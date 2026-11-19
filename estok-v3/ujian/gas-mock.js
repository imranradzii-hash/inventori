/**
 * Simulasi minimum persekitaran Google Apps Script untuk menguji kod .gs dalam Node.
 * Hanya API yang digunakan oleh e-Stok V3 disimulasi.
 */
process.env.TZ = 'Asia/Kuala_Lumpur';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function fmtDate(d, tz, pola) {
  const parts = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .formatToParts(d).forEach(p => { parts[p.type] = p.value; });
  if (parts.hour === '24') parts.hour = '00';
  return pola.replace('yyyy', parts.year).replace('yy', parts.year.slice(2)).replace('MM', parts.month).replace('dd', parts.day)
    .replace('HH', parts.hour).replace('mm', parts.minute).replace('ss', parts.second);
}

// Sheets menukar string seperti tarikh kepada Date (meniru tingkah laku sebenar untuk setValues/appendRow)
function coerce(v) {
  if (typeof v === 'string') {
    if (v.startsWith("'")) return v.slice(1);
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  return v === undefined || v === null ? '' : v;
}

class Sheet {
  constructor(ss, name) { this.ss = ss; this.name = name; this.data = []; this.frozen = 0; this.protections = []; }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getLastRow() { let n = this.data.length; while (n > 0 && this.data[n - 1].every(c => c === '' || c == null)) n--; return n; }
  getLastColumn() { return this.data.reduce((m, r) => { let n = r.length; while (n > 0 && (r[n - 1] === '' || r[n - 1] == null)) n--; return Math.max(m, n); }, 0); }
  _ensure(r, c) { while (this.data.length < r) this.data.push([]); this.data.forEach(row => { while (row.length < c) row.push(''); }); }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  appendRow(arr) { const r = this.getLastRow() + 1; this.getRange(r, 1, 1, arr.length).setValues([arr]); return this; }
  setFrozenRows(n) { this.frozen = n; return this; }
  insertRows() {}
  copyTo(ss) { const s = ss.insertSheet('Copy of ' + this.name); s.data = this.data.map(r => r.slice()); return s; }
  protect() { const p = new Protection(); this.protections.push(p); return p; }
}
class Protection {
  constructor() { this.editors = ['owner@jheaipp.gov.my', 'lain@jheaipp.gov.my']; this.domain = true; }
  setDescription() { return this; }
  addEditor(e) { const em = typeof e === 'string' ? e : e.getEmail(); if (!this.editors.includes(em)) this.editors.push(em); return this; }
  removeEditors(list) { const ems = list.map(e => (typeof e === 'string' ? e : e.getEmail())); this.editors = this.editors.filter(e => !ems.includes(e)); return this; }
  getEditors() { return this.editors.map(e => ({ getEmail: () => e })); }
  canDomainEdit() { return this.domain; }
  setDomainEdit(v) { this.domain = v; return this; }
}
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() {
    this.sh._ensure(this.r + this.nr - 1, this.c + this.nc - 1);
    return this.sh.data.slice(this.r - 1, this.r - 1 + this.nr).map(row => row.slice(this.c - 1, this.c - 1 + this.nc).map(v => (v instanceof Date ? new Date(v) : v)));
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(vals) {
    if (vals.length !== this.nr || vals.some(r => r.length !== this.nc)) throw new Error(`Dimensi tidak padan: ${vals.length}x${vals[0] && vals[0].length} vs ${this.nr}x${this.nc}`);
    this.sh._ensure(this.r + this.nr - 1, this.c + this.nc - 1);
    vals.forEach((row, i) => row.forEach((v, j) => { this.sh.data[this.r - 1 + i][this.c - 1 + j] = coerce(v); }));
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
}
class Spreadsheet {
  constructor() { this.sheets = []; this.tz = 'Asia/Kuala_Lumpur'; }
  getId() { return 'SS-UJIAN'; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { if (this.getSheetByName(n)) throw new Error('Sheet wujud: ' + n); const s = new Sheet(this, n); this.sheets.push(s); return s; }
  getSpreadsheetTimeZone() { return this.tz; }
}

function createEnv() {
  const ss = new Spreadsheet();
  const props = {};
  const cache = {};
  const drive = [];
  const env = { ss, props, cache, drive, emelAktif: '', emelPemilik: 'imran@jheaipp.gov.my', logs: [] };
  const sandbox = {
    console: { log: (...a) => env.logs.push(a.join(' ')), error: (...a) => env.logs.push('ERR ' + a.join(' ')) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss, openById: () => ss,
      getUi: () => { throw new Error('Tiada UI (editor)'); }
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Session: {
      getActiveUser: () => ({ getEmail: () => env.emelAktif }),
      getEffectiveUser: () => ({ getEmail: () => env.emelPemilik }),
      getScriptTimeZone: () => 'Asia/Kuala_Lumpur'
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: fmtDate,
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, v) => Array.from(crypto.createHash(alg).update(typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map(b => b & 255))).digest()).map(b => (b > 127 ? b - 256 : b)),
      base64Decode: s => Array.from(Buffer.from(s, 'base64')).map(b => (b > 127 ? b - 256 : b)),
      newBlob: (bytes, type, name) => ({ bytes, type, name })
    },
    DriveApp: {
      getFolderById: id => ({
        createFile: blob => { const f = { id: 'FILE' + (drive.length + 1), blob, folder: id, desc: '' }; drive.push(f);
          return { getUrl: () => 'https://drive.google.com/file/d/' + f.id, getId: () => f.id, setDescription: d => { f.desc = d; } }; }
      })
    },
    HtmlService: { createHtmlOutputFromFile: () => ({ setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; } }), XFrameOptionsMode: { DEFAULT: 1 } }
  };
  const ctx = vm.createContext(sandbox);
  const dir = path.join(__dirname, '..', 'src');
  const kod = ['Code.gs', 'Database.gs', 'Auth.gs', 'Inventory.gs', 'Audit.gs', 'Drive.gs'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n;\n');
  vm.runInContext(kod, ctx, { filename: 'estok-v3.gs' });
  env.ctx = ctx;
  env.call = (fn, ...args) => vm.runInContext(fn, ctx)(...args);
  env.api = (emel, action, payload, token) => { env.emelAktif = emel; return JSON.parse(ctx.api(JSON.stringify({ action, payload, token }))); };
  env.pad = (token, action, payload) => env.api('', action, payload, token);
  return env;
}

/** Data V2 contoh: 12 lajur, sebahagian tanpa ID, tarikh dalam pelbagai bentuk. */
function seedV2(env) {
  const sh = env.ss.insertSheet('TRANSAKSI');
  const d = (y, m, dd) => new Date(y, m - 1, dd);
  sh.data = [
    ['Tarikh', 'Lokasi', 'Item', 'Jenis', 'Arah', 'Kuantiti', 'Siri Kursus', 'Jumlah Peserta', 'Rujukan', 'ID', 'Direkod Oleh', 'Catatan'],
    [d(2026, 1, 5), 'UPK BUUKI (HQ)', 'Sijil', 'Terima Pembekal', 'Masuk', 1000, '', '', 'DO-1', '', '', ''],
    [d(2026, 1, 5), 'UPK BUUKI (HQ)', 'Mineral', 'Terima Pembekal', 'Masuk', 20, '', '', 'DO-2', '', '', ''],
    [d(2026, 2, 1), 'UPK BUUKI (HQ)', 'Sijil', 'Pindahan Keluar', 'Keluar', 300, '', '', 'PDH-1', 'abc123', 'En. Muhammad Imran bin Mohamed Radzi', ''],
    [d(2026, 2, 1), 'Daerah Barat Daya', 'Sijil', 'Pindahan Masuk', 'Masuk', 300, '', '', 'PDH-1', 'abc124', 'En. Muhammad Imran bin Mohamed Radzi', ''],
    [d(2026, 2, 20), 'Daerah Barat Daya', 'Sijil', 'Pengeluaran Kursus', 'Keluar', 120, 'Siri 2/2026', 120, '', 'abc125', 'SITI (Barat Daya)', 'ok'],
    ['15/03/2026', 'Daerah Timur Laut', 'Pen', 'Terima Pembekal', '', 50, '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '']
  ];
  return sh;
}

module.exports = { createEnv, seedV2 };
