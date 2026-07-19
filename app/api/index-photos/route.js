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
    const { eventId, photos, reset, resetBib, resetFace } = await req.json();

    if (!eventId) {
      return NextResponse.json({ error: 'eventId wajib diisi.' }, { status: 400 });
    }

    if (reset) {
      await Event.updateOne({ _id: eventId }, { $set: { indexedPhotos: [] } });
      return NextResponse.json({ success: true, count: 0 });
    }

    // Reset only Face data (faceDescriptors), keep BIB data intact
    if (resetFace) {
      const result = await Event.updateOne(
        { _id: eventId },
        { $set: { 'indexedPhotos.$[].faceDescriptors': [] } }
      );
      return NextResponse.json({ success: true, modified: result.modifiedCount });
    }

    // Reset only BIB data (ocr + bibs), keep face descriptors intact
    if (resetBib) {
      const result = await Event.updateOne(
        { _id: eventId },
        { $set: { 'indexedPhotos.$[].ocr': false, 'indexedPhotos.$[].bibs': [] } }
      );
      return NextResponse.json({ success: true, modified: result.modifiedCount });
    }

    if (!Array.isArray(photos)) {
      return NextResponse.json({ error: 'Data input tidak valid.' }, { status: 400 });
    }

    // Get projection of existing IDs to check status
    const eventProjection = await Event.findById(eventId, { 'indexedPhotos.id': 1 }).lean();
    if (!eventProjection) {
      return NextResponse.json({ error: 'Event tidak ditemukan.' }, { status: 404 });
    }

    const existingIds = new Set(eventProjection.indexedPhotos?.map(p => p.id) || []);
    const bulkOps = [];

    console.log(`[API INDEX-PHOTOS] Event current indexedPhotos: ${existingIds.size}`);
    
    for (const photo of photos) {
      if (existingIds.has(photo.id)) {
        console.log(`- Bulk Update photo ${photo.id}: bibs: ${(photo.bibs || []).join(', ')}, ocr: ${photo.ocr}`);
        bulkOps.push({
          updateOne: {
            filter: { _id: eventId, 'indexedPhotos.id': photo.id },
            update: {
              $set: {
                'indexedPhotos.$.faceDescriptors': photo.faceDescriptors || [],
                'indexedPhotos.$.bibs': photo.bibs || [],
                'indexedPhotos.$.ocr': photo.ocr || false
              }
            }
          }
        });
      } else {
        console.log(`- Bulk Push photo ${photo.id}: bibs: ${(photo.bibs || []).join(', ')}, ocr: ${photo.ocr}`);
        bulkOps.push({
          updateOne: {
            filter: { _id: eventId },
            update: {
              $push: {
                indexedPhotos: {
                  id: photo.id,
                  name: photo.name,
                  thumbnailLink: photo.thumbnailLink || '',
                  webContentLink: photo.webContentLink || '',
                  faceDescriptors: photo.faceDescriptors || [],
                  bibs: photo.bibs || [],
                  ocr: photo.ocr || false
                }
              }
            }
          }
        });
      }
    }

    console.log(`[API INDEX-PHOTOS] Executing BulkWrite of ${bulkOps.length} ops for event ID ${eventId}`);
    if (bulkOps.length > 0) {
      await Event.bulkWrite(bulkOps);
    }
    return NextResponse.json({ success: true, count: photos.length });
  } catch (err) {
    console.error('Error in index-photos API:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
