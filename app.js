'use strict';
// ---------- constants ----------
const CATS = ['أكل وشرب', 'مواصلات', 'فواتير ورصيد', 'صحة', 'ملابس', 'ترفيه', 'تعليم', 'تانية'];
const KEYWORDS = [
  ['اكل','فطار','غدا','عشا','سندوتش','ساندوتش','مطعم','قهوه','شاي','عصير','بقاله','سوبر','خضار','فاكهه','وجبه','شرب','مياه','ماكل','اكلت','بيتزا','حلويات'],
  ['مواصلات','تاكسي','اوبر','ميكروباص','بنزين','مترو','اتوبيس','توك','موقف','اجره','تذكره','قطر','ديدي','انديرايف','ركبت'],
  ['فاتوره','كهربا','نت','انترنت','رصيد','موبايل','غاز','ايجار','اشتراك','خط'],
  ['دوا','دواء','صيدليه','دكتور','كشف','علاج','تحليل'],
  ['هدوم','ملابس','جزمه','حذاء','قميص','بنطلون','تيشرت'],
  ['سينما','خروجه','لعبه','العاب','كافيه','فيلم','رحله','نتفلكس'],
  ['كورس','كتاب','تعليم','دراسه','مدرسه','جامعه'],
];
const WORDS = {
  واحد:1,اتنين:2,اثنين:2,تلاته:3,ثلاثه:3,اربعه:4,خمسه:5,خمس:5,سته:6,ست:6,سبعه:7,تمانيه:8,ثمانيه:8,تسعه:9,عشره:10,عشر:10,
  حداشر:11,اتناشر:12,تلتاشر:13,اربعتاشر:14,خمستاشر:15,عشرين:20,تلاتين:30,ثلاثين:30,اربعين:40,خمسين:50,ستين:60,سبعين:70,
  تمانين:80,ثمانين:80,تسعين:90,ميه:100,مايه:100,مئه:100,ميتين:200,مئتين:200,تلتميه:300,ربعميه:400,خمسميه:500,ستميه:600,
  سبعميه:700,تمنميه:800,تسعميه:900,الف:1000,الفين:2000,نص:0.5,نصف:0.5,
};
const STOP = new Set(['صرفت','دفعت','جنيه','جنيها','ج','egp','le','على','في','ب','بس','و']);
const NOT_WAW = new Set(['وجبه','وجبات']);
const MAX_AMOUNT = 10000000;
const DB_NAME = 'expenses-db', STORE = 'entries';

