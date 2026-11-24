# Hướng dẫn: Thêm một trang/sàn mới vào Chrome Extension

Tài liệu này mô tả toàn bộ quy trình — từ phân tích trang web đến kiểm tra — để thêm khả năng trích xuất dữ liệu sản phẩm cho một site mới.

---

## Tổng quan kiến trúc

```
┌──────────────────────────────────────────────┐
│              Chrome Extension                │
│                                              │
│  manifest.json  ←── khai báo URL + file     │
│       │                                      │
│  content-scripts/<site>.js                  │
│       │  lắng nghe EXTRACT_PRODUCT           │
│       │  trả về { tenSanPham, gia, ... }     │
│       ↓                                      │
│  background.js  ←── relay + Apps Script      │
│       ↓                                      │
│  popup.js       ←── hiện preview + badge     │
└──────────────────────────────────────────────┘
```

**Luồng dữ liệu khi bấm Lưu SP:**
1. `popup.js` gửi `SAVE_CURRENT_PRODUCT` → `background.js`
2. `background.js` gửi `EXTRACT_PRODUCT` → content script của tab hiện tại
3. Content script trả về object sản phẩm → `background.js` gọi Apps Script

---

## Bước 1 — Phân tích trang web mục tiêu

Mục tiêu: tìm nguồn dữ liệu **ổn định nhất** (không đổi khi site redesign CSS).

### 1.1 Xác định kiến trúc trang

Vào trang sản phẩm → chuột phải → **View Page Source** (không phải Inspect):

| Dấu hiệu trong source | Loại trang |
|----------------------|-----------|
| Thấy tên sản phẩm, giá trong HTML gốc | Server-rendered |
| Chỉ thấy `<div id="app">` hoặc skeleton | SPA (React/Vue/Nuxt) |

### 1.2 Tìm nguồn dữ liệu theo thứ tự ưu tiên

Mở DevTools → Console, chạy từng lệnh:

**Ưu tiên 1: JSON-LD** (tốt nhất cho server-rendered)
```javascript
JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)
// Tìm object có @type: "Product" với name, offers.price, brand
```

**Ưu tiên 2: Nuxt/Next hydration data** (tốt nhất cho SPA)
```javascript
// Nuxt 3
const arr = JSON.parse(document.getElementById('__NUXT_DATA__').textContent);
arr.filter(x => x && typeof x === 'object' && 'manage_no' in x)

// Next.js
JSON.parse(document.getElementById('__NEXT_DATA__').textContent)
```

**Ưu tiên 3: Meta tags**
```javascript
document.querySelector('meta[property="og:title"]')?.content
document.querySelector('meta[property="product:price:amount"]')?.content
```

**Ưu tiên 4: DOM CSS selectors** *(kém ổn định — chỉ dùng khi không còn lựa chọn)*
```javascript
document.querySelector('h1').textContent           // tên
document.querySelector('[class*="price"]').textContent  // giá
```

### 1.3 Ghi lại thông tin cần thu thập

| Field | Ý nghĩa | Bắt buộc |
|-------|---------|---------|
| `tenSanPham` | Tên sản phẩm đầy đủ | ✅ |
| `gia` | Giá bán (số nguyên, JPY) | ✅ |
| `link` | URL trang sản phẩm (bỏ query string) | ✅ |
| `maSanPham` | Mã/ID sản phẩm (từ URL hoặc DOM) | ✅ |
| `san` | Tên sàn — chuỗi cố định, ví dụ `'Trefac'` | ✅ |
| `thuongHieu` | Thương hiệu | Tuỳ |
| `giaGoc` | Giá gốc trước giảm giá | Tuỳ |
| `rank` | Tình trạng/rank sản phẩm | Tuỳ |

### 1.4 Xác định URL pattern

```
https://jp.mercari.com/item/m12345678          → /item/<id>
https://item.fril.jp/abc123def456             → /<id>
https://allu-official.com/jp/ja/market/items/2027281/  → /*/market/items/<id>/
https://www.trefac.jp/store/1070002564939406/c4332969/ → /store/<mpn>/<sku>/
```

---

## Bước 2 — Tạo content script

### 2.1 Tạo file

```
chrome-extension/content-scripts/<tên-site>.js
```

### 2.2 Template chuẩn

