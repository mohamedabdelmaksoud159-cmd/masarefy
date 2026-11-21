'use strict';
// ---------- constants ----------
const DEFAULT_CATS = ['أكل وشرب', 'مواصلات', 'فواتير ورصيد', 'صحة', 'ملابس', 'ترفيه', 'تعليم', 'تانية'];
const INC_CATS = ['مرتب', 'هدية', 'دخل تاني'];
const ACCTS = ['كاش', 'بنك', 'محفظة'];
const KEYWORDS = [
  ['اكل','فطار','غدا','عشا','سندوتش','ساندوتش','مطعم','قهوه','شاي','عصير','بقاله','سوبر','خضار','فاكهه','وجبه','شرب','مياه','ماكل','اكلت','بيتزا','حلويات'],
  ['مواصلات','تاكسي','اوبر','ميكروباص','بنزين','مترو','اتوبيس','توك','موقف','اجره','تذكره','قطر','ديدي','انديرايف','ركبت'],
  ['فاتوره','كهربا','نت','انترنت','رصيد','موبايل','غاز','ايجار','اشتراك','خط'],
  ['دوا','دواء','صيدليه','دكتور','كشف','علاج','تحليل'],
  ['هدوم','ملابس','جزمه','حذاء','قميص','بنطلون','تيشرت'],
  ['سينما','خروجه','لعبه','العاب','كافيه','فيلم','رحله','نتفلكس'],
  ['كورس','كتاب','تعليم','دراسه','مدرسه','جامعه'],
];
const INCOME_WORDS = ['قبضت','قبض','مرتب','راتب','استلمت','دخل','جالي','اتحوللي','حولولي','هديه','عيديه','مكافاه','ربح','ايراد'];
const INC_SALARY = ['مرتب','راتب'], INC_GIFT = ['هديه','عيديه','مكافاه'];
const ACCT_WORDS = [[], ['بنك','فيزا','كارت','ماستر','انستاباي','تحويل'], ['محفظه','فودافون','اورنج','اتصالات','ويي']];
const WORDS = {
  واحد:1,اتنين:2,اثنين:2,تلاته:3,ثلاثه:3,اربعه:4,خمسه:5,خمس:5,سته:6,ست:6,سبعه:7,تمانيه:8,ثمانيه:8,تسعه:9,عشره:10,عشر:10,
  حداشر:11,اتناشر:12,تلتاشر:13,اربعتاشر:14,خمستاشر:15,عشرين:20,تلاتين:30,ثلاثين:30,اربعين:40,خمسين:50,ستين:60,سبعين:70,
  تمانين:80,ثمانين:80,تسعين:90,ميه:100,مايه:100,مئه:100,ميتين:200,مئتين:200,تلتميه:300,ربعميه:400,خمسميه:500,ستميه:600,
  سبعميه:700,تمنميه:800,تسعميه:900,الف:1000,الفين:2000,نص:0.5,نصف:0.5,
};
const STOP = new Set(['صرفت','دفعت','جنيه','جنيها','ج','egp','le','على','في','ب','بس','و','قبضت','استلمت','امبارح','امس','النهارده','انهارده','اليوم']);
const NOT_WAW = new Set(['وجبه','وجبات']);
const MAX_AMOUNT = 10000000;
const DB_NAME = 'expenses-db', STORE = 'entries';
const SETTINGS_KEY = 'masarefy-settings';

// ---------- settings ----------
let settings = { cats: DEFAULT_CATS.slice(), budgets: {}, goals: [], opening: {} };
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (s) settings = sanitizeSettings(s);
  } catch {}
}
function sanitizeSettings(s) {
  const cats = Array.isArray(s.cats) ? s.cats.filter(c => typeof c === 'string' && c.trim()).map(c => c.trim().slice(0, 20)) : [];
  for (let i = 0; i < DEFAULT_CATS.length; i++) if (!cats[i]) cats[i] = DEFAULT_CATS[i];
  const budgets = {};
  if (s.budgets && typeof s.budgets === 'object') for (const [k, v] of Object.entries(s.budgets)) { const i = Number(k); if (Number.isInteger(i) && i >= 0 && i < cats.length && Number.isFinite(v) && v > 0 && v < MAX_AMOUNT) budgets[i] = v; }
  const goals = Array.isArray(s.goals) ? s.goals.filter(g => g && typeof g.id === 'string' && typeof g.name === 'string' && Number.isFinite(g.target) && g.target > 0 && g.target < MAX_AMOUNT && Number.isFinite(g.saved) && g.saved >= 0)
    .slice(0, 30).map(g => ({ id: g.id.slice(0, 64), name: g.name.slice(0, 40), target: g.target, saved: g.saved })) : [];
  const opening = {};
  if (s.opening && typeof s.opening === 'object') for (const [k, v] of Object.entries(s.opening)) { const i = Number(k); if (Number.isInteger(i) && i >= 0 && i < ACCTS.length && Number.isFinite(v) && Math.abs(v) < MAX_AMOUNT) opening[i] = v; }
  return { cats: cats.slice(0, 40), budgets, goals, opening };
}
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} };

