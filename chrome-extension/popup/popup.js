// ---------- Helpers ----------
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Mọi action Apps Script (trừ saveProduct khi dùng phím tắt) đi qua background.js để tái dùng
// logic fetch/secret/CORS đã viết sẵn ở đó, tránh lặp code.
async function callAppsScript(action, data) {
  const resp = await chrome.runtime.sendMessage({ type: 'CALL_APPS_SCRIPT', action, data: data || {} });
  if (!resp.ok) throw new Error(resp.error);
  if (!resp.result.ok) throw new Error(resp.result.error || 'Lỗi không xác định');
  return resp.result;
}

const STATUS_ICONS = { ok: '✓', warning: '⚠', error: '✕' };

function showStatusBox(el, type, text, autoHideMs) {
  el.className = 'status-box status-' + type;
  el.innerHTML = '<span>' + (STATUS_ICONS[type] || '') + '</span><span>' + escapeHtml(text) + '</span>';
  el.hidden = false;
  clearTimeout(el._hideTimer);
  if (autoHideMs) {
    el._hideTimer = setTimeout(() => { el.hidden = true; }, autoHideMs);
  }
}

function showInlineStatus(el, type, text, autoHideMs) {
  el.textContent = text;
  el.className = type === 'loading' ? 'inline-status' : 'inline-status status-' + type;
  el.hidden = false;
  clearTimeout(el._hideTimer);
  if (autoHideMs) {
    el._hideTimer = setTimeout(() => { el.hidden = true; }, autoHideMs);
  }
}

// ---------- Cache khách hàng (client-side) ----------
// Khách hàng ít đổi nhưng được tra cứu liên tục (mỗi lần tạo đơn) — cache local để "Tìm khách" ở tab
// Chờ xử lý không phải gọi mạng mỗi lần. Tab Khách hàng vẫn luôn làm mới ngầm (cache-then-revalidate).
const CUSTOMERS_CACHE_STORAGE_KEY = 'customersCacheV1';
let customersCache = [];

async function loadCustomersCacheFromStorage() {
  const data = await chrome.storage.local.get(CUSTOMERS_CACHE_STORAGE_KEY);
  const cached = data[CUSTOMERS_CACHE_STORAGE_KEY];
  if (cached && Array.isArray(cached.customers)) {
    customersCache = cached.customers;
  }
}

function saveCustomersCacheToStorage(customers) {
  chrome.storage.local.set({ [CUSTOMERS_CACHE_STORAGE_KEY]: { customers, updatedAt: Date.now() } });
}

async function refreshCustomersCache() {
  const result = await callAppsScript('listCustomers');
  customersCache = result.customers || [];
  saveCustomersCacheToStorage(customersCache);
  return customersCache;
}

function filterCustomersLocal(keyword) {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return [];
  return customersCache
    .filter((c) => [c.maKhach, c.tenKhach, c.diaChi].some((v) => String(v || '').toLowerCase().includes(kw)))
    .slice(0, 20);
}

// Giữ lại promise của lần nạp cache đầu tiên — các nơi cần đọc cache (vd "Tìm khách" ở tab Chờ xử lý)
// await promise này trước, tránh trường hợp hiếm: bấm tìm quá nhanh ngay lúc popup vừa mở, khi cache
// trong bộ nhớ JS chưa kịp nạp xong từ chrome.storage.local (dù storage đã có dữ liệu từ trước).
const customersCacheReady = loadCustomersCacheFromStorage();

// ---------- Tabs ----------
const tabButtons = document.querySelectorAll('.tab-btn');
const tabSections = document.querySelectorAll('.tab-section');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    tabSections.forEach((s) => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'pending') {
      loadPendingItems();
      // Làm mới ngầm cache khách hàng khi vào tab này — không chặn UI, để "Tìm khách" có dữ liệu
      // mới nhất ngay khi cần, không phải đợi tới lúc mở tab "Khách hàng" mới được làm mới.
      refreshCustomersCache().catch(() => {});
    }
    if (btn.dataset.tab === 'customers') loadCustomers();
  });
});

