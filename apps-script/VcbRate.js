// VCB chặn trực tiếp một số IP Google Cloud bằng Akamai Bot Manager — ưu tiên lấy từ Báo Mới
// (SSL chuẩn, SSR JSON trong __NEXT_DATA__, đồng bộ trực tiếp bảng tỷ giá VCB) và dự phòng sang
// endpoint XML chính thức của VCB nếu nguồn chính gặp sự cố.
//
// Tỷ giá được làm mới ĐỊNH KỲ qua trigger (refreshVcbRate, mỗi 4h) hoặc menu "Cập nhật tỷ giá VCB ngay",
// lưu vào Script Properties — KHÔNG gọi mạng lúc tạo đơn. actionFinalizeOrder_ chỉ ĐỌC giá trị đã lưu,
// nên tạo đơn luôn tức thì, không phụ thuộc/chờ mạng ngoài.
var VCB_RATE_PROPERTY_KEY = 'VCB_JPY_SELL_RATE';
var VCB_RATE_UPDATED_AT_PROPERTY_KEY = 'VCB_JPY_SELL_RATE_UPDATED_AT';
var BAOMOI_VCB_RATE_URL = 'https://baomoi.com/tien-ich-ty-gia-ngoai-te-vietcombank.epi';
var VCB_OFFICIAL_XML_URL = 'https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx?b=10';

// Đọc tỷ giá đã lưu sẵn — không gọi mạng, tức thì.
function getStoredVcbJpySellRate_() {
  var rate = PropertiesService.getScriptProperties().getProperty(VCB_RATE_PROPERTY_KEY);
  return rate ? Number(rate) : null;
}

// Nguồn chính: Báo Mới (JSON SSR trong thẻ __NEXT_DATA__).
function fetchVcbJpySellFromBaomoi_() {
  var res = UrlFetchApp.fetch(BAOMOI_VCB_RATE_URL, fetchOptionsWithUA_({ muteHttpExceptions: true }));
  if (res.getResponseCode() !== 200) {
    throw new Error('HTTP ' + res.getResponseCode());
  }

  var html = res.getContentText();
  var nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!nextDataMatch) {
    throw new Error('Không tìm thấy __NEXT_DATA__');
  }

  var payload = JSON.parse(nextDataMatch[1]);
  var content = payload && payload.props && payload.props.pageProps &&
    payload.props.pageProps.resp && payload.props.pageProps.resp.data &&
    payload.props.pageProps.resp.data.content;
  var entries = content && content.entries;
  if (!Array.isArray(entries)) {
    throw new Error('Không tìm thấy danh sách entries');
  }

  var jpy = null;
  for (var i = 0; i < entries.length; i++) {
    if (entries[i] && entries[i].code === 'JPY') {
      jpy = entries[i];
      break;
    }
  }
  if (!jpy) {
    throw new Error('Không có mã JPY trong bảng tỷ giá');
  }

  var sellRate = Number(jpy.sellCash || jpy.sellTransfer);
  if (!isFinite(sellRate) || sellRate <= 0) {
    throw new Error('Giá bán JPY không hợp lệ: ' + jpy.sellCash);
  }
  return sellRate;
}

// Nguồn dự phòng: XML chính thức của Vietcombank.
function fetchVcbJpySellFromVcbXml_() {
  var res = UrlFetchApp.fetch(VCB_OFFICIAL_XML_URL, fetchOptionsWithUA_({ muteHttpExceptions: true }));
  if (res.getResponseCode() !== 200) {
    throw new Error('HTTP ' + res.getResponseCode());
  }

  var doc = XmlService.parse(res.getContentText());
  var root = doc.getRootElement();
  var children = root.getChildren('Exrate');
  var jpySellRaw = null;

  for (var i = 0; i < children.length; i++) {
    var codeAttr = children[i].getAttribute('CurrencyCode');
    if (codeAttr && codeAttr.getValue() === 'JPY') {
      var sellAttr = children[i].getAttribute('Sell');
      jpySellRaw = sellAttr ? sellAttr.getValue() : null;
      break;
    }
  }

  if (!jpySellRaw) {
    throw new Error('Không tìm thấy thẻ Exrate JPY');
  }

  var sellRate = parseFloat(String(jpySellRaw).replace(/,/g, ''));
  if (!isFinite(sellRate) || sellRate <= 0) {
    throw new Error('Giá bán JPY XML không hợp lệ: ' + jpySellRaw);
  }
  return sellRate;
}

// Gọi mạng lấy tỷ giá mới nhất + lưu vào Script Properties. Chạy qua trigger định kỳ hoặc menu,
// KHÔNG gọi trong lúc tạo đơn.
function refreshVcbRate() {
  var sources = [
    { name: 'Báo Mới', fn: fetchVcbJpySellFromBaomoi_ },
    { name: 'VCB XML', fn: fetchVcbJpySellFromVcbXml_ }
  ];

  var sellRate = null;
  var errors = [];
  for (var i = 0; i < sources.length; i++) {
    try {
      sellRate = sources[i].fn();
      break;
    } catch (err) {
      errors.push(sources[i].name + ': ' + String((err && err.message) || err));
    }
  }

  if (!sellRate) {
    throw new Error('Không lấy được tỷ giá VCB (' + errors.join(' | ') + ')');
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
