import './globals.css';
import { SearchProvider } from '@/app/context/SearchContext';
import Header from '@/app/components/Header';

export const metadata = {
  title: 'PhotoFinder - Dokumentasi Galeri Foto',
  description: 'Dokumentasi Galeri Foto Kegiatan Anda',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="bg-slate-50 text-slate-900 min-h-screen flex flex-col justify-between">
        <SearchProvider>
          <Header />
          <main className="flex-grow max-w-6xl w-full mx-auto px-3 sm:px-4 py-5 sm:py-8">
            {children}
          </main>
        </SearchProvider>

        <footer className="bg-white border-t border-slate-200 py-6 mt-12 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} PhotoFinder.
        </footer>
      </body>
    </html>
  );
}
