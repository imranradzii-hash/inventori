/**
 * Sistem e-Stok JHEAIPP — V3 (backend Google Apps Script)
 *
 * Perubahan utama berbanding V2:
 *  - Login & kata laluan disemak di SERVER (bukan lagi dalam HTML).
 *  - Setiap request wajib bawa token sesi (6 jam). Peranan & lokasi disemak di server.
 *  - Peranan: SUPERADMIN (En. Imran) > HQ > DAERAH.
 *  - Semua perubahan direkod dalam sheet LOG_AUDIT (siapa, bila, sebelum/selepas).
 *  - Tarikh dipulangkan dalam format yyyy-MM-dd ikut zon Asia/Kuala_Lumpur (elak bug lari 1 hari).
 *  - Semakan baki: transaksi Keluar tidak boleh melebihi baki (kecuali SUPERADMIN paksa).
 *  - Pindahan pintar dipautkan (kolum Pasangan) — edit/padam satu, pasangannya ikut sama.
 *  - LockService elak dua orang tulis serentak.
 *
 * SETUP SEKALI SAHAJA: lihat fungsi SETUP_kataLaluan() di bawah.
 */

const SHEET_TRANSAKSI = "TRANSAKSI";
const SHEET_AUDIT = "LOG_AUDIT";
const TZ = "Asia/Kuala_Lumpur";
const FOLDER_PDF_ID = "1QNIzaUx8kgbMTPlpej8CCBKnDO0OKeoz";
const SESI_SAAT = 6 * 60 * 60; // had maksimum CacheService

// Kolum sheet TRANSAKSI (1-based). Kolum 1-12 sama macam V2, 13-15 baharu.
const KOL = {
  tarikh: 1, lokasi: 2, item: 3, jenis: 4, arah: 5, kuantiti: 6, siriKursus: 7,
  jumlahPeserta: 8, rujukan: 9, id: 10, direkodOleh: 11, catatan: 12,
  dikemaskiniOleh: 13, dikemaskiniPada: 14, pasangan: 15
};
const BIL_KOL = 15;

const LOKASI = [
  "UPK BUUKI (HQ)",
  "Daerah Seberang Perai Tengah",
  "Daerah Seberang Perai Selatan",
  "Daerah Barat Daya",
  "Daerah SPU (Butterworth)",
  "Daerah SPU (Kepala Batas)",
  "Daerah Timur Laut"
];

const JENIS_MASUK = ["Terima Pembekal", "Pindahan Masuk", "Pelarasan (+)"];
const JENIS_SAH = ["Terima Pembekal", "Pindahan Masuk", "Pindahan Keluar", "Pengeluaran Kursus", "Pelarasan (+)", "Pelarasan (-)", "Cabutan Sijil"];

// Senarai pengguna — sumber kebenaran ada di SERVER, bukan di HTML.
const PENGGUNA = [
  { nama: "En. Muhammad Imran bin Mohamed Radzi", peranan: "SUPERADMIN", lokasi: "UPK BUUKI (HQ)" },
  { nama: "Ustazah Yasmin binti Hamdan", peranan: "HQ", lokasi: "UPK BUUKI (HQ)" },
  { nama: "Puan Nor Atika binti Shahrudin", peranan: "HQ", lokasi: "UPK BUUKI (HQ)" },
  { nama: "Ustazah Ros Amira binti Rusli", peranan: "HQ", lokasi: "UPK BUUKI (HQ)" },
  { nama: "Ustazah Nor Fazirah binti Abdul Rashid", peranan: "HQ", lokasi: "UPK BUUKI (HQ)" },
  { nama: "Kerani Pusat - Daerah Seberang Perai Tengah", peranan: "DAERAH", lokasi: "Daerah Seberang Perai Tengah" },
  { nama: "Kerani Pusat - Daerah Seberang Perai Selatan", peranan: "DAERAH", lokasi: "Daerah Seberang Perai Selatan" },
  { nama: "Kerani Pusat - Daerah Barat Daya", peranan: "DAERAH", lokasi: "Daerah Barat Daya" },
  { nama: "Kerani Pusat - Daerah SPU (Butterworth)", peranan: "DAERAH", lokasi: "Daerah SPU (Butterworth)" },
  { nama: "Kerani Pusat - Daerah SPU (Kepala Batas)", peranan: "DAERAH", lokasi: "Daerah SPU (Kepala Batas)" },
  { nama: "Kerani Pusat - Daerah Timur Laut", peranan: "DAERAH", lokasi: "Daerah Timur Laut" }
];

