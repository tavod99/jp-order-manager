// data: { idDon, tracking?, hangVanChuyen?, trangThai? }
function actionUpdateTracking_(data) {
  if (!data.idDon) return { ok: false, error: 'Thiếu ID đơn' };

  var sheet = getSheet_(SHEET_NAMES.ORDERS);
  var rowIndex = findRowIndexByColumnValue_(sheet, 'ID đơn', data.idDon);
  if (rowIndex === -1) return { ok: false, error: 'Không tìm thấy đơn: ' + data.idDon };

  var before = getRowAsObject_(sheet, rowIndex);

  if (data.tracking !== undefined) setCellByHeader_(sheet, rowIndex, 'Tracking', data.tracking);
  if (data.hangVanChuyen !== undefined) setCellByHeader_(sheet, rowIndex, 'Hãng vận chuyển', data.hangVanChuyen);
  if (data.trangThai !== undefined) setCellByHeader_(sheet, rowIndex, 'Trạng thái', data.trangThai);
  setCellByHeader_(sheet, rowIndex, 'Lần cập nhật tracking cuối', new Date());

  logTrackingChange_(
    data.idDon,
    data.tracking !== undefined ? data.tracking : before['Tracking'],
    data.hangVanChuyen !== undefined ? data.hangVanChuyen : before['Hãng vận chuyển'],
    before['Trạng thái'],
    data.trangThai !== undefined ? data.trangThai : before['Trạng thái'],
    'Cập nhật thủ công'
  );

  return { ok: true };
}

function logTrackingChange_(idDon, tracking, hangVanChuyen, trangThaiCu, trangThaiMoi, ghiChu) {
  var logSheet = getSheet_(SHEET_NAMES.TRACKING_LOG);
  appendRowByHeaders_(logSheet, {
    'Thời gian': new Date(),
    'ID đơn': idDon,
    'Tracking': tracking,
    'Hãng vận chuyển': hangVanChuyen,
    'Trạng thái cũ': trangThaiCu,
    'Trạng thái mới': trangThaiMoi,
    'Ghi chú': ghiChu
  });
}
