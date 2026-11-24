// Cả 3 hãng (Yamato, Japan Post, Sagawa) ĐÃ XÁC MINH THỰC TẾ (2026-06-22) qua DevTools Network tab.
// Yamato/Sagawa render bằng JS nên phải GET trang nhập trước để lấy token (timeid / jsf_tree+jsf_state),
// rồi POST lại mới ra kết quả thật; cả 2 hỗ trợ tra tối đa 10 mã/lần (gộp lô để giảm request, tránh bị coi là bot).
// Japan Post trả kết quả ngay từ 1 GET đơn giản, không cần token.
// Nếu hãng nào đổi giao diện sau này, lặp lại cách debug: DevTools > Network > filter theo số tracking >
// xem request thật, rồi sửa lại buildUrl/fetchStatus tương ứng.
// Luôn giữ actionUpdateTracking_ (cập nhật thủ công trong Sheet) làm phương án dự phòng khi scraping bị hãng chặn/đổi giao diện.

var CARRIER_SCRAPERS = {
  'Yamato': {
    fetchStatus: function (trackingNo) {
      var results = fetchYamatoStatusBatch_([trackingNo]);
      return results[String(trackingNo).replace(/-/g, '')] || null;
    }
  },

  // Japan Post: bảng "履歴情報" (lịch sử) liệt kê từng mốc, cột "配送履歴" luôn có class="w_150".
  // KHÔNG so khớp từ khóa trên toàn trang — trang luôn có nút "Đăng ký email khi giao hàng xong"
  // chứa sẵn chữ "配達完了" dù đơn chưa giao tới đâu, gây dương tính giả (đã gặp thực tế 2026-06-23).
  // Phải lấy đúng dòng MỚI NHẤT trong bảng lịch sử.
  'Japan Post': {
    fetchStatus: function (trackingNo) {
      var url = 'https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=' + encodeURIComponent(trackingNo) + '&locale=ja';
      var res = UrlFetchApp.fetch(url, fetchOptionsWithUA_({ muteHttpExceptions: true, followRedirects: true }));
      if (res.getResponseCode() !== 200) return null;

      var html = res.getContentText();
      var historyStatuses = [];
      var historyRegex = /class="w_150">([^<]*)</g;
      var m;
      while ((m = historyRegex.exec(html)) !== null) {
        if (m[1].trim()) historyStatuses.push(m[1].trim());
      }

      Logger.log('[Japan Post] Lịch sử trạng thái tìm được: ' + JSON.stringify(historyStatuses));
      if (!historyStatuses.length) return null;

      var latestStatus = historyStatuses[historyStatuses.length - 1];
      Logger.log('[Japan Post] Trạng thái mới nhất: ' + latestStatus);

      return mapJapanPostStatusText_(latestStatus);
    }
  },

  // Sagawa: ĐÃ XÁC MINH THỰC TẾ (2026-06-22) qua DevTools Network tab. Trang dùng JSF (Java) — phải GET
  // trang nhập trước để lấy "view state" (jsf_tree_NN, jsf_state_NN, jsf_viewid), rồi POST lại kèm
  // main:no1..main:no10 mới ra kết quả. Cũng hỗ trợ tối đa 10 mã/lần như Yamato.
  'Sagawa': {
    fetchStatus: function (trackingNo) {
      var results = fetchSagawaStatusBatch_([trackingNo]);
      return results[String(trackingNo).replace(/-/g, '')] || null;
    }
  },

  // SBS (SBS即配サポート): trang ASP.NET WebForms tại saqura-web.com — phải GET trang nhập trước để lấy
  // __VIEWSTATE, __VIEWSTATEGENERATOR, __EVENTVALIDATION, rồi POST lại với tối đa 10 mã vào các slot
  // dgdData$ctl02..ctl11$txtIraNo. Kết quả trạng thái nằm trong dgdData$ctl0X$txtNew tương ứng.
  'SBS': {
    fetchStatus: function (trackingNo) {
      var results = fetchSbsStatusBatch_([trackingNo]);
      return results[String(trackingNo).replace(/-/g, '')] || null;
    }
  }
};

