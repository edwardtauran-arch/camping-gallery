import dbConnect from '@/lib/mongodb';
import Event from '@/models/Event';
import { getPhotosFromFolder } from '@/lib/gdrive';
import GalleryClient from './GalleryClient'; // Kita pecah component interaktifnya di client side
import { notFound } from 'next/navigation';
import Link from 'next/link';

export const revalidate = 60; // Refresh list foto dari Drive setiap 60 detik

export default async function GalleryPage({ params }) {
  await dbConnect();
  const event = await Event.findOne({ slug: params.slug });

  if (!event) {
    notFound();
  }

  const photos = await getPhotosFromFolder(event.driveFolderId);

  return (
    <div>
      <div className="mb-8">
        <Link href="/" className="text-sm font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1 mb-4">
          ← Kembali ke Beranda
        </Link>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{event.title}</h1>
        <p className="text-slate-500 mt-1">Total: {photos.length} Foto terdeteksi di storage</p>
      </div>

      {photos.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <p className="text-slate-500">Folder Google Drive kosong atau tidak berisi file gambar.</p>
        </div>
      ) : (
        // Mengirim data foto ke komponen client side untuk penanganan interaksi klik/lightbox
        <GalleryClient photos={photos} event={JSON.parse(JSON.stringify(event))} />
      )}
    </div>
  );
}
