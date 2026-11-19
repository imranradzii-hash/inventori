/**
 * Ujian penerimaan backend e-Stok V3 (Fasa 0 & 1).
 * Jalankan: node estok-v3/ujian/ujian-backend.js
 */
const { createEnv, seedV2 } = require('./gas-mock');

let lulus = 0, gagal = 0;
function uji(nama, fn) {
  try { fn(); lulus++; console.log('  LULUS  ' + nama); }
  catch (e) { gagal++; console.log('  GAGAL  ' + nama + '\n         ' + e.message); }
}
function sama(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' dijangka ' + JSON.stringify(b) + ', dapat ' + JSON.stringify(a)); }
function benar(x, m) { if (!x) throw new Error(m || 'dijangka benar'); }
function ok(r) { if (!r.ok) throw new Error('API gagal: ' + r.kod + ' ' + r.mesej); return r.data; }
function ditolak(r, kod) { if (r.ok) throw new Error('Dijangka ditolak (' + kod + ') tetapi berjaya'); if (kod && r.kod !== kod) throw new Error('Kod dijangka ' + kod + ', dapat ' + r.kod + ': ' + r.mesej); }

const ADMIN = 'imran@jheaipp.gov.my';
const KUPK = 'yasmin@jheaipp.gov.my';
const KBD = 'siti@jheaipp.gov.my';
const KTL = 'ali@jheaipp.gov.my';
const PEGBD = 'pegawai.bd@jheaipp.gov.my';
const PEMANTAU = 'pemantau@jheaipp.gov.my';
const HQ = 'UPK BUUKI (HQ)', BD = 'Daerah Barat Daya', TL = 'Daerah Timur Laut';
const hariIni = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());

const env = createEnv();
const tx = seedV2(env);
const asal12 = tx.data.map(r => r.slice(0, 12).map(v => (v instanceof Date ? v.toISOString() : v)));

console.log('\nFASA 0 — Migrasi');
uji('setupV3 berjalan tanpa ralat', () => env.call('setupV3'));
uji('Data asal lajur 1–12 tidak berubah (kecuali ID kosong diisi)', () => {
  tx.data.slice(0, 8).forEach((r, i) => r.slice(0, 12).forEach((v, j) => {
    const lama = asal12[i][j];
    const kini = v instanceof Date ? v.toISOString() : v;
    if (j === 9 && i > 0 && lama === '' && asal12[i][0] !== '') return; // ID dijana
    sama(kini, lama, `baris ${i + 1} lajur ${j + 1}`);
  }));
});
uji('ID dijana untuk rekod lama tanpa ID, ID sedia ada dikekalkan', () => {
  benar(String(tx.data[1][9]).startsWith('LGC-'), 'baris 2');
  benar(String(tx.data[6][9]).startsWith('LGC-'), 'baris 7');
  sama(tx.data[3][9], 'abc123');
});
uji('Lajur V3 ditambah di hujung, Status AKTIF diisi', () => {
  const tajuk = tx.data[0];
  ['Status', 'Dicipta Pada', 'Emel Perekod', 'Sebab Batal', 'Pasangan'].forEach(h => benar(tajuk.includes(h), h));
  sama(tx.data[1][tajuk.indexOf('Status')], 'AKTIF');
  sama(tx.data[7][tajuk.indexOf('Status')], '', 'baris kosong tidak disentuh');
});
uji('Sandaran TRANSAKSI dibuat', () => benar(env.ss.sheets.some(s => s.name.startsWith('BACKUP_TRANSAKSI_'))));
uji('Helaian PENGGUNA, AUDIT_LOG, TETAPAN, ARKIB_LAPORAN dicipta', () => ['PENGGUNA', 'AUDIT_LOG', 'TETAPAN', 'ARKIB_LAPORAN'].forEach(n => benar(env.ss.getSheetByName(n), n)));
uji('Helaian sensitif dilindungi (pemilik sahaja, domain tidak boleh edit)', () => ['PENGGUNA', 'AUDIT_LOG', 'TETAPAN'].forEach(n => {
  const p = env.ss.getSheetByName(n).protections[0];
  sama(p.editors, ['owner@jheaipp.gov.my', 'imran@jheaipp.gov.my'].filter(e => e === env.emelPemilik), n);
  sama(p.domain, false);
}));
uji('setupV3 boleh dijalankan semula tanpa menduplikasi lajur', () => {
  const lebar = tx.data[0].filter(Boolean).length;
  env.call('setupV3');
  sama(tx.data[0].filter(Boolean).length, lebar);
});
uji('SPREADSHEET_ID disimpan dalam Script Properties', () => sama(env.props.SPREADSHEET_ID, 'SS-UJIAN'));

