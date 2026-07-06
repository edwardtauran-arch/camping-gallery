export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const sz = searchParams.get('sz') || 'w400';

    if (!id) {
      return NextResponse.json({ error: 'ID parameter is required.' }, { status: 400 });
    }

    const driveUrl = `https://drive.google.com/thumbnail?id=${id}&sz=${sz}`;
    
    // Server-side fetch has no CORS enforcement
    const res = await fetch(driveUrl);
    if (!res.ok) {
      console.error(`Failed to fetch thumbnail for file ${id} from Google Drive: ${res.statusText}`);
      return NextResponse.json({ error: 'Failed to fetch thumbnail from Google Drive.' }, { status: res.status });
    }

    const buffer = await res.arrayBuffer();

    return new Response(buffer, {
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/jpeg',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    console.error('Error in proxy-thumbnail endpoint:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
