import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Event from '@/models/Event';
import { cookies } from 'next/headers';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[BIB SCAN] GEMINI_API_KEY is not configured in .env.local');
      return NextResponse.json({ 
        success: false, 
        error: 'GEMINI_API_KEY belum dikonfigurasi di .env.local. Silakan dapatkan API Key dari Google AI Studio dan tambahkan ke berkas .env.local Anda.' 
      }, { status: 400 });
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

    // 2. Initialize Gemini API Client and call the model
    console.log(`[BIB SCAN] Calling Gemini API for file: ${driveFileId}`);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });

    const prompt = `Sebutkan semua nomor dada (BIB) pelari yang ada di dalam foto ini.
Patuhi aturan berikut:
1. Hanya keluarkan nomor/angka saja.
2. Hilangkan huruf atau prefiks di depan nomor (misalnya: jika tertulis "M 26366", hanya kembalikan "26366").
3. Jika ada beberapa nomor BIB, pisahkan dengan koma saja (misalnya: 26366, 28885, 27325).
4. Jika tidak ada nomor dada (BIB) yang terdeteksi, jawab dengan: "TIDAK_ADA".
5. Jangan berikan penjelasan atau teks tambahan apapun. Jawab saja.`;

    const imagePart = {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: 'image/jpeg'
      }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const text = result.response.text().trim();
    console.log(`[BIB SCAN] Gemini Raw Result: "${text}"`);

    // 3. Extract numbers from Gemini output
    let cleanBibs = [];
    if (text && text.toUpperCase() !== 'TIDAK_ADA') {
      // Split by commas, spaces, or newlines, then extract numeric digits only
      const rawTokens = text.split(/[\s,]+/);
      for (const token of rawTokens) {
        const cleaned = token.replace(/\D/g, ''); // Keep only digits
        if (cleaned.length >= 3) { // Ensure it's a realistic BIB length
          cleanBibs.push(cleaned);
        }
      }
      // Remove duplicates
      cleanBibs = [...new Set(cleanBibs)];
    }

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
