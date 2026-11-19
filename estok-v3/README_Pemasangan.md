# e-Stok JHEAIPP V3 — Fasa 0 & 1: Panduan Pemasangan

Sistem Pengurusan Inventori Bersepadu UPK & PAD. Platform: Google Apps Script HTML Service + Google Sheets sedia ada + Google Drive. Log masuk menggunakan **emel Google kerajaan**; tiada kata laluan disimpan dalam sistem.

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

| Peranan | Lihat | Rekod / edit / batal | Lain-lain |
|---|---|---|---|
| ADMIN_UPK | Semua lokasi | Semua lokasi, boleh paksa baki negatif (ditanda dalam audit) | Urus pengguna, jejak audit |
| KERANI_UPK | Semua lokasi | HQ sahaja, termasuk pindahan HQ ke PAD | — |
| PEMANTAU_UPK | Semua lokasi | Tiada | Laporan negeri |
| KERANI_PAD | Daerah sendiri | Daerah sendiri | — |
| PEGAWAI_PAD | Daerah sendiri | Tiada | Laporan daerah |

Semua peraturan ini disemak dalam Apps Script (`canView_`, `canWrite_` dalam `Auth.gs`) pada setiap panggilan. Menu yang disorok di skrin hanyalah paparan.

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
8. **Deploy > New deployment > Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone within [domain jabatan]**
   - Salin URL `/exec`.
9. Buka URL, daftar pengguna lain melalui tab **Pengguna**.
10. Semak helaian `TETAPAN`: senarai item, paras stok minimum (lajur Nilai 2), `NO_FAIL`, `FOLDER_ARKIB_ID`.

Jangan ubah atau padam Google Sheets V2 asal sehingga ujian penerimaan di bawah semuanya lulus.

## Ujian penerimaan (lakukan pada salinan)

- [ ] Bilangan baris TRANSAKSI sama sebelum dan selepas setup; nilai lajur A–L tidak berubah.
- [ ] Baki setiap item di setiap lokasi sama dengan V2.
- [ ] Admin pertama boleh buka sistem.
- [ ] Emel yang belum didaftar mendapat skrin "Akses tidak dibenarkan".
- [ ] Admin boleh daftar Kerani PAD; kerani boleh buka sistem dengan akaun Google sendiri.
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

`ujian-backend.js` menjalankan kod `.gs` sebenar dalam simulasi Apps Script (48 ujian: migrasi, akses, ketepatan baki, audit). `ujian-ui.js` menjalankan `Index.html` sebenar dalam Chromium dan disambungkan ke backend yang sama. Simulasi bukan Google sebenar, jadi ujian manual di atas tetap wajib.

## Perkara yang perlu diketahui

- **Emel pengguna** hanya boleh dibaca oleh skrip jika pengguna dan pemilik skrip berada dalam domain Google Workspace yang sama. Jika skrin menunjukkan "tidak dapat mengenal pasti akaun", semak tetapan deployment dan polisi admin Workspace.
- **Muat turun PDF** dari dalam HTML Service mungkin disekat oleh pelayar. Salinan PDF tetap disimpan ke Drive, dan pautan "Buka PDF di Google Drive" dipaparkan selepas laporan dijana.
- **Semakan baki** berdasarkan baki semasa keseluruhan, bukan baki pada tarikh transaksi. Rekod bertarikh lampau masih boleh menjadikan baki sejarah negatif seketika. Semak integriti akan melaporkan baki akhir negatif.
- **Rekod pindahan V2** tiada pautan pasangan. Ia dikira dengan betul dalam baki, tetapi dalam paparan negeri ia muncul sebagai masuk dan keluar.
- **Paras stok minimum** kini satu nilai untuk semua lokasi. Paras berbeza bagi HQ dan PAD boleh ditambah dalam fasa seterusnya.
- **Belum termasuk dalam fasa ini**: pengesahan terima pindahan (Fasa 3), permohonan & kelulusan (Fasa 4, menunggu borang), eksport Excel (Fasa 5), notifikasi emel (Fasa 6).
