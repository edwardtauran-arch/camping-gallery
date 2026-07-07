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
    return NextResponse.json({ success: true, data: events });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function POST(request) {
  if (!isAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  try {
    const body = await request.json();
    
    // Fetch Google Drive photo count once on creation
    let drivePhotosCount = 0;
    try {
      const photos = await getPhotosFromFolder(body.driveFolderId);
      drivePhotosCount = photos.length;
    } catch (e) {
      console.error("Gagal mendapatkan jumlah foto Google Drive saat POST:", e);
    }

    const newEvent = await Event.create({ ...body, drivePhotosCount });
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
    const body = await request.json();
    console.log("[API EVENTS PUT] Received body:", body);
    const { id, title, slug, driveFolderId, date, description, hidden } = body;
    
    // Fetch Google Drive photo count once on update
    let drivePhotosCount = 0;
    try {
      const photos = await getPhotosFromFolder(driveFolderId);
      drivePhotosCount = photos.length;
    } catch (e) {
      console.error("Gagal mendapatkan jumlah foto Google Drive saat PUT:", e);
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      id,
      { title, slug, driveFolderId, date, description, hidden: !!hidden, drivePhotosCount },
      { new: true } // Mengembalikan data terbaru setelah di-update
    );
    console.log("[API EVENTS PUT] Updated event in DB:", updatedEvent);
    return NextResponse.json({ success: true, data: updatedEvent });
  } catch (err) {
    console.error("[API EVENTS PUT] Error:", err);
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

// Toggle visibility ATAU sinkronisasi jumlah foto
export async function PATCH(request) {
  if (!isAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  try {
    const { id, action } = await request.json();
    const event = await Event.findById(id);
    if (!event) return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });

    if (action === 'sync') {
      // Sinkronisasi jumlah foto Google Drive on demand
      const photos = await getPhotosFromFolder(event.driveFolderId);
      event.drivePhotosCount = photos.length;
      await event.save();
      return NextResponse.json({ success: true, data: { drivePhotosCount: event.drivePhotosCount } });
    } else {
      // Toggle visibility
      event.hidden = !event.hidden;
      await event.save();
      return NextResponse.json({ success: true, data: { hidden: event.hidden } });
    }
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