console.log('\nFASA 1 — Identiti & pengurusan akaun');
uji('Pengguna belum berdaftar ditolak', () => ditolak(env.api(ADMIN, 'bootstrap'), 'TIADA_AKSES'));
uji('Tiada emel (bukan akaun domain) ditolak', () => ditolak(env.api('', 'bootstrap'), 'TIADA_EMEL'));
uji('setupFirstAdmin mendaftar pemilik skrip sebagai ADMIN_UPK & kunci domain', () => {
  env.call('setupFirstAdmin');
  const b = ok(env.api(ADMIN, 'bootstrap'));
  sama(b.pengguna.peranan, 'ADMIN_UPK');
  sama(b.tetapan.konfig.DOMAIN_EMEL, 'jheaipp.gov.my');
});
uji('setupFirstAdmin kali kedua tidak mencipta admin baharu', () => {
  env.call('setupFirstAdmin');
  sama(env.ss.getSheetByName('PENGGUNA').data.filter(r => r[3] === 'ADMIN_UPK').length, 1);
});
uji('Emel luar domain ditolak walaupun cuba akses', () => ditolak(env.api('orang@gmail.com', 'bootstrap'), 'DOMAIN_DITOLAK'));
uji('Admin mendaftar Kerani UPK, Kerani PAD, Pegawai PAD dan Pemantau', () => {
  ok(env.api(ADMIN, 'pengguna_simpan', { baru: true, emel: KUPK, nama: 'Ustazah Yasmin binti Hamdan', peranan: 'KERANI_UPK', lokasi: BD }));
  ok(env.api(ADMIN, 'pengguna_simpan', { baru: true, emel: KBD, nama: 'Siti Aminah', peranan: 'KERANI_PAD', lokasi: BD }));
  ok(env.api(ADMIN, 'pengguna_simpan', { baru: true, emel: KTL, nama: 'Ali Ahmad', peranan: 'KERANI_PAD', lokasi: TL }));
  ok(env.api(ADMIN, 'pengguna_simpan', { baru: true, emel: PEGBD, nama: 'Pegawai Tadbir BD', peranan: 'PEGAWAI_PAD', lokasi: BD }));
  const d = ok(env.api(ADMIN, 'pengguna_simpan', { baru: true, emel: PEMANTAU, nama: 'Pemantau Negeri', peranan: 'PEMANTAU_UPK', lokasi: TL }));
  sama(d.pengguna.find(u => u.emel === KUPK).lokasi, HQ, 'Kerani UPK dipaksa ke HQ');
  sama(d.pengguna.find(u => u.emel === PEMANTAU).lokasi, HQ, 'Pemantau dipaksa ke HQ');
});
uji('Peranan PAD tidak boleh ditetapkan ke HQ', () => ditolak(env.api(ADMIN, 'pengguna_simpan', { baru: true, emel: 'x@jheaipp.gov.my', nama: 'Xxx', peranan: 'KERANI_PAD', lokasi: HQ }), 'INPUT'));
uji('Emel berganda ditolak', () => ditolak(env.api(ADMIN, 'pengguna_simpan', { baru: true, emel: KBD.toUpperCase(), nama: 'Siti', peranan: 'KERANI_PAD', lokasi: BD }), 'INPUT'));
uji('Kerani tidak boleh urus pengguna atau naikkan peranan sendiri', () => {
  ditolak(env.api(KBD, 'pengguna_senarai'), 'DILARANG');
  ditolak(env.api(KBD, 'pengguna_simpan', { emel: KBD, nama: 'Siti', peranan: 'ADMIN_UPK', lokasi: HQ }), 'DILARANG');
  sama(ok(env.api(KBD, 'bootstrap')).pengguna.peranan, 'KERANI_PAD');
});
uji('Admin tidak boleh turunkan peranan / nyahaktif diri sendiri', () => {
  ditolak(env.api(ADMIN, 'pengguna_simpan', { emel: ADMIN, nama: 'Imran', peranan: 'KERANI_UPK', lokasi: HQ }), 'DILARANG');
  ditolak(env.api(ADMIN, 'pengguna_simpan', { emel: ADMIN, nama: 'Imran', peranan: 'ADMIN_UPK', lokasi: HQ, status: 'TIDAK_AKTIF' }), 'DILARANG');
});
uji('Akaun dinyahaktif terus hilang akses', () => {
  ok(env.api(ADMIN, 'pengguna_simpan', { baru: true, emel: 'lama@jheaipp.gov.my', nama: 'Staf Lama', peranan: 'KERANI_PAD', lokasi: TL }));
  ok(env.api('lama@jheaipp.gov.my', 'bootstrap'));
  ok(env.api(ADMIN, 'pengguna_simpan', { emel: 'lama@jheaipp.gov.my', nama: 'Staf Lama', peranan: 'KERANI_PAD', lokasi: TL, status: 'TIDAK_AKTIF' }));
  ditolak(env.api('lama@jheaipp.gov.my', 'transaksi'), 'TIDAK_AKTIF');
});

