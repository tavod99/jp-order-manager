// Trích xuất thông tin sản phẩm trên Rakuma (ラクマ — item.fril.jp/<id>).
// Khác Mercari/Mercari Shops: trang này render sẵn ở server, JSON-LD Product và meta
// product:price:amount đã có đủ tên + giá ngay trong HTML gốc nên không cần đợi hydrate.
// Lưu ý: trang có nhiều <h1> (logo header cũng là h1), nên fallback DOM phải bám đúng
// .item__name / .item__price, tuyệt đối không dùng selector 'h1' chung.
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

  function extractRakumaProduct() {
    var url = location.href;
    // URL dạng https://item.fril.jp/<hash 32 ký tự>, không có phần path nào khác.
    var idMatch = location.pathname.match(/^\/([a-z0-9]+)\/?$/i);
    var maSanPham = idMatch ? idMatch[1] : '';

    var jsonLd = readJsonLd_();
    // og:title sạch hơn document.title (title có thêm "の通販 by <người bán>｜...ならラクマ"),
    // chỉ cần cắt đuôi tên site.
    var ogTitle = String(metaContent_('meta[property="og:title"]') || '')
      .replace(/\s*\|\s*フリマアプリ\s*ラクマ\s*$/, '').trim();
    var tenSanPham = (jsonLd && jsonLd.name) ||
      pickFirstText_(['.item__name']) || ogTitle ||
      metaContent_('meta[property="product:custom_label_0"]') || document.title;

    var jsonLdPrice = jsonLd && jsonLd.offers && (jsonLd.offers.price || jsonLd.offers.lowPrice);
    var metaPrice = metaContent_('meta[property="product:price:amount"]');
    var domPrice = pickFirstText_(['.item__price', '.sell-price-fixed']);
    var gia = parsePrice_(jsonLdPrice || metaPrice || domPrice);

    return {
      tenSanPham: String(tenSanPham || '').trim(),
      gia: gia,
      link: url.split('?')[0],
      maSanPham: maSanPham,
      san: 'Rakuma'
    };
  }

  function wait_(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Giữ retry giống các content script khác cho đồng nhất — với Rakuma thường trúng ngay lần đầu,
  // vòng lặp này chỉ đỡ trường hợp trang bị chèn/đổi DOM sau khi load.
  async function extractWithRetry_() {
    var result = extractRakumaProduct();
    for (var attempt = 0; attempt < 3 && !result.gia; attempt++) {
      await wait_(400);
      result = extractRakumaProduct();
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
