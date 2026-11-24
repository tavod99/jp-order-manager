// Chạy 1 lần (hoặc qua menu Order Manager > "Cập nhật biểu đồ Dashboard") để tạo/làm mới bảng phụ + chart.
// An toàn để chạy lại nhiều lần — không xoá dữ liệu Orders, chỉ ghi lại vùng helper D1:N... và chart.
function setupDashboardCharts() {
  var ss = getSpreadsheet_();
  setupDashboardHelperData_(ss);
  insertDashboardCharts_(ss);
  ss.toast('Đã cập nhật biểu đồ Dashboard.');
}

// Ghi các bảng phụ làm nguồn dữ liệu cho chart: Trạng thái (D:E), Hãng vận chuyển (G:H),
// Số đơn theo ngày (J:K), Top khách hàng theo tổng tiền (M:N), Lợi nhuận theo ngày (P:Q),
// Lợi nhuận theo khách hàng (S:T).
function setupDashboardHelperData_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.DASHBOARD);
  if (!sheet) return;

  // Tính chữ cột theo TÊN header (không hardcode A/B/K...) — tránh lệch khi Orders thêm/đổi vị trí cột
  // (đã từng lệch thật khi thêm cột Tỷ giá VCB/Giá mua VND).
  var ordersHeaders = getHeaders_(ss.getSheetByName(SHEET_NAMES.ORDERS));
  var colTrangThai = columnIndexToLetter_(ordersHeaders.indexOf('Trạng thái') + 1);
  var colHang = columnIndexToLetter_(ordersHeaders.indexOf('Hãng vận chuyển') + 1);
  var colNgayTao = columnIndexToLetter_(ordersHeaders.indexOf('Ngày tạo') + 1);
  var colTenKhach = columnIndexToLetter_(ordersHeaders.indexOf('Tên khách') + 1);
  var colGiaJPY = columnIndexToLetter_(ordersHeaders.indexOf('Giá mua (JPY)') + 1);
  var colLoiNhuan = columnIndexToLetter_(ordersHeaders.indexOf('Lợi nhuận (VND)') + 1);

  sheet.getRange('D1:E1').setValues([['Trạng thái', 'Số đơn']]);
  var statusRows = STATUS_LIST.map(function (s) {
    return [s, '=COUNTIF(Orders!' + colTrangThai + ':' + colTrangThai + ',"' + s + '")'];
  });
  sheet.getRange(2, 4, statusRows.length, 2).setValues(statusRows);

  sheet.getRange('G1:H1').setValues([['Hãng vận chuyển', 'Số đơn']]);
  var carrierRows = CARRIER_LIST.map(function (c) {
    return [c, '=COUNTIF(Orders!' + colHang + ':' + colHang + ',"' + c + '")'];
  });
  sheet.getRange(2, 7, carrierRows.length, 2).setValues(carrierRows);

  sheet.getRange('J1:K1').setValues([['Ngày', 'Số đơn']]);
  sheet.getRange('J2').setFormula(
    '=IFERROR(QUERY({ARRAYFORMULA(IF(Orders!' + colNgayTao + '2:' + colNgayTao + '="","",TEXT(Orders!' + colNgayTao + '2:' + colNgayTao + ',"yyyy-MM-dd"))),' +
    'ARRAYFORMULA(IF(Orders!' + colNgayTao + '2:' + colNgayTao + '="","",1))},' +
    '"select Col1, sum(Col2) where Col1 is not null group by Col1 order by Col1 label sum(Col2) \'\'"),"")'
  );

  sheet.getRange('M1:N1').setValues([['Khách hàng', 'Tổng tiền (JPY)']]);
  sheet.getRange('M2').setFormula(
    '=IFERROR(QUERY(Orders!' + colTenKhach + '2:' + colGiaJPY + ',' +
    '"select ' + colTenKhach + ', sum(' + colGiaJPY + ') where ' + colTenKhach + ' is not null and ' + colTenKhach + ' <> \'\' group by ' + colTenKhach + ' order by sum(' + colGiaJPY + ') desc label sum(' + colGiaJPY + ') \'\'"),"")'
  );

  sheet.getRange('P1:Q1').setValues([['Ngày', 'Lợi nhuận (VND)']]);
  sheet.getRange('P2').setFormula(
    '=IFERROR(QUERY({ARRAYFORMULA(IF(Orders!' + colNgayTao + '2:' + colNgayTao + '="","",TEXT(Orders!' + colNgayTao + '2:' + colNgayTao + ',"yyyy-MM-dd"))),' +
    'ARRAYFORMULA(IF(Orders!' + colLoiNhuan + '2:' + colLoiNhuan + '="","",Orders!' + colLoiNhuan + '2:' + colLoiNhuan + '))},' +
    '"select Col1, sum(Col2) where Col1 is not null group by Col1 order by Col1 label sum(Col2) \'\'"),"")'
  );

  sheet.getRange('S1:T1').setValues([['Khách hàng', 'Lợi nhuận (VND)']]);
  sheet.getRange('S2').setFormula(
    '=IFERROR(QUERY({ARRAYFORMULA(IF(Orders!' + colTenKhach + '2:' + colTenKhach + '="","",Orders!' + colTenKhach + '2:' + colTenKhach + ')),' +
    'ARRAYFORMULA(IF(Orders!' + colLoiNhuan + '2:' + colLoiNhuan + '="","",Orders!' + colLoiNhuan + '2:' + colLoiNhuan + '))},' +
    '"select Col1, sum(Col2) where Col1 is not null and Col1 <> \'\' group by Col1 order by sum(Col2) desc label sum(Col2) \'\'"),"")'
  );
}

