import dbConnect from '@/lib/mongodb';
import Event from '@/models/Event';
import EventCard from './components/EventCard';

// Mengaktifkan revalidasi otomatis setiap 1 jam agar data tetap segar
export const revalidate = 3600;

export default async function HomePage() {
  await dbConnect();
  const events = await Event.find({ hidden: { $ne: true } }).sort({ date: -1 });

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

      {events.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500">Belum ada album event yang terdaftar di database.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event._id} event={JSON.parse(JSON.stringify(event))} />
          ))}
        </div>
      )}
    </div>
  );
}
