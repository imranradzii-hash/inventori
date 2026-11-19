/**
 * Audit.gs — jejak audit. Hanya boleh DITAMBAH melalui writeAuditLog_().
 * Tiada fungsi API untuk mengubah atau memadam log. Helaian AUDIT_LOG dilindungi (pemilik sahaja).
 */

function writeAuditLog_(u, tindakan, jenisRekod, idRekod, sebelum, selepas, sebab) {
  const sh = sheet_(SH.AUDIT);
  const json = o => (o == null ? '' : safe_(JSON.stringify(o)).slice(0, 45000));
  sh.appendRow([
    nowStr_(), safe_(u.emel || ''), safe_(u.nama || ''), u.peranan || '', safe_(u.lokasi || ''),
    tindakan, jenisRekod || '', safe_(idRekod || ''), json(sebelum), json(selepas), safe_(sebab || '')
  ]);
}

function getAuditLog_(u, p) {
  if (!PERANAN[u.peranan].audit) throw new AppError_('DILARANG', 'Jejak audit terhad kepada Admin UPK.');
  const sh = sheet_(SH.AUDIT);
  const last = sh.getLastRow();
  if (last < 2) return { log: [] };
  const had = Math.min(Number(p && p.had) || 500, 2000);
  const mula = Math.max(2, last - had + 1);
  const rows = sh.getRange(mula, 1, last - mula + 1, HEADERS.AUDIT.length).getValues();
  const log = rows.reverse().map(r => ({
    masa: toDateTimeStr_(r[0]), emel: String(r[1]), nama: String(r[2]), peranan: String(r[3]), lokasi: String(r[4]),
    tindakan: String(r[5]), jenisRekod: String(r[6]), idRekod: String(r[7]), sebelum: String(r[8]), selepas: String(r[9]), sebab: String(r[10])
  }));
  return { log: log };
}