const TETAPAN_ASAL = {
  items: [
    { nama: "Sijil", stokMin: 100 },
    { nama: "Buku Gerbang Perkahwinan", stokMin: 100 },
    { nama: "Beg", stokMin: 50 },
    { nama: "Pen", stokMin: 100 },
    { nama: "Buku Nota", stokMin: 100 },
    { nama: "Gula-gula (Balang)", stokMin: 5 },
    { nama: "Mineral (Karton)", stokMin: 5 },
    { nama: "Kertas A4 (Kotak)", stokMin: 2 },
    { nama: "Cabutan Sijil", stokMin: 0 },
    { nama: "Others", stokMin: 0 }
  ],
  noFail: ""
};

// =====================================================================
// SETUP — jalankan SEKALI dari editor Apps Script, kemudian PADAM nilai
// kata laluan dari fungsi ini (jangan biar dalam kod).
// =====================================================================
function SETUP_kataLaluan() {
  const KATA_LALUAN_UMUM = "TUKAR_INI";   // untuk HQ & kerani daerah
  const KATA_LALUAN_ADMIN = "TUKAR_INI";  // khas En. Imran (SUPERADMIN) — mesti lain
  const props = PropertiesService.getScriptProperties();
  const salt = Utilities.getUuid();
  props.setProperty("SALT", salt);
  props.setProperty("HASH_UMUM", hashKataLaluan_(KATA_LALUAN_UMUM, salt));
  props.setProperty("HASH_ADMIN", hashKataLaluan_(KATA_LALUAN_ADMIN, salt));
  Logger.log("Siap. Sekarang padam nilai kata laluan dalam fungsi ini dan Deploy > Manage deployments > New version.");
}

function benarkanDrive() { DriveApp.getFiles(); } // jalankan sekali untuk beri kebenaran Drive

// =====================================================================
// ENTRY POINT
// =====================================================================
function doGet() {
  // V3: data tidak lagi dibuka melalui GET tanpa login.
  return json_({ status: "gagal", mesej: "Sila guna sistem web untuk akses data." });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === "login") return json_(handleLogin_(body));

    const sesi = wajibSesi_(body.token);
    switch (body.action) {
      case "senarai":         return json_(handleSenarai_(sesi));
      case "tambah":          return json_(denganKunci_(() => handleTambah_(body, sesi)));
      case "pindahan_pintar": return json_(denganKunci_(() => handlePindahan_(body, sesi)));
      case "kemaskini":       return json_(denganKunci_(() => handleKemaskini_(body, sesi)));
      case "padam":           return json_(denganKunci_(() => handlePadam_(body, sesi)));
      case "upload_pdf":      return json_(handleUploadPdf_(body, sesi));
      case "audit":           return json_(handleAudit_(sesi));
      case "tetapan_simpan":  return json_(handleTetapanSimpan_(body, sesi));
      case "logout":          CacheService.getScriptCache().remove("sesi_" + body.token); return json_({ status: "ok" });
      default:                return json_({ status: "gagal", mesej: "Tindakan tidak dikenali." });
    }
  } catch (err) {
    return json_({ status: "gagal", mesej: String(err.message || err) });
  }
}

