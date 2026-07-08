'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSearch } from '../context/SearchContext';
import EventCard from './EventCard';
import Link from 'next/link';
import { Search, LayoutGrid, List, Image as ImageIcon, Loader2 } from 'lucide-react';

export default function HomeClient({ initialEvents }) {
  const { searchQuery, setSearchQuery } = useSearch();
  const searchParams = useSearchParams();
  const searchParamVal = searchParams.get('search');
  const [viewMode, setViewMode] = useState('grid'); // Default: 'grid'

  // Sync URL query param to search context if provided
  useEffect(() => {
    if (searchParamVal !== null) {
      setSearchQuery(searchParamVal);
    }
  }, [searchParamVal, setSearchQuery]);

  const filteredEvents = initialEvents.filter((event) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      event.title.toLowerCase().includes(query) ||
      (event.description || '').toLowerCase().includes(query) ||
      event.slug.toLowerCase().includes(query)
    );
  });

  return (
    <div>
      <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-12 px-2">
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
          PhotoFinder
        </h1>
        <p className="mt-3 sm:mt-4 text-sm sm:text-lg text-slate-600">
          Pilih event di bawah ini untuk melihat, mencari wajah, dan mengunduh seluruh keseruan foto dokumentasi beresolusi penuh.
        </p>
      </div>

      {/* Control Bar: Total Count and Grid/List view toggler */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-200">
        <span className="text-xs sm:text-sm font-semibold text-slate-500">
          Menampilkan {filteredEvents.length} Event
        </span>
        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md flex items-center gap-1.5 transition-all text-xs font-bold focus:outline-none ${
              viewMode === 'grid'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Tampilan Grid"
          >
            <LayoutGrid size={14} />
            <span className="hidden sm:inline">Grid</span>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md flex items-center gap-1.5 transition-all text-xs font-bold focus:outline-none ${
              viewMode === 'list'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Tampilan List"
          >
            <List size={14} />
            <span className="hidden sm:inline">List</span>
          </button>
        </div>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center">
          <Search size={40} className="text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Tidak ada event yang cocok dengan pencarian Anda.</p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="mt-3 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100 transition-colors"
            >
              Bersihkan Pencarian
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.map((event) => (
            <EventCard key={event._id} event={event} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredEvents.map((event) => (
            <EventListRow key={event._id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

// Custom Row Component for Landing Page List View
function EventListRow({ event }) {
  const [loading, setLoading] = useState(false);

  const getThumbnailUrl = () => {
    if (event.thumbnail) {
      if (event.thumbnail.startsWith('http://') || event.thumbnail.startsWith('https://')) {
        return event.thumbnail;
      }
      return `/api/proxy-image?id=${event.thumbnail}&sz=w300`;
    }
    if (event.randomThumbnailId) {
      return `/api/proxy-image?id=${event.randomThumbnailId}&sz=w300`;
    }
    return 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&auto=format&fit=crop&q=60';
  };

  const thumbnailUrl = getThumbnailUrl();

  return (
    <Link
      href={`/gallery/${event.slug}`}
      onClick={() => setLoading(true)}
      className="group bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:-translate-y-[1px] transition-all duration-200 flex items-center gap-4 relative overflow-hidden"
    >
      {loading && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs z-10 flex items-center justify-center text-white text-xs font-semibold gap-1.5">
          <Loader2 size={14} className="animate-spin text-white" />
          Memuat...
        </div>
      )}

      {/* Thumbnail Image */}
      <div className="w-16 h-16 sm:w-24 sm:h-20 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100 border border-slate-100">
        <img
          src={thumbnailUrl}
          alt={event.title}
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          loading="lazy"
        />
      </div>

      {/* Details */}
      <div className="flex-grow min-w-0 flex flex-col justify-center">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
          <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {new Date(event.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <span className="text-[9px] sm:text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.25 rounded-md flex items-center gap-1">
            <ImageIcon size={10} />
            {event.drivePhotosCount || 0} Foto
          </span>
        </div>
        <h2 className="text-sm sm:text-base font-bold text-slate-800 group-hover:text-emerald-700 transition-colors line-clamp-1">
          {event.title}
        </h2>
        {event.description && (
          <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
            {event.description}
          </p>
        )}
      </div>

      {/* Action CTA Button */}
      <div className="flex-shrink-0 hidden md:block pr-2">
        <span className="bg-slate-50 border border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 group-hover:text-emerald-700 text-slate-700 font-bold text-xs px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap">
          Buka Galeri →
        </span>
      </div>
    </Link>
  );
}
