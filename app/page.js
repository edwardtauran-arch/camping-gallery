import { Suspense } from 'react';
import dbConnect from '@/lib/mongodb';
import Event from '@/models/Event';
import HomeClient from './components/HomeClient';

// Mengaktifkan revalidasi otomatis setiap 1 jam agar data tetap segar
export const revalidate = 3600;

export default async function HomePage() {
  await dbConnect();
  const events = await Event.find({ hidden: { $ne: true } }).sort({ date: -1 });

  return (
    <Suspense fallback={
      <div className="text-center py-12">
        <p className="text-slate-500 animate-pulse font-medium">Memuat Event...</p>
      </div>
    }>
      <HomeClient initialEvents={JSON.parse(JSON.stringify(events))} />
    </Suspense>
  );
}