document.getElementById('options-link').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// ---------- Tab: Lưu sản phẩm ----------
const saveBtn = document.getElementById('save-btn');
const saveStatusEl = document.getElementById('save-status');
const savePreviewEl = document.getElementById('save-preview');
const saveHintEl = document.getElementById('save-hint');

// Nếu đang mở đúng trang sản phẩm Mercari/Yahoo, lấy trước tên/giá/sàn để hiện ngay trong popup,
// cho người dùng xem trước khi bấm Lưu — không cần đợi tới lúc bấm mới biết đang lưu sản phẩm nào.
async function loadSavePreview() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isProductPage = /^https:\/\/(jp\.mercari\.com\/(item|shops\/product)\/|auctions\.yahoo\.co\.jp\/jp\/auction\/|paypayfleamarket\.yahoo\.co\.jp\/item\/|store\.shopping\.yahoo\.co\.jp\/|www\.amazon\.co\.jp\/.*\/dp\/|item\.rakuten\.co\.jp\/|item\.fril\.jp\/|allu-official\.com\/[^/]+\/[^/]+\/market\/items\/|www\.trefac\.jp\/store\/)/.test(tab.url);
    if (!tab || !tab.url || !isProductPage) {
      return; // không phải trang sản phẩm — giữ nguyên hint mặc định
    }

    const productData = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PRODUCT' });
    if (!productData || !productData.tenSanPham) return;

    saveHintEl.hidden = true;
    savePreviewEl.innerHTML = `
      <div class="save-preview-card">
        <p class="card-label">Sản phẩm trên trang này</p>
        <div class="pending-title">${escapeHtml(productData.tenSanPham)}</div>
        <div class="pending-meta-row">
          <span class="platform-badge ${platformClass(productData.san)}">${escapeHtml(productData.san || '')}</span>
          <span class="pending-price">${escapeHtml(String(productData.gia || ''))} JPY</span>
        </div>
      </div>
    `;
  } catch (err) {
    // Trang chưa load content script (vừa mở/extension vừa reload) hoặc không phải trang sản phẩm —
    // im lặng giữ hint mặc định, không cần báo lỗi cho hành động "ngầm" này.
  }
}
loadSavePreview();

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  saveBtn.textContent = 'Đang lưu...';
  saveStatusEl.hidden = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'SAVE_CURRENT_PRODUCT' });
    if (!response.ok) {
      showStatusBox(saveStatusEl, 'error', 'Lỗi: ' + response.error);
    } else if (response.result.duplicate) {
      showStatusBox(saveStatusEl, 'warning', 'Đã tồn tại: ' + response.productData.tenSanPham, 3500);
    } else {
      showStatusBox(saveStatusEl, 'ok', 'Đã lưu: ' + response.productData.tenSanPham, 3500);
    }
  } catch (err) {
    showStatusBox(saveStatusEl, 'error', 'Lỗi: ' + String(err.message || err));
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Lưu sản phẩm';
  }
});

// ---------- Tab: Chờ xử lý (pending, dạng accordion) ----------
const pendingList = document.getElementById('pending-list');
const pendingCountEl = document.getElementById('pending-count');
const pendingOrderStatusEl = document.getElementById('pending-order-status');
let pendingItemsCache = [];
let currentExpandedMaTam = null;

document.getElementById('refresh-pending-btn').addEventListener('click', loadPendingItems);

async function loadPendingItems() {
  pendingList.innerHTML = '<div class="center-message">Đang tải...</div>';
  try {
    const result = await callAppsScript('listPendingStaging');
    pendingItemsCache = result.items || [];
    currentExpandedMaTam = null;
    renderPendingItems();
  } catch (err) {
    pendingList.innerHTML = '<div class="center-message">Lỗi: ' + escapeHtml(err.message) + '</div>';
  }
}

function platformClass(san) {
  if (san === 'Mercari') return 'mercari';
  if (san === 'Mercari Shops') return 'mercari';
  if (san === 'PayPay Fleamarket') return 'paypay';
  if (san === 'Yahoo Shopping') return 'yshopping';
  if (san === 'Amazon') return 'amazon';
  if (san === 'Rakuten') return 'rakuten';
  if (san === 'Rakuma') return 'rakuma';
  if (san === 'Allu') return 'allu';
  if (san === 'Trefac') return 'trefac';
  return 'yahoo';
}