// trackingNumbers: tối đa 10 phần tử. Trả về map { '<mã không dấu gạch>': '<trạng thái đã map>' }.
function fetchYamatoStatusBatch_(trackingNumbers) {
  var pageUrl = 'https://track.kuronekoyamato.co.jp/english/tracking';

  var getRes = UrlFetchApp.fetch(pageUrl, fetchOptionsWithUA_({ muteHttpExceptions: true }));
  Logger.log('[Yamato] GET status: ' + getRes.getResponseCode());
  if (getRes.getResponseCode() !== 200) return {};

  var timeidMatch = getRes.getContentText().match(/name="timeid"\s+value="([^"]+)"/);
  if (!timeidMatch) {
    Logger.log('[Yamato] Không tìm thấy timeid — Yamato có thể đã đổi giao diện');
    return {};
  }

  var payload = { category: '0', timeid: timeidMatch[1] };
  trackingNumbers.slice(0, 10).forEach(function (num, idx) {
    var fieldName = 'number' + (idx < 9 ? '0' + (idx + 1) : String(idx + 1));
    payload[fieldName] = String(num).replace(/-/g, '');
  });

  var postRes = UrlFetchApp.fetch(pageUrl, fetchOptionsWithUA_({ method: 'post', payload: payload, muteHttpExceptions: true }));
  Logger.log('[Yamato] POST status: ' + postRes.getResponseCode());
  if (postRes.getResponseCode() !== 200) return {};

  var html = postRes.getContentText();
  var results = {};
  var blockRegex = /tracking-invoice-block-title">\s*\S+\s*:\s*([\d\-]+)<\/h3>[\s\S]*?tracking-invoice-block-state-title">([^<]+)</g;
  var match;
  while ((match = blockRegex.exec(html)) !== null) {
    var digitsOnly = match[1].replace(/-/g, '');
    var statusText = match[2].trim();
    Logger.log('[Yamato] ' + digitsOnly + ' => ' + statusText);
    results[digitsOnly] = mapYamatoStatusText_(statusText);
  }

  return results;
}

function mapJapanPostStatusText_(statusText) {
  // Xác nhận thực tế 2026-06-23: đơn đã giao dùng cụm "お届け先にお届け済み" (chứa "届け済み"),
  // không phải "配達完了" như giả định ban đầu (chữ đó chỉ nằm trong nút đăng ký email, đã sửa ở trên).
  if (/配達完了|届け済み/.test(statusText)) return 'Hoàn tất';
  if (/配達中|持出中|中継局|到着|通過/.test(statusText)) return 'Đang vận chuyển';
  if (/引受|引き受け|発送/.test(statusText)) return 'Seller đã gửi';
  return 'Đang vận chuyển'; // các mốc trung gian khác chưa rõ map vẫn coi là đang vận chuyển, không vội báo Hoàn tất
}

function mapYamatoStatusText_(statusText) {
  if (/Delivered/i.test(statusText)) return 'Hoàn tất';
  if (/Shipped Out|Information Received|Picked Up/i.test(statusText)) return 'Seller đã gửi';
  if (/Incorrect Tracking Number/i.test(statusText)) return null;
  return 'Đang vận chuyển'; // các trạng thái trung gian khác (In Transit, Out for Delivery, Arrived at...) coi là đang vận chuyển
}

