/**
 * Auth.gs — identiti pengguna (emel Google kerajaan), peranan, kebenaran dan pengurusan akaun.
 *
 * Tiada kata laluan disimpan. Google mengesahkan siapa pengguna; sistem ini menentukan
 * apa yang pengguna itu boleh buat berdasarkan helaian PENGGUNA.
 */

const PERANAN = {
  ADMIN_UPK:    { label: 'Admin UPK',     lihatSemua: true,  tulis: 'SEMUA',   urusPengguna: true,  audit: true,  lokasiHQ: true },
  KERANI_UPK:   { label: 'Kerani UPK',    lihatSemua: true,  tulis: 'SENDIRI', urusPengguna: false, audit: false, lokasiHQ: true },
  PEMANTAU_UPK: { label: 'Pemantau UPK',  lihatSemua: true,  tulis: 'TIADA',   urusPengguna: false, audit: false, lokasiHQ: true },
  KERANI_PAD:   { label: 'Kerani PAD',    lihatSemua: false, tulis: 'SENDIRI', urusPengguna: false, audit: false, lokasiHQ: false },
  PEGAWAI_PAD:  { label: 'Pegawai PAD',   lihatSemua: false, tulis: 'TIADA',   urusPengguna: false, audit: false, lokasiHQ: false }
};
const KOL_PENGGUNA = { emel: 1, nama: 2, jawatan: 3, peranan: 4, lokasi: 5, status: 6, aksesTerakhir: 7, diciptaOleh: 8, diciptaPada: 9, dikemaskiniOleh: 10, dikemaskiniPada: 11 };

// ---------------------------------------------------------------------------
// Identiti
// ---------------------------------------------------------------------------
function currentUser_() {
  const emel = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!emel) {
    throw new AppError_('TIADA_EMEL', 'Sistem tidak dapat mengenal pasti akaun Google anda. Pastikan anda log masuk dengan emel jabatan, kemudian muat semula halaman.');
  }
  const domain = String(getSettings_().konfig.DOMAIN_EMEL || '').trim().toLowerCase();
  if (domain && emel.split('@')[1] !== domain) {
    throw new AppError_('DOMAIN_DITOLAK', 'Akaun ' + emel + ' bukan emel jabatan (@' + domain + '). Sila log masuk dengan emel kerajaan.');
  }
  const u = findUser_(emel);
  if (!u) throw new AppError_('TIADA_AKSES', 'Emel ' + emel + ' belum didaftarkan dalam e-Stok. Sila hubungi Admin UPK untuk akses.');
  if (u.status !== 'AKTIF') throw new AppError_('TIDAK_AKTIF', 'Akaun ' + emel + ' telah dinyahaktifkan. Sila hubungi Admin UPK.');
  if (!PERANAN[u.peranan]) throw new AppError_('PERANAN_TIDAK_SAH', 'Peranan akaun anda tidak sah. Sila hubungi Admin UPK.');
  return u;
}

function readUsers_() {
  const sh = sheet_(SH.PENGGUNA);
  return readRows_(sh, HEADERS.PENGGUNA.length).map((r, i) => ({
    baris: i + 2,
    emel: String(r[0]).trim().toLowerCase(),
    nama: String(r[1]),
    jawatan: String(r[2]),
    peranan: String(r[3]).trim().toUpperCase(),
    lokasi: String(r[4]),
    status: String(r[5]).trim().toUpperCase() || 'AKTIF',
    aksesTerakhir: toDateTimeStr_(r[6]),
    diciptaOleh: String(r[7]),
    diciptaPada: toDateTimeStr_(r[8]),
    dikemaskiniOleh: String(r[9]),
    dikemaskiniPada: toDateTimeStr_(r[10])
  })).filter(u => u.emel);
}
function findUser_(emel) { return readUsers_().find(u => u.emel === emel) || null; }

function publicUser_(u) {
  return { emel: u.emel, nama: u.nama, jawatan: u.jawatan, peranan: u.peranan, labelPeranan: PERANAN[u.peranan].label, lokasi: u.lokasi };
}
function systemUser_() {
  let emel = '';
  try { emel = Session.getEffectiveUser().getEmail(); } catch (e) {}
  return { emel: emel, nama: 'SISTEM (pentadbir skrip)', peranan: 'SISTEM', lokasi: '' };
}