// ---------- parsing ----------
function norm(s) {
  return String(s).replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.').toLowerCase();
}
const wordVal = t => { const n = norm(t); const w = n.replace(/^و/, '').replace(/^ال/, ''); return WORDS[n] ?? WORDS[w]; };
const isNum = t => /\d/.test(norm(t)) || wordVal(t) !== undefined;
function parseSegment(tokens) {
  if (!tokens.length) return null;
  let amount = null;
  const dm = tokens.map(norm).join(' ').match(/(\d+(?:[.,]\d+)?)/);
  if (dm) amount = parseFloat(dm[1].replace(',', '.'));
  else { let sum = 0, found = false; for (const t of tokens) { const v = wordVal(t); if (v !== undefined) { sum += v; found = true; } } if (found) amount = sum; }
  const noteTokens = tokens.filter(t => { const n = norm(t); return !isNum(t) && !STOP.has(n) && !STOP.has(n.replace(/^و(?=.{3,})/, '')); });
  const rest = norm(noteTokens.join(' '));
  let cat = CATS.length - 1;
  outer: for (let i = 0; i < KEYWORDS.length; i++) for (const k of KEYWORDS[i]) if (rest.includes(k)) { cat = i; break outer; }
  if (amount === null && !noteTokens.length) return null;
  return { amount, cat, note: noteTokens.join(' ').replace(/^و(?=.{3,})/, '').slice(0, 60) };
}
function parseText(text) {
  const out = [];
  for (const line of text.split(/[\n,،;؛]+/)) {
    const toks = line.split(/\s+/).filter(Boolean);
    let cur = [], hasAmt = false, prevNum = false;
    const flush = () => { const d = parseSegment(cur); if (d) out.push(d); };
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

// ---------- dates ----------
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
const sum = l => l.reduce((s, e) => s + e.amount, 0);

// ---------- UI ----------
const $ = id => document.getElementById(id);
let entries = [], period = 'day', offset = 0, drafts = null, armed = null, persisted = null;

function setMsg(t, bad) { $('msg').textContent = t; $('msg').className = 'muted' + (bad ? ' danger' : ''); }
function li(name, detail, value, extra) {
  const el = document.createElement('li'); const l = document.createElement('div');
  const n = document.createElement('div'); n.className = 'n'; n.textContent = name; l.appendChild(n);
  if (detail) { const d = document.createElement('div'); d.className = 'd'; d.textContent = detail; l.appendChild(d); }
  const v = document.createElement('div'); v.className = 'v'; v.textContent = value;
  el.appendChild(l); el.appendChild(v); if (extra) el.appendChild(extra); return el;
}
function render() {
  const now = Date.now();
  $('today').textContent = 'النهارده: ' + egp(sum(entries.filter(e => e.ts >= range('day', 0, now)[0] && e.ts < range('day', 0, now)[1])));
  const [from, to] = range(period, offset, now);
  const list = entries.filter(e => e.ts >= from && e.ts < to).sort((a, b) => b.ts - a.ts);
  const total = sum(list);
  $('plabel').textContent = plabel(period, from, to);
  $('next').disabled = offset >= 0;
  $('total').textContent = list.length ? egp(total) : 'مفيش مصاريف في الفترة دي'; $('total').className = list.length ? 'big' : 'big empty';
  const cats = $('cats'); cats.textContent = '';
  CATS.map((c, i) => ({ c, v: sum(list.filter(e => e.cat === i)) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v)
    .forEach(x => cats.appendChild(li(x.c, Math.round(x.v / total * 100).toLocaleString('ar-EG') + '٪ من الإجمالي', egp(x.v))));
  const ul = $('entries'); ul.textContent = '';
  list.forEach(e => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'x';
    b.textContent = armed === e.id ? 'تأكيد المسح' : 'امسح';
    b.onclick = async () => { if (armed !== e.id) { armed = e.id; render(); return; } armed = null; try { await removeOne(e.id); entries = entries.filter(x => x.id !== e.id); setMsg('اتمسح.'); } catch { setMsg('المسح فشل. جرّب تاني.', true); } render(); };
    ul.appendChild(li(e.note || CATS[e.cat], CATS[e.cat] + ' · ' + new Date(e.ts).toLocaleString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }), egp(e.amount), b));
  });
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.p === period));
  renderStore();
}
function renderStore() {
  const last = Number(localStorage.getItem('lastBackup') || 0);
  $('store').textContent = `${entries.length.toLocaleString('ar-EG')} مصروف محفوظ على الجهاز ده. ` +
    (persisted === true ? 'المتصفح وافق يحافظ على البيانات.' : persisted === false ? 'المتصفح لسه مضمنش إن البيانات مش هتتمسح لو المساحة قلت.' : '');
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  const b = $('backup');
  if (!entries.length) { b.textContent = ''; b.className = 'muted'; }
  else if (days === null) { b.textContent = 'مفيش نسخة احتياطية لحد دلوقتي. لو مسحت بيانات التطبيق أو غيّرت الموبايل المصاريف هتضيع.'; b.className = 'warn'; }
  else if (days >= 7) { b.textContent = `آخر نسخة احتياطية من ${days.toLocaleString('ar-EG')} يوم.`; b.className = 'warn'; }
  else { b.textContent = 'آخر نسخة احتياطية: ' + new Date(last).toLocaleDateString('ar-EG'); b.className = 'muted'; }
}
function renderDrafts() {
  const box = $('drafts'); box.textContent = '';
  if (!drafts) { box.hidden = true; return; }
  box.hidden = false;
  drafts.forEach((d, i) => {
    const row = document.createElement('div'); row.className = 'draft';
    const top = document.createElement('div'); top.className = 'top';
    const name = document.createElement('span'); name.textContent = d.note || 'من غير وصف';
    const val = document.createElement('span'); val.textContent = d.amount === null ? 'مفيش مبلغ' : egp(d.amount); top.append(name, val);
    const amt = document.createElement('input'); amt.type = 'number'; amt.inputMode = 'decimal'; amt.min = '0'; amt.step = 'any'; amt.placeholder = 'المبلغ'; amt.setAttribute('aria-label', 'المبلغ');
    if (d.amount !== null) amt.value = d.amount;
    amt.oninput = () => { const v = parseFloat(amt.value); d.amount = isFinite(v) && v > 0 && v < MAX_AMOUNT ? v : null; val.textContent = d.amount === null ? 'مفيش مبلغ' : egp(d.amount); $('save').disabled = !drafts.some(x => x.amount !== null); };
    const sel = document.createElement('select'); sel.setAttribute('aria-label', 'الفئة');
    CATS.forEach((c, k) => { const o = document.createElement('option'); o.value = k; o.textContent = c; if (k === d.cat) o.selected = true; sel.appendChild(o); });
    sel.onchange = () => { d.cat = Number(sel.value); };
    row.append(top, amt, sel); box.appendChild(row);
  });
  const w = document.createElement('p'); w.className = 'muted'; w.textContent = 'البنود من غير مبلغ مش هتتحفظ.'; box.appendChild(w);
  const s = document.createElement('button'); s.id = 'save'; s.type = 'button'; s.className = 'primary'; s.textContent = 'احفظ';
  s.disabled = !drafts.some(x => x.amount !== null);
  s.onclick = async () => {
    s.disabled = true; const t = Date.now();
    const add = drafts.filter(x => x.amount !== null).map((x, i) => ({ id: uid(), ts: t + i, amount: x.amount, cat: x.cat, note: x.note }));
    try { await putMany(add); entries = entries.concat(add); drafts = null; $('input').value = ''; offset = 0; setMsg(`اتحفظ ${add.length.toLocaleString('ar-EG')} في الجهاز.`); renderDrafts(); render(); }
    catch { setMsg('الحفظ فشل ومفيش حاجة اتحفظت. جرّب تاني.', true); s.disabled = false; }
  };
  box.appendChild(s);
}

