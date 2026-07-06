'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

export default function EventCard({ event }) {
  const [loading, setLoading] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
      <div className="p-4 sm:p-6">
        <div className="flex justify-between items-center gap-2">
          <span className="text-[10px] sm:text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full">
            {new Date(event.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <span className="text-[10px] sm:text-xs font-semibold text-blue-700 bg-blue-50 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full whitespace-nowrap border border-blue-200">
            {event.drivePhotosCount || 0} Foto
          </span>
        </div>
        <h2 className="text-base sm:text-xl font-bold mt-2 sm:mt-3 text-slate-900">{event.title}</h2>
        <p className="text-slate-600 mt-1.5 sm:mt-2 text-xs sm:text-sm line-clamp-3">{event.description || 'Tidak ada deskripsi.'}</p>
      </div>
      <div className="p-4 sm:p-6 pt-0">
        <Link
          href={`/gallery/${event.slug}`}
          onClick={() => setLoading(true)}
          className={`block w-full text-center font-medium text-xs sm:text-sm py-2 sm:py-2.5 px-4 rounded-lg transition-all ${
            loading
              ? 'bg-slate-700 text-slate-300 cursor-wait pointer-events-none'
              : 'bg-slate-900 hover:bg-slate-800 text-white'
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Memuat Galeri...
            </span>
          ) : (
            'Buka Galeri Foto'
          )}
        </Link>
      </div>
    </div>
  );
}