// ---------- parsing ----------
function norm(s) {
  return String(s).replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.').toLowerCase();
}
const wordVal = t => { const n = norm(t); const w = n.replace(/^و/, '').replace(/^ال/, ''); return WORDS[n] ?? WORDS[w]; };
const isNum = t => /\d/.test(norm(t)) || wordVal(t) !== undefined;
function parseSegment(tokens, daysAgo) {
  if (!tokens.length) return null;
  let amount = null;
  const dm = tokens.map(norm).join(' ').match(/(\d+(?:[.,]\d+)?)/);
  if (dm) amount = parseFloat(dm[1].replace(',', '.'));
  else { let sum = 0, found = false; for (const t of tokens) { const v = wordVal(t); if (v !== undefined) { sum += v; found = true; } } if (found) amount = sum; }
  const noteTokens = tokens.filter(t => { const n = norm(t); return !isNum(t) && !STOP.has(n) && !STOP.has(n.replace(/^و(?=.{3,})/, '')); });
  const rest = norm(noteTokens.join(' ')), all = norm(tokens.join(' '));
  const inc = INCOME_WORDS.some(k => all.split(/\s+/).some(w => w === k || w === 'ال' + k));
  let cat = DEFAULT_CATS.length - 1;
  if (inc) cat = INC_GIFT.some(k => all.includes(k)) ? 1 : INC_SALARY.some(k => all.includes(k)) ? 0 : 2;
  else outer: for (let i = 0; i < KEYWORDS.length; i++) for (const k of KEYWORDS[i]) if (rest.includes(k)) { cat = i; break outer; }
  let acct = 0;
  for (let a = 1; a < ACCT_WORDS.length; a++) if (ACCT_WORDS[a].some(k => all.includes(k))) { acct = a; break; }
  if (amount === null && !noteTokens.length) return null;
  return { amount, cat, type: inc ? 'inc' : 'exp', acct, daysAgo, note: noteTokens.join(' ').replace(/^و(?=.{3,})/, '').slice(0, 60) };
}
function lineDaysAgo(toks) {
  const ns = toks.map(norm);
  for (let i = 0; i < ns.length; i++) {
    if (ns[i] === 'امبارح' || ns[i] === 'امس') return ns[i - 1] === 'اول' ? 2 : 1;
    if (['النهارده', 'انهارده', 'اليوم'].includes(ns[i])) return 0;
  }
  return null;
}
function parseText(text) {
  const out = []; let carry = 0;
  for (const line of text.split(/[\n,،;؛]+/)) {
    let toks = line.split(/\s+/).filter(Boolean);
    const found = lineDaysAgo(toks), assumed = found === null && carry > 0;
    const daysAgo = found === null ? carry : found; carry = daysAgo;
    if (daysAgo === 2) toks = toks.filter((t, i) => !(norm(t) === 'اول' && ['امبارح', 'امس'].includes(norm(toks[i + 1] || ''))));
    let cur = [], hasAmt = false, prevNum = false;
    const flush = () => { const d = parseSegment(cur, daysAgo); if (d) { if (assumed) d.assumed = true; out.push(d); } };
    for (const t of toks) {
      const n = norm(t);
      if (n.startsWith('و') && !NOT_WAW.has(n) && hasAmt) {
        const rem = n === 'و' ? '' : t.slice(1);
        const remNum = rem !== '' && isNum(rem);
        if (prevNum && (n === 'و' || remNum)) { cur.push(t); prevNum = true; continue; }
        flush(); cur = rem ? [rem] : []; hasAmt = remNum; prevNum = remNum; continue;
      }
      cur.push(t); const num = isNum(t); if (num) hasAmt = true; prevNum = num;
    }
    flush();
  }
  return out;
}

// ---------- storage (IndexedDB) ----------
let db = null;
const idb = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const txDone = tx => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('abort')); });
async function allEntries() { return idb(db.transaction(STORE).objectStore(STORE).getAll()); }
async function putMany(list) { const tx = db.transaction(STORE, 'readwrite'); list.forEach(e => tx.objectStore(STORE).put(e)); await txDone(tx); }
async function removeOne(id) { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); await txDone(tx); }
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

