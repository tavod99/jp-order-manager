// Chạy 1 lần từ editor Apps Script (Run > setupSheets) để tạo toàn bộ schema. An toàn để chạy lại nhiều lần.
function setupSheets() {
  var ss = getSpreadsheet_();

  var customersSheet = ensureSheet_(ss, SHEET_NAMES.CUSTOMERS, ['Mã khách', 'Tên khách', 'Địa chỉ', 'SĐT', 'Phí (%)', 'Ghi chú', 'Ngày tạo']);
  ensureSheet_(ss, SHEET_NAMES.STAGING, ['Mã tạm', 'Thời gian lưu', 'Tên sản phẩm', 'Giá', 'Link', 'Mã sản phẩm', 'Sàn', 'Trạng thái xử lý']);
  var ordersSheet = ensureSheet_(ss, SHEET_NAMES.ORDERS, [
    'ID đơn', 'Ngày tạo', 'Mã khách', 'Tên khách', 'Tên sản phẩm', 'Đơn giá (JPY)', 'Số lượng', 'Giá mua (JPY)', 'Phí ship (JPY)', 'Tỷ giá VCB',
    'Giá VND trước phí', 'Giá VND sau phí', 'Lợi nhuận (VND)',
    'Link sản phẩm', 'Mã sản phẩm', 'Hãng vận chuyển', 'Tracking', 'Trạng thái', 'Ghi chú', 'Lần cập nhật tracking cuối'
  ]);
  ensureSheet_(ss, SHEET_NAMES.TRACKING_LOG, ['Thời gian', 'ID đơn', 'Tracking', 'Hãng vận chuyển', 'Trạng thái cũ', 'Trạng thái mới', 'Ghi chú']);
  ensureSheet_(ss, SHEET_NAMES.DASHBOARD, ['Chỉ số', 'Giá trị']);

  ensureCustomersHasFeeColumn_(customersSheet);
  ensureOrdersHasVcbColumns_(ordersSheet);
  ensureOrdersHasShipFeeColumn_(ordersSheet);
  ensureOrdersHasQuantityColumns_(ordersSheet);

  applyDataValidation_(ordersSheet, 'Trạng thái', STATUS_LIST);
  applyDataValidation_(ordersSheet, 'Hãng vận chuyển', CARRIER_LIST);
  applyMinNumberValidation_(ordersSheet, 'Số lượng', 1);
  setupDashboardFormulas_(ss);
  setupDashboardHelperData_(ss);
  insertDashboardCharts_(ss);

  ss.toast('Setup hoàn tất: đã tạo/cập nhật các sheet.');
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  var currentHeaders = headerRange.getValues()[0];
  var isEmpty = currentHeaders.every(function (v) { return v === ''; });
  if (isEmpty) {
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }
  return sheet;
}

// Sheet Customers đã tồn tại trước đó (không có cột Phí) — chèn thêm ngay sau "SĐT".
function ensureCustomersHasFeeColumn_(sheet) {
  var headers = getHeaders_(sheet);
  if (headers.indexOf('Phí (%)') !== -1) return;

  var colSdt = headers.indexOf('SĐT');
  var afterCol = colSdt !== -1 ? colSdt + 1 : sheet.getLastColumn();
  insertHeadersAfter_(sheet, afterCol, ['Phí (%)']);
}

// Sheet Orders đã tồn tại trước đó — đổi tên cột cũ "Giá mua (VND)" thành "Giá VND trước phí" (nếu có),
// chèn "Tỷ giá VCB"/"Giá VND trước phí" nếu sheet còn cũ hơn nữa (chưa từng có), rồi chèn thêm
// "Giá VND sau phí"/"Lợi nhuận (VND)" nếu chưa có. Không đụng dữ liệu các cột khác.
function ensureOrdersHasVcbColumns_(sheet) {
  renameHeaderIfExists_(sheet, 'Giá mua (VND)', 'Giá VND trước phí');

  var headers = getHeaders_(sheet);
  if (headers.indexOf('Tỷ giá VCB') === -1) {
    var colGiaJPY = headers.indexOf('Giá mua (JPY)');
    var afterCol = colGiaJPY !== -1 ? colGiaJPY + 1 : sheet.getLastColumn();
    insertHeadersAfter_(sheet, afterCol, ['Tỷ giá VCB', 'Giá VND trước phí']);
  }

  headers = getHeaders_(sheet);
  if (headers.indexOf('Giá VND sau phí') === -1) {
    var colTruocPhi = headers.indexOf('Giá VND trước phí');
    var afterCol2 = colTruocPhi !== -1 ? colTruocPhi + 1 : sheet.getLastColumn();
    insertHeadersAfter_(sheet, afterCol2, ['Giá VND sau phí', 'Lợi nhuận (VND)']);
  }
}

