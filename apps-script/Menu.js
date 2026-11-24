// LƯU Ý: script này standalone (không bind vào Sheet), nên đây KHÔNG còn là simple trigger tự chạy —
// phải đăng ký 1 lần qua installable trigger (xem setupStandaloneTriggers() ở InstallTriggers.gs).
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Order Manager')
    .addItem('Cập nhật tracking ngay', 'updateAllTrackingStatuses')
    .addItem('Bật tự động cập nhật tracking (mỗi 4h)', 'setupTrackingTrigger')
    .addSeparator()
    .addItem('Cập nhật tỷ giá VCB ngay', 'refreshVcbRate')
    .addItem('Bật tự động cập nhật tỷ giá VCB (mỗi 4h)', 'setupVcbRateTrigger')
    .addSeparator()
    .addItem('Backup ngay', 'backupSpreadsheetNow')
    .addItem('Bật backup tự động hàng ngày (2h sáng)', 'setupBackupTrigger')
    .addSeparator()
    .addItem('Khởi tạo lại schema', 'setupSheets')
    .addItem('Định dạng đẹp các sheet', 'formatAllSheets')
    .addItem('Cập nhật biểu đồ Dashboard', 'setupDashboardCharts')
    .addToUi();
}
