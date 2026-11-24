// Quét toàn bộ Orders có Tracking + Hãng vận chuyển và Trạng thái chưa kết thúc (xem FINAL_STATUSES), scrape trạng thái mới.
// Yamato, Sagawa, SBS gộp tối đa 10 mã/lần để giảm số request. Các hãng khác quét từng mã,
// có nghỉ giữa các lượt để tránh bị coi là bot. 1 tracking lỗi chỉ ghi log, không chặn các đơn còn lại.
// "Gửi thư" luôn bị loại — hãng này không có mã tracking để tra (không có scraper trong CARRIER_SCRAPERS),
// trạng thái đơn phải cập nhật tay.
function updateAllTrackingStatuses() {
  var sheet = getSheet_(SHEET_NAMES.ORDERS);
  var headers = getHeaders_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var colIdDon = headers.indexOf('ID đơn');
  var colTracking = headers.indexOf('Tracking');
  var colHang = headers.indexOf('Hãng vận chuyển');
  var colTrangThai = headers.indexOf('Trạng thái');
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  var pendingRows = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var tracking = row[colTracking];
    var hang = row[colHang];
    var trangThaiCu = row[colTrangThai];
    if (!tracking || !hang || hang === 'Gửi thư' || FINAL_STATUSES.indexOf(trangThaiCu) !== -1) continue;
    pendingRows.push({
      rowIndex: i + 2,
      idDon: row[colIdDon],
      tracking: String(tracking),
      hang: hang,
      trangThaiCu: trangThaiCu
    });
  }

  var yamatoRows = pendingRows.filter(function (r) { return r.hang === 'Yamato'; });
  var sagawaRows = pendingRows.filter(function (r) { return r.hang === 'Sagawa'; });
  var sbsRows    = pendingRows.filter(function (r) { return r.hang === 'SBS'; });
  var otherRows  = pendingRows.filter(function (r) { return r.hang !== 'Yamato' && r.hang !== 'Sagawa' && r.hang !== 'SBS'; });

  processBatchCarrier_(sheet, yamatoRows, fetchYamatoStatusBatch_);
  processBatchCarrier_(sheet, sagawaRows, fetchSagawaStatusBatch_);
  processBatchCarrier_(sheet, sbsRows,    fetchSbsStatusBatch_);
  processOneByOne_(sheet, otherRows);
}

// Dùng chung cho mọi hãng hỗ trợ tra theo lô (Yamato, Sagawa) — tối đa 10 mã/request.
function processBatchCarrier_(sheet, rows, batchFetchFn) {
  for (var i = 0; i < rows.length; i += 10) {
    var chunk = rows.slice(i, i + 10);
    if (i > 0) randomSleep_(1500, 3500);

    try {
      var trackingNumbers = chunk.map(function (r) { return r.tracking; });
      var results = batchFetchFn(trackingNumbers);

      chunk.forEach(function (r) {
        var digitsOnly = r.tracking.replace(/-/g, '');
        applyTrackingResult_(sheet, r, results[digitsOnly]);
      });
    } catch (err) {
      chunk.forEach(function (r) {
        logTrackingChange_(r.idDon, r.tracking, r.hang, r.trangThaiCu, r.trangThaiCu, 'Lỗi scrape (batch): ' + String((err && err.message) || err));
      });
    }
  }
}

function processOneByOne_(sheet, rows) {
  for (var i = 0; i < rows.length; i++) {
    if (i > 0) randomSleep_(1500, 3500);
    var r = rows[i];
    try {
      var trangThaiMoi = fetchCarrierStatus_(r.hang, r.tracking);
      applyTrackingResult_(sheet, r, trangThaiMoi);
    } catch (err) {
      logTrackingChange_(r.idDon, r.tracking, r.hang, r.trangThaiCu, r.trangThaiCu, 'Lỗi scrape: ' + String((err && err.message) || err));
    }
  }
}

function applyTrackingResult_(sheet, r, trangThaiMoi) {
  if (trangThaiMoi && trangThaiMoi !== r.trangThaiCu) {
    setCellByHeader_(sheet, r.rowIndex, 'Trạng thái', trangThaiMoi);
    setCellByHeader_(sheet, r.rowIndex, 'Lần cập nhật tracking cuối', new Date());
    logTrackingChange_(r.idDon, r.tracking, r.hang, r.trangThaiCu, trangThaiMoi, 'Tự động (scrape)');
  }
}

// Chạy 1 lần để bật cập nhật tự động mỗi 4 giờ (hoặc dùng menu "Order Manager > Bật tự động cập nhật tracking" trong Sheet).
function setupTrackingTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'updateAllTrackingStatuses') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('updateAllTrackingStatuses').timeBased().everyHours(4).create();
}


// Được gọi từ Web App (doPost action = 'triggerUpdateAllTracking'). Lên lịch chạy nền để tránh
// timeout 6 phút của Web App — server trả về ngay, trigger thực thi updateAllTrackingStatuses sau 1 phút.
function actionTriggerUpdateAllTracking_() {
  // Xoá trigger one-time cũ (nếu có, tránh xếp chồng) trước khi tạo mới.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'updateAllTrackingStatuses' && t.getTriggerSource() === ScriptApp.TriggerSource.CLOCK) {
      var type = t.getEventType();
      if (type === ScriptApp.EventType.CLOCK) {
        // Không xoá trigger định kỳ (everyHours) — chỉ xoá at() one-time nếu phân biệt được.
        // Apps Script không phân biệt được at() vs everyHours() qua API, nên chỉ xoá tất cả
        // CLOCK trigger nếu tạo ngay lại trigger định kỳ bên dưới — tạm thời để nguyên an toàn.
      }
    }
  });
  ScriptApp.newTrigger('updateAllTrackingStatuses')
    .timeBased()
    .at(new Date(Date.now() + 60 * 1000))
    .create();
  return { ok: true };
}

