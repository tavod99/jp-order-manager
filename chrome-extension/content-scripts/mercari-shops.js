// Trích xuất thông tin sản phẩm trên trang Mercari Shops (jp.mercari.com/shops/product/...).
// Đây là marketplace riêng biệt trong Mercari (người bán là shop/doanh nghiệp, không phải cá nhân
// như trang /item/ thường) — React app khác hẳn, không có JSON-LD/meta giá trong HTML gốc (SPA
// full client-render). Selector dưới đây lấy từ DOM đã hydrate thực tế (data-testid ổn định hơn class).
(function () {
  function textOf_(selector) {
    var el = document.querySelector(selector);
    return el && el.textContent ? el.textContent.trim() : '';
  }

  function parsePrice_(raw) {
    if (!raw) return '';
    var digits = String(raw).replace(/[^\d]/g, '');
    return digits ? Number(digits) : '';
  }

  function extractMercariShopsProduct() {
    var url = location.href;
    var idMatch = url.match(/\/shops\/product\/([^/?#]+)/);
    var maSanPham = idMatch ? idMatch[1] : '';

    // document.title dạng "<tên sản phẩm> - メルカリ" (khác đuôi "by メルカリ" của trang /item/ thường).
    var fallbackTitle = document.title.replace(/\s*[|｜]?\s*-\s*メルカリ\s*$/i, '').trim();
    var tenSanPham = textOf_('[data-testid="display-name"] h1') || fallbackTitle;

    var gia = parsePrice_(textOf_('[data-testid="product-price"]'));

    return {
      tenSanPham: tenSanPham,
      gia: gia,
      link: url.split('?')[0],
      maSanPham: maSanPham,
      san: 'Mercari Shops'
    };
  }

  function wait_(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Cùng chiến lược retry với mercari.js — trang cần thời gian hydrate xong giá trước khi content
  // script (document_idle) kịp đọc DOM.
  async function extractMercariShopsProductWithRetry_() {
    var result = extractMercariShopsProduct();
    for (var attempt = 0; attempt < 3 && !result.gia; attempt++) {
      await wait_(400);
      result = extractMercariShopsProduct();
    }
    return result;
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === 'EXTRACT_PRODUCT') {
      extractMercariShopsProductWithRetry_().then(sendResponse);
      return true; // báo cho Chrome biết sendResponse sẽ gọi bất đồng bộ
    }
  });
})();