// =====================================================================
// AUTH
// =====================================================================
function handleLogin_(body) {
  const nama = String(body.nama || "");
  const cache = CacheService.getScriptCache();
  const kunciCuba = "cuba_" + nama;
  const cuba = Number(cache.get(kunciCuba) || 0);
  if (cuba >= 8) throw new Error("Terlalu banyak percubaan. Cuba lagi selepas 5 minit.");

  const user = PENGGUNA.find(p => p.nama === nama);
  const props = PropertiesService.getScriptProperties();
  const salt = props.getProperty("SALT");
  if (!salt) throw new Error("Sistem belum di-setup. Admin perlu jalankan SETUP_kataLaluan().");
  const hash = hashKataLaluan_(String(body.kataLaluan || ""), salt);
  const hashBetul = user && user.peranan === "SUPERADMIN" ? props.getProperty("HASH_ADMIN") : props.getProperty("HASH_UMUM");

  if (!user || hash !== hashBetul) {
    cache.put(kunciCuba, String(cuba + 1), 300);
    throw new Error("Nama atau kata laluan tidak sah.");
  }
  cache.remove(kunciCuba);

  let namaPaparan = user.nama;
  if (user.peranan === "DAERAH") {
    const manual = bersih_(body.namaManual).toUpperCase();
    if (manual.length < 3) throw new Error("Sila isi nama penuh anda.");
    namaPaparan = manual + " (" + user.lokasi.replace("Daerah ", "") + ")";
  }

  const token = Utilities.getUuid();
  const sesi = { nama: namaPaparan, akaun: user.nama, peranan: user.peranan, lokasi: user.lokasi };
  cache.put("sesi_" + token, JSON.stringify(sesi), SESI_SAAT);
  logAudit_(sesi, "LOGIN", "", null, null);
  return { status: "ok", token, pengguna: sesi, tetapan: bacaTetapan_(), lokasi: LOKASI };
}

function wajibSesi_(token) {
  if (!token) throw new Error("SESI_TAMAT");
  const raw = CacheService.getScriptCache().get("sesi_" + token);
  if (!raw) throw new Error("SESI_TAMAT");
  return JSON.parse(raw);
}

function hashKataLaluan_(kata, salt) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, kata + salt);
  return raw.map(b => ((b + 256) % 256).toString(16).padStart(2, "0")).join("");
}

// Peraturan kebenaran — ubah di sini sahaja kalau polisi berubah.
function bolehLihatLokasi_(sesi, lokasi) {
  return sesi.peranan === "SUPERADMIN" || sesi.peranan === "HQ" || sesi.lokasi === lokasi;
}
function bolehUbahRekod_(sesi, rekod) {
  if (sesi.peranan === "SUPERADMIN") return true;
  if (!bolehLihatLokasi_(sesi, rekod.lokasi)) return false;
  return rekod.direkodOleh === sesi.nama; // HQ & DAERAH: hanya rekod sendiri
}

// =====================================================================
// HANDLER
// =====================================================================
function handleSenarai_(sesi) {
  const semua = bacaSemua_().map(r => r.data);
  const tapis = semua.filter(t => bolehLihatLokasi_(sesi, t.lokasi));
  return { status: "ok", data: tapis, tetapan: bacaTetapan_() };
}

function handleTambah_(body, sesi) {
  const t = sahkanInput_(body, sesi);
  if (!bolehLihatLokasi_(sesi, t.lokasi)) throw new Error("Anda tiada akses ke lokasi ini.");
  semakBaki_(t, null, sesi, body.paksa);
  t.id = Utilities.getUuid();
  t.direkodOleh = sesi.nama;
  sheet_().appendRow(keBaris_(t));
  logAudit_(sesi, "TAMBAH", t.id, null, t);
  return { status: "ok", rekod: t };
}

