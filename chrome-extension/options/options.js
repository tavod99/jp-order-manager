const urlInput = document.getElementById('apps-script-url');
const secretInput = document.getElementById('api-secret');
const saveBtn = document.getElementById('save-btn');
const statusEl = document.getElementById('status');

async function load() {
  const cfg = await chrome.storage.sync.get(['appsScriptUrl', 'apiSecret']);
  urlInput.value = cfg.appsScriptUrl || '';
  secretInput.value = cfg.apiSecret || '';
}

saveBtn.addEventListener('click', async () => {
  const appsScriptUrl = urlInput.value.trim();
  const apiSecret = secretInput.value.trim();
  await chrome.storage.sync.set({ appsScriptUrl, apiSecret });
  statusEl.textContent = 'Đã lưu.';
  setTimeout(() => { statusEl.textContent = ''; }, 2000);
});

load();
