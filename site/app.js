var CSV_URL = 'directory.csv';
var PAGE_SIZE = 20;
var EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

/* ---------- CSV ---------- */
function parseCSV(text) {
  var rows = [], row = [], cell = '', inQuotes = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false; }
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row);
  return rows;
}
function rowsToRecords(rows) {
  if (rows.length < 2) return [];
  var header = rows[0].map(function (h) { return h.trim(); });
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var rec = {};
    header.forEach(function (h, idx) { rec[h] = (rows[i][idx] || '').trim(); });
    if (rec.name) out.push(rec);
  }
  return out;
}

/* ---------- helpers ---------- */
function esc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function tokens(q) { var n = norm(q); return n ? n.split(' ') : []; }
function hasAll(value, toks) { var n = norm(value); return n !== '' && toks.every(function (t) { return n.indexOf(t) !== -1; }); }
function hl(text, toks) {
  text = String(text == null ? '' : text);
  if (!toks.length || !text) return esc(text);
  var re = new RegExp('(' + toks.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'ig');
  return text.split(re).map(function (p, i) { return i % 2 ? '<mark>' + esc(p) + '</mark>' : esc(p); }).join('');
}
function statusInfo(r) {
  if (r.professional_status === 'PG Ongoing') return { text: 'PG ongoing', cls: 'ongoing' };
  if (r.professional_status === 'Completed PG') return { text: 'PG completed', cls: 'done' };
  return { text: '', cls: '' };
}

/* ---------- anonymous usage events (GoatCounter: no cookies, no search text, no names) ---------- */
function track(name) {
  try {
    if (window.goatcounter && typeof window.goatcounter.count === 'function') {
      window.goatcounter.count({ path: 'event/' + name, title: name, event: true });
    }
  } catch (e) { /* analytics must never break the page */ }
}
var searchTimer = null;
function trackSearch() {
  clearTimeout(searchTimer);
  var n = activeToks().join('').length;
  if (n < 3) return;
  searchTimer = setTimeout(function () { track('search-' + S.scope); }, 1500);
}

/* ---------- state ---------- */
var S = { scope: 'name', view: 'cards', sortKey: 'name', sortDir: 1, page: 1, revealed: {} };
var RECORDS = [], SUGGEST = { college: [], org: [] }, CURRENT = [];
var $ = function (id) { return document.getElementById(id); };

/* ---------- matching ---------- */
function activeToks() { return tokens($('q').value); }
function filterActive() { return activeToks().length > 0 || $('district').value !== '' || tokens($('interest').value).length > 0; }

function matchRecord(r, toks) {
  var hits = {};
  var d = $('district').value;
  if (d && r.native_district !== d) return null;
  var it = tokens($('interest').value);
  if (it.length && !hasAll(r.interests, it)) return null;
  if (!toks.length) return hits;
  var sc = S.scope;
  if (sc === 'name') { return hasAll(r.name, toks) ? { name: true } : null; }
  if (sc === 'college') {
    var any = false;
    ['ug_college', 'pg_college', 'organization'].forEach(function (k) { if (hasAll(r[k], toks)) { hits[k] = true; any = true; } });
    return any ? hits : null;
  }
  if (sc === 'org') {
    var a2 = false;
    ['organization', 'designation'].forEach(function (k) { if (hasAll(r[k], toks)) { hits[k] = true; a2 = true; } });
    return a2 ? hits : null;
  }
  return null;
}

function sortValue(r, key) { return (r[key] || '').toLowerCase(); }
function sortRows(rows) {
  var k = S.sortKey, dir = S.sortDir;
  return rows.slice().sort(function (a, b) {
    var x = sortValue(a.r, k), y = sortValue(b.r, k);
    if (x === '' && y !== '') return 1;
    if (y === '' && x !== '') return -1;
    var c = x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' });
    if (c === 0) c = a.r.name.localeCompare(b.r.name, undefined, { sensitivity: 'base' });
    return c * dir;
  });
}

