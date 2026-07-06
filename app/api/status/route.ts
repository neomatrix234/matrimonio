import { NextResponse } from 'next/server';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const scriptUrl = process.env.APPS_SCRIPT_URL;
    if (!scriptUrl) {
      return NextResponse.json({ ok: false, error: 'APPS_SCRIPT_URL mancante' }, { status: 500 });
    }
    const resp = await fetch(`${scriptUrl}?action=status`, { cache: 'no-store', redirect: 'follow' });
    const text = await resp.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { data = { ok: false, error: text.slice(0, 500) }; }
    return NextResponse.json(data, { status: resp.ok ? 200 : 500 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Errore status' }, { status: 500 });
  }
}
