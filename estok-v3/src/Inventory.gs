/**
 * Inventory.gs — transaksi stok: baca, tambah, pindahan, kemaskini dan pembatalan.
 *
 * Peraturan ketepatan:
 *  - Rekod tidak dipadam. Pembatalan menukar Status kepada BATAL dengan sebab, dan rekod BATAL
 *    tidak dikira dalam baki.
 *  - Setiap perubahan (tambah, edit, batal) disimulasi dahulu; jika ia menyebabkan baki mana-mana
 *    lokasi/item menjadi negatif, ia ditolak (Admin UPK boleh paksa dengan pengesahan).
 *  - Pindahan antara lokasi = dua baris berpasangan yang ditulis dalam satu operasi.
 */

const JENIS_MASUK = ['Terima Pembekal', 'Pindahan Masuk', 'Pelarasan (+)'];
const JENIS_SAH = ['Terima Pembekal', 'Pindahan Masuk', 'Pindahan Keluar', 'Pengeluaran Kursus', 'Pelarasan (+)', 'Pelarasan (-)', 'Cabutan Sijil'];

// ---------------------------------------------------------------------------
// Baca
// ---------------------------------------------------------------------------
function rowToTx_(r, c) {
  const g = k => (c[k] ? r[c[k] - 1] : '');
  const jenis = String(g('jenis')).trim();
  const arahAsal = String(g('arah')).trim();
  const item = String(g('item')).trim();
  return {
    id: String(g('id')).trim(),
    tarikh: toIsoDate_(g('tarikh')),
    lokasi: String(g('lokasi')).trim(),
    item: ALIAS_ITEM[item] || item,
    jenis: jenis,
    arah: arahAsal === 'Masuk' || arahAsal === 'Keluar' ? arahAsal : (JENIS_MASUK.indexOf(jenis) >= 0 ? 'Masuk' : 'Keluar'),
    kuantiti: Number(g('kuantiti')) || 0,
    siriKursus: String(g('siriKursus')),
    jumlahPeserta: g('jumlahPeserta') === '' ? '' : Number(g('jumlahPeserta')),
    rujukan: String(g('rujukan')),
    direkodOleh: String(g('direkodOleh')),
    catatan: String(g('catatan')),
    status: String(g('status')).trim().toUpperCase() || 'AKTIF',
    diciptaPada: toDateTimeStr_(g('diciptaPada')),
    emelPerekod: String(g('emelPerekod')),
    dikemaskiniOleh: String(g('dikemaskiniOleh')),
    dikemaskiniPada: toDateTimeStr_(g('dikemaskiniPada')),
    dibatalOleh: String(g('dibatalOleh')),
    dibatalPada: toDateTimeStr_(g('dibatalPada')),
    sebabBatal: String(g('sebabBatal')),
    pasangan: String(g('pasangan')).trim()
  };
}

function readTransactions_() {
  const sh = sheet_(SH.TRANSAKSI);
  const c = txCols_(sh);
  if (!c.status) throw new AppError_('BELUM_SETUP', 'Struktur TRANSAKSI belum dinaik taraf. Pentadbir perlu jalankan setupV3().');
  const rows = readRows_(sh, c._lebar);
  const senarai = [];
  rows.forEach((r, i) => { if (r[0]) senarai.push({ baris: i + 2, raw: r, t: rowToTx_(r, c) }); });
  return { sh: sh, c: c, senarai: senarai };
}

function getTransactions_(u) {
  const d = readTransactions_();
  return {
    transaksi: d.senarai.map(x => x.t).filter(t => canView_(u, t.lokasi)),
    dibacaPada: nowStr_()
  };
}

