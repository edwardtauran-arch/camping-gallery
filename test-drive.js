const { google } = require('googleapis');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

// AMBIL FOLDER ID DARI DATA YANG KAMU MASUKKAN
const FOLDER_ID = "1TywYGyMy1rWrxk8tWhcusxOeACAwx4QG"; 

const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

if (!credentialsJson) {
  console.log("❌ ERROR: GOOGLE_SERVICE_ACCOUNT_KEY di .env.local masih kosong!");
  process.exit(1);
}

try {
  const credentials = JSON.parse(credentialsJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });

  console.log("⏳ Sedang mengetuk pintu Google Drive...");
  
  drive.files.list({
    q: `'${FOLDER_ID}' in parents and mimeType contains 'image/' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 5,
  }).then(res => {
    const files = res.data.files || [];
    if (files.length === 0) {
      console.log("⚠️ KONEKSI SUKSES! Tapi tidak ada foto langsung di folder ini. Cek apakah fotonya tersembunyi di dalam subfolder lagi.");
    } else {
      console.log(`✅ BERHASIL TOTAL! Menemukan ${files.length} foto. Contoh file:`, files[0].name);
    }
    process.exit(0);
  }).catch(err => {
    console.log("❌ GOOGLE DRIVE ERROR, INI PENYEBABNYA:");
    console.error("- Pesan Error:", err.message);
    if (err.response && err.response.data) {
      console.error("- Detail dari Google:", JSON.stringify(err.response.data.error));
    }
    process.exit(1);
  });
} catch (e) {
  console.log("❌ ERROR: Format JSON di GOOGLE_SERVICE_ACCOUNT_KEY rusak atau salah ketik!", e.message);
  process.exit(1);
}