function renderPendingItems() {
  pendingCountEl.textContent = pendingItemsCache.length + ' sản phẩm chờ xử lý';

  if (!pendingItemsCache.length) {
    pendingList.innerHTML = '<div class="center-message">Không có sản phẩm nào chờ xử lý.</div>';
    return;
  }

  pendingList.innerHTML = pendingItemsCache.map((item) => {
    const maTam = item['Mã tạm'];
    const expanded = maTam === currentExpandedMaTam;
    return `
      <div class="pending-item${expanded ? ' expanded' : ''}" data-matam="${escapeHtml(maTam)}">
        <div class="pending-item-head">
          <div style="flex:1; min-width:0;">
            <div class="pending-title">${escapeHtml(item['Tên sản phẩm'])}</div>
            <div class="pending-meta-row">
              <span class="platform-badge ${platformClass(item['Sàn'])}">${escapeHtml(item['Sàn'] || '')}</span>
              <span class="pending-price">${escapeHtml(String(item['Giá'] || ''))} JPY</span>
            </div>
          </div>
          <span class="chevron">›</span>
        </div>
        <div class="pending-item-body">
          <div class="pending-search-row">
            <input type="text" class="search-customer-input" placeholder="Tên / mã khách / địa chỉ" />
            <button class="btn-primary find-customer-btn" style="height:32px;padding:0 12px;font-size:12px;border-radius:6px;">Tìm</button>
          </div>
          <div class="customer-result"></div>
        </div>
      </div>
    `;
  }).join('');
}

pendingList.addEventListener('click', async (e) => {
  const item = e.target.closest('.pending-item');
  if (!item) return;
  const maTam = item.dataset.matam;

  const headEl = e.target.closest('.pending-item-head');
  if (headEl) {
    currentExpandedMaTam = currentExpandedMaTam === maTam ? null : maTam;
    renderPendingItems();
    return;
  }

  const searchInputEl = item.querySelector('.search-customer-input');
  const resultEl = item.querySelector('.customer-result');

  if (e.target.classList.contains('find-customer-btn')) {
    await searchCustomerInPendingItem_(searchInputEl, resultEl);
    return;
  }

  if (e.target.classList.contains('select-customer-btn')) {
    renderOrderConfirmForm_(resultEl, e.target.dataset.maKhach, e.target.dataset.tenKhach);
    return;
  }

  if (e.target.classList.contains('order-back-btn')) {
    await searchCustomerInPendingItem_(searchInputEl, resultEl);
    return;
  }

  if (e.target.classList.contains('order-confirm-btn')) {
    const maKhach = e.target.dataset.maKhach;
    const soLuong = Number(resultEl.querySelector('.order-soluong-input').value) || 1;
    const phiShipJPY = Number(resultEl.querySelector('.order-phiship-input').value) || 0;
    e.target.disabled = true;
    e.target.textContent = 'Đang tạo...';
    await finalizeOrder(maTam, { maKhach, soLuong, phiShipJPY }, e.target);
  }
});

// Cho phép bấm Enter trong ô tìm khách (tương đương bấm nút "Tìm") thay vì chỉ nhận click chuột.
pendingList.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter' || !e.target.classList.contains('search-customer-input')) return;
  const item = e.target.closest('.pending-item');
  if (!item) return;
  await searchCustomerInPendingItem_(e.target, item.querySelector('.customer-result'));
});