// ---------------------------------------------------------------------------
// Tulis
// ---------------------------------------------------------------------------
function validateTx_(p) {
  const s = getSettings_();
  const tarikh = clean_(p.tarikh);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarikh) || toIsoDate_(isoToDate_(tarikh)) !== tarikh) throw new AppError_('INPUT', 'Tarikh tidak sah.');
  if (tarikh > Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd')) throw new AppError_('INPUT', 'Tarikh tidak boleh melebihi hari ini.');
  const lokasi = clean_(p.lokasi);
  if (s.lokasi.map(l => l.nama).indexOf(lokasi) < 0) throw new AppError_('INPUT', 'Lokasi tidak sah.');
  const item = clean_(p.item);
  if (s.items.map(i => i.nama).indexOf(item) < 0) throw new AppError_('INPUT', 'Item tidak sah.');
  const jenis = clean_(p.jenis);
  if (JENIS_SAH.indexOf(jenis) < 0) throw new AppError_('INPUT', 'Jenis transaksi tidak sah.');
  const kuantiti = Number(p.kuantiti);
  if (!Number.isInteger(kuantiti) || kuantiti <= 0 || kuantiti > 1000000) throw new AppError_('INPUT', 'Kuantiti mesti nombor bulat antara 1 dan 1,000,000.');
  const kursus = jenis === 'Pengeluaran Kursus';
  let peserta = '';
  if (kursus && p.jumlahPeserta !== '' && p.jumlahPeserta != null) {
    peserta = Number(p.jumlahPeserta);
    if (!Number.isInteger(peserta) || peserta < 0) throw new AppError_('INPUT', 'Jumlah peserta tidak sah.');
  }
  return {
    tarikh: tarikh, lokasi: lokasi, item: item, jenis: jenis,
    arah: JENIS_MASUK.indexOf(jenis) >= 0 ? 'Masuk' : 'Keluar',
    kuantiti: kuantiti,
    siriKursus: kursus ? clean_(p.siriKursus, 60) : '',
    jumlahPeserta: peserta,
    rujukan: clean_(p.rujukan, 80),
    catatan: clean_(p.catatan, 500)
  };
}

/**
 * Simulasi baki: tolak jika perubahan menyebabkan baki (lokasi, item) menjadi negatif
 * atau lebih negatif daripada sebelumnya.
 */
function checkStock_(u, aktif, buangIds, tambah, paksa) {
  const kunci = t => t.lokasi + '||' + t.item;
  const terlibat = {};
  aktif.filter(t => buangIds.indexOf(t.id) >= 0).concat(tambah).forEach(t => { terlibat[kunci(t)] = true; });
  const nilai = t => (t.arah === 'Masuk' ? t.kuantiti : -t.kuantiti);
  const masalah = [];
  Object.keys(terlibat).forEach(k => {
    const sebelum = aktif.filter(t => kunci(t) === k).reduce((s, t) => s + nilai(t), 0);
    const selepas = aktif.filter(t => kunci(t) === k && buangIds.indexOf(t.id) < 0).concat(tambah.filter(t => kunci(t) === k))
      .reduce((s, t) => s + nilai(t), 0);
    if (selepas < 0 && selepas < sebelum) {
      const bahagian = k.split('||');
      masalah.push(bahagian[1] + ' di ' + bahagian[0] + ': baki ' + sebelum + ' → ' + selepas);
    }
  });
  if (!masalah.length) return [];
  if (paksa && permissionsFor_(u).paksaBaki) return masalah;
  throw new AppError_('BAKI_TIDAK_CUKUP', 'Baki tidak mencukupi. ' + masalah.join('; ') + '.');
}

function txToRow_(t, c, asal) {
  const row = asal ? asal.slice() : new Array(c._lebar).fill('');
  const set = (k, v) => { if (c[k]) row[c[k] - 1] = v; };
  set('tarikh', isoToDate_(t.tarikh));
  ['lokasi', 'item', 'jenis', 'siriKursus', 'rujukan', 'direkodOleh', 'catatan', 'emelPerekod', 'dikemaskiniOleh', 'dibatalOleh', 'sebabBatal']
    .forEach(k => set(k, safe_(t[k])));
  set('arah', t.arah);
  set('kuantiti', Number(t.kuantiti));
  set('jumlahPeserta', t.jumlahPeserta === '' || t.jumlahPeserta == null ? '' : Number(t.jumlahPeserta));
  set('id', t.id);
  set('status', t.status);
  set('diciptaPada', t.diciptaPada || '');
  set('dikemaskiniPada', t.dikemaskiniPada || '');
  set('dibatalPada', t.dibatalPada || '');
  set('pasangan', t.pasangan || '');
  return row;
}

