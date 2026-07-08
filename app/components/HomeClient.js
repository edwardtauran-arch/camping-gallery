'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSearch } from '../context/SearchContext';
import EventCard from './EventCard';
import { Search } from 'lucide-react';

export default function HomeClient({ initialEvents }) {
  const { searchQuery, setSearchQuery } = useSearch();
  const searchParams = useSearchParams();
  const searchParamVal = searchParams.get('search');

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
      ) : (
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.map((event) => (
            <EventCard key={event._id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
