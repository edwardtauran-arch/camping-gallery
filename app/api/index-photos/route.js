export const dynamic = 'force-dynamic';
import dbConnect from '@/lib/mongodb';
import Event from '@/models/Event';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

function isAdmin() {
  const session = cookies().get('admin_session');
  return session && session.value === 'authenticated';
}

export async function POST(req) {
  try {
    if (!isAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Refresh cookie
    cookies().set('admin_session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60,
      path: '/',
    });

    await dbConnect();
    const { eventId, photos, reset } = await req.json();

    if (!eventId) {
      return NextResponse.json({ error: 'eventId wajib diisi.' }, { status: 400 });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return NextResponse.json({ error: 'Event tidak ditemukan.' }, { status: 404 });
    }

    if (reset) {
      event.indexedPhotos = [];
      event.markModified('indexedPhotos');
      await event.save();
      return NextResponse.json({ success: true, count: 0 });
    }

    if (!Array.isArray(photos)) {
      return NextResponse.json({ error: 'Data input tidak valid.' }, { status: 400 });
    }

    if (!event.indexedPhotos) {
      event.indexedPhotos = [];
    }

    console.log(`[API INDEX-PHOTOS] Event current indexedPhotos: ${event.indexedPhotos.length}`);
    // Update or insert each photo's faceDescriptors
    for (const photo of photos) {
      const idx = event.indexedPhotos.findIndex(p => p.id === photo.id);
      if (idx > -1) {
        console.log(`- Updating photo ${photo.id} descriptors count: ${photo.faceDescriptors.length}`);
        event.indexedPhotos[idx].faceDescriptors = photo.faceDescriptors;
      } else {
        console.log(`- Pushing photo ${photo.id} (${photo.name}) descriptors count: ${photo.faceDescriptors.length}`);
        event.indexedPhotos.push({
          id: photo.id,
          name: photo.name,
          thumbnailLink: photo.thumbnailLink,
          webContentLink: photo.webContentLink,
          faceDescriptors: photo.faceDescriptors,
        });
      }
    }
    console.log(`[API INDEX-PHOTOS] Event new indexedPhotos length: ${event.indexedPhotos.length}`);

    console.log(`[API INDEX-PHOTOS] Saving batch of ${photos.length} photos for event ID ${eventId}`);
    event.markModified('indexedPhotos');
    await event.save();
    return NextResponse.json({ success: true, count: photos.length });
  } catch (err) {
    console.error('Error in index-photos API:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
