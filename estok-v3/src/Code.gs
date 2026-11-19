/**
 * e-STOK JHEAIPP V3 — Pengurusan Inventori Bersepadu UPK & PAD
 * Fasa 0 (persediaan & migrasi) + Fasa 1 (keselamatan & operasi asas)
 *
 * Code.gs — titik masuk aplikasi, konfigurasi dan penghala API.
 *
 * Model keselamatan:
 *  - Web app di-deploy "Execute as: Me" + "Anyone within <domain jabatan>".
 *  - Identiti pengguna = emel Google kerajaan yang dibaca di server (Session.getActiveUser()).
 *    Frontend tidak menghantar identiti; ia tidak boleh dipalsukan dari pelayar.
 *  - Peranan & lokasi dibaca dari helaian PENGGUNA pada SETIAP panggilan API.
 */

const APP = {
  NAMA: 'e-STOK JHEAIPP V3',
  VERSI: '3.1.0',
  VERSI_SKEMA: '1',
  TZ: 'Asia/Kuala_Lumpur',
  FOLDER_ARKIB_ASAL: '1QNIzaUx8kgbMTPlpej8CCBKnDO0OKeoz'
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('e-Stok JHEAIPP V3')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Menu dalam Google Sheets untuk pentadbir (setup & migrasi). */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('e-Stok V3')
    .addItem('1. Setup / migrasi V3', 'setupV3')
    .addItem('2. Daftar saya sebagai Admin pertama', 'setupFirstAdmin')
    .addSeparator()
    .addItem('Semak integriti data', 'semakIntegriti')
    .addToUi();
}

/**
 * Satu-satunya fungsi yang dipanggil oleh frontend melalui google.script.run.
 * Input & output dalam bentuk JSON string (elak masalah Date tidak boleh dihantar).
 */
function api(requestJson) {
  let req;
  try {
    SETTINGS_MEMO_ = null;
    req = JSON.parse(requestJson || '{}');
    const user = currentUser_(); // lempar ralat jika emel tidak berdaftar / tidak aktif
    const p = req.payload || {};
    let data;
    switch (req.action) {
      case 'bootstrap':        data = bootstrap_(user); break;
      case 'transaksi':        data = getTransactions_(user); break;
      case 'tambah':           data = withLock_(() => saveTransaction_(user, p)); break;
      case 'pindahan':         data = withLock_(() => saveTransfer_(user, p)); break;
      case 'kemaskini':        data = withLock_(() => updateTransaction_(user, p)); break;
      case 'batal':            data = withLock_(() => voidTransaction_(user, p)); break;
      case 'pengguna_senarai': data = listUsers_(user); break;
      case 'pengguna_simpan':  data = withLock_(() => saveUser_(user, p)); break;
      case 'audit':            data = getAuditLog_(user, p); break;
      case 'upload_pdf':       data = uploadToDrive_(user, p); break;
      default: throw new AppError_('TINDAKAN_TIDAK_SAH', 'Tindakan tidak dibenarkan.');
    }
    return JSON.stringify({ ok: true, data: data });
  } catch (err) {
    const kod = err && err.kod ? err.kod : 'RALAT';
    if (kod === 'RALAT') console.error(err && err.stack ? err.stack : err);
    return JSON.stringify({ ok: false, kod: kod, mesej: String(err && err.message ? err.message : err) });
  }
}

function bootstrap_(user) {
  logAccessOncePerDay_(user);
  return {
    pengguna: publicUser_(user),
    kebenaran: permissionsFor_(user),
    tetapan: getSettings_(),
    versi: APP.VERSI,
    hariIni: Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd')
  };
}

/** Ralat yang mesejnya selamat dipaparkan kepada pengguna. */
function AppError_(kod, mesej) {
  this.kod = kod;
  this.message = mesej;
  this.stack = (new Error(mesej)).stack;
}
AppError_.prototype = Object.create(Error.prototype);

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new AppError_('SIBUK', 'Sistem sedang memproses rekod lain. Sila cuba semula.');
  try { return fn(); } finally { lock.releaseLock(); }
}
