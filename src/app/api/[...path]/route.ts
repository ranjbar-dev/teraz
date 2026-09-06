import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
async function handle(req: NextRequest, context: Context) {
  const { path } = await context.params;
  const base = process.env.BACKEND_URL || 'http://127.0.0.1:4000';
  const target = new URL('/api/' + path.map(encodeURIComponent).join('/'), base);
  target.search = req.nextUrl.search;
  const headers = new Headers();
  for (const key of ['cookie', 'content-type', 'origin', 'idempotency-key', 'accept']) {
    const value = req.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    const response = await fetch(target, {
      method: req.method,
      headers,
      ...(!['GET', 'HEAD'].includes(req.method) ? { body: await req.arrayBuffer() } : {}),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(45000),
    });
    const outgoing = new Headers({ 'Cache-Control': 'no-store' });
    for (const key of [
      'content-type',
      'content-disposition',
      'location',
      'x-request-id',
      'x-content-type-options',
    ]) {
      const value = response.headers.get(key);
      if (value) outgoing.set(key, value);
    }
    for (const cookie of response.headers.getSetCookie()) outgoing.append('set-cookie', cookie);
    return new NextResponse(response.body, { status: response.status, headers: outgoing });
  } catch {
    return NextResponse.json(
      {
        error: 'سرویس حسابداری در دسترس نیست. اجرای API و PostgreSQL را بررسی کنید.',
        code: 'BACKEND_UNAVAILABLE',
      },
      { status: 503 },
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE, handle as PUT };
