/**
 * Bina fail demo e-Stok V3 yang berjalan sepenuhnya dalam pelayar.
 * Menggunakan kod .gs dan Index.html SEBENAR; hanya Google Sheets/Drive/Session disimulasi.
 * Jalankan: node estok-v3/demo/bina-demo.js  →  estok-v3/demo/e-stok-v3-demo.html
 */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');
const gs = ['Code.gs', 'Database.gs', 'Auth.gs', 'Inventory.gs', 'Audit.gs', 'Drive.gs'].map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n');
let html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');

const runtime = String.raw`
<script>
/* ===== e-Stok V3 DEMO: simulasi Google Apps Script dalam pelayar ===== */
(function () {
  const KUNCI = 'estok_v3_demo_data_v1';
  const DOMAIN = 'contoh.gov.my';
  const PENGGUNA_DEMO = [
    { emel: 'imran@' + DOMAIN, nama: 'En. Muhammad Imran bin Mohamed Radzi', jawatan: 'Pentadbir Sistem e-Stok', peranan: 'ADMIN_UPK', lokasi: 'UPK BUUKI (HQ)' },
    { emel: 'kerani.upk@' + DOMAIN, nama: 'Nurul Aina binti Hassan', jawatan: 'Pembantu Tadbir', peranan: 'KERANI_UPK', lokasi: 'UPK BUUKI (HQ)' },
    { emel: 'pemantau@' + DOMAIN, nama: 'Ahmad Faiz bin Osman', jawatan: 'Penolong Pengarah', peranan: 'PEMANTAU_UPK', lokasi: 'UPK BUUKI (HQ)' },
    { emel: 'kerani.bd@' + DOMAIN, nama: 'Siti Aminah binti Yusof', jawatan: 'Pembantu Tadbir', peranan: 'KERANI_PAD', lokasi: 'Daerah Barat Daya' },
    { emel: 'kerani.tl@' + DOMAIN, nama: 'Mohd Hafiz bin Ali', jawatan: 'Pembantu Tadbir', peranan: 'KERANI_PAD', lokasi: 'Daerah Timur Laut' },
    { emel: 'pegawai.bd@' + DOMAIN, nama: 'Ustaz Rahman bin Ismail', jawatan: 'Pegawai Tadbir Agama', peranan: 'PEGAWAI_PAD', lokasi: 'Daerah Barat Daya' }
  ];
  const TIDAK_BERDAFTAR = 'staf.baru@' + DOMAIN;
  const simpanLS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const bacaLS = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const bacaSS = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const simpanSS = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} };

  // ---------- Simulasi Sheets ----------
  const pad = n => String(n).padStart(2, '0');
  function fmtDate(d, tz, p) { // zon masa skrip = waktu tempatan pelayar (setara Asia/Kuala_Lumpur dalam Apps Script)
    return p.replace('yyyy', d.getFullYear()).replace('yy', String(d.getFullYear()).slice(2)).replace('MM', pad(d.getMonth() + 1))
      .replace('dd', pad(d.getDate())).replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds()));
  }
  function coerce(v) {
    if (typeof v === 'string') {
      if (v.startsWith("'")) return v.slice(1);
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    }
    return v === undefined || v === null ? '' : v;
  }
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    getValues() { this.sh._ensure(this.r + this.nr - 1, this.c + this.nc - 1); return this.sh.data.slice(this.r - 1, this.r - 1 + this.nr).map(row => row.slice(this.c - 1, this.c - 1 + this.nc).map(v => v instanceof Date ? new Date(v) : v)); }
    setValues(vals) { this.sh._ensure(this.r + this.nr - 1, this.c + this.nc - 1); vals.forEach((row, i) => row.forEach((v, j) => { this.sh.data[this.r - 1 + i][this.c - 1 + j] = coerce(v); })); return this; }
    setValue(v) { return this.setValues([[v]]); }
  }
  class Sheet {
    constructor(name) { this.name = name; this.data = []; }
    getName() { return this.name; } setName(n) { this.name = n; return this; }
    getLastRow() { let n = this.data.length; while (n > 0 && this.data[n - 1].every(c => c === '' || c == null)) n--; return n; }
    getLastColumn() { return this.data.reduce((m, r) => { let n = r.length; while (n > 0 && (r[n - 1] === '' || r[n - 1] == null)) n--; return Math.max(m, n); }, 0); }
    _ensure(r, c) { while (this.data.length < r) this.data.push([]); this.data.forEach(row => { while (row.length < c) row.push(''); }); }
    getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
    appendRow(a) { this.getRange(this.getLastRow() + 1, 1, 1, a.length).setValues([a]); return this; }
    setFrozenRows() { return this; }
    copyTo(ss) { const s = ss.insertSheet('Copy ' + Date.now()); s.data = this.data.map(r => r.slice()); return s; }
    protect() { const p = { e: [], setDescription() { return p; }, addEditor() { return p; }, removeEditors() { return p; }, getEditors() { return []; }, canDomainEdit() { return false; }, setDomainEdit() { return p; } }; return p; }
  }
  const ss = { sheets: [], getId: () => 'DEMO', getSpreadsheetTimeZone: () => 'Asia/Kuala_Lumpur',
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; },
    insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; } };
  let props = {};
  const cache = {};
  const fail = {};
  const env = { emel: '' };

  const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  const SpreadsheetApp = { getActiveSpreadsheet: () => ss, openById: () => ss, getUi: () => { throw new Error('tiada UI'); } };
  const PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) };
  const CacheService = { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; } }) };
  const LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
  const Session = { getActiveUser: () => ({ getEmail: () => env.emel }), getEffectiveUser: () => ({ getEmail: () => 'imran@' + DOMAIN }), getScriptTimeZone: () => 'Asia/Kuala_Lumpur' };
  const Utilities = {
    getUuid: uuid, formatDate: fmtDate,
    base64Decode: s => { const b = atob(s); const a = new Array(b.length); for (let i = 0; i < b.length; i++) { const c = b.charCodeAt(i); a[i] = c > 127 ? c - 256 : c; } return a; },
    newBlob: (bytes, type, name) => ({ bytes, type, name })
  };
  const DriveApp = { getFolderById: () => ({ createFile: (blob) => {
    const id = 'DEMO' + Date.now(); const u8 = new Uint8Array(blob.bytes.map(b => b & 255));
    fail[id] = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' }));
    return { getUrl: () => fail[id], getId: () => id, setDescription: () => {} };
  } }) };
  const HtmlService = {};
  const console_ = window.console;

  // ---------- Kod Apps Script sebenar ----------
  const GAS = (function (SpreadsheetApp, PropertiesService, CacheService, LockService, Session, Utilities, DriveApp, HtmlService, console) {
    __KOD_GS__
    return { api: api, setupV3: setupV3, setupFirstAdmin: setupFirstAdmin };
  })(SpreadsheetApp, PropertiesService, CacheService, LockService, Session, Utilities, DriveApp, HtmlService, { log: () => {}, error: (...a) => console_.error(...a) });

  // ---------- Simpan / muat keadaan ----------
  function simpan() {
    simpanLS(KUNCI, JSON.stringify({ props, sheets: ss.sheets.map(s => ({ name: s.name, data: s.data.map(r => r.map(v => v instanceof Date ? { __d: v.getTime() } : v)) })) }));
  }
  function muat() {
    const raw = bacaLS(KUNCI); if (!raw) return false;
    try {
      const o = JSON.parse(raw); props = o.props || {};
      ss.sheets = o.sheets.map(x => { const s = new Sheet(x.name); s.data = x.data.map(r => r.map(v => v && typeof v === 'object' && '__d' in v ? new Date(v.__d) : v)); return s; });
      return true;
    } catch (e) { return false; }
  }

  // ---------- Data contoh ----------
  function seed() {
    ss.sheets = []; props = {};
    const tx = ss.insertSheet('TRANSAKSI');
    const kini = new Date();
    const t = (bulanLalu, hari) => { const d = new Date(kini.getFullYear(), kini.getMonth() - bulanLalu, hari); return d > kini ? new Date(kini.getFullYear(), kini.getMonth(), Math.max(1, kini.getDate() - 1)) : d; };
    // Rekod "V2" lama (12 lajur, sebahagian tanpa ID)
    tx.data = [['Tarikh', 'Lokasi', 'Item', 'Jenis', 'Arah', 'Kuantiti', 'Siri Kursus', 'Jumlah Peserta', 'Rujukan', 'ID', 'Direkod Oleh', 'Catatan'],
      [t(3, 4), 'UPK BUUKI (HQ)', 'Sijil', 'Terima Pembekal', 'Masuk', 2500, '', '', 'DO-2026-101', '', 'Rekod V2', ''],
      [t(3, 4), 'UPK BUUKI (HQ)', 'Buku Gerbang Perkahwinan', 'Terima Pembekal', 'Masuk', 2500, '', '', 'DO-2026-101', '', 'Rekod V2', ''],
      [t(3, 4), 'UPK BUUKI (HQ)', 'Beg', 'Terima Pembekal', 'Masuk', 2500, '', '', 'DO-2026-102', '', 'Rekod V2', ''],
      [t(3, 4), 'UPK BUUKI (HQ)', 'Pen', 'Terima Pembekal', 'Masuk', 3000, '', '', 'DO-2026-102', '', 'Rekod V2', ''],
      [t(3, 4), 'UPK BUUKI (HQ)', 'Buku Nota', 'Terima Pembekal', 'Masuk', 2500, '', '', 'DO-2026-103', '', 'Rekod V2', ''],
      [t(3, 6), 'UPK BUUKI (HQ)', 'Mineral', 'Terima Pembekal', 'Masuk', 60, '', '', 'DO-2026-104', '', 'Rekod V2', ''],
      [t(3, 6), 'UPK BUUKI (HQ)', 'Gula-gula (Balang)', 'Terima Pembekal', 'Masuk', 30, '', '', 'DO-2026-104', '', 'Rekod V2', '']];
    GAS.setupV3();
    GAS.setupFirstAdmin();
    const A = PENGGUNA_DEMO[0].emel, KU = PENGGUNA_DEMO[1].emel;
    const panggil = (emel, action, payload) => { env.emel = emel; const r = JSON.parse(GAS.api(JSON.stringify({ action, payload }))); if (!r.ok) console_.warn('seed:', action, r.mesej); return r.data; };
    const iso = d => fmtDate(d, '', 'yyyy-MM-dd');
    panggil(A, 'pengguna_simpan', Object.assign({}, PENGGUNA_DEMO[0], { status: 'AKTIF' }));
    PENGGUNA_DEMO.slice(1).forEach(u => panggil(A, 'pengguna_simpan', Object.assign({ baru: true }, u)));
    const PAD = ['Daerah Seberang Perai Tengah', 'Daerah Seberang Perai Selatan', 'Daerah Barat Daya', 'Daerah SPU (Butterworth)', 'Daerah SPU (Kepala Batas)', 'Daerah Timur Laut'];
    PAD.forEach((l, k) => ['Sijil', 'Buku Gerbang Perkahwinan', 'Beg', 'Pen', 'Buku Nota'].forEach(it =>
      panggil(KU, 'pindahan', { tarikh: iso(t(2, 2 + k)), lokasi: 'UPK BUUKI (HQ)', lokasiPenerima: l, item: it, kuantiti: 260 + k * 10, rujukan: 'PDH/' + (k + 1) + '/2026' })));
    PAD.forEach((l, k) => ['Sijil', 'Buku Gerbang Perkahwinan', 'Beg', 'Pen'].forEach(it =>
      panggil(A, 'tambah', { tarikh: iso(t(1, 8 + k)), lokasi: l, item: it, jenis: 'Pengeluaran Kursus', kuantiti: 90 + k * 8, siriKursus: 'Siri ' + (10 + k) + '/2026', jumlahPeserta: 90 + k * 8 })));
    PAD.forEach((l, k) => ['Sijil', 'Buku Gerbang Perkahwinan', 'Beg'].forEach(it =>
      panggil(A, 'tambah', { tarikh: iso(t(0, 2 + k)), lokasi: l, item: it, jenis: 'Pengeluaran Kursus', kuantiti: 70 + k * 9, siriKursus: 'Siri ' + (20 + k) + '/2026', jumlahPeserta: 70 + k * 9 })));
    panggil(KU, 'tambah', { tarikh: iso(t(0, 3)), lokasi: 'UPK BUUKI (HQ)', item: 'Mineral (Karton)', jenis: 'Pengeluaran Kursus', kuantiti: 54, siriKursus: 'Siri 19/2026', jumlahPeserta: 160 });
    panggil(KU, 'tambah', { tarikh: iso(t(0, 3)), lokasi: 'UPK BUUKI (HQ)', item: 'Kertas A4 (Kotak)', jenis: 'Terima Pembekal', kuantiti: 2, rujukan: 'PO-2026-077' });
    const d = panggil(PENGGUNA_DEMO[3].emel, 'tambah', { tarikh: iso(t(0, 1)), lokasi: 'Daerah Barat Daya', item: 'Beg', jenis: 'Pelarasan (-)', kuantiti: 6, catatan: 'Beg koyak semasa penghantaran' });
    const salah = d && d.transaksi.find(x => x.catatan === 'Beg koyak semasa penghantaran');
    if (salah) panggil(PENGGUNA_DEMO[3].emel, 'batal', { id: salah.id, sebab: 'Rekod berganda, telah direkod oleh rakan sekerja' });
    simpan();
  }

  if (!muat()) seed();
  env.emel = bacaSS('estok_demo_emel') || PENGGUNA_DEMO[0].emel;

  // ---------- google.script.run tiruan ----------
  function runner(ok, fail) {
    return new Proxy({}, { get: (_, k) => {
      if (k === 'withSuccessHandler') return f => runner(f, fail);
      if (k === 'withFailureHandler') return f => runner(ok, f);
      return (arg) => setTimeout(() => {
        try { const r = GAS[k](arg); simpan(); ok && ok(r); } catch (e) { fail && fail(e); }
      }, 250); // anggaran kelewatan rangkaian
    } });
  }
  window.google = { script: { run: runner(null, null) } };

  // ---------- Panel demo ----------
  window.__estokDemo = { PENGGUNA_DEMO, TIDAK_BERDAFTAR,
    tukar: (emel) => { simpanSS('estok_demo_emel', emel); location.reload(); },
    reset: () => { try { localStorage.removeItem(KUNCI); } catch (e) {} location.reload(); },
    semasa: () => env.emel };
})();
</script>
<style>
  #demo-panel { position: fixed; left: 12px; bottom: 12px; z-index: 200; font-family: Inter, system-ui, sans-serif; }
  #demo-panel .pil { display: flex; align-items: center; gap: 8px; background: #0f172a; color: #fff; border-radius: 999px; padding: 8px 14px 8px 10px; font-size: 12px; font-weight: 600; box-shadow: 0 8px 24px rgba(15,23,42,.25); cursor: pointer; border: 0; }
  #demo-panel .tag { background: #f59e0b; color: #111827; border-radius: 999px; padding: 2px 8px; font-size: 10px; font-weight: 800; letter-spacing: .04em; }
  #demo-panel .kotak { position: absolute; left: 0; bottom: 48px; width: 300px; background: #fff; border-radius: 16px; box-shadow: 0 16px 40px rgba(15,23,42,.25); padding: 14px; border: 1px solid #e2e8f0; }
  #demo-panel .kotak h4 { margin: 0 0 2px; font-size: 13px; color: #0f172a; }
  #demo-panel .kotak p { margin: 0 0 10px; font-size: 11px; color: #64748b; line-height: 1.45; }
  #demo-panel .u { display: block; width: 100%; text-align: left; border: 0; background: transparent; border-radius: 10px; padding: 8px 10px; cursor: pointer; }
  #demo-panel .u:hover { background: #f1f5f9; } #demo-panel .u.aktif { background: #eef3ff; box-shadow: inset 0 0 0 1px #c7d6ff; }
  #demo-panel .u b { display: block; font-size: 12px; color: #0f172a; } #demo-panel .u span { font-size: 11px; color: #64748b; }
  #demo-panel .reset { margin-top: 8px; width: 100%; border: 1px solid #fecaca; color: #b91c1c; background: #fff; border-radius: 10px; padding: 8px; font-size: 12px; font-weight: 600; cursor: pointer; }
  @media print { #demo-panel { display: none; } }
</style>
`;