function appendTx_(d, list) {
  const rows = list.map(t => txToRow_(t, d.c, null));
  d.sh.getRange(d.sh.getLastRow() + 1, 1, rows.length, d.c._lebar).setValues(rows); // satu operasi tulis
}

function auditView_(t) {
  if (!t) return null;
  return { id: t.id, tarikh: t.tarikh, lokasi: t.lokasi, item: t.item, jenis: t.jenis, kuantiti: t.kuantiti, rujukan: t.rujukan, status: t.status };
}

function saveTransaction_(u, p) {
  if (p.jenis === 'Pindahan Keluar' && p.lokasiPenerima) return saveTransfer_(u, p);
  const t = validateTx_(p);
  requireWrite_(u, t.lokasi);
  const d = readTransactions_();
  const kini = nowStr_();
  Object.assign(t, { id: newId_('TRX'), status: 'AKTIF', direkodOleh: u.nama, emelPerekod: u.emel, diciptaPada: kini, pasangan: '' });
  const aktif = d.senarai.map(x => x.t).filter(x => x.status === 'AKTIF');
  const dipaksa = checkStock_(u, aktif, [], [t], p.paksa);
  appendTx_(d, [t]);
  writeAuditLog_(u, 'TAMBAH_TRANSAKSI', 'TRANSAKSI', t.id, null, auditView_(t), dipaksa.length ? 'DIPAKSA: ' + dipaksa.join('; ') : '');
  return Object.assign(getTransactions_(u), { mesej: 'Transaksi ' + t.id + ' disimpan.' });
}

function saveTransfer_(u, p) {
  const keluar = validateTx_(Object.assign({}, p, { jenis: 'Pindahan Keluar' }));
  requireWrite_(u, keluar.lokasi);
  const penerima = clean_(p.lokasiPenerima);
  if (getSettings_().lokasi.map(l => l.nama).indexOf(penerima) < 0 || penerima === keluar.lokasi) {
    throw new AppError_('INPUT', 'Lokasi penerima tidak sah.');
  }
  const d = readTransactions_();
  const kini = nowStr_();
  const asas = { status: 'AKTIF', direkodOleh: u.nama, emelPerekod: u.emel, diciptaPada: kini, siriKursus: '', jumlahPeserta: '' };
  Object.assign(keluar, asas, { id: newId_('TRX') });
  const masuk = Object.assign({}, keluar, { id: newId_('TRX'), lokasi: penerima, jenis: 'Pindahan Masuk', arah: 'Masuk' });
  keluar.pasangan = masuk.id;
  masuk.pasangan = keluar.id;
  const aktif = d.senarai.map(x => x.t).filter(x => x.status === 'AKTIF');
  const dipaksa = checkStock_(u, aktif, [], [keluar, masuk], p.paksa);
  appendTx_(d, [keluar, masuk]);
  writeAuditLog_(u, 'PINDAHAN_STOK', 'TRANSAKSI', keluar.id + ' > ' + masuk.id, null,
    { keluar: auditView_(keluar), masuk: auditView_(masuk) }, dipaksa.length ? 'DIPAKSA: ' + dipaksa.join('; ') : '');
  return Object.assign(getTransactions_(u), { mesej: 'Pindahan ' + keluar.item + ' (' + keluar.kuantiti + ') ke ' + penerima + ' direkod.' });
}

function findTx_(d, id) {
  const x = d.senarai.find(s => s.t.id === clean_(id));
  if (!x) throw new AppError_('TIADA', 'Rekod tidak dijumpai.');
  return x;
}
/** Untuk rekod berpasangan, kebenaran ditentukan oleh lokasi penghantar (baris Keluar). */
function pairOf_(d, x) {
  if (!x.t.pasangan) return { utama: x, pasangan: null, lokasiKawalan: x.t.lokasi };
  const p = d.senarai.find(s => s.t.id === x.t.pasangan) || null;
  const keluar = x.t.arah === 'Keluar' ? x : (p || x);
  return { utama: x, pasangan: p, lokasiKawalan: keluar.t.lokasi };
}

