// Trích xuất thông tin sản phẩm trên trang chi tiết Trefac Fashion (trefac.jp/store/<mpn>/<sku>/).
// Trefac là trang server-rendered HTML truyền thống — dữ liệu sẵn có ngay trong HTML gốc,
// không cần đợi JS hydrate. Ưu tiên JSON-LD (schema.org/Product) vì ổn định nhất,
// CSS selector chỉ là fallback cuối khi JSON-LD không parse được.
(function () {
  function readJsonLd_() {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < scripts.length; i++) {
      try {
        var data = JSON.parse(scripts[i].textContent);
        var items = Array.isArray(data) ? data : [data];
        for (var j = 0; j < items.length; j++) {
          if (items[j] && items[j]['@type'] === 'Product') return items[j];
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

  function extractTrefacProduct() {
    var url = location.href;

    // URL dạng /store/<mpn>/<sku>/ — sku có thể có prefix "c" (ví dụ c4332969)
    var urlMatch = url.match(/\/store\/(\d+)\/c?(\d+)/);
    var mpn = urlMatch ? urlMatch[1] : '';        // store-item unique ID
    var skuFromUrl = urlMatch ? urlMatch[2] : '';  // SKU thuần số (bỏ prefix "c")

    // --- Nguồn 1: JSON-LD (ổn định nhất — không đổi theo CSS redesign) ---
    var jsonLd = readJsonLd_();

    var tenSanPham = '', gia = '', maSanPham = '', thuongHieu = '';

    if (jsonLd) {
      tenSanPham = String(jsonLd.name || '').trim();
      // sku = mã sản phẩm ngắn (4332969), mpn = mã item đầy đủ (1070002564939406)
      maSanPham  = String(jsonLd.sku || skuFromUrl || mpn || '');
      thuongHieu = String((jsonLd.brand && jsonLd.brand.name) || '').trim();
      // JSON-LD offers.price là giá chưa thuế — chỉ dùng làm fallback cuối
      // (ưu tiên DOM .gdprice_main hiển thị giá có thuế bên dưới)
    }

    // --- Nguồn 2: DOM price (giá có thuế — tax-included) ưu tiên hơn JSON-LD price ---
    // .gdprice_main hiển thị "11,000円（税込）" — đây là giá thực sự khách trả
    gia = parsePrice_(pickFirstText_(['.gdprice_main', '.c-price']));

    // --- Nguồn 3: fallbacks tên / mã / brand / giá cuối cùng ---
    if (!tenSanPham) {
      var ogTitle = metaContent_('meta[property="og:title"]') || '';
      // og:title dạng "[中古]on(オン)のメンズ シューズ ローカットスニーカー" — khá clean rồi
      tenSanPham = ogTitle.replace(/^\[中古\]/, '').trim() ||
                   pickFirstText_(['.gdname', '.itemNameArea', 'h1']) ||
                   document.title.replace(/【中古[^】]*】/, '').replace(/｜.*$/, '').trim();
    }
    if (!maSanPham) {
      maSanPham = skuFromUrl || mpn;
    }
    if (!gia) {
      // Fallback cuối: giá chưa thuế từ JSON-LD
      gia = parsePrice_(jsonLd && jsonLd.offers && (jsonLd.offers.price || jsonLd.offers.lowPrice));
    }
    if (!thuongHieu) {
      thuongHieu = pickFirstText_(['.gdbrand a', '.gdbrand', '.brandName a', '.brandName']);
    }

    return {
      tenSanPham: tenSanPham.trim(),
      gia:        gia,
      link:       url.split('?')[0],
      maSanPham:  maSanPham.trim(),
      san:        'Trefac',
      thuongHieu: thuongHieu.trim()
    };
  }


  function wait_(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Trefac là server-rendered nên thường không cần retry — nhưng giữ nhất quán với
  // các content script khác, retry vài lần đề phòng DOM bị thay đổi sau khi load.
  async function extractWithRetry_() {
    var result = extractTrefacProduct();
    for (var attempt = 0; attempt < 3 && !result.gia; attempt++) {
      await wait_(400);
      result = extractTrefacProduct();
    }
    return result;
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === 'EXTRACT_PRODUCT') {
      extractWithRetry_().then(sendResponse);
      return true; // báo cho Chrome biết sendResponse sẽ gọi bất đồng bộ
    }
  });
})();
