/**
 * Database.gs — struktur helaian, akses Google Sheets dan migrasi Fasa 0.
 *
 * Prinsip migrasi:
 *  - Lajur 1–12 helaian TRANSAKSI (format V2) tidak diubah kedudukannya.
 *  - Lajur baharu ditambah di hujung dan dicari ikut NAMA tajuk, jadi setup boleh dijalankan berulang kali.
 *  - setupV3() membuat salinan sandaran TRANSAKSI sebelum menyentuh apa-apa.
 */

const SH = {
  TRANSAKSI: 'TRANSAKSI',
  PENGGUNA: 'PENGGUNA',
  AUDIT: 'AUDIT_LOG',
  TETAPAN: 'TETAPAN',
  ARKIB: 'ARKIB_LAPORAN'
};

// Lajur V2 (kedudukan tetap, 1-based) — tajuk lalai hanya diisi jika sel tajuk kosong.
const TX_LAMA = [
  ['tarikh', 'Tarikh'], ['lokasi', 'Lokasi'], ['item', 'Item'], ['jenis', 'Jenis Transaksi'], ['arah', 'Arah'],
  ['kuantiti', 'Kuantiti'], ['siriKursus', 'Siri Kursus'], ['jumlahPeserta', 'Jumlah Peserta'], ['rujukan', 'No Rujukan'],
  ['id', 'ID'], ['direkodOleh', 'Direkod Oleh'], ['catatan', 'Catatan']
];
// Lajur V3 (dicari ikut tajuk, ditambah jika tiada).
const TX_BARU = [
  ['status', 'Status'], ['diciptaPada', 'Dicipta Pada'], ['emelPerekod', 'Emel Perekod'],
  ['dikemaskiniOleh', 'Dikemaskini Oleh'], ['dikemaskiniPada', 'Dikemaskini Pada'],
  ['dibatalOleh', 'Dibatal Oleh'], ['dibatalPada', 'Dibatal Pada'], ['sebabBatal', 'Sebab Batal'], ['pasangan', 'Pasangan']
];

const HEADERS = {
  PENGGUNA: ['Emel', 'Nama Penuh', 'Jawatan', 'Peranan', 'Lokasi', 'Status', 'Akses Terakhir', 'Dicipta Oleh', 'Dicipta Pada', 'Dikemaskini Oleh', 'Dikemaskini Pada'],
  AUDIT: ['Masa', 'Emel', 'Nama', 'Peranan', 'Lokasi Pengguna', 'Tindakan', 'Jenis Rekod', 'ID Rekod', 'Sebelum', 'Selepas', 'Sebab'],
  TETAPAN: ['Jenis', 'Nilai', 'Nilai 2', 'Susunan', 'Aktif', 'Keterangan'],
  ARKIB: ['Masa', 'Lokasi', 'Bulan', 'Nama Fail', 'URL', 'ID Fail', 'Dijana Oleh']
};

const LOKASI_ASAL = [
  ['UPK BUUKI (HQ)', 'UPK'],
  ['Daerah Seberang Perai Tengah', 'SPT'],
  ['Daerah Seberang Perai Selatan', 'SPS'],
  ['Daerah Barat Daya', 'BD'],
  ['Daerah SPU (Butterworth)', 'SPU-BW'],
  ['Daerah SPU (Kepala Batas)', 'SPU-KB'],
  ['Daerah Timur Laut', 'TL']
];
const ITEM_ASAL = [
  ['Sijil', 100], ['Buku Gerbang Perkahwinan', 100], ['Beg', 50], ['Pen', 100], ['Buku Nota', 100],
  ['Gula-gula (Balang)', 5], ['Mineral (Karton)', 5], ['Kertas A4 (Kotak)', 2], ['Others', 0], ['Cabutan Sijil', 0]
];
// Nama item lama yang dinormalkan semasa dibaca (data asal tidak diubah).
const ALIAS_ITEM = { 'Mineral': 'Mineral (Karton)', 'Kertas A4': 'Kertas A4 (Kotak)' };

// ---------------------------------------------------------------------------
// Akses asas
// ---------------------------------------------------------------------------
function getSs_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(nama) {
  const sh = getSs_().getSheetByName(nama);
  if (!sh) throw new AppError_('BELUM_SETUP', 'Helaian ' + nama + ' tiada. Pentadbir perlu jalankan setupV3().');
  return sh;
}