// trackingNumbers: tối đa 10 phần tử. Trả về map { '<mã không dấu gạch>': '<trạng thái đã map>' }.
function fetchSagawaStatusBatch_(trackingNumbers) {
  var pageUrl = 'https://k2k.sagawa-exp.co.jp/p/sagawa/web/okurijoinput.jsp';

  var getRes = UrlFetchApp.fetch(pageUrl, fetchOptionsWithUA_({ muteHttpExceptions: true }));
  Logger.log('[Sagawa] GET status: ' + getRes.getResponseCode());
  if (getRes.getResponseCode() !== 200) return {};

  var getHtml = getRes.getContentText();
  var treeMatch = getHtml.match(/name="(jsf_tree_\d+)"[^>]*value="([^"]*)"/);
  var stateMatch = getHtml.match(/name="(jsf_state_\d+)"[^>]*value="([^"]*)"/);
  var viewIdMatch = getHtml.match(/name="jsf_viewid"[^>]*value="([^"]*)"/);

  if (!treeMatch || !stateMatch) {
    Logger.log('[Sagawa] Không tìm thấy jsf_tree/jsf_state trong trang nhập — Sagawa có thể đã đổi giao diện');
    return {};
  }

  var payload = {};
  payload[treeMatch[1]] = treeMatch[2];
  payload[stateMatch[1]] = stateMatch[2];
  payload['jsf_viewid'] = viewIdMatch ? viewIdMatch[1] : '/web/okurijoinput.jsp';

  for (var i = 1; i <= 10; i++) {
    payload['main:no' + i] = trackingNumbers[i - 1] ? String(trackingNumbers[i - 1]).replace(/-/g, '') : '';
  }
  payload['main:correlation'] = '1';
  payload['main:toiStart'] = '1';
  payload['main_SUBMIT'] = '1';
  payload['main:_link_hidden_'] = '';

  var postRes = UrlFetchApp.fetch(pageUrl, fetchOptionsWithUA_({ method: 'post', payload: payload, muteHttpExceptions: true }));
  Logger.log('[Sagawa] POST status: ' + postRes.getResponseCode());
  if (postRes.getResponseCode() !== 200) return {};

  var html = postRes.getContentText();
  var results = {};
  var blockRegex = /<th class="number nowrap"><strong>(\d+)<\/strong><\/th>[\s\S]*?<span class="state">([^<]+)<\/span>/g;
  var match;
  while ((match = blockRegex.exec(html)) !== null) {
    var digitsOnly = match[1];
    var statusText = match[2].trim();
    Logger.log('[Sagawa] ' + digitsOnly + ' => ' + statusText);
    results[digitsOnly] = mapSagawaStatusText_(statusText);
  }

  if (Object.keys(results).length === 0) {
    Logger.log('[Sagawa] Không khớp được kết quả nào — dump 1000 ký tự đầu để kiểm tra:');
    Logger.log(html.substring(0, 1000));
  }

  return results;
}

// Trang Sagawa trả về chữ Nhật dưới dạng HTML numeric entity (ví dụ "&#37197;&#36948;..."),
// phải decode về Unicode thật trước khi so khớp regex.
function decodeNumericEntities_(text) {
  return String(text).replace(/&#(\d+);/g, function (_, code) {
    return String.fromCharCode(parseInt(code, 10));
  });
}

function mapSagawaStatusText_(statusText) {
  var decoded = decodeNumericEntities_(statusText);
  if (/配達完了|お届け済み/.test(decoded)) return 'Hoàn tất';
  if (/配達中|営業所|積込|輸送中/.test(decoded)) return 'Đang vận chuyển';
  if (/発送|集荷/.test(decoded)) return 'Seller đã gửi';
  return 'Đang vận chuyển';
}