```javascript
// Trích xuất thông tin sản phẩm trên [Tên Site] (<domain>/path/<id>/).
// [Mô tả ngắn: server-rendered hay SPA, nguồn dữ liệu dùng]
(function () {

  // ── Helpers (copy y nguyên, không sửa) ──────────────────────────────────

  function readJsonLd_() {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < scripts.length; i++) {
      try {
        var data = JSON.parse(scripts[i].textContent);
        var items = Array.isArray(data) ? data : [data];
        for (var j = 0; j < items.length; j++) {
          if (items[j] && (items[j]['@type'] === 'Product' || items[j].offers)) return items[j];
        }
      } catch (e) {}
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

  // ── Logic trích xuất chính ───────────────────────────────────────────────

  function extractProduct() {
    var url = location.href;

    // TODO 1: Lấy maSanPham từ URL
    var idMatch = url.match(/\/path\/(\w+)/);   // ← sửa regex cho đúng URL
    var maSanPham = idMatch ? idMatch[1] : '';

    // TODO 2: Nguồn 1 — JSON-LD (hoặc hydration data tuỳ loại trang)
    var jsonLd = readJsonLd_();
    var tenSanPham = '', gia = '', thuongHieu = '';

    if (jsonLd) {
      tenSanPham = String(jsonLd.name || '').trim();
      gia        = parsePrice_(jsonLd.offers && (jsonLd.offers.price || jsonLd.offers.lowPrice));
      maSanPham  = maSanPham || String(jsonLd.sku || '');
      thuongHieu = String((jsonLd.brand && jsonLd.brand.name) || '').trim();
    }

    // TODO 3: DOM fallback (điền selector thật của trang)
    if (!tenSanPham) {
      tenSanPham = metaContent_('meta[property="og:title"]') ||
                   pickFirstText_(['h1', '.product-name']) ||  // ← sửa selector
                   document.title;
    }
    if (!gia) {
      gia = parsePrice_(pickFirstText_(['.price', '[class*="price"]']));  // ← sửa selector
    }

    return {
      tenSanPham: String(tenSanPham || '').trim(),
      gia:        gia,
      link:       url.split('?')[0],
      maSanPham:  String(maSanPham || '').trim(),
      san:        'NewSite',      // TODO 4: đặt tên sàn cố định (phải khớp với popup.js)
      thuongHieu: thuongHieu
    };
  }

  function wait_(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Retry 3×400ms — cần với SPA, an toàn với server-rendered (chạy nhanh ngay lần đầu).
  async function extractWithRetry_() {
    var result = extractProduct();
    for (var attempt = 0; attempt < 3 && !result.gia; attempt++) {
      await wait_(400);
      result = extractProduct();
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
```

---

## Bước 3 — Cập nhật `manifest.json`

