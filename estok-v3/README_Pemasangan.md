# e-Stok JHEAIPP V3 — Fasa 0 & 1: Panduan Pemasangan

Sistem Pengurusan Inventori Bersepadu UPK & PAD. Platform: Google Apps Script HTML Service + Google Sheets sedia ada + Google Drive.

Dua cara log masuk, satu kod, dua pautan:

| Pengguna | Pautan | Cara log masuk |
|---|---|---|
| Staf UPK (Admin, Kerani UPK, Pemantau) | Pautan UPK | Emel Google kerajaan, didaftarkan dalam tab Pengguna |
| Kerani PAD | Pautan PAD | Pilih daerah, isi nama penuh, masukkan kata laluan daerah |

## Kandungan pakej

| Fail dalam Apps Script | Sumber | Fungsi |
|---|---|---|
| `Code.gs` | `src/Code.gs` | Konfigurasi, `doGet()`, menu Sheet, penghala `api()` |
| `Database.gs` | `src/Database.gs` | Struktur helaian, akses Sheets, migrasi `setupV3()`, `semakIntegriti()` |
| `Auth.gs` | `src/Auth.gs` | Identiti emel, peranan, kebenaran, pengurusan pengguna, `setupFirstAdmin()` |
| `Inventory.gs` | `src/Inventory.gs` | Transaksi: tambah, pindahan, kemaskini, batal, semakan baki |
| `Audit.gs` | `src/Audit.gs` | Jejak audit (tambah sahaja) |
| `Drive.gs` | `src/Drive.gs` | Arkib PDF ke Drive + `ARKIB_LAPORAN` |
| `Index` (HTML) | `src/Index.html` | Antara muka React |
| `appsscript.json` | `src/appsscript.json` | Manifest: zon masa, akses web app |

## Peranan

| Peranan | Log masuk | Lihat | Rekod / edit / batal | Lain-lain |
|---|---|---|---|---|
| ADMIN_UPK | Emel | Semua lokasi | Semua lokasi, boleh paksa baki negatif (ditanda dalam audit) | Urus staf UPK, kata laluan daerah, jejak audit |
| KERANI_UPK | Emel | Semua lokasi | HQ sahaja, termasuk pindahan HQ ke PAD | — |
| PEMANTAU_UPK | Emel | Semua lokasi | Tiada | Laporan negeri |
| KERANI_PAD | Kata laluan daerah + nama | Daerah sendiri | Daerah sendiri | — |

Semua peraturan disemak dalam Apps Script (`canView_`, `canWrite_` dalam `Auth.gs`) pada setiap panggilan.

### Kawalan kata laluan daerah

- Kata laluan disimpan sebagai hash SHA-256 bersalt (+ pepper) dalam **Script Properties**, bukan dalam Sheet.
- Hanya Admin UPK boleh tetapkan atau tukar (tab Pengguna → Akaun Daerah). Pilihan "Jana automatik" memaparkan kata laluan sekali sahaja.
- Nama penuh wajib setiap kali log masuk dan direkod pada setiap transaksi dan dalam jejak audit.
- 5 cubaan salah → daerah dikunci 15 minit. Admin boleh buka kunci dengan menetapkan semula kata laluan.
- Sesi tamat selepas 2 jam tanpa aktiviti atau 8 jam secara mutlak.
- Menukar kata laluan atau menyahaktif daerah menamatkan semua sesi daerah itu serta-merta.
- Tukar kata laluan bila kerani bertukar, atau setiap 3–6 bulan.

## Langkah pemasangan (buat pada SALINAN dahulu)

1. **Salin Google Sheets V2**: File > Make a copy. Namakan `e-STOK JHEAIPP V3 TESTING`. Pastikan salinan dimiliki **akaun emel kerajaan** (bukan Gmail peribadi).
2. **Zon masa Sheet**: File > Settings > Time zone = `(GMT+08:00) Kuala Lumpur`.
3. Dari salinan: **Extensions > Apps Script**.
   - Project Settings > tanda "Show appsscript.json manifest file". Tampal `src/appsscript.json`.
   - Padam kandungan `Code.gs` lama, tampal `src/Code.gs`.
   - Tambah fail skrip: `Database`, `Auth`, `Inventory`, `Audit`, `Drive` (tampal fail `.gs` yang sepadan).
   - Tambah fail HTML bernama tepat `Index`, tampal `src/Index.html`.
   - Simpan.
4. Muat semula tab Google Sheets. Menu **e-Stok V3** akan muncul.
5. **e-Stok V3 > 1. Setup / migrasi V3**. Beri kebenaran yang diminta. Laporan akan dipaparkan:
   - sandaran `BACKUP_TRANSAKSI_yyyyMMdd_HHmm` dibuat,
   - lajur baharu ditambah di hujung TRANSAKSI (lajur asal tidak diubah),
   - ID `LGC-…` dijana untuk rekod lama tanpa ID,
   - helaian `PENGGUNA`, `AUDIT_LOG`, `TETAPAN`, `ARKIB_LAPORAN` dicipta.
6. **e-Stok V3 > Semak integriti data**. Baca isu yang dilaporkan (item/lokasi tidak dikenali, tarikh rosak, baki negatif). Betulkan dalam Sheet jika perlu, kemudian jalankan semula.
7. **e-Stok V3 > 2. Daftar saya sebagai Admin pertama**. Emel anda didaftar sebagai ADMIN_UPK dan domain emel dikunci.
8. **Deployment 1, pautan UPK**: Deploy > New deployment > Web app
   - Description: `e-Stok UPK`
   - Execute as: **Me**
   - Who has access: **Anyone within [domain jabatan]**
   - Salin URL `/exec`. Ini pautan untuk staf UPK sahaja.