/* ---------- rendering ---------- */
function emailHtml(r) {
  return EMAIL_RE.test(r.email) ? '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>' : 'Email not provided';
}
function levelRows(r, hits, toks, college) {
  var out = [];
  var rows = [
    { k: 'ug_college', tag: 'ug', label: 'UG', sub: r.ug_year ? 'Year ' + r.ug_year : '' },
    { k: 'pg_college', tag: 'pg', label: 'PG', sub: statusInfo(r).text },
    { k: 'organization', tag: 'wk', label: 'WORKING', sub: r.designation }
  ];
  rows.forEach(function (x) {
    if (!r[x.k]) return;
    var dim = college && !hits[x.k];
    out.push('<div class="trow' + (dim ? ' dim' : '') + '"><span class="tag ' + x.tag + '">' + x.label + '</span><span>' + hl(r[x.k], toks) +
      (x.sub ? '<span class="tsub">' + esc(x.sub) + '</span>' : '') + '</span></div>');
  });
  return out.join('');
}
function cardHtml(item, toks) {
  var r = item.r, st = statusInfo(r), id = item.id, college = S.scope === 'college' && toks.length > 0;
  var open = !!S.revealed[id];
  return '<article class="card"><div><div class="cname">' + hl(r.name, S.scope === 'name' ? toks : []) + '</div>' +
    '<div class="cmeta"><span>' + hl(r.native_district || 'District not given', []) + '</span>' +
    (st.text ? '<span class="chip ' + st.cls + '">' + esc(st.text) + '</span>' : '') + '</div></div>' +
    '<div class="rows">' + levelRows(r, item.hits, toks, college) + '</div>' +
    (open ? '<div class="emailbox">' + emailHtml(r) + '</div>' : '') +
    '<div class="cactions"><button class="btn solid" data-act="email" data-id="' + id + '">' + (open ? 'Hide email' : 'Show email') + '</button>' +
    '<button class="btn" data-act="detail" data-id="' + id + '">Details</button></div></article>';
}
var COLS = [
  { k: 'name', label: 'Name' }, { k: 'native_district', label: 'District' }, { k: 'professional_status', label: 'Status' },
  { k: 'ug_college', label: 'UG college' }, { k: 'pg_college', label: 'PG college' }, { k: 'organization', label: 'Organization' },
  { k: 'designation', label: 'Designation' }
];
function tableHtml(items, toks) {
  var college = S.scope === 'college' && toks.length > 0;
  var head = COLS.map(function (c) {
    var sorted = S.sortKey === c.k;
    var aria = sorted ? (S.sortDir === 1 ? 'ascending' : 'descending') : 'none';
    return '<th scope="col" aria-sort="' + aria + '"><button data-sort="' + c.k + '">' + esc(c.label) + ' <span class="arrow">' + (sorted ? (S.sortDir === 1 ? '▲' : '▼') : '↕') + '</span></button></th>';
  }).join('') + '<th scope="col" class="plain">Contact</th>';
  var body = items.map(function (it) {
    var r = it.r, id = it.id, h = it.hits;
    function cell(k, extra) {
      var dim = college && (k === 'ug_college' || k === 'pg_college' || k === 'organization') && !h[k];
      var hlOn = (S.scope === 'college' && h[k]) || (S.scope === 'org' && h[k]) || false || (S.scope === 'name' && k === 'name');
      return '<td class="' + (extra || '') + (dim ? ' dimcell' : '') + '">' + (hlOn ? hl(r[k], toks) : esc(r[k])) + '</td>';
    }
    var open = !!S.revealed[id];
    return '<tr>' + cell('name', 'nm') + cell('native_district') +
      '<td>' + esc(statusInfo(r).text) + '</td>' + cell('ug_college') + cell('pg_college') + cell('organization') + cell('designation') +
      '<td class="acts">' + (open ? '<div class="emailbox">' + emailHtml(r) + '</div>' : '<button class="btn" data-act="email" data-id="' + id + '">Show email</button>') +
      '<button class="btn" data-act="detail" data-id="' + id + '">Details</button></td></tr>';
  }).join('');
  return '<div class="tablewrap"><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
}
function pagerHtml(total, pages) {
  if (total <= PAGE_SIZE) return '<div class="pshow">Showing all ' + total + '</div>';
  var from = (S.page - 1) * PAGE_SIZE + 1, to = Math.min(total, S.page * PAGE_SIZE);
  var nums = [], p;
  for (p = 1; p <= pages; p++) { if (p === 1 || p === pages || Math.abs(p - S.page) <= 1) nums.push(p); else if (nums[nums.length - 1] !== '…') nums.push('…'); }
  var btns = nums.map(function (n) {
    return n === '…' ? '<span class="pdots">…</span>' :
      '<button class="pbtn" data-page="' + n + '"' + (n === S.page ? ' aria-current="page"' : '') + ' aria-label="Page ' + n + '">' + n + '</button>';
  }).join('');
  return '<div class="pshow">Showing ' + from + ' to ' + to + ' of ' + total + '</div><div class="pnav">' +
    '<button class="pbtn wide" data-page="' + (S.page - 1) + '"' + (S.page === 1 ? ' disabled' : '') + '>Previous</button>' + btns +
    '<button class="pbtn wide" data-page="' + (S.page + 1) + '"' + (S.page === pages ? ' disabled' : '') + '>Next</button></div>';
}

