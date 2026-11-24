// Cache toàn bộ danh sách khách hàng (ít đổi, đọc nhiều — đặc biệt lúc tạo đơn) để tránh quét lại
// sheet Customers mỗi lần gọi listCustomers/search/match địa chỉ. TTL ngắn (2 phút) + invalidate
// ngay khi tạo khách mới, nên rủi ro dữ liệu cũ là tối thiểu.
var CUSTOMERS_CACHE_KEY = 'customers_list_v1';
var CUSTOMERS_CACHE_TTL_SECONDS = 120;

function getCustomersCached_(sheet) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(CUSTOMERS_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      // cache hỏng/không parse được — đọc lại từ sheet bên dưới
    }
  }

  var fresh = readCustomersFromSheet_(sheet);
  cache.put(CUSTOMERS_CACHE_KEY, JSON.stringify(fresh), CUSTOMERS_CACHE_TTL_SECONDS);
  return fresh;
}

function invalidateCustomersCache_() {
  CacheService.getScriptCache().remove(CUSTOMERS_CACHE_KEY);
}

function readCustomersFromSheet_(sheet) {
  var headers = getHeaders_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var colMaKhach = headers.indexOf('Mã khách');
  var colTenKhach = headers.indexOf('Tên khách');
  var colDiaChi = headers.indexOf('Địa chỉ');
  var colPhi = headers.indexOf('Phí (%)');

  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values
    .filter(function (row) { return row[colMaKhach]; })
    .map(function (row) {
      return {
        maKhach: row[colMaKhach],
        tenKhach: row[colTenKhach],
        diaChi: row[colDiaChi],
        phiPercent: colPhi !== -1 ? (Number(row[colPhi]) || 0) : 0
      };
    });
}

// data: { tenKhach, diaChi, sdt, phiPercent, ghiChu }
// Cho phép nhiều khách dùng chung 1 địa chỉ (ví dụ chung địa chỉ kho/forwarder ở Nhật) — không chặn
// theo địa chỉ trùng, mỗi lần gọi luôn tạo 1 khách mới với mã riêng.
function actionCreateCustomer_(data) {
  if (!data.tenKhach || !data.diaChi) {
    return { ok: false, error: 'Thiếu tên khách hoặc địa chỉ' };
  }

  var sheet = getSheet_(SHEET_NAMES.CUSTOMERS);
  var maKhach = generateNextCustomerCode_(sheet);
  var phiPercent = Number(data.phiPercent) || 0;

  appendRowByHeaders_(sheet, {
    'Mã khách': maKhach,
    'Tên khách': data.tenKhach,
    'Địa chỉ': data.diaChi,
    'SĐT': data.sdt || '',
    'Phí (%)': phiPercent,
    'Ghi chú': data.ghiChu || '',
    'Ngày tạo': new Date()
  });

  invalidateCustomersCache_();

  return { ok: true, maKhach: maKhach, tenKhach: data.tenKhach, phiPercent: phiPercent };
}

function generateNextCustomerCode_(sheet) {
  var customers = getCustomersCached_(sheet);
  var maxNum = 0;

  customers.forEach(function (c) {
    var match = String(c.maKhach).match(/^KH(\d+)$/);
    if (match) {
      var num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });

  var next = maxNum + 1;
  var padded = String(next);
  while (padded.length < 3) padded = '0' + padded;
  return 'KH' + padded;
}

function findCustomerByCode_(sheet, maKhach) {
  if (!maKhach) return null;

  var customers = getCustomersCached_(sheet);
  for (var i = 0; i < customers.length; i++) {
    if (customers[i].maKhach === maKhach) {
      return { maKhach: customers[i].maKhach, tenKhach: customers[i].tenKhach, phiPercent: customers[i].phiPercent };
    }
  }
  return null;
}

// data: { keyword } — tìm theo Mã khách, Tên khách hoặc Địa chỉ (substring, không phân biệt hoa thường).
// Lọc trực tiếp trên danh sách đã cache, không quét lại sheet.
function actionSearchCustomers_(data) {
  var keyword = String(data.keyword || '').trim().toLowerCase();
  if (!keyword) return { ok: false, error: 'Thiếu từ khóa tìm kiếm' };

  var sheet = getSheet_(SHEET_NAMES.CUSTOMERS);
  var customers = getCustomersCached_(sheet);

  var results = customers
    .filter(function (c) {
      return [c.maKhach, c.tenKhach, c.diaChi].some(function (v) {
        return String(v || '').toLowerCase().indexOf(keyword) !== -1;
      });
    })
    .slice(0, 20)
    .map(function (c) {
      return { maKhach: c.maKhach, tenKhach: c.tenKhach, diaChi: c.diaChi, phiPercent: c.phiPercent };
    });

  return { ok: true, customers: results };
}

function actionListCustomers_() {
  var sheet = getSheet_(SHEET_NAMES.CUSTOMERS);
  return { ok: true, customers: getCustomersCached_(sheet) };
}