9. **Deployment 2, pautan PAD**: Deploy > New deployment > Web app (sekali lagi)
   - Description: `e-Stok PAD`
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Salin URL `/exec`. Ini pautan untuk kerani PAD.
   - Nota: setiap deployment mempunyai tetapan akses sendiri. Sahkan dengan membuka pautan PAD dalam tetingkap inkognito (tanpa log masuk Google): skrin "Log masuk PAD" mesti muncul.
   - Bila kod dikemas kini kemudian: Deploy > Manage deployments > Edit **kedua-dua** deployment > Version: New version.
10. Buka pautan UPK. Dalam tab **Pengguna**:
    - daftar staf UPK lain (emel),
    - tetapkan kata laluan bagi setiap daerah di bahagian **Akaun Daerah**, dan serahkan kepada kerani melalui saluran rasmi.
11. Semak helaian `TETAPAN`: senarai item, paras stok minimum (lajur Nilai 2), `NO_FAIL`, `FOLDER_ARKIB_ID`.

Jangan ubah atau padam Google Sheets V2 asal sehingga ujian penerimaan di bawah semuanya lulus.

## Ujian penerimaan (lakukan pada salinan)

- [ ] Bilangan baris TRANSAKSI sama sebelum dan selepas setup; nilai lajur A–L tidak berubah.
- [ ] Baki setiap item di setiap lokasi sama dengan V2.
- [ ] Admin pertama boleh buka sistem.
- [ ] Pautan PAD dibuka dalam inkognito → skrin "Log masuk PAD".
- [ ] Admin boleh tetapkan kata laluan setiap daerah; kata laluan tidak kelihatan dalam mana-mana helaian Sheet.
- [ ] Kerani PAD boleh log masuk dengan kata laluan daerah + nama; nama itu muncul pada transaksi dan jejak audit.
- [ ] Kata laluan salah 5 kali → daerah dikunci; daerah lain tidak terjejas.
- [ ] Tukar kata laluan → kerani yang sedang log masuk terkeluar.
- [ ] Kerani PAD hanya nampak daerah sendiri.
- [ ] Kerani PAD tidak boleh rekod stok untuk daerah lain.
- [ ] Transaksi keluar yang melebihi baki ditolak.
- [ ] Pindahan HQ ke PAD mencipta dua rekod, dan baki kedua-dua lokasi betul.
- [ ] Pembatalan memerlukan sebab; rekod kekal dalam Sheet dengan status BATAL.
- [ ] Jejak audit merekod semua tindakan di atas.
- [ ] Laporan bulan lepas menunjukkan baki pada akhir bulan tersebut (bukan baki hari ini).
- [ ] PDF disimpan dalam folder Drive dan direkod dalam ARKIB_LAPORAN.
- [ ] Sistem berfungsi di telefon Android dan PC.

## Ujian automatik (untuk pembangun)

```bash
node estok-v3/ujian/ujian-backend.js
node estok-v3/ujian/ujian-ui.js
```

`ujian-backend.js` menjalankan kod `.gs` sebenar dalam simulasi Apps Script (61 ujian: migrasi, akses, log masuk PAD, ketepatan baki, audit). `ujian-ui.js` menjalankan `Index.html` sebenar dalam Chromium dan disambungkan ke backend yang sama. Simulasi bukan Google sebenar, jadi ujian manual di atas tetap wajib.

## Perkara yang perlu diketahui

- **Emel staf UPK** hanya boleh dibaca oleh skrip jika pengguna dan pemilik skrip berada dalam domain Google Workspace yang sama. Jika staf UPK nampak skrin "Log masuk PAD" pada pautan UPK, emelnya belum didaftarkan atau tetapan deployment perlu disemak.
- **Pautan PAD terbuka kepada umum** (sesiapa yang ada pautan boleh lihat skrin log masuk). Kawalan sebenar ialah kata laluan, had cubaan dan token sesi di server. Jangan siarkan pautan PAD di laman awam.
- **Akauntabiliti PAD** bergantung pada nama yang ditaip. Sistem tahu daerah mana yang merekod, tetapi tidak dapat mengesahkan identiti individu.
- **Kelajuan log masuk PAD**: hash diulang 500 kali (`PAD_CFG.HASH_ITERASI` dalam `Auth.gs`). Jika log masuk mengambil lebih 3 saat dalam Apps Script sebenar, turunkan nilai ini dan tetapkan semula semua kata laluan daerah.
- **Muat turun PDF** dari dalam HTML Service mungkin disekat oleh pelayar. Salinan PDF tetap disimpan ke Drive, dan pautan "Buka PDF di Google Drive" dipaparkan selepas laporan dijana.
- **Semakan baki** berdasarkan baki semasa keseluruhan, bukan baki pada tarikh transaksi. Rekod bertarikh lampau masih boleh menjadikan baki sejarah negatif seketika. Semak integriti akan melaporkan baki akhir negatif.
- **Rekod pindahan V2** tiada pautan pasangan. Ia dikira dengan betul dalam baki, tetapi dalam paparan negeri ia muncul sebagai masuk dan keluar.
- **Paras stok minimum** kini satu nilai untuk semua lokasi. Paras berbeza bagi HQ dan PAD boleh ditambah dalam fasa seterusnya.
- **Belum termasuk dalam fasa ini**: pengesahan terima pindahan (Fasa 3), permohonan & kelulusan (Fasa 4, menunggu borang), eksport Excel (Fasa 5), notifikasi emel (Fasa 6).
