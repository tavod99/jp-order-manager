# Mercari/Yahoo Order Manager

Hệ thống hỗ trợ lưu sản phẩm, tạo đơn hàng, quản lý khách hàng, tính giá/lợi nhuận theo tỷ giá VCB và theo dõi vận đơn Nhật Bản tự động — gồm **Chrome Extension (Manifest V3)** kết nối với **Google Apps Script + Google Sheets**.

---

## Tính năng chính

### Chrome Extension (`chrome-extension/`)
- **Lưu sản phẩm 1 chạm** hoặc bằng phím tắt `Ctrl+Shift+S` (`Command+Shift+S` trên macOS) kèm badge trạng thái trực tiếp trên icon.
- **Hỗ trợ trích xuất dữ liệu từ 10 sàn/website Nhật Bản:**
  - Mercari (`jp.mercari.com/item/*`)
  - Mercari Shops (`jp.mercari.com/shops/product/*`)
  - Yahoo! Auctions (`auctions.yahoo.co.jp/jp/auction/*`)
  - PayPay Flea Market (`paypayfleamarket.yahoo.co.jp/item/*`)
  - Yahoo! Shopping (`store.shopping.yahoo.co.jp/*`)
  - Amazon Japan (`www.amazon.co.jp/*`)
  - Rakuten (`item.rakuten.co.jp/*`)
  - Rakuma (`item.fril.jp/*`)
  - ALLU (`allu-official.com/*/market/items/*`)
  - Trefac (`www.trefac.jp/store/*/*/`)
- **Quản lý trong Popup:**
  - Duyệt danh sách sản phẩm tạm (`StagingProducts`), chọn/tạo nhanh khách hàng và chốt thành đơn hàng.
  - Tìm kiếm đơn hàng / sản phẩm / khách hàng nhanh.
  - Công cụ kích hoạt cập nhật tracking và làm mới tỷ giá VCB trực tiếp từ extension.

### Google Apps Script & Sheets (`apps-script/`)
- **Quản lý 5 sheet tự động:** `Customers`, `StagingProducts`, `Orders`, `TrackingLog`, `Dashboard`.
- **Tự động tính giá & lợi nhuận:** Cache tỷ giá bán JPY/VND (VCB), tự tính lại `Giá mua (JPY)`, `Giá VND trước phí`, `Giá VND sau phí` và `Lợi nhuận (VND)` khi tạo đơn hoặc chỉnh sửa trực tiếp trên Sheet.
- **Tự động tra cứu vận đơn (Tracking):** Hỗ trợ Yamato, Japan Post, Sagawa, SBS (và tuỳ chọn `Gửi thư` cập nhật tay), ghi nhận thay đổi vào `TrackingLog`.
- **Dashboard & Backup:** Bảng thống kê + biểu đồ tự động và sao lưu Google Sheet hằng ngày lên Google Drive.

---

## Cấu trúc thư mục

```text
.
├── apps-script/           # Backend Google Apps Script (Web App API + Triggers + Sheet setup)
│   ├── README.md          # Hướng dẫn cài đặt và deploy Apps Script chi tiết
│   ├── .clasp.json.example
│   └── ...
└── chrome-extension/      # Chrome Extension (Manifest V3)
    ├── manifest.json
    ├── background.js
    ├── content-scripts/   # Script trích xuất dữ liệu từng sàn
    ├── popup/             # Giao diện popup extension
    ├── options/           # Trang cấu hình Web App URL & Shared Secret
    └── ADD_NEW_SITE.md    # Hướng dẫn thêm sàn/website mới vào extension
```

---

## Cài đặt nhanh

1. **Thiết lập Backend Apps Script:** Làm theo hướng dẫn chi tiết trong [`apps-script/README.md`](apps-script/README.md) để cấu hình Google Sheet, đặt `API_SECRET`, chạy `setupSheets()` và Deploy Web App.
2. **Cài Chrome Extension (Load unpacked):**
   - Mở `chrome://extensions` trên Chrome.
   - Bật **Developer mode** (Chế độ dành cho nhà phát triển).
   - Chọn **Load unpacked** (Tải tiện ích đã giải nén) và trỏ vào thư mục `chrome-extension/`.
3. **Kết nối Extension với Apps Script:**
   - Mở **Options** của extension (nhấn chuột phải vào icon extension → *Options*, hoặc bấm biểu tượng bánh răng trong popup).
   - Nhập **Apps Script Web App URL** (`/exec`) và **Shared secret** đã đặt ở bước 1 → bấm **Lưu**.

---

## Mở rộng hỗ trợ sàn mới

Xem hướng dẫn quy trình phân tích DOM/JSON-LD/Nuxt/Next và thêm content script mới tại [`chrome-extension/ADD_NEW_SITE.md`](chrome-extension/ADD_NEW_SITE.md).