function handlePindahan_(body, sesi) {
  const t = sahkanInput_(Object.assign({}, body, { jenis: "Pindahan Keluar", lokasi: body.lokasiPenghantar }), sesi);
  const penerima = String(body.lokasiPenerima || "");
  if (LOKASI.indexOf(penerima) < 0 || penerima === t.lokasi) throw new Error("Lokasi penerima tidak sah.");
  if (!bolehLihatLokasi_(sesi, t.lokasi)) throw new Error("Anda tiada akses ke lokasi penghantar.");
  semakBaki_(t, null, sesi, body.paksa);

  const keluar = Object.assign({}, t, { id: Utilities.getUuid(), direkodOleh: sesi.nama });
  const masuk = Object.assign({}, t, { id: Utilities.getUuid(), lokasi: penerima, jenis: "Pindahan Masuk", arah: "Masuk", direkodOleh: sesi.nama });
  keluar.pasangan = masuk.id;
  masuk.pasangan = keluar.id;
  sheet_().appendRow(keBaris_(keluar));
  sheet_().appendRow(keBaris_(masuk));
  logAudit_(sesi, "PINDAHAN", keluar.id + " / " + masuk.id, null, { keluar, masuk });
  return { status: "ok", rekod: [keluar, masuk] };
}

function handleKemaskini_(body, sesi) {
  const semua = bacaSemua_();
  const asal = semua.find(r => r.data.id === body.id);
  if (!asal) throw new Error("Rekod tidak dijumpai (mungkin telah dipadam).");
  if (!bolehUbahRekod_(sesi, asal.data)) throw new Error("Anda tiada kebenaran mengubah rekod ini.");

  // Hanya SUPERADMIN boleh pindah rekod ke lokasi lain.
  const lokasiBaru = sesi.peranan === "SUPERADMIN" && body.lokasi ? body.lokasi : asal.data.lokasi;
  const t = sahkanInput_(Object.assign({}, body, { lokasi: lokasiBaru }), sesi);
  // Rekod pindahan kekal jenisnya supaya pasangan tak rosak.
  if (asal.data.pasangan) { t.jenis = asal.data.jenis; t.arah = asal.data.arah; }
  semakBaki_(t, asal.data.id, sesi, body.paksa);

  const baru = Object.assign({}, asal.data, t, {
    id: asal.data.id, direkodOleh: asal.data.direkodOleh, pasangan: asal.data.pasangan,
    dikemaskiniOleh: sesi.nama, dikemaskiniPada: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm")
  });
  sheet_().getRange(asal.baris, 1, 1, BIL_KOL).setValues([keBaris_(baru)]);

  // Kemaskini pasangan pindahan (tarikh, item, kuantiti, rujukan, catatan).
  if (asal.data.pasangan) {
    const p = semua.find(r => r.data.id === asal.data.pasangan);
    if (p) {
      const pBaru = Object.assign({}, p.data, {
        tarikh: baru.tarikh, item: baru.item, kuantiti: baru.kuantiti, rujukan: baru.rujukan, catatan: baru.catatan,
        dikemaskiniOleh: baru.dikemaskiniOleh, dikemaskiniPada: baru.dikemaskiniPada
      });
      sheet_().getRange(p.baris, 1, 1, BIL_KOL).setValues([keBaris_(pBaru)]);
    }
  }
  logAudit_(sesi, "KEMASKINI", baru.id, asal.data, baru);
  return { status: "ok", rekod: baru };
}

function handlePadam_(body, sesi) {
  const semua = bacaSemua_();
  const asal = semua.find(r => r.data.id === body.id);
  if (!asal) throw new Error("Rekod tidak dijumpai.");
  if (!bolehUbahRekod_(sesi, asal.data)) throw new Error("Anda tiada kebenaran memadam rekod ini.");
  const sasaran = [asal];
  if (asal.data.pasangan) {
    const p = semua.find(r => r.data.id === asal.data.pasangan);
    if (p) sasaran.push(p);
  }
  sasaran.sort((a, b) => b.baris - a.baris).forEach(r => sheet_().deleteRow(r.baris)); // padam dari bawah
  sasaran.forEach(r => logAudit_(sesi, "PADAM", r.data.id, r.data, null));
  return { status: "ok", dipadam: sasaran.map(r => r.data.id) };
}

