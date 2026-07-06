import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const scriptUrl = process.env.APPS_SCRIPT_URL;
    const adminToken = process.env.ADMIN_TOKEN;
    if (!scriptUrl || !adminToken) {
      return NextResponse.json({ ok:false, error:'Configurazione admin mancante' }, { status:500 });
    }

    const body = await req.json();
    const action = String(body.action || '');

    const payload: any = { action, adminToken };

    if (action === 'setTotal') {
      payload.totalTiles = Number(body.totalTiles);
    } else if (action === 'uploadTarget') {
      payload.imageBase64 = String(body.imageBase64 || '');
      if (!payload.imageBase64) {
        return NextResponse.json({ ok:false, error:'Foto finale mancante' }, { status:400 });
      }
    } else if (action === 'clearGuestPhotos') {
      // ok
    } else {
      return NextResponse.json({ ok:false, error:'Azione admin non valida' }, { status:400 });
    }

    const resp = await fetch(scriptUrl, {
      method:'POST',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect:'follow',
    });

    const text = await resp.text();
    let data:any = {};
    try { data = JSON.parse(text); } catch { data = { ok:false, error:text.slice(0,500) }; }

    if (!resp.ok || !data.ok) {
      return NextResponse.json({ ok:false, error:data.error || 'Errore admin' }, { status:500 });
    }
    return NextResponse.json(data);
  } catch (err:any) {
    return NextResponse.json({ ok:false, error:err?.message || 'Errore admin' }, { status:500 });
  }
}
