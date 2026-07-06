import './globals.css';

export const metadata = {
  title: 'Camping PhotoFinder',
  description: 'Dokumentasi Galeri Foto Kegiatan Camping Anda',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="bg-slate-50 text-slate-900 min-h-screen flex flex-col justify-between">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex justify-between items-center">
            <a href="/" className="text-base sm:text-xl font-bold tracking-tight text-emerald-700 flex items-center gap-1.5 sm:gap-2">
              ⛺ CAMPING<span className="text-slate-800 font-semibold">GALLERY</span>
            </a>
          </div>
        </header>

        <main className="flex-grow max-w-6xl w-full mx-auto px-3 sm:px-4 py-5 sm:py-8">
          {children}
        </main>

        <footer className="bg-white border-t border-slate-200 py-6 mt-12 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} Camping Gallery. Powered by Next.js & Google Drive API.
        </footer>
      </body>
    </html>
  );
}
