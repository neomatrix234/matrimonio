import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      return NextResponse.json({ ok:false, error:'ID immagine non valido' }, { status:400 });
    }

    const url = `https://drive.google.com/uc?export=download&id=${id}`;
    const resp = await fetch(url, { cache: 'no-store', redirect: 'follow' });

    if (!resp.ok) {
      return NextResponse.json({ ok:false, error:'Immagine non leggibile da Drive' }, { status:500 });
    }

    const bytes = await resp.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': resp.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=60'
      }
    });
  } catch (err:any) {
    return NextResponse.json({ ok:false, error:err?.message || 'Errore immagine' }, { status:500 });
  }
}
