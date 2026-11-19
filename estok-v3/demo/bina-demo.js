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
  const KUNCI = 'estok_v3_demo_data_v2';
  const DOMAIN = 'contoh.gov.my';
  const PENGGUNA_DEMO = [
    { emel: 'imran@' + DOMAIN, nama: 'En. Muhammad Imran bin Mohamed Radzi', jawatan: 'Pentadbir Sistem e-Stok', peranan: 'ADMIN_UPK', lokasi: 'UPK BUUKI (HQ)' },
    { emel: 'kerani.upk@' + DOMAIN, nama: 'Nurul Aina binti Hassan', jawatan: 'Pembantu Tadbir', peranan: 'KERANI_UPK', lokasi: 'UPK BUUKI (HQ)' },
    { emel: 'pemantau@' + DOMAIN, nama: 'Ahmad Faiz bin Osman', jawatan: 'Penolong Pengarah', peranan: 'PEMANTAU_UPK', lokasi: 'UPK BUUKI (HQ)' },
  ];
  const KATA_DEMO = 'Demo2026pad';
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
  let cache = {};
  const fail = {};
  const env = { emel: '' };

  const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  function sha256(str) { // SHA-256 segerak (setara Utilities.computeDigest)
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const b = Array.from(new TextEncoder().encode(str)); const l = b.length * 8;
    b.push(0x80); while (b.length % 64 !== 56) b.push(0);
    for (let i = 7; i >= 0; i--) b.push(i > 3 ? 0 : (l >>> (i * 8)) & 255);
    let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < b.length; o += 64) {
      const w = new Array(64);
      for (let i = 0; i < 16; i++) w[i] = (b[o + i * 4] << 24) | (b[o + i * 4 + 1] << 16) | (b[o + i * 4 + 2] << 8) | b[o + i * 4 + 3];
      for (let i = 16; i < 64; i++) { const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      let [a, bb, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      H = H.map((x, i) => (x + [a, bb, c, d, e, f, g, h][i]) | 0);
    }
    const out = []; H.forEach(x => { for (let i = 3; i >= 0; i--) { const v = (x >>> (i * 8)) & 255; out.push(v > 127 ? v - 256 : v); } });
    return out;
  }
  const SpreadsheetApp = { getActiveSpreadsheet: () => ss, openById: () => ss, getUi: () => { throw new Error('tiada UI'); } };
  const PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) };
  const CacheService = { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; } }) };
  const LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
  const Session = { getActiveUser: () => ({ getEmail: () => env.emel }), getEffectiveUser: () => ({ getEmail: () => 'imran@' + DOMAIN }), getScriptTimeZone: () => 'Asia/Kuala_Lumpur' };
  const Utilities = {
    getUuid: uuid, formatDate: fmtDate,
    DigestAlgorithm: { SHA_256: 'SHA-256' }, computeDigest: (alg, v) => sha256(String(v)),
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
    simpanLS(KUNCI, JSON.stringify({ props, cache, sheets: ss.sheets.map(s => ({ name: s.name, data: s.data.map(r => r.map(v => v instanceof Date ? { __d: v.getTime() } : v)) })) }));
  }
  function muat() {
    const raw = bacaLS(KUNCI); if (!raw) return false;
    try {
      const o = JSON.parse(raw); props = o.props || {}; cache = o.cache || {};
      ss.sheets = o.sheets.map(x => { const s = new Sheet(x.name); s.data = x.data.map(r => r.map(v => v && typeof v === 'object' && '__d' in v ? new Date(v.__d) : v)); return s; });
      return true;
    } catch (e) { return false; }
  }

  // ---------- Data contoh ----------
  function seed() {
    ss.sheets = []; props = {}; cache = {};
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
    const panggil = (emel, action, payload, token) => { env.emel = emel; const r = JSON.parse(GAS.api(JSON.stringify({ action, payload, token }))); if (!r.ok) console_.warn('seed:', action, r.mesej); return r.data; };
    const iso = d => fmtDate(d, '', 'yyyy-MM-dd');
    panggil(A, 'pengguna_simpan', Object.assign({}, PENGGUNA_DEMO[0], { status: 'AKTIF' }));
    PENGGUNA_DEMO.slice(1).forEach(u => panggil(A, 'pengguna_simpan', Object.assign({ baru: true }, u)));
    const PAD = ['Daerah Seberang Perai Tengah', 'Daerah Seberang Perai Selatan', 'Daerah Barat Daya', 'Daerah SPU (Butterworth)', 'Daerah SPU (Kepala Batas)', 'Daerah Timur Laut'];
    PAD.forEach(l => panggil(A, 'pad_tetapkan', { lokasi: l, kataLaluan: KATA_DEMO }));
    PAD.forEach((l, k) => ['Sijil', 'Buku Gerbang Perkahwinan', 'Beg', 'Pen', 'Buku Nota'].forEach(it =>
      panggil(KU, 'pindahan', { tarikh: iso(t(2, 2 + k)), lokasi: 'UPK BUUKI (HQ)', lokasiPenerima: l, item: it, kuantiti: 260 + k * 10, rujukan: 'PDH/' + (k + 1) + '/2026' })));
    PAD.forEach((l, k) => ['Sijil', 'Buku Gerbang Perkahwinan', 'Beg', 'Pen'].forEach(it =>
      panggil(A, 'tambah', { tarikh: iso(t(1, 8 + k)), lokasi: l, item: it, jenis: 'Pengeluaran Kursus', kuantiti: 90 + k * 8, siriKursus: 'Siri ' + (10 + k) + '/2026', jumlahPeserta: 90 + k * 8 })));
    PAD.forEach((l, k) => ['Sijil', 'Buku Gerbang Perkahwinan', 'Beg'].forEach(it =>
      panggil(A, 'tambah', { tarikh: iso(t(0, 2 + k)), lokasi: l, item: it, jenis: 'Pengeluaran Kursus', kuantiti: 70 + k * 9, siriKursus: 'Siri ' + (20 + k) + '/2026', jumlahPeserta: 70 + k * 9 })));
    panggil(KU, 'tambah', { tarikh: iso(t(0, 3)), lokasi: 'UPK BUUKI (HQ)', item: 'Mineral (Karton)', jenis: 'Pengeluaran Kursus', kuantiti: 54, siriKursus: 'Siri 19/2026', jumlahPeserta: 160 });
    panggil(KU, 'tambah', { tarikh: iso(t(0, 3)), lokasi: 'UPK BUUKI (HQ)', item: 'Kertas A4 (Kotak)', jenis: 'Terima Pembekal', kuantiti: 2, rujukan: 'PO-2026-077' });
    const tokBD = panggil('', 'login_pad', { lokasi: 'Daerah Barat Daya', kataLaluan: KATA_DEMO, nama: 'Siti Aminah binti Yusof' }).token;
    const d = panggil('', 'tambah', { tarikh: iso(t(0, 1)), lokasi: 'Daerah Barat Daya', item: 'Beg', jenis: 'Pelarasan (-)', kuantiti: 6, catatan: 'Beg koyak semasa penghantaran' }, tokBD);
    const salah = d && d.transaksi.find(x => x.catatan === 'Beg koyak semasa penghantaran');
    if (salah) panggil('', 'batal', { id: salah.id, sebab: 'Rekod berganda, telah direkod oleh rakan sekerja' }, tokBD);
    panggil('', 'logout_pad', {}, tokBD);
    simpan();
  }

  if (!muat()) seed();
  const pilihan = bacaSS('estok_demo_emel');
  env.emel = pilihan === null ? PENGGUNA_DEMO[0].emel : pilihan; // '' = Kerani PAD (tiada emel)

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
  window.__estokDemo = { PENGGUNA_DEMO, KATA_DEMO,
    tukar: (emel) => { simpanSS('estok_demo_emel', emel); try { sessionStorage.removeItem('estok_pad_token'); } catch (e) {} location.reload(); },
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
  const semasa = D.semasa() === '' ? { nama: 'Kerani PAD', peranan: 'KERANI_PAD' } : D.PENGGUNA_DEMO.find(u => u.emel === D.semasa());
  let buka = false;
  function lukis() {
    const nama = semasa ? semasa.nama.replace(/^(En\.|Ustaz)\s+/, '').split(/\s+(bin|binti)\s+/)[0] : '';
    el.innerHTML = '';
    if (buka) {
      const k = document.createElement('div'); k.className = 'kotak';
      k.innerHTML = '<h4>Mod Demo e-Stok V3</h4><p>Data contoh disimpan dalam pelayar ini sahaja. Staf UPK masuk terus (emel). Kerani PAD masuk melalui skrin kata laluan daerah.</p>';
      D.PENGGUNA_DEMO.concat([{ emel: '', nama: 'Kerani PAD (mana-mana daerah)', peranan: 'KERANI_PAD', lokasi: 'Kata laluan demo: ' + D.KATA_DEMO }]).forEach(u => {
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
    const tx = document.createElement('span'); tx.textContent = (semasa && semasa.peranan === 'KERANI_PAD' ? 'Kerani PAD' : (semasa ? label[semasa.peranan] + ': ' + nama : '')) + (buka ? '  ▾' : '  ▴');
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