console.log('\nFASA 1 — Kawalan akses data');
uji('Kerani PAD hanya nampak rekod daerah sendiri', () => {
  const t = ok(env.api(KBD, 'transaksi')).transaksi;
  benar(t.length > 0);
  benar(t.every(x => x.lokasi === BD), 'ada rekod daerah lain');
});
uji('Pegawai PAD nampak daerah sendiri sahaja, tidak boleh tulis', () => {
  benar(ok(env.api(PEGBD, 'transaksi')).transaksi.every(x => x.lokasi === BD));
  ditolak(env.api(PEGBD, 'tambah', { tarikh: hariIni, lokasi: BD, item: 'Pen', jenis: 'Terima Pembekal', kuantiti: 5 }), 'DILARANG');
});
uji('Pemantau UPK nampak semua lokasi, tidak boleh tulis', () => {
  const lok = new Set(ok(env.api(PEMANTAU, 'transaksi')).transaksi.map(x => x.lokasi));
  benar(lok.has(HQ) && lok.has(BD) && lok.has(TL));
  ditolak(env.api(PEMANTAU, 'tambah', { tarikh: hariIni, lokasi: HQ, item: 'Pen', jenis: 'Terima Pembekal', kuantiti: 5 }), 'DILARANG');
});
uji('Kerani PAD tidak boleh rekod untuk daerah lain melalui API', () =>
  ditolak(env.api(KBD, 'tambah', { tarikh: hariIni, lokasi: TL, item: 'Pen', jenis: 'Terima Pembekal', kuantiti: 5 }), 'DILARANG'));
