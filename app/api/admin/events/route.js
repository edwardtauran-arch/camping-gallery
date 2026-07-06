export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Event from '@/models/Event';
import { cookies } from 'next/headers';
import { getPhotosFromFolder } from '@/lib/gdrive';

function isAdmin() {
  const session = cookies().get('admin_session');
  return session && session.value === 'authenticated';
}

export async function GET() {
  if (!isAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  try {
    const events = await Event.find({}).sort({ date: -1 });

    const eventsWithDriveCount = await Promise.all(
      events.map(async (event) => {
        const photos = await getPhotosFromFolder(event.driveFolderId);
        return {
          ...event.toObject(),
          drivePhotosCount: photos.length
        };
      })
    );

    return NextResponse.json({ success: true, data: eventsWithDriveCount });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function POST(request) {
  if (!isAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  try {
    const body = await request.json();
    const newEvent = await Event.create(body);
    return NextResponse.json({ success: true, data: newEvent });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

// FUNGSI BARU: Update / Edit Data Event Berdasarkan ID
export async function PUT(request) {
  if (!isAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  try {
    const { id, title, slug, driveFolderId, date, description } = await request.json();
    const updatedEvent = await Event.findByIdAndUpdate(
      id,
      { title, slug, driveFolderId, date, description },
      { new: true } // Mengembalikan data terbaru setelah di-update
    );
    return NextResponse.json({ success: true, data: updatedEvent });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function DELETE(request) {
  if (!isAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  try {
    const { id } = await request.json();
    await Event.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