// ---------- events ----------
$('parse').onclick = () => {
  const d = parseText($('input').value);
  if (!d.length) { drafts = null; renderDrafts(); setMsg('مفهمتش مبلغ في الكلام ده. جرّب: مواصلات ٨٠ وأكل ١٢٠', true); return; }
  drafts = d; setMsg(''); renderDrafts();
};
$('input').oninput = () => { if (drafts) { drafts = null; renderDrafts(); } };
document.querySelectorAll('.seg button').forEach(b => b.onclick = () => { period = b.dataset.p; offset = 0; render(); });
$('prev').onclick = () => { offset--; render(); };
$('next').onclick = () => { if (offset < 0) { offset++; render(); } };

// voice
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false;
if (!SR) { $('mic').disabled = true; $('voice-note').textContent = 'المتصفح ده مفيهوش تعرّف على الكلام. اكتب، أو استعمل ميكروفون الكيبورد.'; }
else $('voice-note').textContent = 'الصوت بيتحوّل لكتابة عن طريق خدمة التعرف على الكلام في المتصفح، وبيحتاج إنترنت، وممكن الصوت يتبعت لشركة المتصفح. راجع النص قبل الحفظ.';
$('mic').onclick = () => {
  if (!SR) return;
  if (listening && rec) { rec.stop(); return; }
  rec = new SR(); rec.lang = 'ar-EG'; rec.interimResults = true; rec.continuous = false;
  const base = $('input').value ? $('input').value.trim() + ' ' : '';
  rec.onstart = () => { listening = true; $('mic').classList.add('rec'); $('miclbl').textContent = 'وقّف'; setMsg('بسمعك…'); };
  rec.onresult = ev => { let t = ''; for (const r of ev.results) t += r[0].transcript; $('input').value = base + t; };
  rec.onerror = ev => { const m = { 'not-allowed': 'المتصفح مش مدّي إذن الميكروفون.', 'service-not-allowed': 'خدمة الصوت مش متاحة هنا.', 'no-speech': 'مسمعتش حاجة.', 'network': 'خدمة الصوت محتاجة إنترنت.', 'audio-capture': 'مفيش ميكروفون شغال.' }; setMsg(m[ev.error] || 'الصوت فشل (' + ev.error + ').', true); };
  rec.onend = () => { listening = false; $('mic').classList.remove('rec'); $('miclbl').textContent = 'تكلّم'; if ($('input').value.trim()) { if ($('msg').textContent === 'بسمعك…') setMsg('اتكتب. راجع النص واضغط افهم.'); } };
  try { rec.start(); } catch { setMsg('معرفتش أشغّل الميكروفون.', true); }
};

