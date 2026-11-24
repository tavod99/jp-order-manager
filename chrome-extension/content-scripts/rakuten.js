// Trích xuất thông tin sản phẩm trên Rakuten Ichiba (item.rakuten.co.jp/<shop>/<itemCode>/).
// CHƯA KIỂM CHỨNG THỰC TẾ — Rakuten thường có cả JSON-LD và microdata itemprop, ưu tiên JSON-LD trước,
// microdata/selector sau. Cần test trên trang thật, báo lại tên/giá lấy được để sửa nếu sai.
// URL không có 1 mã sản phẩm toàn cục như ASIN — dùng "shop/itemCode" làm mã sản phẩm.
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

  function extractRakutenProduct() {
    var url = location.href;
    var idMatch = location.pathname.match(/^\/([^\/]+)\/([^\/]+)\/?/);
    var maSanPham = idMatch ? (idMatch[1] + '/' + idMatch[2]) : '';

    var jsonLd = readJsonLd_();
    var ogTitle = metaContent_('meta[property="og:title"]');
    var tenSanPham = (jsonLd && jsonLd.name) ||
      pickFirstText_(['[itemprop="name"]', 'h1']) || ogTitle || document.title;

    var jsonLdPrice = jsonLd && jsonLd.offers && (jsonLd.offers.price || jsonLd.offers.lowPrice);
    var metaPrice = metaContent_('meta[itemprop="price"]') || metaContent_('meta[property="product:price:amount"]');
    var domPrice = pickFirstText_(['[itemprop="price"]', '.price2', '#price', '[class*="price"]']);
    var gia = parsePrice_(jsonLdPrice || metaPrice || domPrice);

    return {
      tenSanPham: String(tenSanPham || '').trim(),
      gia: gia,
      link: url.split('?')[0],
      maSanPham: maSanPham,
      san: 'Rakuten'
    };
  }

  function wait_(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function extractWithRetry_() {
    var result = extractRakutenProduct();
    for (var attempt = 0; attempt < 3 && !result.gia; attempt++) {
      await wait_(400);
      result = extractRakutenProduct();
    }
    return result;
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === 'EXTRACT_PRODUCT') {
      extractWithRetry_().then(sendResponse);
      return true;
    }
  });
})();