uji('Kerani PAD tidak boleh edit / batal rekod daerah lain walaupun tahu ID', () => {
  const idTL = ok(env.api(ADMIN, 'transaksi')).transaksi.find(x => x.lokasi === TL).id;
  ditolak(env.api(KBD, 'kemaskini', { id: idTL, tarikh: hariIni, item: 'Pen', jenis: 'Terima Pembekal', kuantiti: 1 }), 'DILARANG');
  ditolak(env.api(KBD, 'batal', { id: idTL, sebab: 'cubaan curang' }), 'DILARANG');
});
uji('Kerani UPK boleh rekod HQ tetapi bukan daerah', () => {
  ok(env.api(KUPK, 'tambah', { tarikh: hariIni, lokasi: HQ, item: 'Pen', jenis: 'Terima Pembekal', kuantiti: 500 }));
  ditolak(env.api(KUPK, 'tambah', { tarikh: hariIni, lokasi: BD, item: 'Pen', jenis: 'Terima Pembekal', kuantiti: 5 }), 'DILARANG');
});
uji('Log audit terhad kepada Admin', () => { ditolak(env.api(PEMANTAU, 'audit'), 'DILARANG'); ok(env.api(ADMIN, 'audit')); });

console.log('\nFASA 1 — Ketepatan transaksi');
const baki = (emel, lokasi, item) => ok(env.api(emel, 'transaksi')).transaksi
  .filter(t => t.lokasi === lokasi && t.item === item && t.status === 'AKTIF').reduce((s, t) => s + (t.arah === 'Masuk' ? t.kuantiti : -t.kuantiti), 0);