async function searchCustomerInPendingItem_(searchInputEl, resultEl) {
  const keyword = searchInputEl.value.trim();
  if (!keyword) {
    resultEl.innerHTML = '<p class="no-results-hint">Nhập tên, mã khách hoặc địa chỉ trước</p>';
    return;
  }

  await customersCacheReady; // đảm bảo cache từ storage đã nạp xong (xem ghi chú ở khai báo biến)

  // Lọc tức thì từ cache local — không cần gọi mạng. Chỉ gọi server khi cache chưa có gì (lần đầu dùng).
  let customers = filterCustomersLocal(keyword);
  if (customers.length === 0 && customersCache.length === 0) {
    resultEl.innerHTML = '<p class="no-results-hint">Đang tìm...</p>';
    try {
      await refreshCustomersCache();
      customers = filterCustomersLocal(keyword);
    } catch (err) {
      resultEl.innerHTML = '<p class="no-results-hint">Lỗi: ' + escapeHtml(err.message) + '</p>';
      return;
    }
  }

  if (customers.length === 0) {
    resultEl.innerHTML = '<p class="no-results-hint">Không tìm thấy khách — hãy tạo ở tab Khách hàng</p>';
  } else {
    resultEl.innerHTML = customers.map((c) => `
      <div class="customer-candidate">
        <div style="flex:1; min-width:0;">
          <div class="candidate-name">${escapeHtml(c.maKhach)} — ${escapeHtml(c.tenKhach)}</div>
          <div class="candidate-address">${escapeHtml(c.diaChi || '')}</div>
        </div>
        <button class="btn-select select-customer-btn" data-ma-khach="${escapeHtml(c.maKhach)}" data-ten-khach="${escapeHtml(c.tenKhach)}">Chọn</button>
      </div>
    `).join('');
  }
}

// Hiện form nhập Số lượng (mặc định 1) / Phí vận chuyển (mặc định 0) sau khi đã chọn khách, thay vì
// tạo đơn ngay — để có thể chỉnh trước khi gửi lên Apps Script.
function renderOrderConfirmForm_(resultEl, maKhach, tenKhach) {
  resultEl.innerHTML = `
    <div class="order-confirm">
      <div class="order-confirm-customer">
        <span class="ma-khach-badge">${escapeHtml(maKhach)}</span>
        <span class="ten-khach">${escapeHtml(tenKhach)}</span>
      </div>
      <div class="order-confirm-fields">
        <label class="order-confirm-field">
          <span>Số lượng</span>
          <input type="number" class="order-soluong-input" min="1" step="1" value="1" />
        </label>
        <label class="order-confirm-field">
          <span>Phí vận chuyển (¥)</span>
          <input type="number" class="order-phiship-input" min="0" step="1" value="0" />
        </label>
      </div>
      <div class="order-confirm-actions">
        <button type="button" class="btn-ghost-sm order-back-btn">‹ Đổi khách</button>
        <button type="button" class="btn-primary order-confirm-btn" data-ma-khach="${escapeHtml(maKhach)}">Tạo đơn</button>
      </div>
    </div>
  `;
}

async function finalizeOrder(maTam, extra, triggerBtn) {
  try {
    const res = await callAppsScript('finalizeOrder', Object.assign({ maTam }, extra));
    pendingItemsCache = pendingItemsCache.filter((i) => i['Mã tạm'] !== maTam);
    pendingCountEl.textContent = pendingItemsCache.length + ' sản phẩm chờ xử lý';

    // Chỉ xoá đúng item vừa tạo đơn khỏi DOM — KHÔNG render lại toàn bộ danh sách, để không làm mất
    // nội dung đang gõ (ví dụ ô tìm khách) ở các item khác mà người dùng đang tương tác cùng lúc.
    const itemEl = pendingList.querySelector('.pending-item[data-matam="' + CSS.escape(maTam) + '"]');
    if (itemEl) itemEl.remove();
    if (currentExpandedMaTam === maTam) currentExpandedMaTam = null;
    if (!pendingItemsCache.length) {
      pendingList.innerHTML = '<div class="center-message">Không có sản phẩm nào chờ xử lý.</div>';
    }

    showStatusBox(pendingOrderStatusEl, 'ok', 'Đã tạo đơn ' + res.idDon, 3500);
  } catch (err) {
    showStatusBox(pendingOrderStatusEl, 'error', 'Lỗi: ' + String(err.message || err), 3500);
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.textContent = 'Tạo đơn';
    }
  }
}

