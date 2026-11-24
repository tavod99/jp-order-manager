async function getConfig() {
  const cfg = await chrome.storage.sync.get(['appsScriptUrl', 'apiSecret']);
  return { appsScriptUrl: cfg.appsScriptUrl || '', apiSecret: cfg.apiSecret || '' };
}

async function extractFromTab(tabId) {
  return await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_PRODUCT' });
}

// Apps Script Web App không xử lý OPTIONS preflight, nên phải gửi text/plain chứa JSON string
// (application/json sẽ kích hoạt preflight và bị CORS chặn).
async function callAppsScriptRaw(action, data) {
  const { appsScriptUrl, apiSecret } = await getConfig();
  if (!appsScriptUrl || !apiSecret) {
    throw new Error('Chưa cấu hình Apps Script URL / Secret. Mở trang Options của extension để thiết lập.');
  }
  const res = await fetch(appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: apiSecret, action, data })
  });
  return await res.json();
}

// Dùng khi chỉ cần kết quả thành công, lỗi business-logic sẽ ném exception (saveProductForTab dùng cách này).
async function callAppsScript(action, data) {
  const json = await callAppsScriptRaw(action, data);
  if (!json.ok) throw new Error(json.error || 'Lỗi không xác định từ Apps Script');
  return json;
}

// id cố định cho phép gọi lại notify() nhiều lần để "cập nhật" cùng 1 thông báo (Chrome tự thay thế
// notification cũ cùng id) — dùng để hiện phản hồi tức thì rồi cập nhật thành kết quả thật, đỡ cảm giác treo.
function notify(title, message, id) {
  const notifId = id || ('notif-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message
  });
}

// Hiện dấu/màu trực tiếp trên icon extension — không phụ thuộc cài đặt thông báo của Windows/Chrome,
// luôn nhìn thấy được ngay trên toolbar. Dùng làm phương án dự phòng cho phím tắt vì notification hệ
// điều hành có thể bị Focus Assist hoặc cài đặt Windows chặn âm thầm.
function setBadge(text, color, autoClearMs) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  if (autoClearMs) {
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), autoClearMs);
  }
}

async function saveProductForTab(tab) {
  if (!tab || !tab.id) throw new Error('Không xác định được tab hiện tại');
  const productData = await extractFromTab(tab.id);
  if (!productData || !productData.tenSanPham) {
    throw new Error('Không lấy được thông tin sản phẩm — trang này có thể chưa load xong hoặc không phải trang sản phẩm.');
  }
  const result = await callAppsScript('saveProduct', productData);
  return { productData, result };
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'save-product') return;
  const notifId = 'save-product-progress';
  // Hiện ngay phản hồi "đang lưu" thay vì im lặng chờ cả round-trip network mới thấy gì.
  notify('Đang lưu sản phẩm...', 'Đang gửi dữ liệu lên Google Sheets', notifId);
  setBadge('...', '#9aa0a6');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const { productData, result } = await saveProductForTab(tab);
    if (result.duplicate) {
      notify('Sản phẩm đã tồn tại', productData.tenSanPham + ' đã được lưu trước đó.', notifId);
      setBadge('!', '#d97706', 5000);
    } else {
      notify('Đã lưu sản phẩm', productData.tenSanPham, notifId);
      setBadge('OK', '#16a34a', 5000);
    }
  } catch (err) {
    notify('Lưu sản phẩm thất bại', String(err.message || err), notifId);
    setBadge('X', '#dc2626', 6000);
  }
});

// Popup gọi qua đây để tái sử dụng cùng logic với phím tắt.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'SAVE_CURRENT_PRODUCT') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const { productData, result } = await saveProductForTab(tab);
        sendResponse({ ok: true, productData, result });
      } catch (err) {
        sendResponse({ ok: false, error: String(err.message || err) });
      }
    })();
    return true; // báo cho Chrome biết sendResponse sẽ gọi bất đồng bộ
  }

  // Passthrough chung cho popup gọi mọi action Apps Script khác (listPendingStaging, findCustomerByAddress,
  // finalizeOrder, search...) mà không phải lặp lại logic fetch/secret/CORS ở popup.js.
  if (msg && msg.type === 'CALL_APPS_SCRIPT') {
    (async () => {
      try {
        const result = await callAppsScriptRaw(msg.action, msg.data || {});
        sendResponse({ ok: true, result });
      } catch (err) {
        sendResponse({ ok: false, error: String(err.message || err) });
      }
    })();
    return true;
  }
});