function updateTransaction_(u, p) {
  const d = readTransactions_();
  const x = findTx_(d, p.id);
  if (x.t.status !== 'AKTIF') throw new AppError_('DILARANG', 'Rekod yang dibatalkan tidak boleh dikemaskini.');
  const pr = pairOf_(d, x);
  requireWrite_(u, pr.lokasiKawalan);

  const input = Object.assign({}, p);
  if (pr.pasangan || x.t.pasangan) { input.jenis = x.t.jenis; input.lokasi = x.t.lokasi; } // pindahan: jenis & lokasi tetap
  else if (u.peranan !== 'ADMIN_UPK') input.lokasi = x.t.lokasi;                        // hanya Admin boleh pindah lokasi rekod
  if (input.jenis === 'Pindahan Keluar' && !x.t.pasangan && x.t.jenis !== 'Pindahan Keluar') {
    throw new AppError_('INPUT', 'Untuk pindahan antara lokasi, batalkan rekod ini dan rekod pindahan baharu.');
  }
  const v = validateTx_(input);
  if (v.lokasi !== x.t.lokasi) requireWrite_(u, v.lokasi);

  const kini = nowStr_();
  const baru = Object.assign({}, x.t, v, { dikemaskiniOleh: u.nama, dikemaskiniPada: kini });
  const kemaskini = [{ x: x, t: baru }];
  if (pr.pasangan) {
    const pb = Object.assign({}, pr.pasangan.t, {
      tarikh: v.tarikh, item: v.item, kuantiti: v.kuantiti, rujukan: v.rujukan, catatan: v.catatan,
      dikemaskiniOleh: u.nama, dikemaskiniPada: kini
    });
    kemaskini.push({ x: pr.pasangan, t: pb });
  }
  const aktif = d.senarai.map(s => s.t).filter(t => t.status === 'AKTIF');
  const dipaksa = checkStock_(u, aktif, kemaskini.map(k => k.x.t.id), kemaskini.map(k => k.t), p.paksa);
  kemaskini.forEach(k => d.sh.getRange(k.x.baris, 1, 1, d.c._lebar).setValues([txToRow_(k.t, d.c, k.x.raw)]));
  writeAuditLog_(u, 'KEMASKINI_TRANSAKSI', 'TRANSAKSI', kemaskini.map(k => k.t.id).join(' > '),
    auditView_(x.t), auditView_(baru), [clean_(p.sebab, 300), dipaksa.length ? 'DIPAKSA: ' + dipaksa.join('; ') : ''].filter(Boolean).join(' | '));
  return Object.assign(getTransactions_(u), { mesej: 'Rekod ' + baru.id + ' dikemaskini.' });
}

function voidTransaction_(u, p) {
  const sebab = clean_(p.sebab, 300);
  if (sebab.length < 5) throw new AppError_('INPUT', 'Sila nyatakan sebab pembatalan (sekurang-kurangnya 5 aksara).');
  const d = readTransactions_();
  const x = findTx_(d, p.id);
  if (x.t.status !== 'AKTIF') throw new AppError_('DILARANG', 'Rekod ini sudah dibatalkan.');
  const pr = pairOf_(d, x);
  requireWrite_(u, pr.lokasiKawalan);
  const sasaran = [x].concat(pr.pasangan && pr.pasangan.t.status === 'AKTIF' ? [pr.pasangan] : []);
  const aktif = d.senarai.map(s => s.t).filter(t => t.status === 'AKTIF');
  const dipaksa = checkStock_(u, aktif, sasaran.map(s => s.t.id), [], p.paksa);
  const kini = nowStr_();
  sasaran.forEach(s => {
    const t = Object.assign({}, s.t, { status: 'BATAL', dibatalOleh: u.nama, dibatalPada: kini, sebabBatal: sebab });
    d.sh.getRange(s.baris, 1, 1, d.c._lebar).setValues([txToRow_(t, d.c, s.raw)]);
  });
  writeAuditLog_(u, 'BATAL_TRANSAKSI', 'TRANSAKSI', sasaran.map(s => s.t.id).join(' > '), auditView_(x.t), { status: 'BATAL' },
    sebab + (dipaksa.length ? ' | DIPAKSA: ' + dipaksa.join('; ') : ''));
  return Object.assign(getTransactions_(u), { mesej: sasaran.length > 1 ? 'Kedua-dua rekod pindahan dibatalkan.' : 'Rekod dibatalkan.' });
}
