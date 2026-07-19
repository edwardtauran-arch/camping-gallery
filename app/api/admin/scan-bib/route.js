import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Event from '@/models/Event';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function isAdmin() {
  const session = cookies().get('admin_session');
  return session && session.value === 'authenticated';
}

export async function POST(request) {
  try {
    if (!isAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const { eventId, driveFileId, photoName, thumbnailLink, webContentLink } = await request.json();

    if (!eventId || !driveFileId) {
      return NextResponse.json({ error: 'eventId dan driveFileId wajib diisi.' }, { status: 400 });
    }

    // 1. Fetch the compressed image via the internal proxy API
    const origin = request.nextUrl.origin;
    const proxyUrl = `${origin}/api/proxy-image?id=${driveFileId}&sz=w800`;
    
    console.log(`[BIB SCAN] Fetching image from proxy: ${proxyUrl}`);
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`Gagal mengambil gambar dari proxy: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // 2. Send the image to the self-hosted PaddleOCR service.
    const ocrBaseUrl = process.env.PADDLE_OCR_URL;
    if (!ocrBaseUrl) {
      return NextResponse.json({
        success: false,
        error: 'PADDLE_OCR_URL belum dikonfigurasi.',
      }, { status: 503 });
    }
    const ocrUrl = `${ocrBaseUrl.replace(/\/$/, '')}/ocr`;
    console.log(`[BIB SCAN] Calling PaddleOCR for file: ${driveFileId}`);
    const ocrResponse = await fetch(ocrUrl, {
      method: 'POST',
      headers: {
        'Content-Type': response.headers.get('content-type') || 'image/jpeg',
        ...(process.env.PADDLE_OCR_TOKEN && { Authorization: `Bearer ${process.env.PADDLE_OCR_TOKEN}` }),
      },
      body: imageBuffer,
      signal: AbortSignal.timeout(60000),
    });
    if (!ocrResponse.ok) {
      throw new Error(`PaddleOCR gagal: ${ocrResponse.status} ${await ocrResponse.text()}`);
    }
    const { texts = [] } = await ocrResponse.json();

    // 3. Keep only realistic BIB values from PaddleOCR's detected text.
    const cleanBibs = [...new Set(
      texts.flatMap((text) => String(text).match(/(?<!\d)\d{3,}(?!\d)/g) || [])
    )];

    console.log(`[BIB SCAN] Extracted BIBs:`, cleanBibs);

    // 4. Update the event's indexedPhotos in MongoDB
    let updatedEvent = await Event.findOneAndUpdate(
      { _id: eventId, 'indexedPhotos.id': driveFileId },
      { 
        $set: { 
          'indexedPhotos.$.bibs': cleanBibs,
          'indexedPhotos.$.ocr': true 
        } 
      },
      { new: true }
    );

    // If the photo was not found in indexedPhotos, push a new photo object
    if (!updatedEvent) {
      console.log(`[BIB SCAN] Photo not pre-indexed, pushing new entry for ${driveFileId}`);
      updatedEvent = await Event.findOneAndUpdate(
        { _id: eventId },
        {
          $push: {
            indexedPhotos: {
              id: driveFileId,
              name: photoName || '',
              thumbnailLink: thumbnailLink || '',
              webContentLink: webContentLink || '',
              faceDescriptors: [],
              bibs: cleanBibs,
              ocr: true
            }
          }
        },
        { new: true }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: `Berhasil mengindeks ${cleanBibs.length} BIB`, 
      data: cleanBibs 
    });

  } catch (error) {
    console.error('[BIB SCAN] Error:', error);
    const isRateLimit = error.status === 429 || error.message?.includes('Too Many Requests') || error.message?.includes('429');
    return NextResponse.json(
      { success: false, error: isRateLimit ? 'Terlalu Banyak Request API (Rate Limit)' : error.message }, 
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
