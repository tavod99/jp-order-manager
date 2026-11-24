function doGet(e) {
  return jsonResponse_({ ok: true, message: 'Mercari/Yahoo Order System API đang chạy' });
}

// Extension phải POST với Content-Type: text/plain;charset=utf-8 chứa JSON string.
// Apps Script Web App không xử lý OPTIONS preflight, nên dùng application/json sẽ bị CORS chặn.
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ ok: false, error: 'Thiếu request body' });
    }
    var payload = JSON.parse(e.postData.contents);
    var secret = getSecret_();
    if (!secret || payload.secret !== secret) {
      return jsonResponse_({ ok: false, error: 'Sai hoặc thiếu secret' });
    }

    if (!checkRateLimit_()) {
      return jsonResponse_({ ok: false, error: 'Quá nhiều request — vui lòng thử lại sau ít phút.' });
    }

    var action = payload.action;
    var data = payload.data || {};

    switch (action) {
      case 'ping':
        return jsonResponse_({ ok: true, pong: true });
      case 'saveProduct':
        return jsonResponse_(actionSaveProduct_(data));
      case 'createCustomer':
        return jsonResponse_(actionCreateCustomer_(data));
      case 'listCustomers':
        return jsonResponse_(actionListCustomers_());
      case 'searchCustomers':
        return jsonResponse_(actionSearchCustomers_(data));
      case 'finalizeOrder':
        return jsonResponse_(actionFinalizeOrder_(data));
      case 'listPendingStaging':
        return jsonResponse_(actionListPendingStaging_());
      case 'updateTracking':
        return jsonResponse_(actionUpdateTracking_(data));
      case 'search':
        return jsonResponse_(actionSearch_(data));
      case 'refreshVcbRate':
        return jsonResponse_({ ok: true, rate: refreshVcbRate() });
      case 'triggerUpdateAllTracking':
        return jsonResponse_(actionTriggerUpdateAllTracking_());
      default:
        return jsonResponse_({ ok: false, error: 'Action không hợp lệ: ' + action });
    }
  } catch (err) {
    return jsonResponse_({ ok: false, error: String((err && err.message) || err) });
  }
}
