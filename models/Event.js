import mongoose from 'mongoose';

const EventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  driveFolderId: { type: String, required: true },
  date: { type: Date, required: true },
  description: { type: String },
  hidden: { type: Boolean, default: false },
  drivePhotosCount: { type: Number, default: 0 },
  // Tambahan untuk menyimpan koordinat wajah hasil scan AI
  indexedPhotos: [{
    id: String,
    name: String,
    thumbnailLink: String,
    webContentLink: String,
    faceDescriptors: [Array] // Menyimpan array koordinat wajah (Float32Array diubah ke Array biasa)
  }]
});

if (mongoose.models.Event) {
  delete mongoose.models.Event;
}

export default mongoose.model('Event', EventSchema);
