// Chạy 1 lần (hoặc qua menu Order Manager > "Định dạng đẹp các sheet") để làm đẹp toàn bộ Sheet.
// An toàn để chạy lại nhiều lần — không xoá dữ liệu, chỉ áp lại định dạng.
// Mọi vùng định dạng (border/banding/number format) dùng FORMAT_BUFFER_ROWS (xem Config.gs) thay vì
// đúng số dòng hiện có, để dữ liệu Apps Script thêm vào sau tự có định dạng, không cần chạy lại hàm này.
function formatAllSheets() {
  var ss = getSpreadsheet_();

  // Tạo filter TRƯỚC — phòng trường hợp filter tự đổi style header, để bước tô màu header chạy sau cùng ghi đè lại.
  addFilter_(ss.getSheetByName(SHEET_NAMES.CUSTOMERS));
  addFilter_(ss.getSheetByName(SHEET_NAMES.STAGING));
  addFilter_(ss.getSheetByName(SHEET_NAMES.ORDERS));
  addFilter_(ss.getSheetByName(SHEET_NAMES.TRACKING_LOG));

  formatSheetGeneric_(ss.getSheetByName(SHEET_NAMES.CUSTOMERS), '#4285f4');
  formatSheetGeneric_(ss.getSheetByName(SHEET_NAMES.STAGING), '#ff9800');
  formatSheetGeneric_(ss.getSheetByName(SHEET_NAMES.ORDERS), '#34a853');
  formatSheetGeneric_(ss.getSheetByName(SHEET_NAMES.DASHBOARD), '#a142f4');
  formatSheetGeneric_(ss.getSheetByName(SHEET_NAMES.TRACKING_LOG), '#00acc1');

  formatCustomersSheet_(ss.getSheetByName(SHEET_NAMES.CUSTOMERS));
  formatOrdersSheet_(ss.getSheetByName(SHEET_NAMES.ORDERS));
  formatStagingSheet_(ss.getSheetByName(SHEET_NAMES.STAGING));
  formatDashboardSheet_(ss.getSheetByName(SHEET_NAMES.DASHBOARD));

  ss.toast('Đã định dạng lại các sheet.');
}

// Thêm filter (mũi tên lọc/sắp xếp ở header) cho vùng đệm. Bỏ filter cũ trước để tránh lỗi khi chạy lại nhiều lần.
function addFilter_(sheet) {
  if (!sheet) return;
  var existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();

  var lastCol = sheet.getLastColumn();
  sheet.getRange(1, 1, FORMAT_BUFFER_ROWS + 1, lastCol).createFilter();
}

// Áp dụng cho mọi sheet: màu tab, header đậm có màu nền, border nhạt, màu xen dòng, tự co giãn cột.
function formatSheetGeneric_(sheet, tabColor) {
  if (!sheet) return;

  var lastCol = sheet.getLastColumn();

  sheet.setTabColor(tabColor);

  var headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange.setBackground(tabColor);
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  var dataRange = sheet.getRange(1, 1, FORMAT_BUFFER_ROWS + 1, lastCol);
  dataRange.setBorder(true, true, true, true, true, true, '#d9d9d9', SpreadsheetApp.BorderStyle.SOLID);

  sheet.getBandings().forEach(function (b) { b.remove(); });
  // Banding chỉ áp cho phần dữ liệu (từ dòng 2), không đụng header — tránh banding ghi đè màu header đã set ở trên.
  sheet.getRange(2, 1, FORMAT_BUFFER_ROWS, lastCol).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);

  // Set lại màu/chữ header lần cuối để chắc chắn không bị banding hoặc bước nào khác ghi đè.
  headerRange.setBackground(tabColor);
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');

  sheet.autoResizeColumns(1, lastCol);
}