// ---------------------------------------------------------------------------
// Kebenaran — SATU-SATUNYA tempat peraturan akses ditentukan
// ---------------------------------------------------------------------------
function canView_(u, lokasi) { return PERANAN[u.peranan].lihatSemua || u.lokasi === lokasi; }
function canWrite_(u, lokasi) {
  const t = PERANAN[u.peranan].tulis;
  return t === 'SEMUA' || (t === 'SENDIRI' && u.lokasi === lokasi);
}
function requireWrite_(u, lokasi) {
  if (!canWrite_(u, lokasi)) throw new AppError_('DILARANG', 'Anda tiada kebenaran merekod atau mengubah stok bagi ' + lokasi + '.');
}
function requireAdmin_(u) {
  if (!PERANAN[u.peranan].urusPengguna) throw new AppError_('DILARANG', 'Fungsi ini terhad kepada Admin UPK.');
}
function permissionsFor_(u) {
  const r = PERANAN[u.peranan];
  const semua = getSettings_().lokasi.map(l => l.nama);
  return {
    lihatSemua: r.lihatSemua,
    lokasiDilihat: r.lihatSemua ? semua : [u.lokasi],
    lokasiDitulis: r.tulis === 'SEMUA' ? semua : (r.tulis === 'SENDIRI' ? [u.lokasi] : []),
    urusPengguna: r.urusPengguna,
    audit: r.audit,
    paksaBaki: u.peranan === 'ADMIN_UPK'
  };
}

// ---------------------------------------------------------------------------
// Pengurusan akaun (Admin UPK)
// ---------------------------------------------------------------------------
function listUsers_(admin) {
  requireAdmin_(admin);
  return {
    pengguna: readUsers_().map(u => { const x = Object.assign({}, u); delete x.baris; return x; }),
    peranan: Object.keys(PERANAN).map(k => ({ kod: k, label: PERANAN[k].label, lokasiHQ: PERANAN[k].lokasiHQ }))
  };
}

function saveUser_(admin, p) {
  requireAdmin_(admin);
  const emel = clean_(p.emel).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emel)) throw new AppError_('INPUT', 'Format emel tidak sah.');
  const domain = String(getSettings_().konfig.DOMAIN_EMEL || '').toLowerCase();
  if (domain && emel.split('@')[1] !== domain) throw new AppError_('INPUT', 'Hanya emel @' + domain + ' boleh didaftarkan.');
  const nama = clean_(p.nama, 120);
  if (nama.length < 3) throw new AppError_('INPUT', 'Nama penuh diperlukan.');
  const peranan = clean_(p.peranan).toUpperCase();
  if (!PERANAN[peranan]) throw new AppError_('INPUT', 'Peranan tidak sah.');
  const hq = lokasiHQ_();
  let lokasi = clean_(p.lokasi);
  if (PERANAN[peranan].lokasiHQ) lokasi = hq;
  if (getSettings_().lokasi.map(l => l.nama).indexOf(lokasi) < 0) throw new AppError_('INPUT', 'Lokasi tidak sah.');
  if (!PERANAN[peranan].lokasiHQ && lokasi === hq) throw new AppError_('INPUT', 'Peranan PAD mesti ditetapkan kepada lokasi daerah, bukan HQ.');
  const status = clean_(p.status || 'AKTIF').toUpperCase();
  if (['AKTIF', 'TIDAK_AKTIF'].indexOf(status) < 0) throw new AppError_('INPUT', 'Status tidak sah.');

  const semua = readUsers_();
  const sedia = semua.find(u => u.emel === emel);
  if (p.baru && sedia) throw new AppError_('INPUT', 'Emel ini sudah didaftarkan.');
  if (!p.baru && !sedia) throw new AppError_('INPUT', 'Akaun tidak dijumpai.');

  // Elak sistem tanpa pentadbir: admin tidak boleh turunkan / nyahaktif diri sendiri,
  // dan mesti kekal sekurang-kurangnya seorang Admin UPK aktif.
  if (sedia && sedia.emel === admin.emel && (peranan !== 'ADMIN_UPK' || status !== 'AKTIF')) {
    throw new AppError_('DILARANG', 'Anda tidak boleh menukar peranan atau menyahaktifkan akaun sendiri.');
  }
  if (sedia && sedia.peranan === 'ADMIN_UPK' && (peranan !== 'ADMIN_UPK' || status !== 'AKTIF')) {
    const adminAktif = semua.filter(u => u.peranan === 'ADMIN_UPK' && u.status === 'AKTIF').length;
    if (adminAktif <= 1) throw new AppError_('DILARANG', 'Sistem mesti mempunyai sekurang-kurangnya seorang Admin UPK aktif.');
  }

  const sh = sheet_(SH.PENGGUNA);
  const kini = nowStr_();
  const baris = [safe_(emel), safe_(nama), safe_(clean_(p.jawatan, 120)), peranan, safe_(lokasi), status,
    sedia ? sedia.aksesTerakhir : '', sedia ? sedia.diciptaOleh : admin.emel, sedia ? sedia.diciptaPada : kini, admin.emel, kini];
  if (sedia) sh.getRange(sedia.baris, 1, 1, baris.length).setValues([baris]);
  else sh.appendRow(baris);

  const ringkas = u => u ? { emel: u.emel, nama: u.nama, jawatan: u.jawatan, peranan: u.peranan, lokasi: u.lokasi, status: u.status } : null;
  writeAuditLog_(admin, sedia ? 'KEMASKINI_PENGGUNA' : 'TAMBAH_PENGGUNA', 'PENGGUNA', emel, ringkas(sedia),
    { emel: emel, nama: nama, jawatan: clean_(p.jawatan, 120), peranan: peranan, lokasi: lokasi, status: status }, '');
  return listUsers_(admin);
}

