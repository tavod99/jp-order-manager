// data: { maTam, maKhach } — maKhach lấy từ kết quả tìm theo tên/mã khách/địa chỉ (xem actionSearchCustomers_).
function actionFinalizeOrder_(data) {
  if (!data.maTam) {
    return { ok: false, error: 'Thiếu mã tạm' };
  }
  if (!data.maKhach) {
    return { ok: false, error: 'Thiếu mã khách' };
  }

  var stagingSheet = getSheet_(SHEET_NAMES.STAGING);
  var rowIndex = findRowIndexByColumnValue_(stagingSheet, 'Mã tạm', data.maTam);
  if (rowIndex === -1) {
    return { ok: false, error: 'Không tìm thấy sản phẩm tạm: ' + data.maTam };
  }

  var stagingRow = getRowAsObject_(stagingSheet, rowIndex);
  if (stagingRow['Trạng thái xử lý'] === STAGING_STATUS.DONE) {
    return { ok: false, error: 'Sản phẩm này đã được tạo đơn trước đó' };
  }

  var customersSheet = getSheet_(SHEET_NAMES.CUSTOMERS);
  var customer = findCustomerByCode_(customersSheet, data.maKhach);
  if (!customer) return { ok: false, error: 'Không tìm thấy khách với mã: ' + data.maKhach };

  var ordersSheet = getSheet_(SHEET_NAMES.ORDERS);
  var idDon = 'DH' + Date.now();

  // Lấy tỷ giá VCB đã lưu sẵn (xem VcbRate.gs — không gọi mạng lúc tạo đơn) làm snapshot tại thời điểm
  // tạo đơn, để giữ đúng giá trị lúc mua, không đổi theo tỷ giá hiện tại khi xem lại đơn cũ.
  // Phí ship thường chưa biết lúc tạo đơn (chỉ rõ khi hàng đã gửi) — để trống 0, sau này điền tay vào
  // Sheet sẽ tự kích hoạt tính lại (xem onEdit ở OnEditTrigger.gs).
  // Số lượng và phí ship nhập sẵn từ extension lúc tạo đơn (mặc định số lượng 1, phí ship 0) — sửa tay
  // sau trong Sheet vẫn tự tính lại Giá mua (JPY)/giá VND trước/sau phí như thường (xem onEdit ở
  // OnEditTrigger.gs).
  // Giá VND trước phí = (giá mua + phí ship) × tỷ giá. Giá sau phí = giá trước phí × (1 + % phí
  // của khách) — % áp dụng trên cả giá mua và phí ship. Lợi nhuận = chênh lệch giữa 2 giá đó.
  // Lỗi lấy tỷ giá không chặn việc tạo đơn — chỉ để trống các cột này, có thể điền tay sau.
  var donGiaJPY = Number(stagingRow['Giá']) || 0;
  var soLuong = Number(data.soLuong) || 1;
  var giaJPY = donGiaJPY * soLuong;
  var phiShipJPY = Number(data.phiShipJPY) || 0;
  var tyGiaVcb = '';
  var giaVndTruocPhi = '';
  var giaVndSauPhi = '';
  var loiNhuan = '';
  try {
    tyGiaVcb = fetchVcbJpySellRate_();
    if (giaJPY) {
      giaVndTruocPhi = Math.round((giaJPY + phiShipJPY) * tyGiaVcb);
      var phiPercent = Number(customer.phiPercent) || 0;
      giaVndSauPhi = Math.round(giaVndTruocPhi * (1 + phiPercent / 100));
      loiNhuan = giaVndSauPhi - giaVndTruocPhi;
    }
  } catch (err) {
    Logger.log('Lỗi lấy tỷ giá VCB khi tạo đơn ' + idDon + ': ' + String((err && err.message) || err));
  }

  appendRowByHeaders_(ordersSheet, {
    'ID đơn': idDon,
    'Ngày tạo': new Date(),
    'Mã khách': customer.maKhach,
    'Tên khách': customer.tenKhach,
    'Tên sản phẩm': stagingRow['Tên sản phẩm'],
    'Đơn giá (JPY)': donGiaJPY,
    'Số lượng': soLuong,
    'Giá mua (JPY)': giaJPY,
    'Phí ship (JPY)': phiShipJPY,
    'Tỷ giá VCB': tyGiaVcb,
    'Giá VND trước phí': giaVndTruocPhi,
    'Giá VND sau phí': giaVndSauPhi,
    'Lợi nhuận (VND)': loiNhuan,
    'Link sản phẩm': stagingRow['Link'],
    'Mã sản phẩm': stagingRow['Mã sản phẩm'],
    'Hãng vận chuyển': '',
    'Tracking': '',
    'Trạng thái': STATUS_LIST[0],
    'Ghi chú': data.ghiChu || '',
    'Lần cập nhật tracking cuối': ''
  });

  setCellByHeader_(stagingSheet, rowIndex, 'Trạng thái xử lý', STAGING_STATUS.DONE);

  return { ok: true, idDon: idDon, maKhach: customer.maKhach, tenKhach: customer.tenKhach };
}

function actionListPendingStaging_() {
  var sheet = getSheet_(SHEET_NAMES.STAGING);
  var headers = getHeaders_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, items: [] };

  var colTrangThai = headers.indexOf('Trạng thái xử lý');
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  var items = [];
  values.forEach(function (row) {
    if (row[colTrangThai] === STAGING_STATUS.PENDING) {
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = row[i]; });
      items.push(obj);
    }
  });

  return { ok: true, items: items };
}