function formatCustomersSheet_(sheet) {
  if (!sheet) return;
  var headers = getHeaders_(sheet);

  var colNgayTao = headers.indexOf('Ngày tạo');
  if (colNgayTao !== -1) {
    sheet.getRange(2, colNgayTao + 1, FORMAT_BUFFER_ROWS, 1).setNumberFormat('yyyy-mm-dd HH:mm');
  }

  var colPhi = headers.indexOf('Phí (%)');
  if (colPhi !== -1) {
    sheet.getRange(2, colPhi + 1, FORMAT_BUFFER_ROWS, 1).setNumberFormat('0.##"%"');
  }
}

function formatOrdersSheet_(sheet) {
  if (!sheet) return;
  var headers = getHeaders_(sheet);

  ['Đơn giá (JPY)', 'Giá mua (JPY)', 'Phí ship (JPY)'].forEach(function (h) {
    var col = headers.indexOf(h);
    if (col !== -1) {
      sheet.getRange(2, col + 1, FORMAT_BUFFER_ROWS, 1).setNumberFormat('#,##0 "¥"');
    }
  });

  var colSoLuong = headers.indexOf('Số lượng');
  if (colSoLuong !== -1) {
    sheet.getRange(2, colSoLuong + 1, FORMAT_BUFFER_ROWS, 1).setNumberFormat('0');
  }

  var colTyGia = headers.indexOf('Tỷ giá VCB');
  if (colTyGia !== -1) {
    sheet.getRange(2, colTyGia + 1, FORMAT_BUFFER_ROWS, 1).setNumberFormat('#,##0.00');
  }

  ['Giá VND trước phí', 'Giá VND sau phí', 'Lợi nhuận (VND)'].forEach(function (h) {
    var col = headers.indexOf(h);
    if (col !== -1) {
      sheet.getRange(2, col + 1, FORMAT_BUFFER_ROWS, 1).setNumberFormat('#,##0 "₫"');
    }
  });

  var colTracking = headers.indexOf('Tracking');
  if (colTracking !== -1) {
    sheet.getRange(2, colTracking + 1, FORMAT_BUFFER_ROWS, 1).setNumberFormat('@');
  }

  ['Ngày tạo', 'Lần cập nhật tracking cuối'].forEach(function (h) {
    var col = headers.indexOf(h);
    if (col !== -1) {
      sheet.getRange(2, col + 1, FORMAT_BUFFER_ROWS, 1).setNumberFormat('yyyy-mm-dd HH:mm');
    }
  });

  var colTrangThai = headers.indexOf('Trạng thái');
  if (colTrangThai !== -1) {
    var range = sheet.getRange(2, colTrangThai + 1, FORMAT_BUFFER_ROWS, 1);
    var rules = [
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Đã mua').setBackground('#f4cccc').setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Seller đã gửi').setBackground('#d9d2e9').setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Đang vận chuyển').setBackground('#fff2cc').setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Đã giao kho Nhật').setBackground('#cfe2f3').setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Hoàn tất').setBackground('#b6d7a8').setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Đã đánh giá').setBackground('#274e13').setFontColor('#ffffff').setRanges([range]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Chú ý').setBackground('#990000').setFontColor('#ffffff').setRanges([range]).build()
    ];
    sheet.setConditionalFormatRules(rules);
  }
}

function formatStagingSheet_(sheet) {
  if (!sheet) return;
  var headers = getHeaders_(sheet);

  var colGia = headers.indexOf('Giá');
  if (colGia !== -1) {
    sheet.getRange(2, colGia + 1, FORMAT_BUFFER_ROWS, 1).setNumberFormat('#,##0 "¥"');
  }

  var colThoiGian = headers.indexOf('Thời gian lưu');
  if (colThoiGian !== -1) {
    sheet.getRange(2, colThoiGian + 1, FORMAT_BUFFER_ROWS, 1).setNumberFormat('yyyy-mm-dd HH:mm');
  }
}

function formatDashboardSheet_(sheet) {
  if (!sheet) return;
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 150);
  sheet.getRange(2, 2, 20, 1).setHorizontalAlignment('center').setFontWeight('bold');
}
