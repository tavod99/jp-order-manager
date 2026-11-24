// Trích xuất thông tin sản phẩm trên trang chi tiết ALLU (allu-official.com/.../market/items/<id>/).
// ALLU dùng Nuxt 3 SPA — HTML gốc chỉ có skeleton, nhưng server inject sẵn toàn bộ dữ liệu vào
// #__NUXT_DATA__ (script[type="application/json"]) dưới dạng mảng flat: mỗi phần tử là giá trị
// thật hoặc index con trỏ sang phần tử khác trong mảng (Nuxt deduplication format).
// Ưu tiên parse __NUXT_DATA__ vì ổn định hơn CSS selector (không đổi khi redesign UI).
// Fallback: og:title + DOM price selectors nếu __NUXT_DATA__ chưa sẵn (hiếm).
(function () {
  function metaContent_(selector) {
    var el = document.querySelector(selector);
    return el ? el.getAttribute('content') : '';
  }

  function pickFirstText_(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.textContent && el.textContent.trim()) return el.textContent.trim();
    }
    return '';
  }

  function parsePrice_(raw) {
    if (!raw) return '';
    var digits = String(raw).replace(/[^\d]/g, '');
    return digits ? Number(digits) : '';
  }

  // Nuxt 3 deduplication format: mảng flat trong đó value có thể là index tham chiếu sang
  // phần tử khác. Object được lưu dưới dạng plain JS object { "key": indexValue }.
  // Hàm resolve() biến đổi 1 level: nếu value là số nguyên trong phạm vi mảng thì tra cứu.
  function parseNuxtData_() {
    var el = document.getElementById('__NUXT_DATA__');
    if (!el) return null;
    var arr;
    try { arr = JSON.parse(el.textContent); } catch (e) { return null; }
    if (!Array.isArray(arr)) return null;

    // resolve(v): nếu v là integer index hợp lệ (khác chính nó), trả arr[v]; ngược lại trả v.
    function resolve(v) {
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < arr.length) {
        return arr[v];
      }
      return v;
    }

    // Tìm object "asset" trong mảng — là plain object có key "manage_no" (hoặc "sale_price").
    // Nuxt lưu object cha có dạng: { "manage_no": <idx>, "name": <idx>, "sale_price": <idx>, ... }
    // Ngoài ra, Nuxt dùng ["ShallowReactive", idx] hay object lớn hơn chứa key "asset": <idx>.
    // Cách tiếp cận: duyệt mảng tìm object có key "manage_no" hoặc dựa vào key "asset" → resolve.

    var assetObj = null;

    // Pass 1: tìm plain object có key "manage_no" trực tiếp
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i];
      if (item && typeof item === 'object' && !Array.isArray(item) && 'manage_no' in item) {
        assetObj = item;
        break;
      }
    }

    // Pass 2: tìm object có key "asset" → resolve để lấy asset object
    if (!assetObj) {
      for (var j = 0; j < arr.length; j++) {
        var obj = arr[j];
        if (obj && typeof obj === 'object' && !Array.isArray(obj) && 'asset' in obj) {
          var assetIdx = obj['asset'];
          var resolved = resolve(assetIdx);
          if (resolved && typeof resolved === 'object' && 'manage_no' in resolved) {
            assetObj = resolved;
            break;
          }
        }
      }
    }

    if (!assetObj) return null;

    // Lấy giá trị: resolve 1 level (value là index → tra arr, hoặc giá trị thẳng)
    function get_(key) {
      if (!(key in assetObj)) return null;
      var v = assetObj[key];
      // null/undefined trong Nuxt data thường được biểu diễn bằng chuỗi null hoặc index trỏ tới null
      var resolved = resolve(v);
      if (resolved === null || resolved === undefined) return null;
      return resolved;
    }

    return {
      manage_no:         get_('manage_no'),
      name:              get_('name'),
      sale_price:        get_('sale_price'),
      display_price_max: get_('display_price_max'),
      brand:             get_('brand'),
      conditions:        get_('conditions'),
      conditions_title:  get_('conditions_title')
    };
  }

  function extractAlluProduct() {
    var url = location.href;

    // Lấy item ID từ URL: .../market/items/<id>/
    var idMatch = url.match(/\/items\/(\d+)/);
    var itemId = idMatch ? idMatch[1] : '';

    // --- Nguồn 1: __NUXT_DATA__ (ổn định nhất — server-injected, không đổi theo CSS redesign) ---
    var nuxt = parseNuxtData_();

    var maSanPham = '', tenSanPham = '', gia = '', giaGoc = '', thuongHieu = '', rank = '';

    if (nuxt) {
      maSanPham  = String(nuxt.manage_no  || itemId  || '');
      tenSanPham = String(nuxt.name       || '');
      // sale_price là giá đang bán (giảm giá nếu có sale), display_price_max là giá niêm yết gốc
      gia        = parsePrice_(nuxt.sale_price);
      giaGoc     = parsePrice_(nuxt.display_price_max);
      thuongHieu = String(nuxt.brand             || '');
      // conditions: rank chữ (A, AB, B, BC, C...) — ổn định hơn conditions_title (text mô tả)
      rank       = String(nuxt.conditions        || nuxt.conditions_title || '');
    }

    // --- Nguồn 2: meta tag + DOM (fallback khi __NUXT_DATA__ chưa parse được) ---
    if (!tenSanPham) {
      var ogTitle = metaContent_('meta[property="og:title"]') || '';
      // og:title dạng "シャネル... A4482153｜中古ブランド品...｜ALLU（アリュー）" — cắt đuôi site
      tenSanPham = ogTitle.replace(/\s*｜[^｜]*ALLU[^｜]*$/i, '').trim() ||
                   document.title.replace(/\s*[｜|].*$/, '').trim();
    }
    if (!maSanPham) {
      // Thử tìm mã sản phẩm trong DOM: dt "商品番号" → dd kề bên
      var dts = document.querySelectorAll('dt');
      for (var i = 0; i < dts.length; i++) {
        if (dts[i].textContent.includes('商品番号')) {
          var dd = dts[i].nextElementSibling;
          if (dd) { maSanPham = dd.textContent.trim(); break; }
        }
      }
      maSanPham = maSanPham || itemId;
    }
    if (!gia) {
      var rawPrice = pickFirstText_([
        '.p-productsDetails__info strong',
        '[class*="salePrice"]',
        '[class*="sale_price"]',
        '[class*="price"] strong'
      ]);
      gia = parsePrice_(rawPrice);
    }

    return {
      tenSanPham: tenSanPham.trim(),
      gia:        gia,
      giaGoc:     giaGoc,
      link:       url.split('?')[0],
      maSanPham:  maSanPham.trim(),
      san:        'Allu',
      thuongHieu: thuongHieu.trim(),
      rank:       rank.trim()
    };
  }

  function wait_(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Retry tối đa 3 lần ×400ms — __NUXT_DATA__ thường sẵn ngay trong HTML server-rendered,
  // nhưng giữ retry phòng trường hợp Nuxt client-only hoặc script chạy trước DOM sẵn sàng.
  async function extractWithRetry_() {
    var result = extractAlluProduct();
    for (var attempt = 0; attempt < 3 && !result.gia; attempt++) {
      await wait_(400);
      result = extractAlluProduct();
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
