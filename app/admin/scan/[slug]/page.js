import dbConnect from '@/lib/mongodb';
import Event from '@/models/Event';
import { getPhotosFromFolder } from '@/lib/gdrive';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ScanClient from './ScanClient';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function isAdmin() {
  const session = cookies().get('admin_session');
  return session && session.value === 'authenticated';
}

export default async function ScanPage({ params }) {
  if (!isAdmin()) {
    redirect('/admin');
  }

  await dbConnect();
  const event = await Event.findOne({ slug: params.slug });

  if (!event) {
    redirect('/admin/dashboard');
  }

  const photos = await getPhotosFromFolder(event.driveFolderId);

  const hasFace = event.enableFaceSearch !== false;
  const hasBib = event.enableBibSearch !== false;
  let pageTitle = "Scan Foto";
  let pageDesc = "Memproses foto dari Google Drive.";
  if (hasFace && hasBib) {
    pageTitle = `🤖 Scan Wajah & BIB: ${event.title}`;
    pageDesc = "Gunakan fitur ini untuk memproses foto dari Google Drive menggunakan kecerdasan buatan (AI) untuk mengenali wajah dan OCR untuk nomor BIB.";
  } else if (hasFace) {
    pageTitle = `🤖 Scan Wajah AI: ${event.title}`;
    pageDesc = "Gunakan fitur ini untuk memproses foto dari Google Drive menggunakan kecerdasan buatan (AI) untuk mengenali wajah di setiap foto.";
  } else if (hasBib) {
    pageTitle = `🔢 Scan Nomor BIB: ${event.title}`;
    pageDesc = "Gunakan fitur ini untuk memproses foto dari Google Drive menggunakan OCR untuk mengenali nomor dada (BIB) di setiap foto.";
  }

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <Link href="/admin/dashboard" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1">
          ← Kembali ke Dashboard
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">
          {pageTitle}
        </h1>
        <p className="text-slate-500 text-sm">
          {pageDesc}
        </p>
      </div>

      <ScanClient event={JSON.parse(JSON.stringify(event))} initialPhotos={photos} />
    </div>
  );
}