function handleUploadPdf_(body, sesi) {
  const namaFail = bersih_(body.filename).replace(/[\\/:*?"<>|]/g, "-").slice(0, 150) || "laporan.pdf";
  const blob = Utilities.newBlob(Utilities.base64Decode(body.fileData), "application/pdf", namaFail);
  if (blob.getBytes().length > 10 * 1024 * 1024) throw new Error("Fail terlalu besar.");
  DriveApp.getFolderById(FOLDER_PDF_ID).createFile(blob);
  logAudit_(sesi, "UPLOAD_PDF", namaFail, null, null);
  return { status: "ok" };
}

function handleAudit_(sesi) {
  if (sesi.peranan !== "SUPERADMIN") throw new Error("Akses terhad kepada pentadbir sistem.");
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_AUDIT);
  if (!sh || sh.getLastRow() < 2) return { status: "ok", data: [] };
  const mula = Math.max(2, sh.getLastRow() - 299); // 300 entri terakhir
  const rows = sh.getRange(mula, 1, sh.getLastRow() - mula + 1, 6).getValues();
  const data = rows.reverse().map(r => ({
    masa: r[0] instanceof Date ? Utilities.formatDate(r[0], TZ, "yyyy-MM-dd HH:mm:ss") : String(r[0]),
    oleh: r[1], tindakan: r[2], rujukanId: r[3], sebelum: r[4], selepas: r[5]
  }));
  return { status: "ok", data };
}

function handleTetapanSimpan_(body, sesi) {
  if (sesi.peranan !== "SUPERADMIN") throw new Error("Hanya pentadbir sistem boleh ubah tetapan.");
  const t = body.tetapan || {};
  const items = (t.items || []).map(i => ({ nama: bersih_(i.nama), stokMin: Math.max(0, parseInt(i.stokMin, 10) || 0) }))
    .filter(i => i.nama);
  if (!items.length) throw new Error("Senarai item tidak boleh kosong.");
  const baru = { items, noFail: bersih_(t.noFail) };
  const lama = bacaTetapan_();
  PropertiesService.getScriptProperties().setProperty("TETAPAN", JSON.stringify(baru));
  logAudit_(sesi, "TETAPAN", "", lama, baru);
  return { status: "ok", tetapan: baru };
}

// =====================================================================
// UTILITI DATA
// =====================================================================
function sheet_() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSAKSI); }

function bacaSemua_() {
  const sh = sheet_();
  if (sh.getLastRow() < 2) return [];
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, BIL_KOL).getValues();
  const hasil = [];
  rows.forEach((r, i) => {
    if (!r[0]) return;
    const jenis = String(r[KOL.jenis - 1]);
    let item = String(r[KOL.item - 1]);
    if (item === "Mineral") item = "Mineral (Karton)";
    if (item === "Kertas A4") item = "Kertas A4 (Kotak)";
    hasil.push({
      baris: i + 2,
      data: {
        tarikh: keTarikh_(r[0]),
        lokasi: String(r[KOL.lokasi - 1]),
        item: item,
        jenis: jenis,
        arah: r[KOL.arah - 1] || (JENIS_MASUK.indexOf(jenis) >= 0 ? "Masuk" : "Keluar"),
        kuantiti: Number(r[KOL.kuantiti - 1]) || 0,
        siriKursus: String(r[KOL.siriKursus - 1] || ""),
        jumlahPeserta: r[KOL.jumlahPeserta - 1] === "" ? "" : Number(r[KOL.jumlahPeserta - 1]),
        rujukan: String(r[KOL.rujukan - 1] || ""),
        id: String(r[KOL.id - 1] || ""),
        direkodOleh: String(r[KOL.direkodOleh - 1] || ""),
        catatan: String(r[KOL.catatan - 1] || ""),
        dikemaskiniOleh: String(r[KOL.dikemaskiniOleh - 1] || ""),
        dikemaskiniPada: r[KOL.dikemaskiniPada - 1] instanceof Date
          ? Utilities.formatDate(r[KOL.dikemaskiniPada - 1], TZ, "yyyy-MM-dd HH:mm") : String(r[KOL.dikemaskiniPada - 1] || ""),
        pasangan: String(r[KOL.pasangan - 1] || "")
      }
    });
  });
  return hasil;
}

