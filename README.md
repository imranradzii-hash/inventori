# Sistem e-Stok JHEAIPP — V3

Sistem rekod stok Kursus Praperkahwinan Islam (UPK BUUKI + 6 pejabat agama daerah).

| Fail | Fungsi |
|---|---|
| `index.html` | Frontend (React + Tailwind melalui CDN) |
| `apps-script/Code.gs` | Backend Google Apps Script (tampal dalam editor Apps Script Google Sheet) |
| `apps-script/appsscript.json` | Manifest (zon masa Asia/Kuala_Lumpur) |
| `v2-asal/Code.gs` | Backend V2 asal, untuk rujukan / rollback |
| `docs/preview/` | Tangkapan skrin preview (data contoh) |

## Peranan

| | SUPERADMIN (En. Imran) | HQ | DAERAH |
|---|---|---|---|
| Lihat lokasi | Semua | Semua | Lokasi sendiri |
| Tambah transaksi | Semua lokasi | Semua lokasi | Lokasi sendiri |
| Edit / padam | **Semua rekod** | Rekod sendiri | Rekod sendiri |
| Pindah rekod ke lokasi lain | Ya | Tidak | Tidak |
| Paksa keluar melebihi baki | Ya (dengan amaran) | Tidak | Tidak |
| Log audit, tetapan item & paras minimum, No. Fail | Ya | Tidak | Tidak |

Peraturan ini dikuatkuasa di **server** (`bolehLihatLokasi_`, `bolehUbahRekod_` dalam `Code.gs`), bukan setakat sorok butang.

## Langkah deploy (sekali sahaja)

1. Backup Google Sheet dahulu (File > Make a copy).
2. Dalam sheet `TRANSAKSI`, tambah tajuk kolum M, N, O: `Dikemaskini Oleh`, `Dikemaskini Pada`, `Pasangan`.
3. Buka Extensions > Apps Script. Ganti kandungan `Code.gs` dengan `apps-script/Code.gs`.
   Project Settings > tandakan "Show appsscript.json" dan tampal `apps-script/appsscript.json`.
4. Dalam fungsi `SETUP_kataLaluan()`, isi dua kata laluan (umum & admin, mesti berbeza). Pilih fungsi itu > Run.
   Selepas berjaya, **padam semula nilai kata laluan** dari kod dan simpan.
5. Run `benarkanDrive()` sekali untuk beri kebenaran Drive.
6. Deploy > Manage deployments > Edit > Version: New version > Deploy. URL `/exec` kekal sama.
7. Upload `index.html` baharu ke hosting sedia ada.

Kata laluan V2 (`BUUKI2026`) tidak lagi digunakan dan perlu dianggap bocor kerana ia pernah berada dalam kod HTML.