function logAccessOncePerDay_(u) {
  const kunci = 'akses_' + u.emel + '_' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd');
  const cache = CacheService.getScriptCache();
  if (cache.get(kunci)) return;
  cache.put(kunci, '1', 21600);
  sheet_(SH.PENGGUNA).getRange(u.baris, KOL_PENGGUNA.aksesTerakhir).setValue(nowStr_());
  writeAuditLog_(u, 'AKSES_SISTEM', 'PENGGUNA', u.emel, null, null, '');
}

// ---------------------------------------------------------------------------
// FASA 1 — Admin pertama (dijalankan sekali oleh pemilik skrip dari menu Sheet)
// ---------------------------------------------------------------------------
function setupFirstAdmin() {
  const emel = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!emel) throw new Error('Tidak dapat membaca emel anda. Jalankan dari akaun Google jabatan.');
  const users = readUsers_();
  if (users.some(u => u.peranan === 'ADMIN_UPK' && u.status === 'AKTIF')) {
    return showReport_('Admin sudah wujud', ['Admin UPK aktif sudah wujud. Tambah admin lain melalui menu Pengguna dalam sistem.']);
  }
  let nama = 'Pentadbir Sistem';
  try {
    const ui = SpreadsheetApp.getUi();
    const r = ui.prompt('Admin pertama', 'Nama penuh anda (untuk ' + emel + '):', ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return null;
    nama = clean_(r.getResponseText(), 120) || nama;
  } catch (e) { /* dari editor: guna nama lalai, boleh dikemaskini dalam sistem */ }

  const kini = nowStr_();
  sheet_(SH.PENGGUNA).appendRow([emel, safe_(nama), 'Pentadbir Sistem e-Stok', 'ADMIN_UPK', lokasiHQ_(), 'AKTIF', '', emel, kini, emel, kini]);
  if (!getSettings_().konfig.DOMAIN_EMEL) setKonfig_('DOMAIN_EMEL', emel.split('@')[1]);
  writeAuditLog_(systemUser_(), 'TAMBAH_PENGGUNA', 'PENGGUNA', emel, null, { emel: emel, nama: nama, peranan: 'ADMIN_UPK' }, 'Admin pertama');
  return showReport_('Admin pertama didaftarkan', [
    emel + ' kini Admin UPK.',
    'Domain emel dikunci kepada: @' + emel.split('@')[1],
    'Langkah seterusnya: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone within domain).'
  ]);
}
