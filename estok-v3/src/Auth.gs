/**
 * Auth.gs — identiti pengguna, peranan, kebenaran dan pengurusan akaun.
 *
 * Dua cara log masuk, satu kod:
 *  1. Staf UPK  → emel Google kerajaan (dibaca di server melalui Session.getActiveUser()).
 *  2. Kerani PAD → pilih daerah + kata laluan daerah + nama penuh. Server memberi token sesi
 *     yang mesti disertakan pada setiap panggilan. Kata laluan disimpan sebagai hash bersalt
 *     dalam Script Properties (bukan dalam Sheet).
 */

const PERANAN = {
  ADMIN_UPK:    { label: 'Admin UPK',    lihatSemua: true,  tulis: 'SEMUA',   urusPengguna: true,  audit: true,  emel: true },
  KERANI_UPK:   { label: 'Kerani UPK',   lihatSemua: true,  tulis: 'SENDIRI', urusPengguna: false, audit: false, emel: true },
  PEMANTAU_UPK: { label: 'Pemantau UPK', lihatSemua: true,  tulis: 'TIADA',   urusPengguna: false, audit: false, emel: true },
  KERANI_PAD:   { label: 'Kerani PAD',   lihatSemua: false, tulis: 'SENDIRI', urusPengguna: false, audit: false, emel: false }
};
const KOL_PENGGUNA = { emel: 1, nama: 2, jawatan: 3, peranan: 4, lokasi: 5, status: 6, aksesTerakhir: 7, diciptaOleh: 8, diciptaPada: 9, dikemaskiniOleh: 10, dikemaskiniPada: 11 };
const PAD_CFG = {
  HASH_ITERASI: 500,          // naikkan jika log masuk masih pantas; turunkan jika terlalu perlahan
  MIN_PANJANG: 8,
  GAGAL_MAKS: 5,              // cubaan salah sebelum daerah dikunci
  KUNCI_SAAT: 15 * 60,        // tempoh kunci
  SESI_REHAT_SAAT: 2 * 60 * 60,// sesi tamat jika tiada aktiviti 2 jam
  SESI_MAKS_MS: 8 * 60 * 60 * 1000 // sesi tamat mutlak selepas 8 jam
};

// ---------------------------------------------------------------------------
// Identiti
// ---------------------------------------------------------------------------
/** Tentukan pengguna bagi satu panggilan API. PAD guna token; UPK guna emel. */
function resolveUser_(req) {
  if (req.token) return padSessionUser_(req.token);
  return currentUser_();
}

function currentUser_() {
  const emel = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!emel) throw new AppError_('TIADA_EMEL', 'Sila log masuk.');
  const domain = String(getSettings_().konfig.DOMAIN_EMEL || '').trim().toLowerCase();
  if (domain && emel.split('@')[1] !== domain) {
    throw new AppError_('DOMAIN_DITOLAK', 'Akaun ' + emel + ' bukan emel jabatan (@' + domain + ').');
  }
  const u = findUser_(emel);
  if (!u) throw new AppError_('TIADA_AKSES', 'Emel ' + emel + ' belum didaftarkan dalam e-Stok.');
  if (u.status !== 'AKTIF') throw new AppError_('TIDAK_AKTIF', 'Akaun ' + emel + ' telah dinyahaktifkan. Sila hubungi Admin UPK.');
  if (!PERANAN[u.peranan] || !PERANAN[u.peranan].emel) throw new AppError_('PERANAN_TIDAK_SAH', 'Peranan akaun anda tidak sah. Sila hubungi Admin UPK.');
  u.jenisAkaun = 'EMEL';
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
  return { emel: u.emel, nama: u.nama, jawatan: u.jawatan || '', peranan: u.peranan, labelPeranan: PERANAN[u.peranan].label, lokasi: u.lokasi, jenisAkaun: u.jenisAkaun || 'EMEL' };
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
// Akaun daerah (Kerani PAD)
// ---------------------------------------------------------------------------
function lokasiPad_() { return getSettings_().lokasi.slice(1); } // semua kecuali HQ
function kodPad_(lokasi) {
  const l = lokasiPad_().find(x => x.nama === lokasi);
  if (!l) throw new AppError_('INPUT', 'Daerah tidak sah.');
  return l.kod;
}
function padRecord_(kod) {
  const raw = PropertiesService.getScriptProperties().getProperty('PAD_' + kod);
  return raw ? JSON.parse(raw) : null;
}
function savePadRecord_(kod, rec) { PropertiesService.getScriptProperties().setProperty('PAD_' + kod, JSON.stringify(rec)); }

function hashKataLaluan_(kata, salt) {
  const props = PropertiesService.getScriptProperties();
  let pepper = props.getProperty('PEPPER');
  if (!pepper) { pepper = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('PEPPER', pepper); }
  const hex = b => b.map(x => ((x + 256) % 256).toString(16)).map(x => (x.length < 2 ? '0' + x : x)).join('');
  let h = hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + kata + '|' + pepper));
  for (let i = 0; i < PAD_CFG.HASH_ITERASI; i++) h = hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt));
  return h;
}