// ---------- Tab: Khách hàng ----------
const customersList = document.getElementById('customers-list');
const customerCountEl = document.getElementById('customer-count');
const createCustomerBtn = document.getElementById('create-customer-btn');
const createCustomerStatus = document.getElementById('create-customer-status');

async function loadCustomers() {
  // Hiện ngay từ cache (nếu có) để cảm giác tức thì, rồi làm mới ngầm từ server (cache-then-revalidate).
  if (customersCache.length) {
    renderCustomers(customersCache);
  } else {
    customersList.innerHTML = '<div class="center-message">Đang tải...</div>';
  }
  try {
    const customers = await refreshCustomersCache();
    renderCustomers(customers);
  } catch (err) {
    if (!customersCache.length) {
      customersList.innerHTML = '<div class="center-message">Lỗi: ' + escapeHtml(err.message) + '</div>';
    }
  }
}

function renderCustomers(customers) {
  customerCountEl.textContent = customers.length + ' khách hàng';

  if (!customers.length) {
    customersList.innerHTML = '<div class="center-message">Chưa có khách hàng nào.</div>';
    return;
  }

  customersList.innerHTML = customers.map((c) => `
    <div class="customer-card">
      <div class="customer-card-top">
        <span class="ma-khach-badge">${escapeHtml(c.maKhach)}</span>
        <span class="ten-khach">${escapeHtml(c.tenKhach)}</span>
        ${c.phiPercent ? `<span class="fee-badge">${escapeHtml(String(c.phiPercent))}%</span>` : ''}
      </div>
      <div class="customer-card-address">${escapeHtml(c.diaChi || '')}</div>
    </div>
  `).join('');
}

const customerFormInputs = ['cust-name', 'cust-address', 'cust-phone', 'cust-fee', 'cust-note'].map(
  (id) => document.getElementById(id)
);

function setCustomerFormDisabled(disabled) {
  createCustomerBtn.disabled = disabled;
  customerFormInputs.forEach((el) => { el.disabled = disabled; });
}

createCustomerBtn.addEventListener('click', async () => {
  const tenKhach = document.getElementById('cust-name').value.trim();
  const diaChi = document.getElementById('cust-address').value.trim();
  const sdt = document.getElementById('cust-phone').value.trim();
  const phiPercent = document.getElementById('cust-fee').value.trim();
  const ghiChu = document.getElementById('cust-note').value.trim();

  if (!tenKhach || !diaChi) {
    showInlineStatus(createCustomerStatus, 'error', 'Cần nhập tên khách và địa chỉ');
    return;
  }

  // Khoá luôn các ô nhập (không chỉ nút) trong lúc request đang chạy — tránh trường hợp người dùng
  // gõ tiếp cho khách kế tiếp trong lúc đang lưu, rồi bị code xoá trắng mất nội dung vừa gõ khi request
  // trước đó hoàn tất (race condition gây lưu sai/lưu nhầm tên-địa chỉ giữa 2 lần tạo liên tiếp).
  setCustomerFormDisabled(true);
  showInlineStatus(createCustomerStatus, 'loading', 'Đang tạo...');
  try {
    const res = await callAppsScript('createCustomer', { tenKhach, diaChi, sdt, phiPercent, ghiChu });
    // Hiện luôn cả địa chỉ trong thông báo — để phát hiện ngay tại chỗ nếu có ô bị điền sai/lẫn dữ liệu,
    // không phải dò lại qua Sheet/Network tab sau này.
    showInlineStatus(createCustomerStatus, 'ok', 'Đã tạo: ' + res.maKhach + ' — ' + res.tenKhach + ' (' + diaChi + ')', 3500);
    customersCache.push({ maKhach: res.maKhach, tenKhach: res.tenKhach, diaChi, phiPercent: Number(phiPercent) || 0 });
    saveCustomersCacheToStorage(customersCache);
    document.getElementById('cust-name').value = '';
    document.getElementById('cust-address').value = '';
    document.getElementById('cust-phone').value = '';
    document.getElementById('cust-fee').value = '';
    document.getElementById('cust-note').value = '';
    loadCustomers();
  } catch (err) {
    showInlineStatus(createCustomerStatus, 'error', 'Lỗi: ' + String(err.message || err));
  } finally {
    setCustomerFormDisabled(false);
  }
});

