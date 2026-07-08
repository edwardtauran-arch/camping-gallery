import { Suspense } from 'react';
import dbConnect from '@/lib/mongodb';
import Event from '@/models/Event';
import HomeClient from './components/HomeClient';

// Force dynamic rendering to run on every request and randomize thumbnails on load
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  await dbConnect();
  
  // Ambil data event hanya dengan field-field yang diperlukan saja untuk optimalisasi payload
  const events = await Event.find({ hidden: { $ne: true } })
    .select('title slug date description hidden drivePhotosCount thumbnail indexedPhotos.id')
    .sort({ date: -1 });

  // Konversi dokumen ke plain object dan acak thumbnail di server
  const serializedEvents = events.map(doc => {
    const eventObj = doc.toObject();
    
    // Pilih satu foto random secara acak dari daftar foto terindeks di server
    if (!eventObj.thumbnail && eventObj.indexedPhotos && eventObj.indexedPhotos.length > 0) {
      const randomIndex = Math.floor(Math.random() * eventObj.indexedPhotos.length);
      eventObj.randomThumbnailId = eventObj.indexedPhotos[randomIndex].id;
    }
    
    // Hapus indexedPhotos agar payload HTML beranda super ringan (< 5KB) dan loading secepat kilat
    delete eventObj.indexedPhotos;
    
    // Stringify _id dan date
    eventObj._id = eventObj._id.toString();
    if (eventObj.date) {
      eventObj.date = eventObj.date.toISOString();
    }
    
    return eventObj;
  });

  return (
    <Suspense fallback={
      <div className="text-center py-12">
        <p className="text-slate-500 animate-pulse font-medium">Memuat Event...</p>
      </div>
    }>
      <HomeClient initialEvents={serializedEvents} />
    </Suspense>
  );
}
