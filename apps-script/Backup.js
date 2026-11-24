// Backup toàn bộ file Sheet (nhân bản — "Make a copy") vào 1 thư mục riêng trên Drive, để an toàn
// nếu lỡ tay xóa/sửa hỏng dữ liệu gốc. Dùng menu "Order Manager > Backup ngay" để chạy thử thủ công,
// hoặc "Bật backup tự động hàng ngày" để chạy lúc 2h sáng mỗi ngày qua trigger.
var BACKUP_FOLDER_NAME = 'Backup - Mercari Order System';

function getOrCreateBackupFolder_() {
  var folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

// Dùng toast() (không phải getUi().alert) vì hàm này cần chạy được cả khi gọi từ trigger tự động
// (không có UI context) lẫn khi chạy thủ công từ menu.
function backupSpreadsheetNow() {
  var ss = getSpreadsheet_();
  var file = DriveApp.getFileById(ss.getId());
  var folder = getOrCreateBackupFolder_();
  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var backupName = 'Backup - ' + ss.getName() + ' - ' + timestamp;

  file.makeCopy(backupName, folder);
  ss.toast('Đã backup xong: ' + backupName, 'Backup', 5);
}

// Chạy 1 lần để bật backup tự động mỗi ngày lúc 2h sáng (giờ theo Time zone của project, xem
// appsscript.json > timeZone). An toàn để chạy lại nhiều lần — luôn xóa trigger cũ trước khi tạo mới.
function setupBackupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupSpreadsheetNow') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupSpreadsheetNow').timeBased().atHour(2).everyDays(1).create();
}
