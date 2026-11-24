// Giới hạn số kết quả trả về — bảng Orders càng lớn, trả hết kết quả vừa chậm vừa tốn payload không cần thiết.
var SEARCH_MAX_RESULTS = 30;

// data: { keyword }
function actionSearch_(data) {
  var keyword = String(data.keyword || '').trim().toLowerCase();
  if (!keyword) return { ok: false, error: 'Thiếu từ khóa tìm kiếm' };

  var sheet = getSheet_(SHEET_NAMES.ORDERS);
  var headers = getHeaders_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, results: [] };

  var searchHeaders = ['Tên khách', 'Mã khách', 'Tracking', 'Link sản phẩm', 'Mã sản phẩm'];
  var searchCols = searchHeaders.map(function (h) { return headers.indexOf(h); });

  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var results = [];

  // Quét từ dòng mới nhất (đơn gần đây thường liên quan hơn) và dừng sớm khi đủ số lượng cần.
  for (var i = values.length - 1; i >= 0 && results.length < SEARCH_MAX_RESULTS; i--) {
    var row = values[i];
    var match = searchCols.some(function (col) {
      return col !== -1 && String(row[col] || '').toLowerCase().indexOf(keyword) !== -1;
    });
    if (match) {
      var obj = {};
      headers.forEach(function (h, idx) { obj[h] = row[idx]; });
      obj['__sheetRow'] = i + 2;
      results.push(obj);
    }
  }

  return { ok: true, results: results };
}
