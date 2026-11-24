// Script standalone (KHÔNG bind vào Sheet) — mọi truy cập Sheet phải qua SpreadsheetApp.openById(),
// không dùng getActiveSpreadsheet() được (xem getSpreadsheet_() ở Utils.gs). Nhờ vậy người được cấp
// quyền Editor trên Sheet vẫn không đụng được vào code, vì code nằm ở project script riêng chỉ mình
// chủ sở hữu có quyền truy cập.
var SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID'; // Thay bằng ID Google Sheet của bạn (chuỗi giữa /d/ và /edit trong URL)

var SHEET_NAMES = {
  CUSTOMERS: 'Customers',
  STAGING: 'StagingProducts',
  ORDERS: 'Orders',
  DASHBOARD: 'Dashboard',
  TRACKING_LOG: 'TrackingLog'
};

var STATUS_LIST = ['Đã mua', 'Seller đã gửi', 'Đang vận chuyển', 'Đã giao kho Nhật', 'Hoàn tất', 'Đã đánh giá', 'Chú ý'];
// Các trạng thái kết thúc — tracking tự động bỏ qua các đơn này (không còn gì để scrape).
var FINAL_STATUSES = ['Hoàn tất', 'Đã đánh giá', 'Chú ý'];
// Gửi thư: không có mã tracking để tra cứu, nên updateAllTrackingStatuses (xem TrackingTrigger.gs)
// luôn bỏ qua hãng này — trạng thái đơn phải tự cập nhật tay.
var CARRIER_LIST = ['Yamato', 'Japan Post', 'Sagawa', 'SBS', 'Gửi thư'];
var STAGING_STATUS = { PENDING: 'Chưa xử lý', DONE: 'Đã thành đơn' };

// Số dòng đệm áp định dạng/border/banding/data-validation/conditional-format sẵn, để dữ liệu Apps Script
// thêm vào sau (appendRow) tự có định dạng luôn, không cần chạy lại formatAllSheets mỗi lần có dữ liệu mới.
var FORMAT_BUFFER_ROWS = 1000;

// Dùng cho mọi request UrlFetchApp tới trang tra cứu tracking — giả lập trình duyệt thật để giảm khả năng
// bị WAF/anti-bot của hãng vận chuyển nhận diện là script (mặc định UrlFetchApp không gửi UA giống trình duyệt).
var BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function getSecret_() {
  return PropertiesService.getScriptProperties().getProperty('API_SECRET');
}

// Chạy 1 lần từ editor Apps Script (Run > setApiSecretOnce) để đặt secret dùng chung với extension.
function setApiSecretOnce(secretValue) {
  if (!secretValue) throw new Error('Truyền vào 1 chuỗi secret, ví dụ: setApiSecretOnce("abc123...")');
  PropertiesService.getScriptProperties().setProperty('API_SECRET', secretValue);
}

// Giới hạn số request hợp lệ (đã qua check secret)/phút, đếm theo phút hiện tại qua CacheService —
// chặn trường hợp secret bị lộ rồi bị spam request. Ngưỡng generous, không ảnh hưởng dùng bình thường
// (popup/phím tắt 1 người dùng không bao giờ tạo gần 60 request/phút).
var RATE_LIMIT_MAX_PER_MINUTE = 60;

function checkRateLimit_() {
  var cache = CacheService.getScriptCache();
  var bucket = 'rl_' + Math.floor(Date.now() / 60000);
  var count = Number(cache.get(bucket)) || 0;

  if (count >= RATE_LIMIT_MAX_PER_MINUTE) return false;

  cache.put(bucket, String(count + 1), 70);
  return true;
}