function render(resetPage) {
  if (resetPage) S.page = 1;
  var area = $('results-area');
  if (!filterActive()) { area.hidden = true; CURRENT = []; return; }
  var toks = activeToks();
  var items = [];
  RECORDS.forEach(function (r, i) { var h = matchRecord(r, toks); if (h) items.push({ r: r, id: i, hits: h }); });
  items = sortRows(items);
  CURRENT = items;
  area.hidden = false;
  var total = items.length, pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (S.page > pages) S.page = pages;
  var c = { ug: 0, pg: 0, wk: 0 };
  if (S.scope === 'college' && toks.length) {
    items.forEach(function (it) { if (it.hits.ug_college) c.ug++; if (it.hits.pg_college) c.pg++; if (it.hits.organization) c.wk++; });
    $('rsub').innerHTML = '<span class="ug">UG ' + c.ug + '</span> &nbsp;/&nbsp; <span class="pg">PG ' + c.pg + '</span> &nbsp;/&nbsp; <span class="wk">Working ' + c.wk + '</span>';
  } else $('rsub').innerHTML = '';
  $('rcount').textContent = total + (total === 1 ? ' member found' : ' members found');
  if (!total) {
    $('out').innerHTML = '<div class="empty"><b>No members found</b>Try a shorter word, another spelling (GMC, Govt, a city name) or a different tab.</div>';
    $('pager').innerHTML = ''; return;
  }
  var slice = items.slice((S.page - 1) * PAGE_SIZE, S.page * PAGE_SIZE);
  $('out').innerHTML = S.view === 'table' ? tableHtml(slice, toks) : '<div class="cards">' + slice.map(function (it) { return cardHtml(it, toks); }).join('') + '</div>';
  $('pager').innerHTML = pagerHtml(total, pages);
  $('sortKey').value = S.sortKey;
  $('sortDir').textContent = S.sortDir === 1 ? 'A → Z' : 'Z → A';
}

/* ---------- suggestions ---------- */
function buildSuggest(fields) {
  var map = {};
  RECORDS.forEach(function (r) {
    fields.forEach(function (f) {
      var raw = r[f]; var k = norm(raw); if (!k) return;
      if (map[k]) map[k].count++; else map[k] = { display: raw, key: k, count: 1 };
    });
  });
  return Object.keys(map).map(function (k) { return map[k]; });
}
function showSuggest() {
  var box = $('suggestions'), toks = activeToks();
  var pool = S.scope === 'college' ? SUGGEST.college : S.scope === 'org' ? SUGGEST.org : [];
  if (!toks.length || !pool.length) { box.classList.remove('show'); box.innerHTML = ''; return; }
  var list = pool.filter(function (s) { return toks.every(function (t) { return s.key.indexOf(t) !== -1; }); })
    .sort(function (a, b) { return b.count - a.count || a.display.localeCompare(b.display); }).slice(0, 8);
  if (!list.length) { box.classList.remove('show'); box.innerHTML = ''; return; }
  box.innerHTML = list.map(function (s) {
    return '<button type="button" data-fill="' + esc(s.display) + '"><span>' + hl(s.display, toks) + '</span><span class="cnt">' + s.count + (s.count === 1 ? ' mention' : ' mentions') + '</span></button>';
  }).join('');
  box.classList.add('show');
}

