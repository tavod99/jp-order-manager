// Trích xuất thông tin sản phẩm trên trang chi tiết Mercari (jp.mercari.com/item/m...).
// Selector CSS có thể đổi khi Mercari redesign — ưu tiên JSON-LD / meta tag (ổn định hơn) trước, CSS chỉ là fallback cuối.
// Mercari là SPA — JSON-LD/giá có thể load sau bằng JS, chậm hơn lúc content script chạy (document_idle không
// đảm bảo đã hydrate xong). Nếu chưa thấy giá, thử lại vài lần có chờ trước khi trả kết quả cuối.
(function () {
  function readJsonLd_() {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < scripts.length; i++) {
      try {
        var data = JSON.parse(scripts[i].textContent);
        var items = Array.isArray(data) ? data : [data];
        for (var j = 0; j < items.length; j++) {
          if (items[j] && (items[j]['@type'] === 'Product' || items[j].offers)) return items[j];
        }
      } catch (e) {
        // JSON-LD không hợp lệ, bỏ qua
      }
    }
    return null;
  }

  function pickFirstText_(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.textContent && el.textContent.trim()) return el.textContent.trim();
    }
    return '';
  }

  function metaContent_(selector) {
    var el = document.querySelector(selector);
    return el ? el.getAttribute('content') : '';
  }

  function parsePrice_(raw) {
    if (!raw) return '';
    var digits = String(raw).replace(/[^\d]/g, '');
    return digits ? Number(digits) : '';
  }

  function extractMercariProduct() {
    var url = location.href;
    var idMatch = url.match(/\/item\/(m\d+)/);
    var maSanPham = idMatch ? idMatch[1] : '';

    var jsonLd = readJsonLd_();
    var ogTitle = metaContent_('meta[property="og:title"]');
    // document.title của Mercari có dạng "<tên sản phẩm> by メルカリ" — chỉ dùng khi JSON-LD/og:title/selector
    // đều không có (nghĩa là trang chưa hydrate xong), nên bỏ phần đuôi thương hiệu cho sạch tên.
    var fallbackTitle = document.title.replace(/\s*[|｜]?\s*by\s*メルカリ\s*$/i, '').trim();
    var tenSanPham = (jsonLd && jsonLd.name) || ogTitle || pickFirstText_(['[data-testid="name"]', 'h1']) || fallbackTitle;

    var jsonLdPrice = jsonLd && jsonLd.offers && (jsonLd.offers.price || jsonLd.offers.lowPrice);
    var metaPrice = metaContent_('meta[property="product:price:amount"]') || metaContent_('meta[itemprop="price"]');
    var domPrice = pickFirstText_(['[data-testid="price"]', '.merPrice', '[class*="price"]']);
    var gia = parsePrice_(jsonLdPrice || metaPrice || domPrice);

    return {
      tenSanPham: String(tenSanPham || '').trim(),
      gia: gia,
      link: url.split('?')[0],
      maSanPham: maSanPham,
      san: 'Mercari'
    };
  }

  function wait_(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Thử tối đa 4 lần, chờ 400ms giữa các lần — đủ thời gian cho Mercari hydrate xong JSON-LD/giá trong
  // hầu hết trường hợp, mà không làm phím tắt cảm giác treo quá lâu (tối đa thêm ~1.2s).
  async function extractMercariProductWithRetry_() {
    var result = extractMercariProduct();
    for (var attempt = 0; attempt < 3 && !result.gia; attempt++) {
      await wait_(400);
      result = extractMercariProduct();
    }
    return result;
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === 'EXTRACT_PRODUCT') {
      extractMercariProductWithRetry_().then(sendResponse);
      return true; // báo cho Chrome biết sendResponse sẽ gọi bất đồng bộ
    }
  });
})();
