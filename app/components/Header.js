'use client';

import Link from 'next/link';
import { Camera, Search, X } from 'lucide-react';
import { useSearch } from '../context/SearchContext';
import { useRouter, usePathname } from 'next/navigation';

export default function Header() {
  const { searchQuery, setSearchQuery } = useSearch();
  const router = useRouter();
  const pathname = usePathname();

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (pathname !== '/') {
      router.push(`/?search=${encodeURIComponent(val)}`);
    }
  };

  const handleClear = () => {
    setSearchQuery('');
    if (pathname !== '/') {
      router.push('/');
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-4 sm:gap-6 justify-between">
        {/* Logo */}
        <Link href="/" className="text-base sm:text-xl font-bold tracking-tight text-emerald-700 flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          📸 PHOTO<span className="text-slate-800 font-semibold">FINDER</span>
        </Link>

        {/* Search Input */}
        <div className="flex-grow max-w-xl relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search Event"
            className="w-full pl-10 pr-9 py-2 bg-slate-100 border-0 rounded-full text-sm placeholder-slate-400 text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