const panel = String.raw`
<div id="demo-panel"></div>
<script>
(function () {
  const D = window.__estokDemo, el = document.getElementById('demo-panel');
  const label = { ADMIN_UPK: 'Admin UPK', KERANI_UPK: 'Kerani UPK', PEMANTAU_UPK: 'Pemantau UPK', KERANI_PAD: 'Kerani PAD', PEGAWAI_PAD: 'Pegawai PAD' };
  const semasa = D.PENGGUNA_DEMO.find(u => u.emel === D.semasa());
  let buka = false;
  function lukis() {
    const nama = semasa ? semasa.nama.replace(/^(En\.|Ustaz)\s+/, '').split(/\s+(bin|binti)\s+/)[0] : 'Tidak berdaftar';
    el.innerHTML = '';
    if (buka) {
      const k = document.createElement('div'); k.className = 'kotak';
      k.innerHTML = '<h4>Mod Demo e-Stok V3</h4><p>Data contoh disimpan dalam pelayar ini sahaja. Pilih akaun untuk melihat sistem dari sudut setiap peranan.</p>';
      D.PENGGUNA_DEMO.concat([{ emel: D.TIDAK_BERDAFTAR, nama: 'Staf belum didaftar', peranan: '', lokasi: 'Untuk lihat skrin akses ditolak' }]).forEach(u => {
        const b = document.createElement('button'); b.className = 'u' + (u.emel === D.semasa() ? ' aktif' : '');
        const bb = document.createElement('b'); bb.textContent = u.nama; const sp = document.createElement('span'); sp.textContent = (label[u.peranan] ? label[u.peranan] + ' · ' : '') + u.lokasi;
        b.append(bb, sp); b.onclick = () => D.tukar(u.emel); k.appendChild(b);
      });
      const r = document.createElement('button'); r.className = 'reset'; r.textContent = 'Set semula data demo';
      r.onclick = () => { if (confirm('Padam semua perubahan dan muat semula data contoh?')) D.reset(); };
      k.appendChild(r); el.appendChild(k);
    }
    const p = document.createElement('button'); p.className = 'pil';
    const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = 'DEMO';
    const tx = document.createElement('span'); tx.textContent = (semasa ? label[semasa.peranan] + ': ' + nama : nama) + (buka ? '  ▾' : '  ▴');
    p.append(tag, tx); p.onclick = () => { buka = !buka; lukis(); }; el.appendChild(p);
  }
  lukis();
})();
</script>
`;

html = html.replace('<title>e-Stok JHEAIPP V3</title>', '<title>e-Stok V3 Demo</title>');
html = html.replace('<script type="text/babel"', runtime.replace('__KOD_GS__', () => gs) + '\n  <script type="text/babel"');
html = html.replace('</body>', panel + '\n</body>');
const out = path.join(__dirname, 'e-stok-v3-demo.html');
fs.writeFileSync(out, html);
console.log('Demo ditulis:', out, Math.round(html.length / 1024) + ' KB');
