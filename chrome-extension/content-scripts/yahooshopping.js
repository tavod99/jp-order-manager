// Trích xuất thông tin sản phẩm trên Yahoo Shopping (store.shopping.yahoo.co.jp/<shop>/<slug>.html).
// CHƯA KIỂM CHỨNG THỰC TẾ — viết theo cùng chiến lược JSON-LD/meta trước, CSS selector chỉ là fallback
// cuối, giống mercari.js/yahoo.js. Cần test trên trang thật, báo lại tên/giá lấy được để sửa nếu sai.
// URL không có ID số rõ ràng như Mercari/Yahoo Auction — dùng slug cuối đường dẫn làm "mã sản phẩm".
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

  function extractYahooShoppingProduct() {
    var url = location.href;
    var slugMatch = location.pathname.match(/\/([^\/]+)\.html$/);
    var maSanPham = slugMatch ? slugMatch[1] : '';

    var jsonLd = readJsonLd_();
    var ogTitle = metaContent_('meta[property="og:title"]');
    var tenSanPham = (jsonLd && jsonLd.name) || ogTitle ||
      pickFirstText_(['h1', '[class*="ItemName"]', '[class*="itemName"]']) || document.title;

    var jsonLdPrice = jsonLd && jsonLd.offers && (jsonLd.offers.price || jsonLd.offers.lowPrice);
    var metaPrice = metaContent_('meta[property="product:price:amount"]') || metaContent_('meta[itemprop="price"]');
    var domPrice = pickFirstText_(['[class*="Price"]', '[class*="price"]']);
    var gia = parsePrice_(jsonLdPrice || metaPrice || domPrice);

    return {
      tenSanPham: String(tenSanPham || '').trim(),
      gia: gia,
      link: url.split('?')[0],
      maSanPham: maSanPham,
      san: 'Yahoo Shopping'
    };
  }

  function wait_(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function extractWithRetry_() {
    var result = extractYahooShoppingProduct();
    for (var attempt = 0; attempt < 3 && !result.gia; attempt++) {
      await wait_(400);
      result = extractYahooShoppingProduct();
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
