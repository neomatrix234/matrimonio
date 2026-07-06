import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const scriptUrl = process.env.APPS_SCRIPT_URL;
    if (!scriptUrl) return NextResponse.json({ ok:false, error:'APPS_SCRIPT_URL mancante' }, { status:500 });

    const body = await req.json();
    const action = String(body.action || '');

    const payload: any = { action };

    if (action === 'adminLogin') {
      payload.password = String(body.password || '');
    } else {
      payload.adminPassword = String(body.adminPassword || '');
    }

    if (action === 'setTotal') {
      payload.totalTiles = Number(body.totalTiles);
    } else if (action === 'setPanelOpacity') {
      payload.panelOpacity = Number(body.panelOpacity);
    } else if (action === 'setBackgroundDarkness') {
      payload.backgroundDarkness = Number(body.backgroundDarkness);
    } else if (action === 'setSplashText') {
      payload.line1 = String(body.line1 || '');
      payload.line2 = String(body.line2 || '');
      payload.line3 = String(body.line3 || '');
    } else if (action === 'setBackgroundLayout') {
      payload.fit = String(body.fit || 'contain');
      payload.posX = Number(body.posX);
      payload.posY = Number(body.posY);
      payload.scale = Number(body.scale);
    } else if (action === 'uploadTarget' || action === 'uploadBackground') {
      payload.imageBase64 = String(body.imageBase64 || '');
      if (!payload.imageBase64) return NextResponse.json({ ok:false, error:'Immagine mancante' }, { status:400 });
    } else if (action === 'changeAdminPassword') {
      payload.newPassword = String(body.newPassword || '');
    } else if (action === 'clearGuestPhotos' || action === 'clearTarget' || action === 'clearBackground' || action === 'adminLogin') {
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
    if (!resp.ok || !data.ok) return NextResponse.json({ ok:false, error:data.error || 'Errore admin' }, { status:500 });
    return NextResponse.json(data);
  } catch (err:any) {
    return NextResponse.json({ ok:false, error:err?.message || 'Errore admin' }, { status:500 });
  }
}