uji('Nama item lama "Mineral" dibaca sebagai "Mineral (Karton)"', () => benar(ok(env.api(ADMIN, 'transaksi')).transaksi.some(t => t.item === 'Mineral (Karton)')));
uji('Tarikh lama (objek Date dalam Sheet) dibaca sebagai yyyy-MM-dd', () => {
  const t = ok(env.api(ADMIN, 'transaksi')).transaksi;
  benar(t.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x.tarikh)), 'format tarikh: ' + t.map(x => x.tarikh).join(','));
  benar(t.some(x => x.tarikh === '2026-01-05'));
});
uji('Tarikh lama DD/MM/YYYY dibaca betul', () => benar(ok(env.api(ADMIN, 'transaksi')).transaksi.some(t => t.tarikh === '2026-03-15' && t.lokasi === TL)));
uji('Baki awal betul selepas migrasi (Sijil BD = 300 − 120 = 180)', () => sama(baki(ADMIN, BD, 'Sijil'), 180));
uji('Tambah transaksi: tarikh disimpan & dibaca sama (tiada lari sehari)', () => {
  const d = ok(env.api(KBD, 'tambah', { tarikh: hariIni, lokasi: BD, item: 'Sijil', jenis: 'Pengeluaran Kursus', kuantiti: 30, siriKursus: 'Siri 9/2026', jumlahPeserta: 30 }));
  const t = d.transaksi.find(x => x.siriKursus === 'Siri 9/2026');
  sama(t.tarikh, hariIni); sama(t.emelPerekod, KBD); sama(t.status, 'AKTIF');
  sama(baki(KBD, BD, 'Sijil'), 150);
});
uji('Keluar melebihi baki ditolak', () => ditolak(env.api(KBD, 'tambah', { tarikh: hariIni, lokasi: BD, item: 'Sijil', jenis: 'Pengeluaran Kursus', kuantiti: 151 }), 'BAKI_TIDAK_CUKUP'));
uji('Kerani tidak boleh paksa baki negatif; Admin boleh (direkod dalam audit)', () => {
  ditolak(env.api(KBD, 'tambah', { tarikh: hariIni, lokasi: BD, item: 'Beg', jenis: 'Pelarasan (-)', kuantiti: 1, paksa: true }), 'BAKI_TIDAK_CUKUP');
  ok(env.api(ADMIN, 'tambah', { tarikh: hariIni, lokasi: BD, item: 'Beg', jenis: 'Pelarasan (-)', kuantiti: 1, paksa: true, catatan: 'ujian paksa' }));
  const log = ok(env.api(ADMIN, 'audit')).log;
  benar(log.some(l => l.tindakan === 'TAMBAH_TRANSAKSI' && l.sebab.startsWith('DIPAKSA')));
});
uji('Tarikh masa depan & kuantiti tidak sah ditolak', () => {
  ditolak(env.api(KBD, 'tambah', { tarikh: '2099-01-01', lokasi: BD, item: 'Pen', jenis: 'Terima Pembekal', kuantiti: 5 }), 'INPUT');
  ditolak(env.api(KBD, 'tambah', { tarikh: hariIni, lokasi: BD, item: 'Pen', jenis: 'Terima Pembekal', kuantiti: 2.5 }), 'INPUT');
  ditolak(env.api(KBD, 'tambah', { tarikh: hariIni, lokasi: BD, item: 'Pen', jenis: 'Terima Pembekal', kuantiti: -5 }), 'INPUT');
  ditolak(env.api(KBD, 'tambah', { tarikh: '2026-02-30', lokasi: BD, item: 'Pen', jenis: 'Terima Pembekal', kuantiti: 5 }), 'INPUT');
});
uji('Input formula (=HYPERLINK…) disimpan sebagai teks', () => {
  ok(env.api(KBD, 'tambah', { tarikh: hariIni, lokasi: BD, item: 'Pen', jenis: 'Terima Pembekal', kuantiti: 5, rujukan: '=HYPERLINK("http://x")' }));
  const sel = tx.data.find(r => String(r[8]).includes('HYPERLINK'));
  benar(sel && !String(sel[8]).startsWith("'") , 'mock: apostrof ditanggalkan oleh Sheets');
  const t = ok(env.api(KBD, 'transaksi')).transaksi.find(x => x.rujukan.includes('HYPERLINK'));
  sama(t.rujukan, '=HYPERLINK("http://x")');
});
let idKeluar, idMasuk;
uji('Pindahan HQ → Timur Laut: dua rekod berpasangan, baki kedua-dua lokasi betul', () => {
  const hqSebelum = baki(ADMIN, HQ, 'Sijil'), tlSebelum = baki(ADMIN, TL, 'Sijil');
  const d = ok(env.api(KUPK, 'pindahan', { tarikh: hariIni, lokasi: HQ, lokasiPenerima: TL, item: 'Sijil', kuantiti: 200, rujukan: 'PDH-V3-1' }));
  const pair = d.transaksi.filter(t => t.rujukan === 'PDH-V3-1');
  sama(pair.length, 2);
  idKeluar = pair.find(t => t.arah === 'Keluar').id; idMasuk = pair.find(t => t.arah === 'Masuk').id;
  sama(pair.find(t => t.id === idKeluar).pasangan, idMasuk);
  sama(baki(ADMIN, HQ, 'Sijil'), hqSebelum - 200);
  sama(baki(ADMIN, TL, 'Sijil'), tlSebelum + 200);
});
uji('Kerani penerima (TL) tidak boleh batal/edit pindahan yang dikawal penghantar', () => {
  ditolak(env.api(KTL, 'batal', { id: idMasuk, sebab: 'tak terima pun' }), 'DILARANG');
});
uji('Edit kuantiti pindahan mengemas kini kedua-dua pasangan', () => {
  ok(env.api(KUPK, 'kemaskini', { id: idKeluar, tarikh: hariIni, item: 'Sijil', kuantiti: 150, rujukan: 'PDH-V3-1', sebab: 'salah kira' }));
  const pair = ok(env.api(ADMIN, 'transaksi')).transaksi.filter(t => t.rujukan === 'PDH-V3-1');
  benar(pair.every(t => t.kuantiti === 150 && t.dikemaskiniOleh));
});
uji('Batal yang menyebabkan baki negatif ditolak (TL keluarkan stok pindahan dulu)', () => {
  ok(env.api(KTL, 'tambah', { tarikh: hariIni, lokasi: TL, item: 'Sijil', jenis: 'Pengeluaran Kursus', kuantiti: 100 }));
  ditolak(env.api(KUPK, 'batal', { id: idKeluar, sebab: 'pindahan dibatalkan' }), 'BAKI_TIDAK_CUKUP');
});
uji('Batal memerlukan sebab', () => ditolak(env.api(ADMIN, 'batal', { id: idKeluar, sebab: '' }), 'INPUT'));
uji('Batal pindahan oleh Admin (paksa): kedua-dua BATAL, tidak dipadam, dikecualikan dari baki', () => {
  const bilBaris = tx.getLastRow();
  ok(env.api(ADMIN, 'batal', { id: idKeluar, sebab: 'Pindahan ujian dibatalkan', paksa: true }));
  sama(tx.getLastRow(), bilBaris, 'tiada baris dipadam');
  const pair = ok(env.api(ADMIN, 'transaksi')).transaksi.filter(t => t.rujukan === 'PDH-V3-1');
  benar(pair.every(t => t.status === 'BATAL' && t.sebabBatal === 'Pindahan ujian dibatalkan'));
  ditolak(env.api(ADMIN, 'kemaskini', { id: idKeluar, tarikh: hariIni, item: 'Sijil', kuantiti: 1 }), 'DILARANG');
});
uji('Kerani PAD tidak boleh pindah rekod ke lokasi lain melalui edit', () => {
  const t = ok(env.api(KBD, 'transaksi')).transaksi.find(x => x.status === 'AKTIF' && x.jenis === 'Terima Pembekal');
  ok(env.api(KBD, 'kemaskini', { id: t.id, lokasi: TL, tarikh: t.tarikh, item: t.item, jenis: t.jenis, kuantiti: t.kuantiti }));
  sama(ok(env.api(ADMIN, 'transaksi')).transaksi.find(x => x.id === t.id).lokasi, BD);
});