File: [`manifest.json`](file:///d:/Downloads/ExtensionApp/chrome-extension/manifest.json)

Thêm vào **2 chỗ**:

```jsonc
// 1. host_permissions — thêm domain mới
"host_permissions": [
  // ... các domain hiện có ...
  "https://www.newsite.com/*"
],

// 2. content_scripts — thêm entry mới
"content_scripts": [
  // ... các entry hiện có ...
  {
    "matches": ["https://www.newsite.com/products/*"],
    "js": ["content-scripts/newsite.js"],
    "run_at": "document_idle"
  }
]
```

> **Glob pattern trong `matches`:**
> - `*` khớp mọi chuỗi ngoại trừ `/`
> - `**` khớp mọi chuỗi kể cả `/`
> - Không dùng regex — chỉ dùng glob của Chrome
> - Ví dụ đúng: `"https://allu-official.com/*/market/items/*"` khớp `/jp/ja/market/items/123/`

---

## Bước 4 — Cập nhật `popup.js`

File: [`popup.js`](file:///d:/Downloads/ExtensionApp/chrome-extension/popup/popup.js)

Sửa **2 chỗ**:

### 4.1 Regex `isProductPage` (~dòng 113)

Thêm domain mới vào cuối regex (trước dấu `)` đóng):

```javascript
// Trước:
const isProductPage = /^https:\/\/(jp\.mercari\.com\/....|item\.fril\.jp\/)/.test(tab.url);

// Sau: thêm |www\.newsite\.com\/products\/ vào cuối
const isProductPage = /^https:\/\/(jp\.mercari\.com\/....|item\.fril\.jp\/|www\.newsite\.com\/products\/)/.test(tab.url);
```

> Pattern phải là prefix URL sản phẩm. Escape: `.` → `\.`  `/` → `\/`

### 4.2 Hàm `platformClass` (~dòng 181)

```javascript
function platformClass(san) {
  // ... các case hiện có ...
  if (san === 'NewSite') return 'newsite';   // ← thêm (san phải khớp với content script)
  return 'yahoo';
}
```

---

## Bước 5 — (Tuỳ chọn) CSS badge màu

File: [`popup.css`](file:///d:/Downloads/ExtensionApp/chrome-extension/popup/popup.css)

Tìm chỗ định nghĩa `.platform-badge` và thêm:

```css
.platform-badge.newsite {
  background: #e3f2fd;   /* màu nền nhạt */
  color: #1565c0;        /* màu chữ đậm hơn */
}
```

---

## Bước 6 — Reload & Kiểm tra

### 6.1 Reload extension

1. `chrome://extensions` → bật **Developer mode**
2. Bấm **↺** (Reload) trên card extension

> ⚠️ Sau khi reload, phải **reload lại tab trang sản phẩm** vì content script cũ đã inject vào tab cũ.

### 6.2 Checklist kiểm tra

```
[ ] Mở trang sản phẩm của site mới
[ ] Click extension → tab "Lưu SP" hiện preview: tên + giá + badge tên sàn đúng
[ ] Bấm "Lưu sản phẩm" → notification thành công
[ ] Kiểm tra Google Sheets: row mới đủ cột tên / giá / link / mã SP / sàn
[ ] Nhấn Ctrl+Shift+S trên trang → notification thành công
[ ] Lưu lần 2 → popup báo "đã tồn tại" (duplicate check hoạt động)
```

### 6.3 Debug nhanh

```javascript
// Mở DevTools trên trang sản phẩm → Console:

// Kiểm tra content script đã inject chưa
chrome.runtime.id
// → undefined = chưa inject (kiểm tra manifest matches pattern)

// Gửi thủ công message để test
chrome.runtime.sendMessage({ type: 'EXTRACT_PRODUCT' }, r => console.log(r))
// → Nếu lỗi "Cannot establish connection" → content script chưa load
// → Nếu ra object với tenSanPham="" hoặc gia="" → sai selector/parser

// Test selector trực tiếp
document.querySelector('script[type="application/ld+json"]')  // có JSON-LD không?
document.getElementById('__NUXT_DATA__')                       // có Nuxt data không?
```

---

## Tham khảo: các site đã implement

| Sàn | File | Nguồn dữ liệu | Kiến trúc |
|-----|------|---------------|-----------|
| Mercari | [`mercari.js`](file:///d:/Downloads/ExtensionApp/chrome-extension/content-scripts/mercari.js) | JSON-LD + retry | SPA |
| Yahoo Auction | [`yahoo.js`](file:///d:/Downloads/ExtensionApp/chrome-extension/content-scripts/yahoo.js) | JSON-LD + meta | SPA |
| Rakuma | [`rakuma.js`](file:///d:/Downloads/ExtensionApp/chrome-extension/content-scripts/rakuma.js) | JSON-LD | Server-rendered |
| Amazon | [`amazon.js`](file:///d:/Downloads/ExtensionApp/chrome-extension/content-scripts/amazon.js) | meta + DOM | Server-rendered |
| ALLU | [`allu.js`](file:///d:/Downloads/ExtensionApp/chrome-extension/content-scripts/allu.js) | `#__NUXT_DATA__` JSON | Nuxt 3 SPA |
| Trefac | [`trefac.js`](file:///d:/Downloads/ExtensionApp/chrome-extension/content-scripts/trefac.js) | JSON-LD + DOM `.gdprice_main` | Server-rendered |

---

## Tóm tắt checklist

```
[ ] 1. Phân tích: server-rendered hay SPA?
[ ] 1. Tìm nguồn dữ liệu: JSON-LD / hydration / meta / DOM
[ ] 1. Ghi URL pattern của trang sản phẩm
[ ] 2. Tạo content-scripts/<site>.js từ template, điền TODO 1-4
[ ] 3. Thêm domain vào manifest.json → host_permissions
[ ] 3. Thêm entry vào manifest.json → content_scripts (đúng matches pattern)
[ ] 4. Thêm URL prefix vào regex isProductPage trong popup.js
[ ] 4. Thêm case vào platformClass trong popup.js
[ ] 5. (tuỳ chọn) Thêm CSS badge màu cho sàn mới
[ ] 6. Reload extension + reload tab → chạy checklist 6 điểm
```
