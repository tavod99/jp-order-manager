// Script standalone không có "active spreadsheet" — luôn phải mở đúng file theo SPREADSHEET_ID
// (xem Config.gs). Dùng hàm này ở MỌI nơi thay cho SpreadsheetApp.getActiveSpreadsheet().
function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet_(name) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet không tồn tại: ' + name + ' — chạy setupSheets() trước.');
  return sheet;
}

function getHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

// Ghi 1 dòng theo tên cột (không phụ thuộc thứ tự cột) để dễ sửa schema sau này.
function appendRowByHeaders_(sheet, rowObject) {
  var headers = getHeaders_(sheet);
  var row = headers.map(function (h) {
    return rowObject.hasOwnProperty(h) ? rowObject[h] : '';
  });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

// Đổi số cột (1-based) thành chữ cột Sheet (1→A, 2→B, ..., 27→AA). Dùng để dựng công thức tham chiếu
// theo TÊN cột (qua getHeaders_/indexOf) thay vì hardcode chữ cột — tránh lệch khi schema thêm/đổi cột.
function columnIndexToLetter_(colIndex1Based) {
  var letter = '';
  var n = colIndex1Based;
  while (n > 0) {
    var rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Trả về số dòng (1-based, tính cả header) của dòng đầu tiên có giá trị khớp ở cột headerName, hoặc -1 nếu không có.
function findRowIndexByColumnValue_(sheet, headerName, value) {
  var headers = getHeaders_(sheet);
  var col = headers.indexOf(headerName);
  if (col === -1) return -1;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  var values = sheet.getRange(2, col + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === value) return i + 2;
  }
  return -1;
}

function getRowAsObject_(sheet, rowIndex) {
  var headers = getHeaders_(sheet);
  var values = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  var obj = {};
  headers.forEach(function (h, i) { obj[h] = values[i]; });
  return obj;
}

function setCellByHeader_(sheet, rowIndex, headerName, value) {
  var headers = getHeaders_(sheet);
  var col = headers.indexOf(headerName);
  if (col === -1) return;
  sheet.getRange(rowIndex, col + 1).setValue(value);
}

// Đổi tên cột header (chỉ đổi nếu oldName đang tồn tại và newName chưa có) — dùng khi migrate schema
// trên sheet đã có dữ liệu, không phải tạo cột mới.
function renameHeaderIfExists_(sheet, oldName, newName) {
  var headers = getHeaders_(sheet);
  var col = headers.indexOf(oldName);
  if (col !== -1 && headers.indexOf(newName) === -1) {
    sheet.getRange(1, col + 1).setValue(newName);
  }
}

// Chèn các cột mới ngay sau cột thứ afterCol1Based (1-based), đặt header tương ứng, in đậm.
function insertHeadersAfter_(sheet, afterCol1Based, headerNames) {
  sheet.insertColumnsAfter(afterCol1Based, headerNames.length);
  var range = sheet.getRange(1, afterCol1Based + 1, 1, headerNames.length);
  range.setValues([headerNames]);
  range.setFontWeight('bold');
}

// Gắn header User-Agent giống trình duyệt thật vào options của UrlFetchApp.fetch, không ghi đè
// headers khác nếu caller đã tự đặt sẵn (ví dụ Cookie).
function fetchOptionsWithUA_(options) {
  options = options || {};
  options.headers = Object.assign({ 'User-Agent': BROWSER_USER_AGENT }, options.headers || {});
  return options;
}

// Nghỉ ngẫu nhiên trong khoảng [minMs, maxMs] thay vì 1 khoảng cố định — tránh tạo nhịp request
// đều tăm tắp dễ bị anti-bot fingerprint là script tự động.
function randomSleep_(minMs, maxMs) {
  var ms = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  Utilities.sleep(ms);
}