/* ---------- details modal ---------- */
function openDetail(id) {
  var r = RECORDS[id]; if (!r) return;
  var st = statusInfo(r), sec = [];
  function add(h, body) { if (body) sec.push('<div class="msec"><h3>' + esc(h) + '</h3>' + body + '</div>'); }
  add('Native district', r.native_district ? '<p>' + esc(r.native_district) + '</p>' : '');
  add('Status', st.text ? '<p>' + esc(st.text) + (r.pg_completion_expected && r.professional_status === 'PG Ongoing' ? ' · expected ' + esc(r.pg_completion_expected) : '') + (r.md_completion_year && r.professional_status === 'Completed PG' ? ' · ' + esc(r.md_completion_year) : '') + '</p>' : '');
  add('UG', r.ug_college ? '<p>' + esc(r.ug_college) + '</p><p class="tsub">' + esc([r.ug_state, r.ug_year].filter(Boolean).join(' · ')) + '</p>' : '');
  add('PG', r.pg_college ? '<p>' + esc(r.pg_college) + '</p><p class="tsub">' + esc(r.pg_state) + '</p>' : '');
  add('Working at', r.organization ? '<p>' + esc(r.organization) + '</p>' + (r.designation ? '<p class="tsub">' + esc(r.designation) + '</p>' : '') : '');
  var tags = r.interests ? r.interests.split(/[;,|]/).map(function (s) { return s.trim(); }).filter(Boolean) : [];
  add('Areas of interest', tags.length ? '<div class="itags">' + tags.map(function (t) { return '<span class="itag">' + esc(t) + '</span>'; }).join('') + '</div>' : '');
  add('Email', '<p>' + emailHtml(r) + '</p>');
  $('mname').textContent = r.name;
  $('mbody').innerHTML = sec.join('');
  $('overlay').classList.add('show');
  $('mclose').focus();
}
function closeDetail() { $('overlay').classList.remove('show'); }

