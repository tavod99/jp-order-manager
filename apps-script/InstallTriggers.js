// Script standalone (không bind vào Sheet — xem ghi chú SPREADSHEET_ID ở Config.gs) nên onOpen()/onEdit()
// KHÔNG tự chạy như simple trigger nữa. Phải chạy hàm này 1 LẦN DUY NHẤT từ editor Apps Script (Run >
// setupStandaloneTriggers), đăng nhập bằng tài khoản chủ sở hữu script, để cấp quyền + đăng ký installable
// trigger. Sau đó trigger chạy bằng quyền của chủ sở hữu, nên vẫn hoạt động bình thường khi người khác
// (chỉ có quyền Editor trên Sheet, không có quyền vào project script) sửa dữ liệu trên Sheet.
// An toàn để chạy lại nhiều lần — luôn xoá trigger onOpen/onEdit cũ trước khi tạo mới, tránh chạy trùng 2 lần.
function setupStandaloneTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'onOpen' || fn === 'onEdit') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('onOpen').forSpreadsheet(SPREADSHEET_ID).onOpen().create();
  ScriptApp.newTrigger('onEdit').forSpreadsheet(SPREADSHEET_ID).onEdit().create();
}
