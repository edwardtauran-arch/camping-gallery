import dbConnect from '@/lib/mongodb';
import Event from '@/models/Event';
import Link from 'next/link';
import { getPhotosFromFolder } from '@/lib/gdrive';

// Mengaktifkan revalidasi otomatis setiap 1 jam agar data tetap segar
export const revalidate = 3600;

export default async function HomePage() {
  await dbConnect();
  const events = await Event.find({}).sort({ date: -1 });

  const eventsWithCount = await Promise.all(
    events.map(async (event) => {
      const photos = await getPhotosFromFolder(event.driveFolderId);
      return {
        ...event.toObject(),
        drivePhotosCount: photos.length
      };
    })
  );

  return (
    <div>
      <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-12 px-2">
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
          PhotoFinder Dokumentasi
        </h1>
        <p className="mt-3 sm:mt-4 text-sm sm:text-lg text-slate-600">
          Pilih event camping di bawah ini untuk melihat dan mengunduh seluruh keseruan foto dokumentasi beresolusi penuh.
        </p>
      </div>

      {eventsWithCount.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500">Belum ada album event yang terdaftar di database.</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {eventsWithCount.map((event) => (
            <div key={event._id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
              <div className="p-6">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                    {new Date(event.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                  <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full whitespace-nowrap border border-blue-200">
                    {event.drivePhotosCount || 0} Foto
                  </span>
                </div>
                <h2 className="text-xl font-bold mt-3 text-slate-900">{event.title}</h2>
                <p className="text-slate-600 mt-2 text-sm line-clamp-3">{event.description || 'Tidak ada deskripsi.'}</p>
              </div>
              <div className="p-6 pt-0">
                <Link href={`/gallery/${event.slug}`} className="block w-full text-center bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm py-2.5 px-4 rounded-lg transition-colors">
                  Buka Galeri Foto
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