/** Senarai daerah untuk skrin log masuk (tiada maklumat sensitif). */
function padLoginInfo_() {
  return { daerah: lokasiPad_().map(l => { const r = padRecord_(l.kod); return { nama: l.nama, aktif: !!(r && r.aktif && r.hash) }; }) };
}

function loginPad_(p) {
  const lokasi = clean_(p.lokasi);
  const kod = kodPad_(lokasi);
  const nama = clean_(p.nama, 80).replace(/\s+/g, ' ').toUpperCase();
  if (nama.length < 5 || !/[A-Z]/.test(nama)) throw new AppError_('INPUT', 'Sila isi nama penuh anda.');
  const cache = CacheService.getScriptCache();
  if (cache.get('kunci_pad_' + kod)) {
    throw new AppError_('DIKUNCI', 'Terlalu banyak cubaan salah bagi ' + lokasi + '. Cuba semula selepas 15 minit atau hubungi Admin UPK.');
  }
  const rec = padRecord_(kod);
  if (!rec || !rec.hash) throw new AppError_('BELUM_DITETAPKAN', 'Kata laluan bagi ' + lokasi + ' belum ditetapkan. Sila hubungi Admin UPK.');
  if (!rec.aktif) throw new AppError_('TIDAK_AKTIF', 'Akses ' + lokasi + ' sedang dinyahaktifkan. Sila hubungi Admin UPK.');

  const pemohon = { emel: 'PAD-' + kod, nama: nama + ' (' + lokasi.replace('Daerah ', '') + ')', peranan: 'KERANI_PAD', lokasi: lokasi };
  if (hashKataLaluan_(String(p.kataLaluan || ''), rec.salt) !== rec.hash) {
    const gagal = Number(cache.get('gagal_pad_' + kod) || 0) + 1;
    cache.put('gagal_pad_' + kod, String(gagal), PAD_CFG.KUNCI_SAAT);
    let mesej = 'Kata laluan tidak sah.';
    if (gagal >= PAD_CFG.GAGAL_MAKS) {
      cache.put('kunci_pad_' + kod, '1', PAD_CFG.KUNCI_SAAT);
      cache.remove('gagal_pad_' + kod);
      mesej = 'Kata laluan tidak sah. ' + lokasi + ' dikunci selama 15 minit.';
    }
    writeAuditLog_(pemohon, 'LOGIN_PAD_GAGAL', 'AKAUN_PAD', pemohon.emel, null, null, 'Cubaan ' + gagal + ' oleh "' + nama + '"');
    throw new AppError_('LOGIN_GAGAL', mesej);
  }
  cache.remove('gagal_pad_' + kod);
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('sesi_' + token, JSON.stringify({ kod: kod, lokasi: lokasi, nama: pemohon.nama, versi: rec.versi || 1, mula: Date.now() }), PAD_CFG.SESI_REHAT_SAAT);
  writeAuditLog_(pemohon, 'LOGIN_PAD', 'AKAUN_PAD', pemohon.emel, null, null, '');
  return { token: token };
}

function padSessionUser_(token) {
  const cache = CacheService.getScriptCache();
  const raw = cache.get('sesi_' + String(token));
  if (!raw) throw new AppError_('SESI_TAMAT', 'Sesi anda telah tamat. Sila log masuk semula.');
  const s = JSON.parse(raw);
  const rec = padRecord_(s.kod);
  // Kata laluan ditukar / akaun dinyahaktif / melebihi 8 jam → sesi tidak sah lagi
  if (!rec || !rec.aktif || (rec.versi || 1) !== s.versi || Date.now() - s.mula > PAD_CFG.SESI_MAKS_MS) {
    cache.remove('sesi_' + token);
    throw new AppError_('SESI_TAMAT', 'Sesi anda telah tamat. Sila log masuk semula.');
  }
  cache.put('sesi_' + token, raw, PAD_CFG.SESI_REHAT_SAAT); // lanjut tempoh tanpa aktiviti
  return { emel: 'PAD-' + s.kod, nama: s.nama, jawatan: '', peranan: 'KERANI_PAD', lokasi: s.lokasi, status: 'AKTIF', jenisAkaun: 'PAD', token: token };
}

function logoutPad_(token) {
  if (token) CacheService.getScriptCache().remove('sesi_' + String(token));
  return { ok: true };
}

/** Admin: status setiap akaun daerah. */
function listPadAccounts_(admin) {
  requireAdmin_(admin);
  const cache = CacheService.getScriptCache();
  return lokasiPad_().map(l => {
    const r = padRecord_(l.kod) || {};
    return { lokasi: l.nama, kod: l.kod, adaKataLaluan: !!r.hash, aktif: !!r.aktif, dikunci: !!cache.get('kunci_pad_' + l.kod),
      dikemaskiniOleh: r.dikemaskiniOleh || '', dikemaskiniPada: r.dikemaskiniPada || '' };
  });
}