function sahkanInput_(b, sesi) {
  const tarikh = String(b.tarikh || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarikh)) throw new Error("Tarikh tidak sah.");
  const hariIni = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  if (tarikh > hariIni) throw new Error("Tarikh tidak boleh melebihi hari ini.");
  const lokasi = String(b.lokasi || "");
  if (LOKASI.indexOf(lokasi) < 0) throw new Error("Lokasi tidak sah.");
  const namaItem = bacaTetapan_().items.map(i => i.nama);
  if (namaItem.indexOf(b.item) < 0) throw new Error("Item tidak sah.");
  if (JENIS_SAH.indexOf(b.jenis) < 0) throw new Error("Jenis transaksi tidak sah.");
  const kuantiti = parseInt(b.kuantiti, 10);
  if (!(kuantiti > 0) || kuantiti > 1000000) throw new Error("Kuantiti mesti nombor bulat lebih dari 0.");
  const kursus = b.jenis === "Pengeluaran Kursus";
  return {
    tarikh, lokasi, item: b.item, jenis: b.jenis,
    arah: JENIS_MASUK.indexOf(b.jenis) >= 0 ? "Masuk" : "Keluar",
    kuantiti,
    siriKursus: kursus ? bersih_(b.siriKursus) : "",
    jumlahPeserta: kursus && b.jumlahPeserta !== "" && b.jumlahPeserta != null ? Math.max(0, parseInt(b.jumlahPeserta, 10) || 0) : "",
    rujukan: bersih_(b.rujukan),
    catatan: bersih_(b.catatan).slice(0, 500)
  };
}

function semakBaki_(t, abaikanId, sesi, paksa) {
  if (t.arah !== "Keluar") return;
  const baki = bacaSemua_().map(r => r.data)
    .filter(r => r.lokasi === t.lokasi && r.item === t.item && r.id !== abaikanId)
    .reduce((s, r) => s + (r.arah === "Masuk" ? r.kuantiti : -r.kuantiti), 0);
  if (t.kuantiti > baki) {
    if (sesi.peranan === "SUPERADMIN" && paksa) return;
    throw new Error("BAKI_TIDAK_CUKUP:" + baki);
  }
}

function keBaris_(t) {
  const s = sanitize_;
  const [y, m, d] = t.tarikh.split("-").map(Number);
  return [
    new Date(y, m - 1, d), s(t.lokasi), s(t.item), s(t.jenis), t.arah, Number(t.kuantiti),
    s(t.siriKursus), t.jumlahPeserta === "" ? "" : Number(t.jumlahPeserta), s(t.rujukan), t.id,
    s(t.direkodOleh), s(t.catatan), s(t.dikemaskiniOleh || ""), s(t.dikemaskiniPada || ""), t.pasangan || ""
  ];
}

function keTarikh_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy-MM-dd");
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // DD/MM/YYYY
  if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  return s;
}

function bacaTetapan_() {
  const raw = PropertiesService.getScriptProperties().getProperty("TETAPAN");
  return raw ? JSON.parse(raw) : TETAPAN_ASAL;
}

function logAudit_(sesi, tindakan, idRujukan, sebelum, selepas) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_AUDIT);
  if (!sh) {
    sh = ss.insertSheet(SHEET_AUDIT);
    sh.appendRow(["Masa", "Oleh", "Tindakan", "ID Rujukan", "Sebelum", "Selepas"]);
    sh.setFrozenRows(1);
  }
  sh.appendRow([new Date(), sanitize_(sesi.nama), tindakan, idRujukan,
    sebelum ? sanitize_(JSON.stringify(sebelum)) : "", selepas ? sanitize_(JSON.stringify(selepas)) : ""]);
}

function denganKunci_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error("Sistem sibuk, sila cuba sebentar lagi.");
  try { return fn(); } finally { lock.releaseLock(); }
}

function bersih_(v) { return String(v == null ? "" : v).trim(); }
function sanitize_(v) { const s = String(v == null ? "" : v); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
