const { chromium } = require('playwright');
const OUT = process.argv[2] || require('path').join(__dirname, 'screenshot');
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch(); const ralat = [];
  const ctx = await b.newContext({ viewport: { width: 1366, height: 860 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => ralat.push(e.message)); p.on('console', m => { if (['error','warning'].includes(m.type()) && !/Failed to load|cdn.tailwindcss.com should not|in-browser Babel/.test(m.text())) ralat.push(m.text()); });
  await p.goto('file://' + require('path').join(__dirname, 'e-stok-v3-demo.html') + '');
  await p.waitForSelector('text=Stok Masuk & Keluar', { timeout: 60000 }); await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + '/01-admin.png' });
  // buka panel demo, tukar ke kerani BD
  await p.click('#demo-panel .pil'); await p.waitForTimeout(200);
  await p.screenshot({ path: OUT + '/02-panel.png' });
  await p.click('#demo-panel .u:has-text("Kerani PAD")');
  await p.waitForSelector('text=Log masuk PAD', { timeout: 60000 });
  await p.screenshot({ path: OUT + '/02b-log-masuk-pad.png' });
  await p.selectOption('select', 'Daerah Barat Daya');
  await p.fill('input[autocomplete=name]', 'Siti Aminah binti Yusof');
  await p.fill('input[autocomplete=current-password]', 'Demo2026pad');
  await p.click('button[type=submit]');
  await p.waitForSelector('text=Stok Masuk & Keluar', { timeout: 60000 });
  const lokasi = await p.textContent('main');
  console.log('Kerani nampak Barat Daya:', lokasi.includes('Daerah Barat Daya'), '· tiada tab Pengguna:', (await p.locator('aside button', { hasText: 'Pengguna' }).count()) === 0);
  // tambah transaksi & semak kekal selepas reload
  await p.locator('aside:visible button', { hasText: 'Transaksi' }).click();
  await p.fill('form input[type=number]', '7'); await p.fill('label:has-text("No. DO") + input', 'DEMO-UJI-1');
  await p.click('text=Simpan Transaksi'); await p.waitForSelector('text=disimpan');
  await p.reload(); await p.waitForSelector('text=Stok Masuk & Keluar', { timeout: 60000 });
  await p.locator('aside:visible button', { hasText: 'Transaksi' }).click();
  await p.waitForSelector('text=Ruj: DEMO-UJI-1', { timeout: 15000 }).catch(() => {});
  console.log('Data kekal selepas muat semula:', await p.locator('text=Ruj: DEMO-UJI-1').count() > 0);
  await p.screenshot({ path: OUT + '/03-kerani-transaksi.png' });
  // laporan PDF dalam demo
  await p.locator('aside:visible button', { hasText: 'Laporan' }).click();
  await p.click('text=PDF & Arkib'); await p.waitForSelector('text=Buka PDF di Google Drive', { timeout: 60000 });
  console.log('PDF dijana & pautan dipapar: ya');
  // tidak berdaftar
  // reset
  await p.click('#demo-panel .pil'); p.once('dialog', d => d.accept()); await p.click('#demo-panel .reset');
  await p.waitForSelector('text=Log masuk PAD', { timeout: 60000 });
  await p.click('#demo-panel .pil'); await p.click('#demo-panel .u:has-text("Muhammad Imran")');
  await p.waitForSelector('text=Stok Masuk & Keluar', { timeout: 60000 });
  await p.locator('aside:visible button', { hasText: 'Transaksi' }).click();
  console.log('Reset membuang data ujian:', await p.locator('text=Ruj: DEMO-UJI-1').count() === 0);
  // telefon
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await m.goto('file://' + require('path').join(__dirname, 'e-stok-v3-demo.html') + ''); await m.waitForSelector('text=Stok Masuk & Keluar', { timeout: 60000 }); await m.waitForTimeout(600);
  await m.screenshot({ path: OUT + '/04-telefon.png' });
  console.log('Lebar halaman telefon:', await m.evaluate(() => document.documentElement.scrollWidth));
  console.log(ralat.length ? 'RALAT:\n' + ralat.join('\n') : 'Tiada ralat konsol.');
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