// ---------- Tab: Tìm kiếm ----------
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');

searchBtn.addEventListener('click', doSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
});

function renderSearchHint() {
  searchResults.innerHTML = `
    <div class="search-hint">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style="margin:0 auto; display:block; opacity:.25;">
        <circle cx="14" cy="14" r="8" stroke="#141414" stroke-width="2"></circle>
        <line x1="20" y1="20" x2="28" y2="28" stroke="#141414" stroke-width="2" stroke-linecap="round"></line>
      </svg>
      <p>Tìm theo tên khách, mã khách,<br />tracking hoặc link sản phẩm.</p>
    </div>
  `;
}
renderSearchHint();

async function doSearch() {
  const keyword = searchInput.value.trim();
  if (!keyword) return;
  searchResults.innerHTML = '<div class="center-message">Đang tìm kiếm...</div>';
  try {
    const res = await callAppsScript('search', { keyword });
    renderSearchResults(res.results || []);
  } catch (err) {
    searchResults.innerHTML = '<div class="center-message">Lỗi: ' + escapeHtml(err.message) + '</div>';
  }
}

function renderSearchResults(results) {
  if (!results.length) {
    searchResults.innerHTML = '<div class="center-message">Không có kết quả phù hợp</div>';
    return;
  }
  searchResults.innerHTML = results.map((r) => `
    <div class="search-item">
      <div class="search-item-title">${escapeHtml(r['Tên sản phẩm'])}</div>
      <div class="search-item-meta">
        <span class="search-customer">${escapeHtml(r['Tên khách'] || '')}</span>
        <span class="search-status-badge">${escapeHtml(r['Trạng thái'] || '')}</span>
        <span class="search-tracking">${escapeHtml(r['Tracking'] || '(chưa có tracking)')}</span>
        ${r['__sheetRow'] ? `<span class="search-row-badge">Dòng ${r['__sheetRow']}</span>` : ''}
      </div>
    </div>
  `).join('');
}

// ---------- Tab: Công cụ (admin) ----------
// Gọi các action admin qua Web App (chạy dưới danh nghĩa chủ script) nên không cần quyền vào project
// Apps Script — ai có extension + secret đều bấm được, thay cho menu "Order Manager" trong Sheet.
const updateTrackingBtn = document.getElementById('update-tracking-btn');
const refreshVcbBtn = document.getElementById('refresh-vcb-btn');
const adminStatusEl = document.getElementById('admin-status');

async function runAdminAction(btn, action, buildMessage) {
  const originalText = btn.textContent;
  updateTrackingBtn.disabled = true;
  refreshVcbBtn.disabled = true;
  btn.textContent = 'Đang chạy...';
  adminStatusEl.hidden = true;
  try {
    const res = await callAppsScript(action);
    showStatusBox(adminStatusEl, 'ok', buildMessage(res), 8000);
  } catch (err) {
    showStatusBox(adminStatusEl, 'error', 'Lỗi: ' + String(err.message || err), 10000);
  } finally {
    btn.textContent = originalText;
    updateTrackingBtn.disabled = false;
    refreshVcbBtn.disabled = false;
  }
}

updateTrackingBtn.addEventListener('click', () => {
  // Dùng action chạy nền: server chỉ lên lịch 1 trigger rồi trả về ngay (tránh timeout 6 phút của Web App
  // + popup đóng làm mất phản hồi). Kết quả cập nhật vào sheet/TrackingLog sau khi trigger chạy xong.
  runAdminAction(updateTrackingBtn, 'triggerUpdateAllTracking', () =>
    'Đã kích hoạt cập nhật tracking chạy nền. Trạng thái sẽ được cập nhật vào sheet/TrackingLog sau khoảng 1–2 phút.');
});

refreshVcbBtn.addEventListener('click', () => {
  runAdminAction(refreshVcbBtn, 'refreshVcbRate', (res) =>
    'Đã cập nhật tỷ giá bán JPY: ' + res.rate);
});
