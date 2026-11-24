// data: { tenSanPham, gia, link, maSanPham, san } — san là 'Mercari' hoặc 'Yahoo'
function actionSaveProduct_(data) {
  if (!data.tenSanPham || !data.link) {
    return { ok: false, error: 'Thiếu tên sản phẩm hoặc link' };
  }

  var sheet = getSheet_(SHEET_NAMES.STAGING);

  var dupMaTam = findDuplicateStagingProduct_(sheet, data.maSanPham, data.san);
  if (dupMaTam) {
    return { ok: true, duplicate: true, maTam: dupMaTam, message: 'Sản phẩm này đã được lưu trước đó (chưa xử lý thành đơn)' };
  }

  // Kiểm tra cả Orders — sản phẩm đã thành đơn rồi thì lưu lại (vô tình bấm trùng) cũng phải báo trùng,
  // không chỉ check trong StagingProducts đang "Chưa xử lý" (1 listing Mercari/Yahoo chỉ bán 1 lần).
  var existingOrder = findExistingOrderByProductCode_(data.maSanPham);
  if (existingOrder) {
    return {
      ok: true,
      duplicate: true,
      idDon: existingOrder.idDon,
      message: 'Sản phẩm này đã được tạo đơn trước đó: ' + existingOrder.idDon
    };
  }

  var maTam = 'SP' + Date.now();
  appendRowByHeaders_(sheet, {
    'Mã tạm': maTam,
    'Thời gian lưu': new Date(),
    'Tên sản phẩm': data.tenSanPham,
    'Giá': data.gia || '',
    'Link': data.link,
    'Mã sản phẩm': data.maSanPham || '',
    'Sàn': data.san || '',
    'Trạng thái xử lý': STAGING_STATUS.PENDING
  });

  return { ok: true, maTam: maTam };
}

// Chỉ quét tối đa 200 dòng gần nhất — sản phẩm trùng (chưa xử lý) chỉ có ý nghĩa khi vừa lưu gần đây,
// quét toàn bảng mỗi lần saveProduct sẽ ngày càng chậm khi StagingProducts tồn đọng nhiều.
var DUPLICATE_SCAN_MAX_ROWS = 200;

function findDuplicateStagingProduct_(sheet, maSanPham, san) {
  if (!maSanPham) return null;

  var headers = getHeaders_(sheet);
  var colMaSanPham = headers.indexOf('Mã sản phẩm');
  var colSan = headers.indexOf('Sàn');
  var colTrangThai = headers.indexOf('Trạng thái xử lý');
  var colMaTam = headers.indexOf('Mã tạm');

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var totalDataRows = lastRow - 1;
  var rowsToScan = Math.min(totalDataRows, DUPLICATE_SCAN_MAX_ROWS);
  var startRow = lastRow - rowsToScan + 1;

  var values = sheet.getRange(startRow, 1, rowsToScan, headers.length).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    var row = values[i];
    if (row[colMaSanPham] === maSanPham && row[colSan] === san && row[colTrangThai] === STAGING_STATUS.PENDING) {
      return row[colMaTam];
    }
  }
  return null;
}

function findExistingOrderByProductCode_(maSanPham) {
  if (!maSanPham) return null;

  var sheet = getSheet_(SHEET_NAMES.ORDERS);
  var headers = getHeaders_(sheet);
  var colMaSanPham = headers.indexOf('Mã sản phẩm');
  var colIdDon = headers.indexOf('ID đơn');

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var totalDataRows = lastRow - 1;
  var rowsToScan = Math.min(totalDataRows, DUPLICATE_SCAN_MAX_ROWS);
  var startRow = lastRow - rowsToScan + 1;

  var values = sheet.getRange(startRow, 1, rowsToScan, headers.length).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (values[i][colMaSanPham] === maSanPham) {
      return { idDon: values[i][colIdDon] };
    }
  }
  return null;
}
