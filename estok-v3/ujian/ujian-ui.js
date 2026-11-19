/**
 * Ujian UI hujung-ke-hujung: Index.html sebenar + backend .gs sebenar (melalui gas-mock),
 * disambung dengan google.script.run tiruan. Jalankan: node estok-v3/ujian/ujian-ui.js [folderOutput]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { createEnv, seedV2 } = require('./gas-mock');
const OUT = process.argv[2] || path.join(__dirname, 'screenshot');
fs.mkdirSync(OUT, { recursive: true });

const ADMIN = 'imran@jheaipp.gov.my', KUPK = 'yasmin@jheaipp.gov.my', PEMANTAU = 'pemantau@jheaipp.gov.my';
const HQ = 'UPK BUUKI (HQ)', BD = 'Daerah Barat Daya';
const env = createEnv(); seedV2(env); env.call('setupV3'); env.call('setupFirstAdmin');
const must = r => { if (!r.ok) throw new Error(r.mesej); return r.data; };
must(env.api(ADMIN, 'pengguna_simpan', { emel: ADMIN, nama: 'En. Muhammad Imran bin Mohamed Radzi', jawatan: 'Penolong Pegawai Hal Ehwal Islam', peranan: 'ADMIN_UPK', lokasi: HQ, status: 'AKTIF' }));
must(env.api(ADMIN, 'pengguna_simpan', { baru: true, emel: KUPK, nama: 'Ustazah Yasmin binti Hamdan', peranan: 'KERANI_UPK', lokasi: HQ }));
must(env.api(ADMIN, 'pengguna_simpan', { baru: true, emel: PEMANTAU, nama: 'Ahmad Faiz bin Osman', jawatan: 'Penolong Pengarah', peranan: 'PEMANTAU_UPK' }));
['Daerah Seberang Perai Tengah', 'Daerah Seberang Perai Selatan', BD, 'Daerah SPU (Butterworth)', 'Daerah SPU (Kepala Batas)', 'Daerah Timur Laut'].forEach(l => must(env.api(ADMIN, 'pad_tetapkan', { lokasi: l, kataLaluan: 'Demo2026pad' })));
const KBD = must(env.api('', 'login_pad', { lokasi: BD, kataLaluan: 'Demo2026pad', nama: 'Siti Aminah binti Yusof' })).token;
const LOK = ['Daerah Seberang Perai Tengah', 'Daerah Seberang Perai Selatan', BD, 'Daerah SPU (Butterworth)', 'Daerah SPU (Kepala Batas)', 'Daerah Timur Laut'];
const d = (m, dd) => `2026-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
['Sijil', 'Buku Gerbang Perkahwinan', 'Beg', 'Pen', 'Buku Nota'].forEach(it => must(env.api(KUPK, 'tambah', { tarikh: d(9, 2), lokasi: HQ, item: it, jenis: 'Terima Pembekal', kuantiti: 3000, rujukan: 'DO-2026-118' })));
must(env.api(KUPK, 'tambah', { tarikh: d(9, 2), lokasi: HQ, item: 'Mineral (Karton)', jenis: 'Terima Pembekal', kuantiti: 40, rujukan: 'DO-2026-119' }));
LOK.forEach((l, k) => ['Sijil', 'Buku Gerbang Perkahwinan', 'Beg', 'Pen'].forEach(it => must(env.api(KUPK, 'pindahan', { tarikh: d(10, 1 + k), lokasi: HQ, lokasiPenerima: l, item: it, kuantiti: 250 + k * 10, rujukan: 'PDH/' + (k + 1) }))));
LOK.forEach((l, k) => ['Sijil', 'Buku Gerbang Perkahwinan', 'Beg'].forEach(it => must(env.api(ADMIN, 'tambah', { tarikh: d(11, 3 + k), lokasi: l, item: it, jenis: 'Pengeluaran Kursus', kuantiti: 110 + k * 12, siriKursus: `Siri ${20 + k}/2026`, jumlahPeserta: 110 + k * 12 }))));
must(env.pad(KBD, 'tambah', { tarikh: d(11, 17), lokasi: BD, item: 'Pen', jenis: 'Pengeluaran Kursus', kuantiti: 120, siriKursus: 'Siri 31/2026', jumlahPeserta: 118 }));
const salah = must(env.pad(KBD, 'tambah', { tarikh: d(11, 18), lokasi: BD, item: 'Beg', jenis: 'Pelarasan (-)', kuantiti: 10, catatan: 'Beg rosak' })).transaksi.find(t => t.catatan === 'Beg rosak');
must(env.pad(KBD, 'batal', { id: salah.id, sebab: 'Rekod berganda, sudah direkod semalam' }));
must(env.api(ADMIN, 'tambah', { tarikh: d(11, 12), lokasi: HQ, item: 'Mineral (Karton)', jenis: 'Pengeluaran Kursus', kuantiti: 36, siriKursus: 'Siri 30/2026', jumlahPeserta: 180 }));

const ralat = [];
(async () => {
  const browser = await chromium.launch();
  async function buka(emel, vp) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on('pageerror', e => ralat.push(`[${emel}] ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) ralat.push(`[${emel}] console: ${m.text()}`); });
    await p.exposeFunction('__gasApi', json => { env.emelAktif = emel; return env.ctx.api(json); });
    await p.addInitScript(() => {
      const runner = (ok, fail) => new Proxy({}, { get: (_, k) => {
        if (k === 'withSuccessHandler') return f => runner(f, fail);
        if (k === 'withFailureHandler') return f => runner(ok, f);
        return (...a) => window.__gasApi(...a).then(r => setTimeout(() => ok && ok(r), 60)).catch(e => fail && fail(e));
      } });
      window.google = { script: { run: runner(null, null) } };
    });
    await p.goto('file://' + path.join(__dirname, '..', 'src', 'Index.html'));
    return p;
  }
  const tab = async (p, nama) => {
    const hamburger = p.locator('button[aria-label="Menu"]');
    if (await hamburger.isVisible()) await hamburger.click();
    await p.locator('aside:visible button', { hasText: nama }).first().click();
  };
  const shot = async (p, n) => { await p.waitForTimeout(500); await p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: true }); };
  const semak = (syarat, mesej) => { if (!syarat) ralat.push('SEMAKAN GAGAL: ' + mesej); };

  // Admin
  let p = await buka(ADMIN, { width: 1366, height: 860 });
  await p.waitForSelector('text=Stok Masuk & Keluar', { timeout: 60000 });
  await shot(p, '01-admin-papan-pemuka');
  await tab(p, 'Transaksi'); await p.waitForSelector('text=Senarai Transaksi');
  await shot(p, '02-admin-transaksi');
  await p.locator('label:has-text("Papar dibatal")').click();
  await p.waitForTimeout(400);
  semak(await p.locator('text=Rekod berganda, sudah direkod semalam').count() > 0, 'rekod batal dipapar dengan sebab');
  // cuba keluarkan melebihi baki → dialog paksa
  await p.selectOption('form select >> nth=0', BD);
  await p.selectOption('form select >> nth=1', 'Beg');
  await p.selectOption('form select >> nth=2', 'Pelarasan (-)');
  await p.fill('form input[type=number]', '99999');
  await p.click('text=Simpan Transaksi');
  await p.waitForSelector('text=Paksa simpan');
  await shot(p, '03-admin-amaran-baki');
  await p.click('button:has-text("Batal") >> nth=-1');
  await p.fill('header input[placeholder^="Cari"]', 'PDH/3'); await p.press('header input[placeholder^="Cari"]', 'Enter');
  await p.waitForSelector('text=Senarai Transaksi (8)');
  await tab(p, 'Laporan Bulanan'); await p.waitForSelector('#laporan-cetak');
  await shot(p, '04-admin-laporan-negeri');
  await tab(p, 'Pengguna'); await p.waitForSelector('text=Akaun Daerah');
  await p.click('text=Daftar staf');
  await shot(p, '05-admin-pengguna');
  await tab(p, 'Jejak Audit'); await p.waitForSelector('td >> text=BATAL_TRANSAKSI');
  await shot(p, '06-admin-jejak-audit');

  // Pengurusan kata laluan daerah (Admin)
  p = await buka(ADMIN, { width: 1366, height: 860 });
  await p.waitForSelector('text=Stok Masuk & Keluar', { timeout: 60000 });
  await tab(p, 'Pengguna'); await p.waitForSelector('text=Akaun Daerah');
  await p.locator('tr', { hasText: 'Daerah Timur Laut' }).locator('button', { hasText: 'Tukar' }).click();
  await p.click('button:has-text("Simpan")');
  await p.waitForSelector('text=tidak akan dipaparkan lagi');
  const kataTL = (await p.textContent('code')).trim();
  semak(/^[A-Za-z0-9]{10}$/.test(kataTL), 'kata laluan jana: ' + kataTL);
  await shot(p, '12-admin-kata-laluan-daerah');

  // Kerani PAD log masuk dengan kata laluan daerah (telefon, tiada emel)
  p = await buka('', { width: 390, height: 844 });
  await p.waitForSelector('text=Log masuk PAD', { timeout: 60000 });
  await p.selectOption('select', BD);
  await p.fill('input[autocomplete=name]', 'Siti Aminah binti Yusof');
  await p.fill('input[autocomplete=current-password]', 'SalahSalah1');
  await p.click('button[type=submit]');
  await p.waitForSelector('text=Kata laluan tidak sah');
  await shot(p, '13-pad-log-masuk-salah');
  await p.fill('input[autocomplete=current-password]', 'Demo2026pad');
  await p.click('button[type=submit]');
  await p.waitForSelector('text=Stok Masuk & Keluar', { timeout: 60000 });
  semak((await p.textContent('header')).includes('SITI AMINAH'), 'nama PAD dalam header');
  semak(await p.locator('aside button', { hasText: 'Pengguna' }).count() === 0, 'kerani tiada tab Pengguna');
  semak(await p.locator('aside button', { hasText: 'Jejak Audit' }).count() === 0, 'kerani tiada tab Audit');
  await shot(p, '07-kerani-pad-telefon-papan-pemuka');
  await tab(p, 'Transaksi'); await p.waitForSelector('text=Senarai Transaksi');
  await p.fill('form input[type=number]', '25');
  await p.click('text=Simpan Transaksi');
  await p.waitForSelector('text=disimpan');
  await shot(p, '08-kerani-pad-telefon-transaksi');
  await p.locator('button[title="Batalkan"]').first().click();
  await p.fill('.fixed textarea', 'Salah item');
  await shot(p, '09-kerani-pad-dialog-batal');
  await p.click('text=Batalkan rekod >> nth=-1');
  await p.waitForSelector('text=Rekod dibatalkan');
  semak(env.ss.getSheetByName('TRANSAKSI').data.some(r => String(r[10]).startsWith('SITI AMINAH BINTI YUSOF')), 'nama kerani direkod dalam Sheet');
  // log keluar
  await p.locator('header button[title="Log keluar"]').click();
  await p.click('button:has-text("Log keluar") >> nth=-1');
  await p.waitForSelector('text=Log masuk PAD');

  // Pemantau UPK (paparan sahaja)
  p = await buka(PEMANTAU, { width: 1280, height: 800 });
  await p.waitForSelector('text=Stok Masuk & Keluar', { timeout: 60000 });
  await tab(p, 'Transaksi'); await p.waitForSelector('text=Akaun paparan sahaja');
  semak(await p.locator('button[title="Batalkan"]').count() === 0, 'pemantau tiada butang batal');
  await shot(p, '10-pemantau-paparan-sahaja');

  // Tidak berdaftar
  p = await buka('orang.baru@jheaipp.gov.my', { width: 1280, height: 720 });
  await p.waitForSelector('text=Log masuk PAD', { timeout: 60000 });
  await shot(p, '11-log-masuk-pad-desktop');

  await browser.close();
  const logAkhir = must(env.api(ADMIN, 'audit')).log.slice(0, 3).map(l => l.tindakan).join(', ');
  console.log('Audit terkini:', logAkhir);
  if (ralat.length) { console.log('RALAT:\n' + ralat.join('\n')); process.exit(1); }
  console.log('UI: semua senario lulus. Screenshot di ' + OUT);
})().catch(e => { console.error(e); console.log(ralat.join('\n')); process.exit(1); });