// ---------- dates & math ----------
const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; };
function range(period, offset, now = Date.now()) {
  const d = startOfDay(now); let from, to;
  if (period === 'day') { from = new Date(d); from.setDate(from.getDate() + offset); to = new Date(from); to.setDate(to.getDate() + 1); }
  else if (period === 'week') { from = new Date(d); from.setDate(from.getDate() - ((from.getDay() + 1) % 7) + offset * 7); to = new Date(from); to.setDate(to.getDate() + 7); }
  else { from = new Date(d.getFullYear(), d.getMonth() + offset, 1); to = new Date(from.getFullYear(), from.getMonth() + 1, 1); }
  return [from.getTime(), to.getTime()];
}
const nf = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 });
const egp = n => nf.format(Math.round(n * 100) / 100) + ' جنيه';
const fmtDate = (t, o) => new Date(t).toLocaleDateString('ar-EG', o);
function plabel(period, from, to) {
  if (period === 'day') return fmtDate(from, { weekday: 'long', day: 'numeric', month: 'long' });
  if (period === 'week') return fmtDate(from, { day: 'numeric', month: 'short' }) + ' إلى ' + fmtDate(to - 1, { day: 'numeric', month: 'short' });
  return fmtDate(from, { month: 'long', year: 'numeric' });
}
const isInc = e => e.type === 'inc';
const sum = l => l.reduce((s, e) => s + e.amount, 0);
const expOf = l => l.filter(e => !isInc(e)), incOf = l => l.filter(isInc);
const inRange = (from, to) => e => e.ts >= from && e.ts < to;
const catName = e => isInc(e) ? (INC_CATS[e.cat] || 'دخل') : (settings.cats[e.cat] || 'تانية');
const dayKey = t => { const d = new Date(t); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
const pad = n => String(n).padStart(2, '0');
const ymd = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// ---------- UI helpers ----------
const $ = id => document.getElementById(id);
let entries = [], drafts = null, armed = null, persisted = null, tab = 'home';
let dOffset = 0, rPeriod = 'month', rOffset = 0, openDay = null;

function setMsg(t, bad) { $('msg').textContent = t; $('msg').className = 'muted' + (bad ? ' danger' : ''); }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function li(name, detail, value, extra) {
  const e = el('li'); const l = el('div'); l.appendChild(el('div', 'n', name));
  if (detail) l.appendChild(el('div', 'd', detail));
  e.appendChild(l); e.appendChild(el('div', 'v', value)); if (extra) e.appendChild(extra); return e;
}
function bar(frac, over) { const b = el('div', 'bar' + (over ? ' over' : '')); const i = el('i'); i.style.width = Math.max(0, Math.min(1, frac)) * 100 + '%'; b.appendChild(i); return b; }
function entryRow(e) {
  const b = el('button', 'x', armed === e.id ? 'تأكيد المسح' : 'امسح'); b.type = 'button';
  b.onclick = async () => {
    if (armed !== e.id) { armed = e.id; render(); return; }
    armed = null;
    try { await removeOne(e.id); entries = entries.filter(x => x.id !== e.id); setMsg('اتمسح.'); } catch { setMsg('المسح فشل. جرّب تاني.', true); }
    render();
  };
  const sign = isInc(e) ? '+ ' : '';
  const when = new Date(e.ts).toLocaleString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const row = li(e.note || catName(e), catName(e) + ' · ' + ACCTS[e.acct || 0] + ' · ' + when, sign + egp(e.amount), b);
  if (isInc(e)) row.classList.add('inc');
  return row;
}
function budgetStatus(now = Date.now()) {
  const [f, t] = range('month', 0, now); const m = expOf(entries.filter(inRange(f, t)));
  return Object.entries(settings.budgets).map(([k, lim]) => { const i = Number(k); const spent = sum(m.filter(e => e.cat === i)); return { i, lim, spent, frac: spent / lim }; });
}

// ---------- renderers ----------
function renderHome(now) {
  const [f, t] = range('day', 0, now); const d = entries.filter(inRange(f, t)).sort((a, b) => b.ts - a.ts);
  $('home-sum').textContent = d.length ? 'صرفت ' + egp(sum(expOf(d))) + (incOf(d).length ? ' · دخل ' + egp(sum(incOf(d))) : '') : 'لسه مسجلتش حاجة النهارده';
  $('home-sum').className = d.length ? 'big' : 'big empty';
  const ul = $('home-list'); ul.textContent = ''; d.forEach(e => ul.appendChild(entryRow(e)));
}
function renderDays(now) {
  const [f, t] = range('month', dOffset, now); const m = entries.filter(inRange(f, t));
  $('d-label').textContent = plabel('month', f, t); $('d-next').disabled = dOffset >= 0;
  $('d-total').textContent = m.length ? 'مصروفات الشهر: ' + egp(sum(expOf(m))) : 'مفيش حاجة متسجلة في الشهر ده';
  $('d-total').className = m.length ? 'big' : 'big empty';
  const days = new Date(new Date(f).getFullYear(), new Date(f).getMonth() + 1, 0).getDate();
  const per = []; for (let i = 1; i <= days; i++) per.push(0);
  expOf(m).forEach(e => { per[new Date(e.ts).getDate() - 1] += e.amount; });
  const max = Math.max(...per, 1); const ch = $('d-chart'); ch.textContent = '';
  per.forEach((v, i) => { const c = el('div', 'col'); const b = el('i'); b.style.height = (v / max * 100) + '%'; if (v === 0) b.className = 'zero'; c.title = (i + 1) + ': ' + egp(v); c.appendChild(b); ch.appendChild(c); });
  const ul = $('d-list'); ul.textContent = '';
  const byDay = new Map(); m.forEach(e => { const k = dayKey(e.ts); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(e); });
  [...byDay.entries()].sort((a, b) => b[0] - a[0]).forEach(([k, list]) => {
    const first = list[0].ts; const head = el('button', 'dayhead'); head.type = 'button';
    const x = sum(expOf(list)), y = sum(incOf(list));
    head.appendChild(el('span', 'n', fmtDate(first, { weekday: 'long', day: 'numeric', month: 'long' })));
    head.appendChild(el('span', 'v', egp(x) + (y ? ' · +' + egp(y) : '')));
    head.setAttribute('aria-expanded', openDay === k ? 'true' : 'false');
    head.onclick = () => { openDay = openDay === k ? null : k; render(); };
    const item = el('li', 'dayitem'); item.appendChild(head);
    if (openDay === k) { const inner = el('ul', 'list'); list.sort((a, b) => b.ts - a.ts).forEach(e => inner.appendChild(entryRow(e))); item.appendChild(inner); }
    ul.appendChild(item);
  });
}
function renderReports(now) {
  const [f, t] = range(rPeriod, rOffset, now); const list = entries.filter(inRange(f, t)); const ex = expOf(list), inn = incOf(list);
  $('r-label').textContent = plabel(rPeriod, f, t); $('r-next').disabled = rOffset >= 0;
  $('r-exp').textContent = egp(sum(ex)); $('r-inc').textContent = egp(sum(inn)); $('r-net').textContent = egp(sum(inn) - sum(ex));
  document.querySelectorAll('#tab-rep .seg button').forEach(b => b.classList.toggle('on', b.dataset.p === rPeriod));
  const cats = $('r-cats'); cats.textContent = ''; const total = sum(ex);
  settings.cats.map((c, i) => ({ c, v: sum(ex.filter(e => e.cat === i)) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).forEach(x => {
    const row = li(x.c, Math.round(x.v / total * 100).toLocaleString('ar-EG') + '٪ من المصروفات', egp(x.v)); row.classList.add('withbar'); row.appendChild(bar(x.v / total)); cats.appendChild(row);
  });
  if (!cats.children.length) cats.appendChild(li('مفيش مصروفات في الفترة دي', '', ''));
  const top = $('r-top'); top.textContent = ''; const g = new Map();
  ex.forEach(e => { const k = norm(e.note || '').trim() || '(من غير وصف)'; const o = g.get(k) || { name: e.note || catName(e), v: 0, n: 0 }; o.v += e.amount; o.n++; g.set(k, o); });
  [...g.values()].sort((a, b) => b.v - a.v).slice(0, 5).forEach(o => top.appendChild(li(o.name, o.n.toLocaleString('ar-EG') + ' مرة', egp(o.v))));
  if (!top.children.length) top.appendChild(li('لسه مفيش', '', ''));
  const ac = $('r-accts'); ac.textContent = '';
  ACCTS.forEach((a, i) => {
    const mine = entries.filter(e => (e.acct || 0) === i), op = settings.opening[i], net = sum(incOf(mine)) - sum(expOf(mine));
    if (!mine.length && op === undefined) return;
    const row = op === undefined ? li(a, 'حركة صافية مسجلة (دخل − مصروفات). اضغط وحط رصيد البداية', egp(net)) : li(a, 'رصيد = رصيد البداية ' + egp(op) + ' + الحركة المسجلة ' + egp(net), egp(op + net));
    row.classList.add('tap'); row.onclick = () => { const v = prompt('رصيد البداية في ' + a + ' (جنيه). سيبه فاضي لو مش عايز.', op === undefined ? '' : op); if (v === null) return; const n = parseFloat(norm(v)); if (v.trim() === '') delete settings.opening[i]; else if (isFinite(n) && Math.abs(n) < MAX_AMOUNT) settings.opening[i] = n; saveSettings(); render(); };
    ac.appendChild(row);
  });
  if (!ac.children.length) ac.appendChild(li('لسه مفيش حركة', '', ''));
}
function renderBudget() {
  const st = new Map(budgetStatus().map(s => [s.i, s])); const ul = $('b-list'); ul.textContent = '';
  settings.cats.forEach((c, i) => {
    const s = st.get(i); const row = el('li', 'withbar'); const top = el('div', 'brow');
    top.appendChild(el('span', 'n', c));
    const inp = el('input'); inp.type = 'number'; inp.inputMode = 'decimal'; inp.min = '0'; inp.step = 'any'; inp.placeholder = 'حد شهري'; inp.setAttribute('aria-label', 'الحد الشهري لـ ' + c);
    if (settings.budgets[i]) inp.value = settings.budgets[i];
    inp.onchange = () => { const v = parseFloat(inp.value); if (isFinite(v) && v > 0 && v < MAX_AMOUNT) settings.budgets[i] = v; else delete settings.budgets[i]; saveSettings(); render(); };
    top.appendChild(inp); row.appendChild(top);
    if (s) { row.appendChild(bar(s.frac, s.frac > 1)); row.appendChild(el('div', 'd' + (s.frac > 1 ? ' danger' : ''), `صرفت ${egp(s.spent)} من ${egp(s.lim)} (${Math.round(s.frac * 100).toLocaleString('ar-EG')}٪)`)); }
    ul.appendChild(row);
  });
  const gl = $('g-list'); gl.textContent = '';
  settings.goals.forEach(g => {
    const box = el('div', 'goal'); box.appendChild(el('div', 'n', g.name));
    box.appendChild(bar(g.saved / g.target, g.saved >= g.target)); box.appendChild(el('div', 'd', `${egp(g.saved)} من ${egp(g.target)}`));
    const r = el('div', 'row'); const inp = el('input'); inp.type = 'number'; inp.inputMode = 'decimal'; inp.min = '0'; inp.step = 'any'; inp.placeholder = 'ضيف مبلغ'; inp.setAttribute('aria-label', 'ضيف مبلغ لـ ' + g.name);
    const add = el('button', 'secondary', 'ضيف'); add.type = 'button';
    add.onclick = () => { const v = parseFloat(inp.value); if (isFinite(v) && v > 0 && v < MAX_AMOUNT) { g.saved += v; saveSettings(); render(); } };
    const del = el('button', 'x', 'امسح الهدف'); del.type = 'button';
    del.onclick = () => { if (armed !== g.id) { armed = g.id; render(); return; } armed = null; settings.goals = settings.goals.filter(x => x.id !== g.id); saveSettings(); render(); };
    if (armed === g.id) del.textContent = 'تأكيد المسح';
    r.append(inp, add, del); box.appendChild(r); gl.appendChild(box);
  });
}
function renderSettings() {
  const last = Number(localStorage.getItem('lastBackup') || 0);
  $('store').textContent = `${entries.length.toLocaleString('ar-EG')} حركة محفوظة على الجهاز ده. ` +
    (persisted === true ? 'المتصفح وافق يحافظ على البيانات.' : persisted === false ? 'المتصفح لسه مضمنش إن البيانات مش هتتمسح لو المساحة قلت.' : '');
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null; const b = $('backup');
  if (!entries.length) { b.textContent = ''; b.className = 'muted'; }
  else if (days === null) { b.textContent = 'مفيش نسخة احتياطية لحد دلوقتي. لو مسحت بيانات التطبيق أو غيّرت الموبايل البيانات هتضيع.'; b.className = 'warn'; }
  else if (days >= 7) { b.textContent = `آخر نسخة احتياطية من ${days.toLocaleString('ar-EG')} يوم.`; b.className = 'warn'; }
  else { b.textContent = 'آخر نسخة احتياطية: ' + new Date(last).toLocaleDateString('ar-EG'); b.className = 'muted'; }
  const cl = $('c-list'); cl.textContent = '';
  settings.cats.forEach((c, i) => {
    const inp = el('input'); inp.value = c; inp.maxLength = 20; inp.setAttribute('aria-label', 'اسم الفئة'); inp.className = 'catname';
    inp.onchange = () => { const v = inp.value.trim().slice(0, 20); if (v) { settings.cats[i] = v; saveSettings(); render(); } else inp.value = settings.cats[i]; };
    const row = el('li'); row.appendChild(inp); cl.appendChild(row);
  });
}
function renderAlerts() {
  const a = $('alerts'); const hot = budgetStatus().filter(s => s.frac >= 0.8).sort((x, y) => y.frac - x.frac);
  if (!hot.length) { a.hidden = true; a.textContent = ''; return; }
  a.hidden = false; a.textContent = hot.map(s => (s.frac > 1 ? 'عدّيت ميزانية ' : 'قربت توصل حد ') + settings.cats[s.i] + ` (${Math.round(s.frac * 100).toLocaleString('ar-EG')}٪)`).join(' · ');
}
function render() {
  const now = Date.now(); const [f, t] = range('day', 0, now);
  $('today').textContent = 'النهارده: ' + egp(sum(expOf(entries.filter(inRange(f, t)))));
  document.querySelectorAll('.tab').forEach(x => x.hidden = x.id !== 'tab-' + tab);
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  renderAlerts();
  if (tab === 'home') renderHome(now); else if (tab === 'days') renderDays(now); else if (tab === 'rep') renderReports(now);
  else if (tab === 'bud') renderBudget(); else renderSettings();
}

// ---------- drafts ----------
function selectOf(label, opts, val, on) {
  const s = el('select'); s.setAttribute('aria-label', label);
  opts.forEach((c, k) => { const o = el('option', '', c); o.value = k; if (k === val) o.selected = true; s.appendChild(o); });
  s.onchange = () => on(Number(s.value)); return s;
}
function renderDrafts() {
  const box = $('drafts'); box.textContent = '';
  if (!drafts) { box.hidden = true; return; }
  box.hidden = false;
  drafts.forEach(d => {
    const row = el('div', 'draft'); const top = el('div', 'top'); const name = el('span', '', d.note || 'من غير وصف');
    const val = el('span', '', ''); const upd = () => { val.textContent = d.amount === null ? 'مفيش مبلغ' : (d.type === 'inc' ? '+ ' : '') + egp(d.amount); }; upd(); top.append(name, val);
    const amt = el('input'); amt.type = 'number'; amt.inputMode = 'decimal'; amt.min = '0'; amt.step = 'any'; amt.placeholder = 'المبلغ'; amt.setAttribute('aria-label', 'المبلغ');
    if (d.amount !== null) amt.value = d.amount;
    amt.oninput = () => { const v = parseFloat(amt.value); d.amount = isFinite(v) && v > 0 && v < MAX_AMOUNT ? v : null; upd(); $('save').disabled = !drafts.some(x => x.amount !== null); };
    const type = selectOf('النوع', ['مصروف', 'دخل'], d.type === 'inc' ? 1 : 0, v => { d.type = v ? 'inc' : 'exp'; d.cat = v ? 2 : Math.min(d.cat, settings.cats.length - 1); upd(); renderDrafts(); });
    const cats = d.type === 'inc' ? INC_CATS : settings.cats;
    const cat = selectOf('الفئة', cats, Math.min(d.cat, cats.length - 1), v => { d.cat = v; });
    const acct = selectOf('الحساب', ACCTS, d.acct, v => { d.acct = v; });
    const date = el('input'); date.type = 'date'; date.value = ymd(d.date || Date.now() - d.daysAgo * 86400000); date.max = ymd(Date.now()); date.setAttribute('aria-label', 'التاريخ');
    date.onchange = () => { const p = date.value.split('-').map(Number); d.date = p.length === 3 && p[0] ? new Date(p[0], p[1] - 1, p[2], 12).getTime() : null; };
    if (d.date === undefined) d.date = null;
    const grid = el('div', 'grid'); grid.append(type, cat, acct, date);
    row.append(top, amt, grid);
    if (d.unsure && d.unsure.length) row.appendChild(el('p', 'hint', 'مش متأكد من ' + d.unsure.map(u => ({ category: 'الفئة', date: 'التاريخ', account: 'الحساب' }[u] || u)).join(' و') + '. اتحط الافتراضي، راجعه قبل ما تحفظ.'));
    if (d.assumed) row.appendChild(el('p', 'hint', 'التاريخ اتاخد من «امبارح» اللي قبله في الكلام. راجعه لو غلط.'));
    box.appendChild(row);
  });
  box.appendChild(el('p', 'muted', 'البنود من غير مبلغ مش هتتحفظ.'));
  const s = el('button', 'primary', 'احفظ'); s.id = 'save'; s.type = 'button'; s.disabled = !drafts.some(x => x.amount !== null);
  s.onclick = async () => {
    s.disabled = true; const t = Date.now();
    const add = drafts.filter(x => x.amount !== null).map((x, i) => {
      const base = x.date || (x.daysAgo ? startOfDay(t - x.daysAgo * 86400000).getTime() + 12 * 3600000 : t);
      const e = { id: uid(), ts: Math.min(base + i, t + i), amount: x.amount, cat: x.cat, note: x.note };
      if (x.type === 'inc') e.type = 'inc'; if (x.acct) e.acct = x.acct; return e;
    });
    try { await putMany(add); entries = entries.concat(add); drafts = null; $('input').value = ''; setMsg(`اتحفظ ${add.length.toLocaleString('ar-EG')} في الجهاز.`); renderDrafts(); render(); }
    catch { setMsg('الحفظ فشل ومفيش حاجة اتحفظت. جرّب تاني.', true); s.disabled = false; }
  };
  box.appendChild(s);
}

// ---------- events ----------
$('parse').onclick = () => {
  if (getPC()) { understand($('input').value); return; }
  const d = parseText($('input').value);
  if (!d.length) { drafts = null; renderDrafts(); setMsg('مفهمتش مبلغ في الكلام ده. جرّب: مواصلات ٨٠ وأكل ١٢٠', true); return; }
  drafts = d; setMsg(''); renderDrafts();
};
$('input').oninput = () => { if (drafts) { drafts = null; renderDrafts(); } };
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; armed = null; render(); window.scrollTo(0, 0); });
$('d-prev').onclick = () => { dOffset--; openDay = null; render(); };
$('d-next').onclick = () => { if (dOffset < 0) { dOffset++; openDay = null; render(); } };
document.querySelectorAll('#tab-rep .seg button').forEach(b => b.onclick = () => { rPeriod = b.dataset.p; rOffset = 0; render(); });
$('r-prev').onclick = () => { rOffset--; render(); };
$('r-next').onclick = () => { if (rOffset < 0) { rOffset++; render(); } };
$('g-add').onclick = () => {
  const n = $('g-name').value.trim().slice(0, 40), v = parseFloat($('g-target').value);
  if (!n || !(v > 0 && v < MAX_AMOUNT) || settings.goals.length >= 30) return;
  settings.goals.push({ id: uid(), name: n, target: v, saved: 0 }); $('g-name').value = ''; $('g-target').value = ''; saveSettings(); render();
};
$('c-add').onclick = () => {
  const n = $('c-name').value.trim().slice(0, 20); if (!n || settings.cats.length >= 40) return;
  settings.cats.push(n); $('c-name').value = ''; saveSettings(); render();
};

// voice
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false;
if (!SR && !window.MediaRecorder) { $('mic').disabled = true; $('voice-note').textContent = 'المتصفح ده مفيهوش تعرّف على الكلام. اكتب، أو استعمل ميكروفون الكيبورد.'; }
else $('voice-note').textContent = 'من غير الرمز السري: الصوت بيتحوّل لكتابة عن طريق خدمة التعرف على الكلام في المتصفح، وبيحتاج إنترنت، وممكن الصوت يتبعت لشركة المتصفح. راجع النص قبل الحفظ.';
const AI_URL = 'https://masarefy-ai.mohamedabdelmaksoud159.workers.dev/stt';
const PC_KEY = 'masarefy_voice_pc';
const getPC = () => { try { return localStorage.getItem(PC_KEY) || ''; } catch { return ''; } };
let mrec = null, mstream = null, mchunks = [];
function srStart() {
  if (!SR) { setMsg('الصوت السحابي مش شغال والمتصفح مفيهوش تعرّف. اكتب بإيدك.', true); return; }
  rec = new SR(); rec.lang = 'ar-EG'; rec.interimResults = true; rec.continuous = false;
  const base = $('input').value ? $('input').value.trim() + ' ' : '';
  rec.onstart = () => { listening = true; $('mic').classList.add('rec'); $('miclbl').textContent = 'وقّف'; setMsg('بسمعك…'); };
  rec.onresult = ev => { let t = ''; for (const r of ev.results) t += r[0].transcript; $('input').value = base + t; };
  rec.onerror = ev => { const m = { 'not-allowed': 'المتصفح مش مدّي إذن الميكروفون.', 'service-not-allowed': 'خدمة الصوت مش متاحة هنا.', 'no-speech': 'مسمعتش حاجة.', 'network': 'خدمة الصوت محتاجة إنترنت.', 'audio-capture': 'مفيش ميكروفون شغال.' }; setMsg(m[ev.error] || 'الصوت فشل (' + ev.error + ').', true); };
  rec.onend = () => { listening = false; $('mic').classList.remove('rec'); $('miclbl').textContent = 'تكلّم'; if ($('input').value.trim()) { if ($('msg').textContent === 'بسمعك…') setMsg('اتكتب. راجع النص واضغط افهم.'); } };
  try { rec.start(); } catch { setMsg('معرفتش أشغّل الميكروفون.', true); }
}
const AI_PARSE = AI_URL.replace('/stt', '/parse');
async function aiDrafts(text) {
  const pc = getPC(); if (!pc) return null;
  try {
    const r = await fetch(AI_PARSE, { method: 'POST', headers: { 'X-Passcode': pc, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, cats: settings.cats }) });
    if (!r.ok) return null;
    const j = await r.json(); const out = []; out.dropped = j.dropped || 0;
    for (const it of (j.items || [])) {
      const inc = it.type === 'inc';
      const cat = inc ? INC_CATS.indexOf(it.category) : settings.cats.indexOf(it.category);
      const acct = ['cash', 'bank', 'wallet'].indexOf(it.account);
      const unsure = Array.isArray(it.flags) ? it.flags.slice() : [];
      const amount = Number(it.amount); if (!(amount > 0 && amount < MAX_AMOUNT)) { out.dropped++; continue; }
      const da = it.daysAgo === null ? NaN : Math.round(Number(it.daysAgo));
      if (!(da >= 0 && da <= 60) && !unsure.includes('date')) unsure.push('date');
      if (cat < 0 && !unsure.includes('category')) unsure.push('category');
      if (acct < 0 && !unsure.includes('account')) unsure.push('account');
      out.push({ amount, cat: cat >= 0 ? cat : (inc ? 2 : settings.cats.length - 1), type: inc ? 'inc' : 'exp', acct: acct >= 0 ? acct : 0, daysAgo: da >= 0 && da <= 60 ? da : 0, note: String(it.note || '').slice(0, 60), ai: true, unsure });
    }
    return out.length ? out : null;
  } catch { return null; }
}
async function understand(text) {
  setMsg('بفهم الكلام…');
  let d = await aiDrafts(text), how = 'ai';
  if (!d) { d = parseText(text); how = 'local'; }
  if (!d.length) { drafts = null; renderDrafts(); setMsg('مفهمتش مبلغ في الكلام ده. جرّب: مواصلات ٨٠ وأكل ١٢٠', true); return; }
  drafts = d; renderDrafts();
  const dr = how === 'ai' && d.dropped ? ' في ' + d.dropped + ' بند مفهمتوش، اكتبهم بإيدك.' : '';
  setMsg(how === 'ai' ? 'فهمت. راجع كل بند واضغط احفظ.' + dr : 'فهمت بالطريقة العادية. راجع كل بند واضغط احفظ.');
}
async function cloudVoice() {
  if (mrec && mrec.state === 'recording') { mrec.stop(); return; }
  try { mstream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { setMsg('المتصفح مش مدّي إذن الميكروفون.', true); return; }
  mchunks = [];
  mrec = new MediaRecorder(mstream);
  const base = $('input').value ? $('input').value.trim() + ' ' : '';
  mrec.ondataavailable = e => { if (e.data && e.data.size) mchunks.push(e.data); };
  mrec.onstart = () => { listening = true; $('mic').classList.add('rec'); $('miclbl').textContent = 'وقّف'; setMsg('بسمعك… اضغط وقّف لما تخلص.'); };
  mrec.onstop = async () => {
    listening = false; $('mic').classList.remove('rec'); $('miclbl').textContent = 'تكلّم';
    mstream.getTracks().forEach(t => t.stop());
    const blob = new Blob(mchunks, { type: mrec.mimeType || 'audio/webm' });
    if (blob.size < 1000) { setMsg('مسمعتش حاجة. جرّب تاني.', true); return; }
    setMsg('بكتب اللي قلته…');
    try {
      const r = await fetch(AI_URL, { method: 'POST', headers: { 'X-Passcode': getPC(), 'Content-Type': blob.type }, body: blob });
      if (r.status === 401) { setMsg('الرمز السري غلط. صحّحه من «بياناتك».', true); return; }
      if (!r.ok) { setMsg('الصوت السحابي مش متاح دلوقتي (' + r.status + '). اكتب أو جرّب تاني.', true); return; }
      const j = await r.json(); const t = (j.text || '').trim();
      if (!t) { setMsg('مسمعتش كلام واضح. جرّب تاني.', true); return; }
      $('input').value = base + t; await understand($('input').value);
    } catch { setMsg('مفيش اتصال بخدمة الصوت. اكتب أو جرّب تاني.', true); }
  };
  mrec.start();
}
$('mic').onclick = () => {
  if (listening && rec) { rec.stop(); return; }
  if (getPC() && window.MediaRecorder && navigator.mediaDevices) { cloudVoice(); return; }
  srStart();
};
$('pc-save').onclick = () => {
  const v = $('pc').value.trim();
  try { if (v) localStorage.setItem(PC_KEY, v); else localStorage.removeItem(PC_KEY); } catch {}
  $('pc').value = ''; $('pc-state').textContent = getPC() ? 'الصوت الذكي شغال على الجهاز ده.' : 'الصوت الذكي مقفول. بيستعمل تعرّف المتصفح.';
};
$('pc-state').textContent = getPC() ? 'الصوت الذكي شغال على الجهاز ده.' : 'الصوت الذكي مقفول. بيستعمل تعرّف المتصفح.';

// export / import
function download(name, mime, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const stamp = () => ymd(Date.now());
$('exp-json').onclick = () => {
  download(`masarefy-backup-${stamp()}.json`, 'application/json', JSON.stringify({ app: 'masarefy', v: 2, exportedAt: Date.now(), entries, settings }));
  localStorage.setItem('lastBackup', String(Date.now())); render();
};
const csvCell = s => { s = String(s); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
$('exp-csv').onclick = () => {
  const rows = ['date,time,type,amount_egp,category,account,note'].concat(entries.slice().sort((a, b) => a.ts - b.ts).map(e => {
    const d = new Date(e.ts);
    return [ymd(e.ts), `${pad(d.getHours())}:${pad(d.getMinutes())}`, isInc(e) ? 'income' : 'expense', e.amount, catName(e), ACCTS[e.acct || 0], e.note].map(csvCell).join(',');
  }));
  download(`masarefy-${stamp()}.csv`, 'text/csv;charset=utf-8', '\ufeff' + rows.join('\r\n'));
};
function validEntry(e, ncats) {
  const inc = e && e.type === 'inc';
  return e && typeof e.id === 'string' && e.id.length > 0 && e.id.length <= 64 && Number.isFinite(e.ts) && e.ts > 0 && e.ts < 4102444800000 &&
    Number.isFinite(e.amount) && e.amount > 0 && e.amount < MAX_AMOUNT && Number.isInteger(e.cat) && e.cat >= 0 && e.cat < (inc ? INC_CATS.length : ncats) &&
    typeof e.note === 'string' && (e.type === undefined || e.type === 'inc' || e.type === 'exp') && (e.acct === undefined || (Number.isInteger(e.acct) && e.acct >= 0 && e.acct < ACCTS.length));
}
$('imp').onchange = async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  try {
    if (f.size > 20e6) throw new Error('big');
    const data = JSON.parse(await f.text());
    const list = Array.isArray(data) ? data : data && data.app === 'masarefy' ? data.entries : null;
    if (!Array.isArray(list)) throw new Error('bad');
    if (data && data.settings) { const s = sanitizeSettings(data.settings); settings.cats = s.cats.length >= settings.cats.length ? s.cats : settings.cats; Object.assign(settings.budgets, s.budgets); const ids = new Set(settings.goals.map(g => g.id)); s.goals.forEach(g => { if (!ids.has(g.id)) settings.goals.push(g); }); saveSettings(); }
    const good = list.filter(e => validEntry(e, settings.cats.length)).map(e => { const o = { id: e.id, ts: e.ts, amount: e.amount, cat: e.cat, note: e.note.slice(0, 120) }; if (e.type === 'inc') o.type = 'inc'; if (e.acct) o.acct = e.acct; return o; });
    const have = new Set(entries.map(e => e.id)); const fresh = good.filter(e => !have.has(e.id) && have.add(e.id));
    await putMany(fresh); entries = entries.concat(fresh); render();
    setMsg(`اتضاف ${fresh.length.toLocaleString('ar-EG')} حركة جديدة، وتجاهلت ${(list.length - fresh.length).toLocaleString('ar-EG')} (متكررة أو مش صالحة).`);
    if (tab === 'set') $('backup').textContent = `اتضاف ${fresh.length.toLocaleString('ar-EG')} حركة جديدة، وتجاهلت ${(list.length - fresh.length).toLocaleString('ar-EG')} (متكررة أو مش صالحة).`;
  } catch { setMsg('الملف مش نسخة احتياطية صالحة، ومفيش حاجة اتغيّرت.', true); if (tab === 'set') $('backup').textContent = 'الملف مش نسخة احتياطية صالحة، ومفيش حاجة اتغيّرت.'; }
};

// ---------- install ----------
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('install').hidden = false; });
$('install').onclick = async () => { if (!deferredInstall) return; deferredInstall.prompt(); try { await deferredInstall.userChoice; } catch {} deferredInstall = null; $('install').hidden = true; };
window.addEventListener('appinstalled', () => { $('install').hidden = true; $('inst-note').textContent = 'التطبيق اتثبّت. افتحه من الشاشة الرئيسية.'; });
if (window.matchMedia && matchMedia('(display-mode: standalone)').matches) $('inst').hidden = true;

// ---------- start ----------
(async () => {
  loadSettings();
  try {
    db = await openDb(); entries = await allEntries();
    if (navigator.storage && navigator.storage.persist) { try { persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist()); } catch {} }
  } catch (e) { setMsg('التخزين على الجهاز مش شغال في المتصفح ده (ممكن تكون في وضع التصفح الخاص). مش هقدر أحفظ.', true); $('parse').disabled = true; }
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