// Tạo lại 4 chart trên Dashboard: pie trạng thái, pie hãng vận chuyển, cột số đơn/ngày, cột top khách hàng.
function insertDashboardCharts_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.DASHBOARD);
  if (!sheet) return;

  sheet.getCharts().forEach(function (chart) { sheet.removeChart(chart); });

  var pieStatus = sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(sheet.getRange('D1:E6'))
    .setPosition(8, 1, 0, 0)
    .setOption('title', 'Đơn hàng theo trạng thái')
    .setOption('pieSliceText', 'value')
    .setOption('width', 420)
    .setOption('height', 300)
    .build();
  sheet.insertChart(pieStatus);

  var pieCarrier = sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(sheet.getRange('G1:H' + (CARRIER_LIST.length + 1)))
    .setPosition(8, 8, 0, 0)
    .setOption('title', 'Đơn hàng theo hãng vận chuyển')
    .setOption('pieSliceText', 'value')
    .setOption('width', 420)
    .setOption('height', 300)
    .build();
  sheet.insertChart(pieCarrier);

  // Dùng 1 vùng liên tục (header + data) cho mỗi chart, giống 2 pie chart trên — không tách addRange
  // riêng cho header nữa, vì Google Charts hiểu nhầm header là 1 series/điểm dữ liệu riêng thay vì
  // tên cột, khiến trục chỉ hiện đúng chữ "Ngày"/"Khách hàng" thay vì giá trị thật.
  var colDay = sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange('J1:K366'))
    .setPosition(24, 1, 0, 0)
    .setOption('title', 'Số đơn theo ngày')
    .setOption('legend', { position: 'none' })
    .setOption('width', 420)
    .setOption('height', 300)
    .build();
  sheet.insertChart(colDay);

  var barCustomer = sheet.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(sheet.getRange('M1:N21'))
    .setPosition(24, 8, 0, 0)
    .setOption('title', 'Top khách hàng theo tổng tiền (JPY)')
    .setOption('legend', { position: 'none' })
    .setOption('width', 420)
    .setOption('height', 300)
    .build();
  sheet.insertChart(barCustomer);

  var colProfitByDay = sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange('P1:Q366'))
    .setPosition(40, 1, 0, 0)
    .setOption('title', 'Lợi nhuận theo ngày (VND)')
    .setOption('legend', { position: 'none' })
    .setOption('width', 420)
    .setOption('height', 300)
    .build();
  sheet.insertChart(colProfitByDay);

  var barProfitByCustomer = sheet.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(sheet.getRange('S1:T21'))
    .setPosition(40, 8, 0, 0)
    .setOption('title', 'Top khách hàng theo lợi nhuận (VND)')
    .setOption('legend', { position: 'none' })
    .setOption('width', 420)
    .setOption('height', 300)
    .build();
  sheet.insertChart(barProfitByCustomer);
}
