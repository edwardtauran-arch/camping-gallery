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

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <Link href="/admin/dashboard" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1">
          ← Kembali ke Dashboard
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">
          🤖 Scan Wajah: {event.title}
        </h1>
        <p className="text-slate-500 text-sm">
          Gunakan fitur ini untuk memproses foto dari Google Drive menggunakan kecerdasan buatan (AI) untuk mengenali wajah di setiap foto.
        </p>
      </div>

      <ScanClient event={JSON.parse(JSON.stringify(event))} initialPhotos={photos} />
    </div>
  );
}