// export / import
function download(name, mime, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
$('exp-json').onclick = () => {
  download(`masarefy-backup-${stamp()}.json`, 'application/json', JSON.stringify({ app: 'masarefy', v: 1, exportedAt: Date.now(), entries }));
  localStorage.setItem('lastBackup', String(Date.now())); renderStore();
};
const csvCell = s => { s = String(s); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
$('exp-csv').onclick = () => {
  const rows = ['date,time,amount_egp,category,note'].concat(entries.slice().sort((a, b) => a.ts - b.ts).map(e => {
    const d = new Date(e.ts), p = n => String(n).padStart(2, '0');
    return [`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, `${p(d.getHours())}:${p(d.getMinutes())}`, e.amount, CATS[e.cat], e.note].map(csvCell).join(',');
  }));
  download(`masarefy-${stamp()}.csv`, 'text/csv;charset=utf-8', '\ufeff' + rows.join('\r\n'));
};
function validEntry(e) {
  return e && typeof e.id === 'string' && e.id.length > 0 && e.id.length <= 64 && Number.isFinite(e.ts) && e.ts > 0 && e.ts < 4102444800000 &&
    Number.isFinite(e.amount) && e.amount > 0 && e.amount < MAX_AMOUNT && Number.isInteger(e.cat) && e.cat >= 0 && e.cat < CATS.length && typeof e.note === 'string';
}
$('imp').onchange = async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  try {
    if (f.size > 20e6) throw new Error('big');
    const data = JSON.parse(await f.text());
    const list = Array.isArray(data) ? data : data && data.app === 'masarefy' ? data.entries : null;
    if (!Array.isArray(list)) throw new Error('shape');
    const good = list.filter(validEntry).map(e => ({ id: e.id, ts: e.ts, amount: e.amount, cat: e.cat, note: e.note.slice(0, 60) }));
    const have = new Set(entries.map(e => e.id)); const fresh = good.filter(e => !have.has(e.id) && have.add(e.id));
    await putMany(fresh); entries = entries.concat(fresh); render();
    setMsg(`اتضاف ${fresh.length.toLocaleString('ar-EG')} مصروف جديد، وتجاهلت ${(list.length - fresh.length).toLocaleString('ar-EG')} (متكرر أو مش صالح).`);
  } catch { setMsg('الملف مش نسخة احتياطية صالحة، ومفيش حاجة اتغيّرت.', true); }
};

// ---------- start ----------
(async () => {
  try {
    db = await openDb(); entries = await allEntries();
    if (navigator.storage && navigator.storage.persist) { try { persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist()); } catch {} }
  } catch (e) { setMsg('التخزين على الجهاز مش شغال في المتصفح ده (ممكن تكون في وضع التصفح الخاص). مش هقدر أحفظ.', true); $('parse').disabled = true; }
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();

// ---------- install ----------
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('install').hidden = false; });
$('install').onclick = async () => { if (!deferredInstall) return; deferredInstall.prompt(); try { await deferredInstall.userChoice; } catch {} deferredInstall = null; $('install').hidden = true; };
window.addEventListener('appinstalled', () => { $('install').hidden = true; $('inst-note').textContent = 'التطبيق اتثبّت. افتحه من الشاشة الرئيسية.'; });
if (window.matchMedia && matchMedia('(display-mode: standalone)').matches) $('inst').hidden = true;