/* ---------- credits popup ---------- */
/* Edit this list to update the credits. A person with an empty linkedin value shows no LinkedIn button. */
var CREDITS = [
  { group: 'Created and maintained by', people: [
    { name: 'Dr Sharan Murali', role: 'Scientist C, ICMR – National Institute of Epidemiology', linkedin: 'https://www.linkedin.com/in/drsharanmurali' }
  ] },
  { group: 'Platform idea', people: [
    { name: 'Dr Amal Kareem', role: '', linkedin: 'https://www.linkedin.com/in/dr-amal-kareem-36b134157' },
    { name: 'Dr Salin K Eliyas', role: '', linkedin: 'https://www.linkedin.com/in/salins13' }
  ] }
];
var LI_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/></svg>';
function safeUrl(u) { return /^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(u || '') ? u : ''; }
function openCredits() {
  $('creditsBody').innerHTML = CREDITS.map(function (g) {
    return '<div class="cgroup"><h3>' + esc(g.group) + '</h3>' + g.people.map(function (p) {
      var u = safeUrl(p.linkedin);
      return '<div class="cperson"><div><div class="cname">' + esc(p.name) + '</div>' +
        (p.role ? '<div class="crole">' + esc(p.role) + '</div>' : '') + '</div>' +
        (u ? '<a class="clink" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(p.name) + ' on LinkedIn">' + LI_ICON + 'LinkedIn</a>' : '') +
        '</div>';
    }).join('') + '</div>';
  }).join('');
  track('credits-open');
  $('creditsOverlay').classList.add('show');
  $('creditsClose').focus();
}
function closeCredits() {
  if (!$('creditsOverlay').classList.contains('show')) return;
  $('creditsOverlay').classList.remove('show');
  $('creditsBtn').focus();
}
$('creditsBtn').addEventListener('click', openCredits);
$('creditsClose').addEventListener('click', closeCredits);
$('creditsOverlay').addEventListener('click', function (e) { if (e.target === $('creditsOverlay')) closeCredits(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCredits(); });

/* ---------- events ---------- */
var PLACEHOLDERS = {
  name: 'Type a name', college: 'e.g. Kottayam, JIPMER, Amala, Government Medical College', org: 'Organization or designation'
};
document.addEventListener('click', function (e) { if (e.target.closest('[data-join]')) track('join-click'); });
document.querySelector('.tabs').addEventListener('click', function (e) {
  var b = e.target.closest('.tab'); if (!b) return;
  S.scope = b.getAttribute('data-scope');
  track('tab-' + S.scope);
  document.querySelectorAll('.tab').forEach(function (t) { t.setAttribute('aria-selected', t === b ? 'true' : 'false'); });
  $('q').placeholder = PLACEHOLDERS[S.scope];
  $('hint').style.display = S.scope === 'college' ? '' : 'none';
  showSuggest(); render(true);
});
$('q').addEventListener('input', function () { showSuggest(); render(true); trackSearch(); });
$('q').addEventListener('focus', showSuggest);
$('district').addEventListener('change', function () { if (this.value) track('filter-district'); render(true); });
$('interest').addEventListener('input', function () { render(true); if (tokens(this.value).length) { clearTimeout(searchTimer); searchTimer = setTimeout(function () { track('filter-interest'); }, 1500); } });
$('suggestions').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-fill]'); if (!b) return;
  $('q').value = b.getAttribute('data-fill'); $('suggestions').classList.remove('show'); render(true);
});
document.addEventListener('click', function (e) { if (!e.target.closest('.qwrap')) $('suggestions').classList.remove('show'); });
$('vCards').addEventListener('click', function () { S.view = 'cards'; track('view-cards'); $('vCards').setAttribute('aria-pressed', 'true'); $('vTable').setAttribute('aria-pressed', 'false'); render(false); });
$('vTable').addEventListener('click', function () { S.view = 'table'; track('view-table'); $('vTable').setAttribute('aria-pressed', 'true'); $('vCards').setAttribute('aria-pressed', 'false'); render(false); });
$('sortKey').addEventListener('change', function () { S.sortKey = this.value; render(true); });
$('sortDir').addEventListener('click', function () { S.sortDir *= -1; render(true); });
$('out').addEventListener('click', function (e) {
  var s = e.target.closest('[data-sort]');
  if (s) { track('table-sort'); var k = s.getAttribute('data-sort'); if (S.sortKey === k) S.sortDir *= -1; else { S.sortKey = k; S.sortDir = 1; } render(true); return; }
  var b = e.target.closest('[data-act]'); if (!b) return;
  var id = parseInt(b.getAttribute('data-id'), 10);
  if (b.getAttribute('data-act') === 'email') { S.revealed[id] = !S.revealed[id]; if (S.revealed[id]) track('email-reveal'); render(false); }
  else { track('details-open'); openDetail(id); }
});
$('pager').addEventListener('click', function (e) {
  var b = e.target.closest('[data-page]'); if (!b || b.disabled) return;
  S.page = parseInt(b.getAttribute('data-page'), 10); if (S.page > 1) track('page-next'); render(false);
  $('results-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('mclose').addEventListener('click', closeDetail);
$('overlay').addEventListener('click', function (e) { if (e.target === $('overlay')) closeDetail(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

/* ---------- load ---------- */
function loadData() {
  fetch(CSV_URL + '?t=' + Date.now(), { cache: 'no-store' })
    .then(function (resp) { if (!resp.ok) throw new Error('HTTP ' + resp.status); return resp.text(); })
    .then(function (text) {
      RECORDS = rowsToRecords(parseCSV(text));
      SUGGEST.college = buildSuggest(['ug_college', 'pg_college', 'organization']);
      SUGGEST.org = buildSuggest(['organization']);
      var ds = {}; RECORDS.forEach(function (r) { if (r.native_district) ds[r.native_district] = 1; });
      Object.keys(ds).sort().forEach(function (d) { var o = document.createElement('option'); o.value = d; o.textContent = d; $('district').appendChild(o); });
      $('loadnote').textContent = RECORDS.length + ' members in the directory.';
      render(false);
    })
    .catch(function (err) { $('loadnote').textContent = 'Could not load the directory (' + err.message + '). Please refresh.'; });
}
loadData();
