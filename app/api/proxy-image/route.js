import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const sz = searchParams.get('sz') || 'w400'; // Default kompresi ke lebar 400px jika tidak diatur

  if (!id) {
    return new Response('Missing image ID', { status: 400 });
  }

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    // Ambil gambar ukuran terkompresi langsung lewat request server-to-server
    const googleRes = await fetch(`https://drive.google.com/thumbnail?id=${id}&sz=${sz}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!googleRes.ok) {
      return new Response('Gagal mengambil gambar dari Google', { status: googleRes.status });
    }

    const arrayBuffer = await googleRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        // Set cache selama 1 tahun agar loading halaman berikutnya secepat kilat
        'Cache-Control': 'public, max-age=31536000, immutable', 
      },
    });
  } catch (err) {
    console.error('Proxy Image Error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
