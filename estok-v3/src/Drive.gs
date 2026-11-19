/**
 * Drive.gs — arkib laporan PDF ke Google Drive dan rekod dalam ARKIB_LAPORAN.
 */

function uploadToDrive_(u, p) {
  const lokasi = clean_(p.lokasi);
  if (lokasi === 'SEMUA') {
    if (!PERANAN[u.peranan].lihatSemua) throw new AppError_('DILARANG', 'Anda tiada akses kepada laporan keseluruhan.');
  } else if (!canView_(u, lokasi)) {
    throw new AppError_('DILARANG', 'Anda tiada akses kepada laporan ' + lokasi + '.');
  }
  const bulan = clean_(p.bulan);
  if (!/^\d{4}-\d{2}$/.test(bulan)) throw new AppError_('INPUT', 'Bulan laporan tidak sah.');
  const data = String(p.data || '');
  if (data.length > 14 * 1024 * 1024) throw new AppError_('INPUT', 'Fail terlalu besar (maksimum 10MB).');
  const bytes = Utilities.base64Decode(data);
  // Semak tandatangan fail PDF ("%PDF")
  if (bytes.length < 4 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
    throw new AppError_('INPUT', 'Fail bukan PDF yang sah.');
  }
  const namaLokasi = lokasi === 'SEMUA' ? 'KESELURUHAN' : lokasi;
  const namaFail = (namaLokasi + ' - Laporan Stok ' + bulan + ' - ' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd-HHmm') + '.pdf')
    .replace(/[\\/:*?"<>|]/g, '-');
  const folderId = getSettings_().konfig.FOLDER_ARKIB_ID || APP.FOLDER_ARKIB_ASAL;
  const fail = DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(bytes, 'application/pdf', namaFail));
  fail.setDescription('Dijana oleh ' + u.nama + ' (' + u.emel + ') melalui ' + APP.NAMA);
  sheet_(SH.ARKIB).appendRow([nowStr_(), safe_(namaLokasi), bulan, safe_(namaFail), fail.getUrl(), fail.getId(), safe_(u.emel)]);
  writeAuditLog_(u, 'ARKIB_LAPORAN', 'LAPORAN', fail.getId(), null, { namaFail: namaFail, lokasi: namaLokasi, bulan: bulan }, '');
  return { url: fail.getUrl(), namaFail: namaFail };
}