// Sheet Orders đã tồn tại trước đó (chưa có cột Phí ship) — chèn thêm ngay sau "Giá mua (JPY)".
// Đơn cũ không có cột này sẽ để trống (coi như phí ship = 0, không ảnh hưởng số liệu cũ đã tính).
function ensureOrdersHasShipFeeColumn_(sheet) {
  var headers = getHeaders_(sheet);
  if (headers.indexOf('Phí ship (JPY)') !== -1) return;

  var colGiaJPY = headers.indexOf('Giá mua (JPY)');
  var afterCol = colGiaJPY !== -1 ? colGiaJPY + 1 : sheet.getLastColumn();
  insertHeadersAfter_(sheet, afterCol, ['Phí ship (JPY)']);
}

function applyDataValidation_(sheet, headerName, list) {
  var headers = getHeaders_(sheet);
  var colIndex = headers.indexOf(headerName);
  if (colIndex === -1) return;
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
  sheet.getRange(2, colIndex + 1, FORMAT_BUFFER_ROWS, 1).setDataValidation(rule);
}

function applyMinNumberValidation_(sheet, headerName, min) {
  var headers = getHeaders_(sheet);
  var colIndex = headers.indexOf(headerName);
  if (colIndex === -1) return;
  var rule = SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(min).setAllowInvalid(false).build();
  sheet.getRange(2, colIndex + 1, FORMAT_BUFFER_ROWS, 1).setDataValidation(rule);
}

// Sheet Orders đã tồn tại trước đó (mỗi đơn coi như số lượng = 1) — chèn thêm "Đơn giá (JPY)"/"Số lượng"
// ngay trước "Giá mua (JPY)", rồi đổi nghĩa "Giá mua (JPY)" thành tổng tiền (đơn giá × số lượng). Backfill
// dữ liệu cũ: Đơn giá = Giá mua (JPY) hiện có, Số lượng = 1 — không đổi giá trị Giá mua (JPY)/giá VND đã tính.
function ensureOrdersHasQuantityColumns_(sheet) {
  var headers = getHeaders_(sheet);
  if (headers.indexOf('Số lượng') !== -1) return;

  var colGiaJPY = headers.indexOf('Giá mua (JPY)');
  var afterCol = colGiaJPY !== -1 ? colGiaJPY : sheet.getLastColumn();
  insertHeadersAfter_(sheet, afterCol, ['Đơn giá (JPY)', 'Số lượng']);

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  headers = getHeaders_(sheet);
  var colDonGia = headers.indexOf('Đơn giá (JPY)');
  var colSoLuong = headers.indexOf('Số lượng');
  var colGiaJPYMoi = headers.indexOf('Giá mua (JPY)');
  var giaMuaValues = sheet.getRange(2, colGiaJPYMoi + 1, lastRow - 1, 1).getValues();

  sheet.getRange(2, colDonGia + 1, lastRow - 1, 1).setValues(giaMuaValues);
  sheet.getRange(2, colSoLuong + 1, lastRow - 1, 1).setValues(giaMuaValues.map(function () { return [1]; }));
}

function setupDashboardFormulas_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.DASHBOARD);
  var ordersHeaders = getHeaders_(ss.getSheetByName(SHEET_NAMES.ORDERS));
  var colIdDon = columnIndexToLetter_(ordersHeaders.indexOf('ID đơn') + 1);
  var colNgayTao = columnIndexToLetter_(ordersHeaders.indexOf('Ngày tạo') + 1);
  var colGiaJPY = columnIndexToLetter_(ordersHeaders.indexOf('Giá mua (JPY)') + 1);
  var colTrangThai = columnIndexToLetter_(ordersHeaders.indexOf('Trạng thái') + 1);
  var colLoiNhuan = columnIndexToLetter_(ordersHeaders.indexOf('Lợi nhuận (VND)') + 1);

  var rows = [
    ['Tổng đơn hôm nay', '=COUNTIFS(Orders!' + colNgayTao + ':' + colNgayTao + ',">="&TODAY(),Orders!' + colNgayTao + ':' + colNgayTao + ',"<"&(TODAY()+1))'],
    ['Tổng tiền JPY (tất cả đơn)', '=SUM(Orders!' + colGiaJPY + '2:' + colGiaJPY + ')'],
    ['Tổng số đơn', '=COUNTA(Orders!' + colIdDon + '2:' + colIdDon + ')'],
    ['Đơn đang vận chuyển', '=COUNTIF(Orders!' + colTrangThai + ':' + colTrangThai + ',"Đang vận chuyển")'],
    ['Đơn hoàn tất', '=COUNTIF(Orders!' + colTrangThai + ':' + colTrangThai + ',"Hoàn tất")'],
    ['Tổng lợi nhuận (VND)', '=SUM(Orders!' + colLoiNhuan + '2:' + colLoiNhuan + ')']
  ];
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
}
