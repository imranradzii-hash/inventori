const SHEET_NAME = "TRANSAKSI";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // ==========================================
    // FUNGSI 1: MUAT NAIK PDF KE GOOGLE DRIVE
    // ==========================================
    if (data.action === "upload_pdf") {
      // ID Folder Drive Tuan
      const targetFolderId = "1QNIzaUx8kgbMTPlpej8CCBKnDO0OKeoz";
      const folder = DriveApp.getFolderById(targetFolderId);

      // Tukar data kembali menjadi fail PDF dan simpan ke Drive
      const failPDF = Utilities.newBlob(Utilities.base64Decode(data.fileData), "application/pdf", data.filename);
      folder.createFile(failPDF);

      return ContentService.createTextOutput(JSON.stringify({ "status": "berjaya_upload" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // FUNGSI 2: SIMPAN / KEMASKINI / PADAM DATA DI SHEET
    // ==========================================
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const rows = sheet.getDataRange().getValues();

    if (data.action === "padam") {
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][9] == data.id) {
          sheet.deleteRow(i + 1);
          return ContentService.createTextOutput(JSON.stringify({ "status": "berjaya_padam" })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ "status": "gagal_padam", "mesej": "ID tidak dijumpai" })).setMimeType(ContentService.MimeType.JSON);
    }

    else if (data.action === "kemaskini") {
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][9] == data.id) {
          const arahStok = ["Terima Pembekal", "Pindahan Masuk", "Pelarasan (+)"].includes(data.jenis) ? "Masuk" : "Keluar";
          sheet.getRange(i + 1, 1, 1, 12).setValues([[
            data.tarikh, data.lokasi, data.item, data.jenis, arahStok, data.kuantiti,
            data.siriKursus || "", data.jumlahPeserta || "", data.rujukan || "", data.id, data.direkodOleh || "", data.catatan || ""
          ]]);
          return ContentService.createTextOutput(JSON.stringify({ "status": "berjaya_kemaskini" })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    else if (data.action === "pindahan_pintar") {
      sheet.appendRow([data.tarikh, data.lokasiPenghantar, data.item, "Pindahan Keluar", "Keluar", data.kuantiti, data.siriKursus || "", data.jumlahPeserta || "", data.rujukan || "", data.id1, data.direkodOleh || "", data.catatan || ""]);
      sheet.appendRow([data.tarikh, data.lokasiPenerima, data.item, "Pindahan Masuk", "Masuk", data.kuantiti, data.siriKursus || "", data.jumlahPeserta || "", data.rujukan || "", data.id2, data.direkodOleh || "", data.catatan || ""]);
      return ContentService.createTextOutput(JSON.stringify({ "status": "berjaya_pindahan" })).setMimeType(ContentService.MimeType.JSON);
    }

    else {
      const arahStok = ["Terima Pembekal", "Pindahan Masuk", "Pelarasan (+)"].includes(data.jenis) ? "Masuk" : "Keluar";
      sheet.appendRow([data.tarikh, data.lokasi, data.item, data.jenis, arahStok, data.kuantiti, data.siriKursus || "", data.jumlahPeserta || "", data.rujukan || "", data.id, data.direkodOleh || "", data.catatan || ""]);
      return ContentService.createTextOutput(JSON.stringify({ "status": "berjaya_tambah" })).setMimeType(ContentService.MimeType.JSON);
    }

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ "status": "gagal", "mesej": error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// FUNGSI 3: HANTAR DATA KE SISTEM WEB (UI)
// ==========================================
function doGet() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const rows = sheet.getDataRange().getValues();
    const dataRows = rows.slice(1);

    const jsonData = dataRows.map(row => {
      if (!row[0]) return null;
      return {
        tarikh: row[0],
        lokasi: row[1],
        item: row[2],
        jenis: row[3],
        arah: row[4],
        kuantiti: row[5],
        siriKursus: row[6],
        jumlahPeserta: row[7],
        rujukan: row[8],
        id: row[9] || "",
        direkodOleh: row[10] || "",
        catatan: row[11] || ""
      };
    }).filter(item => item !== null);

    return ContentService.createTextOutput(JSON.stringify(jsonData)).setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  }
}
function benarkanDrive() {
  DriveApp.getFiles();
}