// trackingNumbers: tối đa 10 phần tử. Trả về map { '<mã không dấu gạch>': '<trạng thái đã map>' }.
function fetchSbsStatusBatch_(trackingNumbers) {
  var pageUrl = 'https://www.saqura-web.com/sbs_ltrc/';

  var getRes = UrlFetchApp.fetch(pageUrl, fetchOptionsWithUA_({ muteHttpExceptions: true }));
  Logger.log('[SBS] GET status: ' + getRes.getResponseCode());
  if (getRes.getResponseCode() !== 200) return {};

  // ASP.NET gắn ViewState với session — phải carry cookie từ GET sang POST,
  // vì UrlFetchApp không tự làm điều này (không có cookie jar như trình duyệt).
  var setCookieRaw = getRes.getAllHeaders()['Set-Cookie'];
  var cookieHeader = '';
  if (Array.isArray(setCookieRaw)) {
    cookieHeader = setCookieRaw.map(function (c) { return c.split(';')[0]; }).join('; ');
  } else if (setCookieRaw) {
    cookieHeader = String(setCookieRaw).split(';')[0];
  }
  Logger.log('[SBS] Cookie từ GET: ' + cookieHeader);

  var getHtml = getRes.getContentText();
  var viewstateMatch = getHtml.match(/id="__VIEWSTATE"\s+value="([^"]*)"/);
  var viewstateGenMatch = getHtml.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]*)"/);
  var eventValidationMatch = getHtml.match(/id="__EVENTVALIDATION"\s+value="([^"]*)"/);

  if (!viewstateMatch) {
    Logger.log('[SBS] Không tìm thấy __VIEWSTATE — SBS có thể đã đổi giao diện');
    return {};
  }

  var payload = {
    '__VIEWSTATE': viewstateMatch[1],
    '__VIEWSTATEGENERATOR': viewstateGenMatch ? viewstateGenMatch[1] : '',
    '__EVENTVALIDATION': eventValidationMatch ? eventValidationMatch[1] : '',
    'ExecType': '',
    'IroNo': '',
    'btnSearch': '検索開始'
  };

  // Slot ctl02..ctl11 (10 slot, index 0..9)
  for (var i = 0; i < 10; i++) {
    var ctl = 'ctl' + (i + 2 < 10 ? '0' + (i + 2) : String(i + 2));
    payload['dgdData$' + ctl + '$txtIraNo'] = trackingNumbers[i] ? String(trackingNumbers[i]).replace(/-/g, '') : '';
    payload['dgdData$' + ctl + '$txtNew'] = '';
    payload['dgdData$' + ctl + '$txtShuDate'] = '';
    payload['dgdData$' + ctl + '$txtHaiDate'] = '';
  }

  var opts = fetchOptionsWithUA_({
    method: 'post',
    payload: payload,
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      'Cookie': cookieHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://www.saqura-web.com',
      'Referer': pageUrl
    }
  });

  var postRes = UrlFetchApp.fetch(pageUrl, opts);
  Logger.log('[SBS] POST status: ' + postRes.getResponseCode());
  if (postRes.getResponseCode() !== 200) return {};

  var html = postRes.getContentText();
  var results = {};

  for (var i = 0; i < 10; i++) {
    var ctl = 'ctl' + (i + 2 < 10 ? '0' + (i + 2) : String(i + 2));
    var numMatch = html.match(new RegExp('name="dgdData\\$' + ctl + '\\$txtIraNo"[^>]*value="([^"]*)"'));
    var statusMatch = html.match(new RegExp('name="dgdData\\$' + ctl + '\\$txtNew"[^>]*value="([^"]*)"'));
    if (!numMatch || !statusMatch) continue;
    var digitsOnly = numMatch[1].replace(/-/g, '');
    var statusText = statusMatch[1].trim();
    if (!digitsOnly || !statusText || /該当する番号が見つかりません/.test(statusText)) continue;
    Logger.log('[SBS] ' + digitsOnly + ' => ' + statusText);
    results[digitsOnly] = mapSbsStatusText_(statusText);
  }

  if (Object.keys(results).length === 0) {
    Logger.log('[SBS] Không khớp được kết quả nào — dump 1000 ký tự đầu để kiểm tra:');
    Logger.log(html.substring(0, 1000));
  }

  return results;
}

function mapSbsStatusText_(statusText) {
  if (/配達完了|お届け済み|配達済み/.test(statusText)) return 'Hoàn tất';
  if (/配達中|持出|輸送中|中継|営業所/.test(statusText)) return 'Đang vận chuyển';
  if (/集荷|発送|引受/.test(statusText)) return 'Seller đã gửi';
  return 'Đang vận chuyển';
}

function fetchCarrierStatus_(hangVanChuyen, trackingNo) {
  var scraper = CARRIER_SCRAPERS[hangVanChuyen];
  if (!scraper || !trackingNo) return null;
  return scraper.fetchStatus(trackingNo);
}

// Chạy thử trong editor (chọn debugTrackingScrape ở dropdown > Run) để kiểm tra 1 mã tracking thật,
// xem View > Logs để theo dõi từng bước.
function debugTrackingScrape(hangVanChuyen, trackingNo) {
  var scraper = CARRIER_SCRAPERS[hangVanChuyen];
  if (!scraper) {
    Logger.log('Không có scraper cho hãng: ' + hangVanChuyen);
    return;
  }
  var status = scraper.fetchStatus(trackingNo);
  Logger.log('=> Trạng thái map được: ' + status);
}
