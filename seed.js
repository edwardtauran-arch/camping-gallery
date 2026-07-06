const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables dari .env.local
dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI tidak ditemukan di .env.local');
  process.exit(1);
}

// Skema sederhana untuk insert
const EventSchema = new mongoose.Schema({
  title: String,
  slug: String,
  driveFolderId: String,
  date: Date,
  description: String,
});

const Event = mongoose.models.Event || mongoose.model('Event', EventSchema);

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('🔌 Berhasil terkoneksi ke MongoDB Atlas...');

    // JANGAN LUPA: Ganti 'PASTE_FOLDER_ID_KAMU' dengan ID Folder Google Drive asli kamu!
    const newEvent = new Event({
      title: "Camping Ceria Lembah Fatamorgana",
      slug: "lembah-fatamorgana",
      driveFolderId: "1TywYGyMy1rWrxk8tWhcusxOeACAwx4QG", 
      date: new Date("2026-07-02"),
      description: "Dokumentasi lengkap keseruan camping dan trekking menyusuri alam hijau.",
    });

    await newEvent.save();
    console.log('✅ Data Event Camping berhasil dimasukkan ke database!');
  } catch (error) {
    console.error('❌ Gagal memasukkan data:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

run();
