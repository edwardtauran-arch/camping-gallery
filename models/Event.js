import mongoose from 'mongoose';

const EventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  driveFolderId: { type: String, required: true },
  date: { type: Date, required: true },
  description: { type: String },
  // Tambahan untuk menyimpan koordinat wajah hasil scan AI
  indexedPhotos: [{
    id: String,
    name: String,
    thumbnailLink: String,
    webContentLink: String,
    faceDescriptors: [Array] // Menyimpan array koordinat wajah (Float32Array diubah ke Array biasa)
  }]
});

export default mongoose.models.Event || mongoose.model('Event', EventSchema);