/** Admin: tetapkan / tukar kata laluan daerah. Jika kosong, sistem jana kata laluan rawak. */
function setPadPassword_(admin, p) {
  requireAdmin_(admin);
  const lokasi = clean_(p.lokasi);
  const kod = kodPad_(lokasi);
  let kata = String(p.kataLaluan || '').trim();
  let dijana = false;
  if (!kata) { kata = randomPassword_(10); dijana = true; }
  if (kata.length < PAD_CFG.MIN_PANJANG || !/[A-Za-z]/.test(kata) || !/[0-9]/.test(kata)) {
    throw new AppError_('INPUT', 'Kata laluan mesti sekurang-kurangnya ' + PAD_CFG.MIN_PANJANG + ' aksara dan mengandungi huruf serta nombor.');
  }
  const lama = padRecord_(kod) || {};
  const salt = Utilities.getUuid();
  savePadRecord_(kod, { hash: hashKataLaluan_(kata, salt), salt: salt, aktif: true, versi: (lama.versi || 0) + 1,
    dikemaskiniOleh: admin.nama, dikemaskiniPada: nowStr_() });
  CacheService.getScriptCache().remove('kunci_pad_' + kod);
  writeAuditLog_(admin, 'KATA_LALUAN_PAD', 'AKAUN_PAD', 'PAD-' + kod, null, { lokasi: lokasi, status: 'AKTIF' },
    lama.hash ? 'Kata laluan ditukar; semua sesi daerah ini ditamatkan' : 'Kata laluan pertama ditetapkan');
  return { akaun: listPadAccounts_(admin), kataLaluan: dijana ? kata : null, lokasi: lokasi };
}

/** Admin: aktif / nyahaktif akses daerah (nyahaktif menamatkan semua sesi). */
function setPadStatus_(admin, p) {
  requireAdmin_(admin);
  const lokasi = clean_(p.lokasi);
  const kod = kodPad_(lokasi);
  const rec = padRecord_(kod);
  if (!rec || !rec.hash) throw new AppError_('INPUT', 'Tetapkan kata laluan dahulu.');
  rec.aktif = !!p.aktif;
  rec.versi = (rec.versi || 1) + 1;
  rec.dikemaskiniOleh = admin.nama; rec.dikemaskiniPada = nowStr_();
  savePadRecord_(kod, rec);
  if (rec.aktif) CacheService.getScriptCache().remove('kunci_pad_' + kod);
  writeAuditLog_(admin, 'STATUS_AKAUN_PAD', 'AKAUN_PAD', 'PAD-' + kod, null, { lokasi: lokasi, status: rec.aktif ? 'AKTIF' : 'TIDAK_AKTIF' }, '');
  return { akaun: listPadAccounts_(admin) };
}

function randomPassword_(n) {
  const abjad = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const nombor = '23456789';
  const sumber = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  let out = '';
  for (let i = 0; out.length < n - 2; i += 2) out += abjad[parseInt(sumber.substr(i, 2), 16) % abjad.length];
  out += nombor[parseInt(sumber.substr(40, 2), 16) % nombor.length] + nombor[parseInt(sumber.substr(44, 2), 16) % nombor.length];
  return out;
}

// ---------------------------------------------------------------------------
// Pengurusan akaun emel (staf UPK) — Admin UPK
// ---------------------------------------------------------------------------
function listUsers_(admin) {
  requireAdmin_(admin);
  return {
    pengguna: readUsers_().map(u => { const x = Object.assign({}, u); delete x.baris; return x; }),
    peranan: Object.keys(PERANAN).filter(k => PERANAN[k].emel).map(k => ({ kod: k, label: PERANAN[k].label })),
    akaunPad: listPadAccounts_(admin)
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
  if (!PERANAN[peranan] || !PERANAN[peranan].emel) throw new AppError_('INPUT', 'Peranan tidak sah. Kerani PAD log masuk dengan kata laluan daerah, bukan emel.');
  const lokasi = lokasiHQ_(); // semua akaun emel ialah staf UPK
  const status = clean_(p.status || 'AKTIF').toUpperCase();
  if (['AKTIF', 'TIDAK_AKTIF'].indexOf(status) < 0) throw new AppError_('INPUT', 'Status tidak sah.');

  const semua = readUsers_();
  const sedia = semua.find(u => u.emel === emel);
  if (p.baru && sedia) throw new AppError_('INPUT', 'Emel ini sudah didaftarkan.');
  if (!p.baru && !sedia) throw new AppError_('INPUT', 'Akaun tidak dijumpai.');

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
  const kunci = 'akses_' + u.emel + '_' + u.nama + '_' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd');
  const cache = CacheService.getScriptCache();
  if (cache.get(kunci)) return;
  cache.put(kunci, '1', 21600);
  if (u.baris) sheet_(SH.PENGGUNA).getRange(u.baris, KOL_PENGGUNA.aksesTerakhir).setValue(nowStr_());
  writeAuditLog_(u, 'AKSES_SISTEM', u.jenisAkaun === 'PAD' ? 'AKAUN_PAD' : 'PENGGUNA', u.emel, null, null, '');
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
    'Seterusnya: buat DUA deployment Web app (lihat README_Pemasangan.md).'
  ]);
}
