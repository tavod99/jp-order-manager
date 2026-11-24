// Xoá TOÀN BỘ dữ liệu (giữ lại header + định dạng) ở Customers, StagingProducts, Orders, TrackingLog.
// KHÔNG thể khôi phục — luôn hỏi xác nhận trước khi xoá thật. Dùng cho mục đích test/làm lại từ đầu,
// không nên dùng trên dữ liệu thật đang vận hành.
function resetAllData() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert(
    'Xác nhận xoá toàn bộ dữ liệu',
    'Hành động này sẽ xoá TOÀN BỘ dữ liệu trong Customers, StagingProducts, Orders, TrackingLog ' +
    '(giữ lại header và định dạng). KHÔNG thể khôi phục lại. Bạn chắc chắn muốn tiếp tục?',
    ui.ButtonSet.YES_NO
  );

  var ss = getSpreadsheet_();

  if (response !== ui.Button.YES) {
    ss.toast('Đã hủy — không có gì bị xoá.');
    return;
  }

  clearSheetData_(ss.getSheetByName(SHEET_NAMES.CUSTOMERS));
  clearSheetData_(ss.getSheetByName(SHEET_NAMES.STAGING));
  clearSheetData_(ss.getSheetByName(SHEET_NAMES.ORDERS));
  clearSheetData_(ss.getSheetByName(SHEET_NAMES.TRACKING_LOG));

  invalidateCustomersCache_();

  ss.toast('Đã xoá toàn bộ dữ liệu (giữ lại header).');
}

function clearSheetData_(sheet) {
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return; // chỉ có header, không có gì để xoá
  sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
}
