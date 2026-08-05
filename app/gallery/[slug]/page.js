import dbConnect from '@/lib/mongodb';
import Event from '@/models/Event';
import { getPhotosFromFolder } from '@/lib/gdrive';
import GalleryClient from './GalleryClient'; // Kita pecah component interaktifnya di client side
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function GalleryPage({ params }) {
  await dbConnect();
  const event = await Event.findOne({ slug: params.slug });

  if (!event) {
    notFound();
  }

  // Check if admin is logged in
  const session = cookies().get('admin_session');
  const adminActive = session && session.value === 'authenticated';

  const isHidden = event.hidden === true;
  const isPrivate = event.isPrivate === true;

  const showPrivateNotice = isHidden && !adminActive;
  const isAdminViewingPrivate = isHidden && adminActive;

  // Private link mode: event is NOT hidden but marked as private (direct link only)
  // Non-admin visitors can still see content, but without navigation UI
  const isPrivateLink = isPrivate && !isHidden && !adminActive;
  const isAdminViewingPrivateLink = isPrivate && !isHidden && adminActive;

  // If private notice is shown, we do not fetch the photos from Drive (secure)
  const photos = showPrivateNotice ? [] : await getPhotosFromFolder(event.driveFolderId);

  return (
    <div>
      {/* Admin hidden page notice */}
      {isAdminViewingPrivate && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 sm:p-4 mb-5 flex items-start gap-2.5 text-xs">
          <span className="text-base leading-none">⚠️</span>
          <div>
            <p className="font-bold">Mode Pratinjau Admin</p>
            <p className="text-amber-700 text-[11px] mt-0.5">Galeri ini disembunyikan dari publik. Hanya Anda yang dapat melihat halaman ini karena sedang aktif session Admin.</p>
          </div>
        </div>
      )}

      {/* Admin private-link page notice */}
      {isAdminViewingPrivateLink && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl p-3 sm:p-4 mb-5 flex items-start gap-2.5 text-xs">
          <span className="text-base leading-none">🔗</span>
          <div>
            <p className="font-bold">Mode Private Link (Admin View)</p>
            <p className="text-blue-700 text-[11px] mt-0.5">Galeri ini bersifat <strong>Private</strong> — tidak tampil di beranda dan hanya bisa diakses via direct link. Pengunjung tidak akan melihat header atau tombol navigasi.</p>
          </div>
        </div>
      )}

      <div className="mb-5 sm:mb-8">
        {/* Only show back button when NOT a private link (or if admin is viewing) */}
        {(!isPrivateLink) && (
          <Link href="/" className="text-xs sm:text-sm font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1 mb-3 sm:mb-4">
            ← Kembali ke Beranda
          </Link>
        )}
        <h1 className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{event.title}</h1>
        <p className="text-slate-500 mt-1 text-xs sm:text-base">
          Total: {showPrivateNotice ? 0 : photos.length} Foto terdeteksi di storage
        </p>
      </div>

      {photos.length === 0 && !showPrivateNotice ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <p className="text-slate-500">Folder Google Drive kosong atau tidak berisi file gambar.</p>
        </div>
      ) : (
        // Mengirim data foto ke komponen client side untuk penanganan interaksi klik/lightbox
        <GalleryClient 
          photos={photos} 
          event={JSON.parse(JSON.stringify(event))} 
          isPrivate={showPrivateNotice}
          isPrivateLink={isPrivateLink}
        />
      )}
    </div>
  );
}
