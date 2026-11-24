// LƯU Ý: script này standalone (không bind vào Sheet), nên đây KHÔNG còn là simple trigger tự chạy —
// phải đăng ký 1 lần qua installable trigger (xem setupStandaloneTriggers() ở InstallTriggers.gs), chạy
// với quyền của người cài (chủ sở hữu script), nên vẫn hoạt động khi người chỉ có quyền Editor Sheet sửa.
// Xử lý 3 việc khi người dùng sửa Orders:
// 1) phát hiện dán/xóa đè lên cột "Trạng thái"/"Hãng vận chuyển" (paste thường xóa luôn data validation
//    của ô), rồi gắn lại dropdown ngay cho đúng các dòng vừa bị sửa.
// 2) phát hiện khi nhập/sửa "Đơn giá (JPY)"/"Số lượng", rồi tự tính lại "Giá mua (JPY)" (= đơn giá ×
//    số lượng) cho đúng dòng đó, sau đó tính tiếp như việc 3.
// 3) phát hiện khi nhập/sửa "Giá mua (JPY)"/"Phí ship (JPY)" (thường chưa biết lúc tạo đơn, điền tay sau
//    khi hàng đã gửi), rồi tự tính lại "Giá VND trước phí"/"Giá VND sau phí"/"Lợi nhuận (VND)" cho đúng dòng đó.
function onEdit(e) {
  try {
    var sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_NAMES.ORDERS) return;

    var headers = getHeaders_(sheet);
    var colTrangThai = headers.indexOf('Trạng thái') + 1;
    var colHang = headers.indexOf('Hãng vận chuyển') + 1;
    var colDonGia = headers.indexOf('Đơn giá (JPY)') + 1;
    var colSoLuong = headers.indexOf('Số lượng') + 1;
    var colGiaMua = headers.indexOf('Giá mua (JPY)') + 1;
    var colPhiShip = headers.indexOf('Phí ship (JPY)') + 1;

    var startRow = Math.max(e.range.getRow(), 2); // bỏ qua dòng header nếu vùng sửa dính tới dòng 1
    var lastRow = e.range.getLastRow();
    if (lastRow < startRow) return;

    var startCol = e.range.getColumn();
    var lastCol = startCol + e.range.getNumColumns() - 1;

    if (colTrangThai > 0 && colTrangThai >= startCol && colTrangThai <= lastCol) {
      reapplyDropdown_(sheet, startRow, lastRow, colTrangThai, STATUS_LIST);
    }
    if (colHang > 0 && colHang >= startCol && colHang <= lastCol) {
      reapplyDropdown_(sheet, startRow, lastRow, colHang, CARRIER_LIST);
    }

    var quantityEdited = (colDonGia > 0 && colDonGia >= startCol && colDonGia <= lastCol) ||
      (colSoLuong > 0 && colSoLuong >= startCol && colSoLuong <= lastCol);
    var pricingEdited = quantityEdited || (colGiaMua > 0 && colGiaMua >= startCol && colGiaMua <= lastCol) ||
      (colPhiShip > 0 && colPhiShip >= startCol && colPhiShip <= lastCol);

    if (pricingEdited) {
      for (var row = startRow; row <= lastRow; row++) {
        if (quantityEdited) recalcOrderRowQuantity_(sheet, row);
        recalcOrderRowPricing_(sheet, row);
      }
    }
  } catch (err) {
    Logger.log('onEdit lỗi: ' + String((err && err.message) || err));
  }
}

// Tính lại "Giá mua (JPY)" (= đơn giá × số lượng) cho 1 dòng Orders khi người dùng sửa "Đơn giá (JPY)"
// hoặc "Số lượng". Số lượng trống/không hợp lệ coi như 1 (không có chuyện mua 0 sản phẩm).
function recalcOrderRowQuantity_(sheet, row) {
  var obj = getRowAsObject_(sheet, row);

  var donGiaJPY = Number(obj['Đơn giá (JPY)']) || 0;
  var soLuong = Number(obj['Số lượng']) || 1;

  setCellByHeader_(sheet, row, 'Giá mua (JPY)', donGiaJPY * soLuong);
}

function reapplyDropdown_(sheet, startRow, lastRow, col, list) {
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
  sheet.getRange(startRow, col, lastRow - startRow + 1, 1).setDataValidation(rule);
}

// Tính lại giá VND trước/sau phí + lợi nhuận cho 1 dòng Orders, dùng đúng tỷ giá VCB đã lưu lúc tạo đơn
// (snapshot, không gọi mạng lấy tỷ giá mới) và % phí hiện tại của khách (tra theo Mã khách).
function recalcOrderRowPricing_(sheet, row) {
  var obj = getRowAsObject_(sheet, row);

  var giaJPY = Number(obj['Giá mua (JPY)']) || 0;
  var tyGiaVcb = Number(obj['Tỷ giá VCB']) || 0;
  if (!giaJPY || !tyGiaVcb) return; // thiếu dữ liệu gốc (đơn lỗi tỷ giá lúc tạo) — không tính được

  var phiShipJPY = Number(obj['Phí ship (JPY)']) || 0;

  var customersSheet = getSheet_(SHEET_NAMES.CUSTOMERS);
  var customer = findCustomerByCode_(customersSheet, obj['Mã khách']);
  var phiPercent = customer ? (Number(customer.phiPercent) || 0) : 0;

  var giaVndTruocPhi = Math.round((giaJPY + phiShipJPY) * tyGiaVcb);
  var giaVndSauPhi = Math.round(giaVndTruocPhi * (1 + phiPercent / 100));
  var loiNhuan = giaVndSauPhi - giaVndTruocPhi;

  setCellByHeader_(sheet, row, 'Giá VND trước phí', giaVndTruocPhi);
  setCellByHeader_(sheet, row, 'Giá VND sau phí', giaVndSauPhi);
  setCellByHeader_(sheet, row, 'Lợi nhuận (VND)', loiNhuan);
}
