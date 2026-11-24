# Apps Script Backend — Mercari/Yahoo Order Manager

Backend Google Apps Script cho hệ thống quản lý đơn hàng Nhật Bản (kết nối với Google Sheets và Chrome Extension).

## Kiến trúc Standalone Script

Project này được thiết kế dưới dạng **Standalone Apps Script** (không gắn trực tiếp bên trong file Google Sheet), truy cập bảng tính thông qua `SPREADSHEET_ID` trong [`Config.js`](Config.js).

Lợi ích: Người dùng được cấp quyền **Editor** trên Google Sheet vẫn không thể xem hoặc chỉnh sửa mã nguồn Apps Script, nhưng menu và trigger vẫn hoạt động bình thường thông qua installable triggers chạy dưới quyền chủ sở hữu script.

---

## Hướng dẫn cài đặt từ đầu

### Bước 1: Tạo Google Sheet
1. Tạo một file Google Sheets mới trên Google Drive.
2. Lấy **Spreadsheet ID** từ URL của file:
   ```text
   https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit
   ```

### Bước 2: Tạo project Google Apps Script
1. Truy cập [script.google.com](https://script.google.com) → **New project** (tạo standalone project).
2. Đưa toàn bộ code trong thư mục `apps-script/` lên project:
   - **Cách 1 (dùng `clasp`):**
     1. Cài đặt `@google/clasp` và đăng nhập (`clasp login`).
     2. Copy file `.clasp.json.example` thành `.clasp.json`, điền `scriptId` của project vừa tạo.
     3. Chạy `clasp push` trong thư mục `apps-script/`.
   - **Cách 2 (thủ công):** Copy nội dung các file `.js` và bật hiển thị file manifest `appsscript.json` trong Project Settings rồi dán nội dung [`appsscript.json`](appsscript.json).

### Bước 3: Cấu hình `SPREADSHEET_ID`
Mở [`Config.js`](Config.js) và thay `YOUR_SPREADSHEET_ID` bằng ID Google Sheet ở Bước 1:
```javascript
var SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';
```

### Bước 4: Thiết lập API Secret
Trong Apps Script Editor:
1. Mở hàm `setApiSecretOnce(secretValue)` trong [`Config.js`](Config.js) hoặc chạy từ hàm tạm / console editor:
   ```javascript
   setApiSecretOnce('chuoi-secret-manh-cua-ban');
   ```
2. Secret sẽ được lưu vào **Script Properties** dưới key `API_SECRET` (không lưu cứng trong source code).

### Bước 5: Khởi tạo Sheet, định dạng & Triggers bắt buộc
Chạy lần lượt các hàm sau trong Apps Script Editor (cấp quyền khi Google hỏi):
1. `setupSheets` ([`Setup.js`](Setup.js)) — Tạo các sheet (`Customers`, `StagingProducts`, `Orders`, `TrackingLog`, `Dashboard`), header, data validation và biểu đồ Dashboard.
2. `formatAllSheets` ([`Format.js`](Format.js)) — Áp dụng bộ lọc, màu tab, định dạng số/tiền tệ và vùng đệm.
3. `setupStandaloneTriggers` ([`InstallTriggers.js`](InstallTriggers.js)) — Đăng ký installable triggers cho `onOpen` (hiện menu **Order Manager** trên Sheet) và `onEdit` (tự tính lại giá VND/lợi nhuận và giữ dropdown khi sửa `Orders`).

> **Lưu ý:** Vì đây là standalone script, `onOpen` và `onEdit` không tự chạy nếu bạn bỏ qua `setupStandaloneTriggers()`.

### Bước 6: Bật các trigger tự động (tuỳ chọn)
Có thể chạy trực tiếp từ menu **Order Manager** trên Google Sheet hoặc từ Apps Script Editor:
- `setupTrackingTrigger` ([`TrackingTrigger.js`](TrackingTrigger.js)) — Tự động kiểm tra và cập nhật trạng thái vận đơn mỗi 4 giờ.
- `setupVcbRateTrigger` ([`VcbRate.js`](VcbRate.js)) — Tự động cập nhật tỷ giá bán JPY/VND (VCB) mỗi 4 giờ và lưu vào Script Properties.
- `setupBackupTrigger` ([`Backup.js`](Backup.js)) — Tự động sao lưu toàn bộ file Sheet vào thư mục `Backup - Mercari Order System` trên Google Drive lúc 2h sáng hằng ngày.

### Bước 7: Deploy Web App
1. Trong Apps Script Editor chọn **Deploy → New deployment**.
2. Chọn loại **Web app**:
   - **Execute as:** `Me` (tài khoản chủ sở hữu script)
   - **Who has access:** `Anyone` (xác thực request qua `API_SECRET` + rate limit 60 req/phút trong `doPost`)
3. Copy **Web App URL** (`https://script.google.com/macros/s/.../exec`).
4. Mở trang **Options** của Chrome Extension, dán Web App URL và Shared secret vừa tạo rồi bấm **Lưu**.

---

## Cấu trúc Sheet được tạo

| Sheet | Mục đích |
|-------|----------|
| `Customers` | Danh sách khách hàng (`Mã khách`, `Tên khách`, `Địa chỉ`, `SĐT`, `Phí (%)`, ...) |
| `StagingProducts` | Sản phẩm tạm vừa lưu từ Chrome Extension trước khi chốt đơn |
| `Orders` | Đơn hàng chính thức, tự tính giá VND trước/sau phí, lợi nhuận và theo dõi tracking |
| `TrackingLog` | Lịch sử thay đổi trạng thái vận đơn và log lỗi scrape |
| `Dashboard` | Các chỉ số tổng hợp và biểu đồ thống kê |

## Danh sách file chính

- [`Code.js`](Code.js) — Entry point `doGet` / `doPost` tiếp nhận API từ Chrome Extension.
- [`Config.js`](Config.js) — Cấu hình `SPREADSHEET_ID`, tên sheet, danh sách trạng thái/hãng vận chuyển, secret và rate limit.
- [`Actions_Product.js`](Actions_Product.js), [`Actions_Customer.js`](Actions_Customer.js), [`Actions_Order.js`](Actions_Order.js), [`Actions_Tracking.js`](Actions_Tracking.js), [`Actions_Search.js`](Actions_Search.js) — Xử lý các action từ Extension.
- [`TrackingScrapers.js`](TrackingScrapers.js) & [`TrackingTrigger.js`](TrackingTrigger.js) — Tra cứu trạng thái vận đơn (Yamato, Japan Post, Sagawa, SBS) theo lô hoặc từng mã.
- [`VcbRate.js`](VcbRate.js) — Lấy và cache tỷ giá JPY/VND Vietcombank.
- [`OnEditTrigger.js`](OnEditTrigger.js) — Tự động tính lại `Giá mua (JPY)`, giá VND, lợi nhuận và gắn lại dropdown khi chỉnh sửa `Orders`.
- [`Setup.js`](Setup.js), [`Format.js`](Format.js), [`DashboardCharts.js`](DashboardCharts.js) — Khởi tạo schema, định dạng bảng tính và biểu đồ.
- [`Menu.js`](Menu.js), [`InstallTriggers.js`](InstallTriggers.js), [`Backup.js`](Backup.js), [`ResetData.js`](ResetData.js), [`Utils.js`](Utils.js) — Menu thao tác nhanh, trigger, backup Drive, reset dữ liệu test và hàm tiện ích.
