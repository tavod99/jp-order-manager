// VCB chặn truy cập trực tiếp bằng Akamai Bot Manager — dùng nguồn thay thế trustweb.vn (tổng hợp lại
// tỷ giá VCB, không bị chặn) — ĐÃ XÁC MINH THỰC TẾ (2026-06-23), giữ đúng số thập phân giống VCB (167.23).
//
// Tỷ giá được làm mới ĐỊNH KỲ qua trigger (refreshVcbRate, mỗi 4h) hoặc menu "Cập nhật tỷ giá VCB ngay",
// lưu vào Script Properties — KHÔNG gọi mạng lúc tạo đơn. actionFinalizeOrder_ chỉ ĐỌC giá trị đã lưu,
// nên tạo đơn luôn tức thì, không phụ thuộc/chờ mạng ngoài.
var VCB_RATE_PROPERTY_KEY = 'VCB_JPY_SELL_RATE';
var VCB_RATE_UPDATED_AT_PROPERTY_KEY = 'VCB_JPY_SELL_RATE_UPDATED_AT';

// Đọc tỷ giá đã lưu sẵn — không gọi mạng, tức thì.
function getStoredVcbJpySellRate_() {
  var rate = PropertiesService.getScriptProperties().getProperty(VCB_RATE_PROPERTY_KEY);
  return rate ? Number(rate) : null;
}

// Gọi mạng lấy tỷ giá mới nhất + lưu vào Script Properties. Chạy qua trigger định kỳ hoặc menu,
// KHÔNG gọi trong lúc tạo đơn.
function refreshVcbRate() {
  var url = 'https://trustweb.vn/ty-gia-ngoai-te-vietcombank-hom-nay-api-ty-gia/';
  var res = UrlFetchApp.fetch(url, fetchOptionsWithUA_({ muteHttpExceptions: true }));
  if (res.getResponseCode() !== 200) {
    throw new Error('Không lấy được tỷ giá (HTTP ' + res.getResponseCode() + ')');
  }

  var html = res.getContentText();
  var rowMatch = html.match(
    /<td style="text-align:left;">YEN[^<]*<\/td>\s*<td style="text-align:center;">JPY<\/td>\s*<td>([\d.,]+)<\/td>\s*<td>([\d.,]+)<\/td>\s*<td>([\d.,]+)<\/td>/
  );
  if (!rowMatch) {
    throw new Error('Không tìm thấy dòng JPY trong bảng tỷ giá — trang có thể đã đổi giao diện');
  }

  var sellRate = parseFloat(rowMatch[3].replace(/,/g, ''));
  if (!sellRate) {
    throw new Error('Giá bán JPY đọc được không hợp lệ: ' + rowMatch[3]);
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty(VCB_RATE_PROPERTY_KEY, String(sellRate));
  props.setProperty(VCB_RATE_UPDATED_AT_PROPERTY_KEY, new Date().toISOString());

  return sellRate;
}

// Dùng trong actionFinalizeOrder_ — đọc tức thì từ Properties. Nếu chưa từng refresh (lần đầu dùng,
// trước khi trigger chạy lần nào), thử gọi mạng 1 lần để có dữ liệu khởi điểm; mọi lần sau đều đọc cache.
function fetchVcbJpySellRate_() {
  var stored = getStoredVcbJpySellRate_();
  if (stored) return stored;
  return refreshVcbRate();
}

// Chạy 1 lần để bật cập nhật tự động mỗi 4 giờ (hoặc dùng menu "Order Manager > Cập nhật tỷ giá VCB ngay").
function setupVcbRateTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'refreshVcbRate') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('refreshVcbRate').timeBased().everyHours(4).create();
}

// Chạy thử trong editor (chọn debugFetchVcbRate ở dropdown > Run) để kiểm tra nhanh giá trị lấy được.
function debugFetchVcbRate() {
  var rate = refreshVcbRate();
  Logger.log('Tỷ giá bán JPY/VND hiện tại: ' + rate);
}
