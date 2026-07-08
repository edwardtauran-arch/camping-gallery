'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

export default function EventCard({ event }) {
  const [loading, setLoading] = useState(false);

  const getThumbnailUrl = () => {
    if (event.thumbnail) {
      if (event.thumbnail.startsWith('http://') || event.thumbnail.startsWith('https://')) {
        return event.thumbnail;
      }
      return `/api/proxy-image?id=${event.thumbnail}&sz=w600`;
    }
    if (event.indexedPhotos && event.indexedPhotos.length > 0) {
      return `/api/proxy-image?id=${event.indexedPhotos[0].id}&sz=w600`;
    }
    // Gambar dummy camping sebagai contoh fallback jika data belum diisi
    return 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&auto=format&fit=crop&q=60';
  };

  const thumbnailUrl = getThumbnailUrl();

  return (
    <Link
      href={`/gallery/${event.slug}`}
      onClick={() => setLoading(true)}
      className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between"
    >
      <div className="relative w-full aspect-[16/10] overflow-hidden bg-slate-100 border-b border-slate-100">
        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-10 flex items-center justify-center text-white text-xs sm:text-sm font-semibold gap-2">
            <Loader2 size={16} className="animate-spin text-white" />
            Memuat Galeri...
          </div>
        )}
        
        {/* Thumbnail Image */}
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-emerald-500/80 to-teal-700/90 flex flex-col items-center justify-center text-white px-4 text-center group-hover:scale-[1.03] transition-transform duration-500">
            <span className="text-3xl mb-1">⛺</span>
            <span className="font-bold text-xs tracking-wide uppercase opacity-90">{event.title}</span>
          </div>
        )}

        {/* Photo Count Badge */}
        <span className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-white/10 shadow-sm">
          {event.drivePhotosCount || 0} Foto
        </span>
      </div>

      <div className="p-4 sm:p-5 flex-grow flex flex-col justify-start">
        {/* Date */}
        <span className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {new Date(event.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
        </span>
        {/* Title */}
        <h2 className="text-base sm:text-lg font-bold mt-1 text-slate-800 group-hover:text-emerald-700 transition-colors line-clamp-2 leading-snug">
          {event.title}
        </h2>
      </div>
    </Link>
  );
}
