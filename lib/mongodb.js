import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    "Harap definisikan variabel lingkungan MONGODB_URI di dalam .env.local",
  );
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    
    // Deteksi error khusus karena masalah IP Whitelist atau Jaringan
    if (e.name === 'MongoServerSelectionError' || e.name === 'MongooseServerSelectionError' || (e.message && e.message.includes('IP'))) {
      console.error('\n' + '='.repeat(80));
      console.error('🚨 MONGODB CONNECTION ERROR: IP ANDA DIBLOKIR OLEH MONGODB ATLAS 🚨');
      console.error('='.repeat(80));
      console.error('Komputer ini mencoba mengakses database MongoDB, tetapi ditolak.');
      console.error('Karena Anda menjalankan project ini di komputer/WiFi baru, IP Anda belum terdaftar.');
      console.error('\nCARA MEMPERBAIKI SEKARANG:');
      console.error('1. Buka browser dan login ke https://cloud.mongodb.com');
      console.error('2. Di menu kiri (Security), pilih "Network Access".');
      console.error('3. Klik tombol "ADD IP ADDRESS".');
      console.error('4. Klik tombol "ALLOW ACCESS FROM ANYWHERE" (otomatis terisi 0.0.0.0/0).');
      console.error('5. Klik "Confirm" dan tunggu 1 menit sampai statusnya hijau/Active.');
      console.error('6. Matikan server ini (Ctrl+C) lalu nyalakan lagi dengan "npm run dev".');
      console.error('='.repeat(80) + '\n');
    }
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
