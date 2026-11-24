// Trích xuất thông tin sản phẩm trên trang chi tiết Yahoo Auctions (auctions.yahoo.co.jp/jp/auction/...).
// Cùng chiến lược như mercari.js: ưu tiên JSON-LD / meta tag trước, CSS selector chỉ là fallback cuối,
// và thử lại vài lần có chờ nếu chưa thấy giá (đề phòng trang chưa render xong lúc content script chạy).
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

  function extractYahooProduct() {
    var url = location.href;
    var idMatch = url.match(/\/auction\/([a-z0-9]+)/i);
    var maSanPham = idMatch ? idMatch[1] : '';

    var jsonLd = readJsonLd_();
    var ogTitle = metaContent_('meta[property="og:title"]');
    var tenSanPham = (jsonLd && jsonLd.name) || ogTitle || pickFirstText_(['h1', '.ProductTitle__text']) || document.title;

    var jsonLdPrice = jsonLd && jsonLd.offers && (jsonLd.offers.price || jsonLd.offers.lowPrice);
    var metaPrice = metaContent_('meta[property="product:price:amount"]') || metaContent_('meta[itemprop="price"]');
    var domPrice = pickFirstText_(['.Price__value', '[class*="Price"]', '[class*="price"]']);
    var gia = parsePrice_(jsonLdPrice || metaPrice || domPrice);

    return {
      tenSanPham: String(tenSanPham || '').trim(),
      gia: gia,
      link: url.split('?')[0],
      maSanPham: maSanPham,
      san: 'Yahoo'
    };
  }

  function wait_(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Thử tối đa 4 lần, chờ 400ms giữa các lần — đủ thời gian cho trang render xong giá trong hầu hết
  // trường hợp, mà không làm phím tắt cảm giác treo quá lâu (tối đa thêm ~1.2s).
  async function extractYahooProductWithRetry_() {
    var result = extractYahooProduct();
    for (var attempt = 0; attempt < 3 && !result.gia; attempt++) {
      await wait_(400);
      result = extractYahooProduct();
    }
    return result;
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === 'EXTRACT_PRODUCT') {
      extractYahooProductWithRetry_().then(sendResponse);
      return true; // báo cho Chrome biết sendResponse sẽ gọi bất đồng bộ
    }
  });
})();
