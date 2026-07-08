export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request) {
  const { password } = await request.json();
  const securePassword = process.env.ADMIN_PASSWORD || "admin123"; // password default jika env belum diisi

  if (password === securePassword) {
    cookies().set('admin_session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60, // 10 menit session
      path: '/',
    });
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ success: false, message: "Password salah!" }, { status: 401 });
}

export async function DELETE() {
  cookies().delete('admin_session');
  return NextResponse.json({ success: true });
}