console.log('\nFASA 1 — Audit & arkib');
uji('Audit merekod tambah, pindahan, kemaskini, batal, pengguna & akses', () => {
  const t = new Set(ok(env.api(ADMIN, 'audit')).log.map(l => l.tindakan));
  ['SETUP_V3', 'TAMBAH_PENGGUNA', 'KEMASKINI_PENGGUNA', 'AKSES_SISTEM', 'TAMBAH_TRANSAKSI', 'PINDAHAN_STOK', 'KEMASKINI_TRANSAKSI', 'BATAL_TRANSAKSI']
    .forEach(x => benar(t.has(x), x));
});
uji('Audit menyimpan nilai sebelum/selepas & sebab', () => {
  const l = ok(env.api(ADMIN, 'audit')).log.find(x => x.tindakan === 'KEMASKINI_TRANSAKSI' && x.sebab === 'salah kira');
  benar(JSON.parse(l.sebelum).kuantiti === 200 && JSON.parse(l.selepas).kuantiti === 150);
});
uji('Tiada tindakan API untuk ubah/padam audit atau padam transaksi', () => {
  ['padam', 'audit_padam', 'hapus'].forEach(a => ditolak(env.api(ADMIN, a, {}), 'TINDAKAN_TIDAK_SAH'));
});
uji('Arkib PDF: hanya PDF sah, direkod dalam ARKIB_LAPORAN; PAD tak boleh arkib laporan negeri', () => {
  const pdf = Buffer.from('%PDF-1.4 ujian').toString('base64');
  ditolak(env.api(KBD, 'upload_pdf', { lokasi: 'SEMUA', bulan: '2026-11', data: pdf }), 'DILARANG');
  ditolak(env.api(KBD, 'upload_pdf', { lokasi: BD, bulan: '2026-11', data: Buffer.from('<html>').toString('base64') }), 'INPUT');
  const r = ok(env.api(KBD, 'upload_pdf', { lokasi: BD, bulan: '2026-11', data: pdf }));
  benar(r.url.includes('drive.google.com'));
  sama(env.ss.getSheetByName('ARKIB_LAPORAN').getLastRow(), 2);
});
uji('Semak integriti mengesan baki negatif yang dipaksa', () => {
  const r = env.call('semakIntegriti');
  benar(r.baris.some(b => b.includes('Baki negatif') && b.includes('Beg')), r.baris.join(' / '));
});

console.log(`\n${lulus} lulus, ${gagal} gagal\n`);
process.exit(gagal ? 1 : 0);