function ensureSheet_(ss, nama, headers) {
  let sh = ss.getSheetByName(nama);
  let baru = false;
  if (!sh) {
    sh = ss.insertSheet(nama);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    baru = true;
  }
  return { sh: sh, baru: baru };
}

/** Peta lajur TRANSAKSI: kunci → nombor lajur (1-based). */
function txCols_(sh) {
  const lastCol = Math.max(sh.getLastColumn(), TX_LAMA.length);
  const tajuk = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const peta = { _lebar: lastCol };
  TX_LAMA.forEach((c, i) => { peta[c[0]] = i + 1; });
  TX_BARU.forEach(c => {
    const idx = tajuk.indexOf(c[1]);
    if (idx >= 0) peta[c[0]] = idx + 1;
  });
  return peta;
}

function readRows_(sh, lebar) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, lebar).getValues();
}

// ---------------------------------------------------------------------------
// Penukaran nilai
// ---------------------------------------------------------------------------
/** Semakan Date yang selamat merentas konteks (lebih tahan lasak daripada instanceof). */
function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }

function toIsoDate_(v) {
  if (isDate_(v)) return Utilities.formatDate(v, APP.TZ, 'yyyy-MM-dd');
  const s = String(v == null ? '' : v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // DD/MM/YYYY
  if (m) return m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  return s;
}
function toDateTimeStr_(v) {
  if (isDate_(v)) return Utilities.formatDate(v, APP.TZ, 'yyyy-MM-dd HH:mm:ss');
  return String(v == null ? '' : v);
}
function isoToDate_(iso) {
  const p = iso.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}
function nowStr_() { return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd HH:mm:ss'); }
function pad2_(x) { return ('0' + x).slice(-2); }
function clean_(v, max) { const s = String(v == null ? '' : v).trim(); return max ? s.slice(0, max) : s; }
/** Elak formula injection: nilai bermula = + - @ disimpan sebagai teks. */
function safe_(v) { const s = String(v == null ? '' : v); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function newId_(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), APP.TZ, 'yyMMdd') + '-' +
    Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
}

// ---------------------------------------------------------------------------
// TETAPAN
// ---------------------------------------------------------------------------
let SETTINGS_MEMO_ = null;
function getSettings_() {
  if (SETTINGS_MEMO_) return SETTINGS_MEMO_;
  const rows = readRows_(sheet_(SH.TETAPAN), HEADERS.TETAPAN.length);
  const aktif = rows.filter(r => r[0] && String(r[4]).toUpperCase() !== 'TIDAK')
    .sort((a, b) => (Number(a[3]) || 0) - (Number(b[3]) || 0));
  const konfig = {};
  aktif.filter(r => r[0] === 'KONFIG').forEach(r => { konfig[String(r[1])] = String(r[2]); });
  SETTINGS_MEMO_ = {
    items: aktif.filter(r => r[0] === 'ITEM').map(r => ({ nama: String(r[1]), stokMin: Number(r[2]) || 0 })),
    lokasi: aktif.filter(r => r[0] === 'LOKASI').map(r => ({ nama: String(r[1]), kod: String(r[2]) })),
    konfig: konfig
  };
  return SETTINGS_MEMO_;
}
function setKonfig_(kunci, nilai) {
  const sh = sheet_(SH.TETAPAN);
  const rows = readRows_(sh, HEADERS.TETAPAN.length);
  const i = rows.findIndex(r => r[0] === 'KONFIG' && String(r[1]) === kunci);
  if (i >= 0) sh.getRange(i + 2, 3).setValue(nilai);
  else sh.appendRow(['KONFIG', kunci, nilai, 99, 'YA', '']);
  SETTINGS_MEMO_ = null;
}
function lokasiHQ_() { return getSettings_().lokasi[0].nama; } // lokasi pertama = UPK HQ

// ---------------------------------------------------------------------------
// FASA 0 — SETUP & MIGRASI (dijalankan oleh pemilik skrip)
// ---------------------------------------------------------------------------
function setupV3() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || getSs_();
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', ss.getId());
  const laporan = [];

  const tx = ss.getSheetByName(SH.TRANSAKSI);
  if (!tx) throw new Error('Helaian TRANSAKSI tidak dijumpai. Pastikan skrip dibuka dari Google Sheets e-Stok.');

  // 1. Sandaran
  const namaBackup = 'BACKUP_TRANSAKSI_' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmm');
  if (!ss.getSheetByName(namaBackup)) tx.copyTo(ss).setName(namaBackup);
  laporan.push('Sandaran dibuat: ' + namaBackup);

  // 2. Tajuk lajur
  const lastCol = Math.max(tx.getLastColumn(), TX_LAMA.length);
  const tajuk = tx.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  TX_LAMA.forEach((c, i) => { if (!tajuk[i]) { tx.getRange(1, i + 1).setValue(c[1]); tajuk[i] = c[1]; } });
  const ditambah = [];
  TX_BARU.forEach(c => {
    if (tajuk.indexOf(c[1]) < 0) {
      tajuk.push(c[1]);
      tx.getRange(1, tajuk.length).setValue(c[1]);
      ditambah.push(c[1]);
    }
  });
  laporan.push(ditambah.length ? 'Lajur baharu ditambah: ' + ditambah.join(', ') : 'Lajur V3 sudah wujud.');

  // 3. ID & status untuk rekod lama
  const cols = txCols_(tx);
  const rows = readRows_(tx, cols._lebar);
  let idBaru = 0, statusBaru = 0;
  const lajurId = rows.map(r => [r[cols.id - 1]]);
  const lajurStatus = rows.map(r => [r[cols.status - 1]]);
  const itemDijumpai = {};
  rows.forEach((r, i) => {
    if (!r[0]) return; // baris kosong
    if (!String(r[cols.id - 1]).trim()) { lajurId[i][0] = 'LGC-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(); idBaru++; }
    if (!String(r[cols.status - 1]).trim()) { lajurStatus[i][0] = 'AKTIF'; statusBaru++; }
    const it = ALIAS_ITEM[String(r[cols.item - 1])] || String(r[cols.item - 1]);
    if (it) itemDijumpai[it] = true;
  });
  if (rows.length) {
    tx.getRange(2, cols.id, rows.length, 1).setValues(lajurId);
    tx.getRange(2, cols.status, rows.length, 1).setValues(lajurStatus);
  }
  laporan.push('Rekod sedia ada: ' + rows.filter(r => r[0]).length + ' · ID dijana: ' + idBaru + ' · Status AKTIF diisi: ' + statusBaru);

  // 4. Helaian sokongan
  [[SH.PENGGUNA, HEADERS.PENGGUNA], [SH.AUDIT, HEADERS.AUDIT], [SH.ARKIB, HEADERS.ARKIB]].forEach(x => {
    const r = ensureSheet_(ss, x[0], x[1]);
    laporan.push(x[0] + (r.baru ? ' dicipta.' : ' sudah wujud.'));
  });
  const t = ensureSheet_(ss, SH.TETAPAN, HEADERS.TETAPAN);
  if (t.baru) {
    const seed = [];
    LOKASI_ASAL.forEach((l, i) => seed.push(['LOKASI', l[0], l[1], i + 1, 'YA', '']));
    const namaItem = ITEM_ASAL.map(x => x[0]);
    ITEM_ASAL.forEach((it, i) => seed.push(['ITEM', it[0], it[1], i + 1, 'YA', 'Nilai 2 = paras stok minimum']));
    Object.keys(itemDijumpai).filter(n => namaItem.indexOf(n) < 0).forEach((n, i) => {
      seed.push(['ITEM', n, 0, 100 + i, 'YA', 'Ditemui dalam data lama semasa migrasi']);
    });
    seed.push(['KONFIG', 'FOLDER_ARKIB_ID', APP.FOLDER_ARKIB_ASAL, 1, 'YA', 'Folder Google Drive arkib laporan PDF']);
    seed.push(['KONFIG', 'NO_FAIL', '', 2, 'YA', 'No. fail rasmi pada laporan']);
    seed.push(['KONFIG', 'DOMAIN_EMEL', '', 3, 'YA', 'Hanya emel domain ini dibenarkan (diisi automatik oleh setupFirstAdmin)']);
    seed.push(['KONFIG', 'VERSI_SKEMA', APP.VERSI_SKEMA, 4, 'YA', 'Jangan ubah']);
    t.sh.getRange(2, 1, seed.length, HEADERS.TETAPAN.length).setValues(seed);
    laporan.push('TETAPAN dicipta dengan ' + LOKASI_ASAL.length + ' lokasi dan ' + seed.filter(s => s[0] === 'ITEM').length + ' item.');
  } else {
    laporan.push('TETAPAN sudah wujud (tidak diubah).');
  }

  // 5. Lindungi helaian sensitif (hanya pemilik boleh edit terus)
  [SH.PENGGUNA, SH.AUDIT, SH.TETAPAN].forEach(n => protectOwnerOnly_(ss.getSheetByName(n), laporan));

  // 6. Zon masa
  const tzSheet = ss.getSpreadsheetTimeZone();
  const tzSkrip = Session.getScriptTimeZone();
  if (tzSheet !== APP.TZ || tzSkrip !== APP.TZ) {
    laporan.push('AMARAN zon masa: Sheet=' + tzSheet + ', Skrip=' + tzSkrip + '. Tetapkan kedua-duanya kepada ' + APP.TZ + ' (File > Settings dan appsscript.json).');
  } else {
    laporan.push('Zon masa OK (' + APP.TZ + ').');
  }

  SETTINGS_MEMO_ = null;
  writeAuditLog_(systemUser_(), 'SETUP_V3', 'SISTEM', '', null, { laporan: laporan }, '');
  return showReport_('Setup V3 selesai', laporan);
}

function protectOwnerOnly_(sh, laporan) {
  try {
    const p = sh.protect().setDescription('e-Stok V3: hanya pemilik skrip. Ubah melalui sistem.');
    p.addEditor(Session.getEffectiveUser());
    p.removeEditors(p.getEditors().filter(e => e.getEmail() !== Session.getEffectiveUser().getEmail()));
    if (p.canDomainEdit()) p.setDomainEdit(false);
  } catch (e) {
    laporan.push('Tidak dapat lindungi ' + sh.getName() + ': ' + e.message);
  }
}

/** Semakan integriti — boleh dijalankan bila-bila masa dari menu. */
function semakIntegriti() {
  const sh = sheet_(SH.TRANSAKSI);
  const cols = txCols_(sh);
  const s = getSettings_();
  const namaItem = s.items.map(i => i.nama), namaLokasi = s.lokasi.map(l => l.nama);
  const rows = readRows_(sh, cols._lebar);
  const isu = [];
  const ids = {};
  const baki = {};
  rows.forEach((r, i) => {
    if (!r[0]) return;
    const baris = i + 2;
    const t = rowToTx_(r, cols);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.tarikh)) isu.push('Baris ' + baris + ': tarikh tidak sah (' + t.tarikh + ')');
    if (!t.id) isu.push('Baris ' + baris + ': tiada ID');
    else if (ids[t.id]) isu.push('Baris ' + baris + ': ID berganda dengan baris ' + ids[t.id]);
    else ids[t.id] = baris;
    if (namaItem.indexOf(t.item) < 0) isu.push('Baris ' + baris + ': item tidak dikenali "' + t.item + '"');
    if (namaLokasi.indexOf(t.lokasi) < 0) isu.push('Baris ' + baris + ': lokasi tidak dikenali "' + t.lokasi + '"');
    if (!(t.kuantiti > 0)) isu.push('Baris ' + baris + ': kuantiti tidak sah (' + r[cols.kuantiti - 1] + ')');
    if (t.status === 'AKTIF') {
      const k = t.lokasi + ' | ' + t.item;
      baki[k] = (baki[k] || 0) + (t.arah === 'Masuk' ? t.kuantiti : -t.kuantiti);
    }
  });
  Object.keys(baki).forEach(k => { if (baki[k] < 0) isu.push('Baki negatif: ' + k + ' = ' + baki[k]); });
  const ringkas = ['Rekod disemak: ' + rows.filter(r => r[0]).length, 'Isu dijumpai: ' + isu.length].concat(isu.slice(0, 50));
  if (isu.length > 50) ringkas.push('… dan ' + (isu.length - 50) + ' isu lagi (lihat Logger).');
  isu.forEach(x => console.log(x));
  return showReport_('Semakan integriti', ringkas);
}

function showReport_(tajuk, baris) {
  const teks = baris.join('\n');
  console.log(tajuk + '\n' + teks);
  try { SpreadsheetApp.getUi().alert(tajuk, teks, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* dijalankan dari editor */ }
  return { tajuk: tajuk, baris: baris };
}
