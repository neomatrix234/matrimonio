'use client';
import { useEffect, useState } from 'react';

const options = [600, 800, 1000, 1200, 1500];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

async function compressTarget(file: File): Promise<{base64:string;previewUrl:string;sizeKb:number}> {
  const img = await loadImage(file);
  const maxW = 1400;
  const ratio = img.naturalWidth > img.naturalHeight ? maxW / img.naturalWidth : maxW / img.naturalHeight;
  const w = Math.round(img.naturalWidth * Math.min(1, ratio));
  const h = Math.round(img.naturalHeight * Math.min(1, ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile.');
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
  const base64 = dataUrl.split(',')[1] || '';
  return { base64, previewUrl: dataUrl, sizeKb: Math.round((base64.length * 0.75) / 1024) };
}

export default function AdminPage(){
  const [data,setData]=useState<any>(null);
  const [msg,setMsg]=useState('');
  const [err,setErr]=useState('');
  const [busy,setBusy]=useState(false);
  const [targetBase64,setTargetBase64]=useState('');
  const [targetPreview,setTargetPreview]=useState('');
  const [targetInfo,setTargetInfo]=useState('');

  async function load(){
    setErr('');
    try{
      const r=await fetch('/api/status?x='+Date.now());
      const d=await r.json();
      if(!r.ok||!d.ok) throw new Error(d.error||'Errore');
      setData(d);
    }catch(e:any){setErr(e?.message||'Errore caricamento');}
  }

  async function setTotal(n:number){
    setBusy(true); setErr(''); setMsg('');
    try{
      const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'setTotal',totalTiles:n})});
      const d=await r.json();
      if(!r.ok||!d.ok) throw new Error(d.error||'Errore');
      setData(d); setMsg(`Obiettivo impostato a ${n} foto/tessere.`);
    }catch(e:any){setErr(e?.message||'Errore salvataggio');}
    finally{setBusy(false);}
  }

  async function onTargetChange(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];
    setTargetBase64(''); setTargetPreview(''); setTargetInfo(''); setErr('');
    if(!file) return;
    try{
      setBusy(true);
      const r=await compressTarget(file);
      setTargetBase64(r.base64);
      setTargetPreview(r.previewUrl);
      setTargetInfo(`Foto finale pronta, circa ${r.sizeKb} KB.`);
    }catch(e:any){setErr(e?.message||'Errore preparazione foto finale');}
    finally{setBusy(false);}
  }

  async function uploadTarget(){
    if(!targetBase64){setErr('Scegli prima la foto finale.'); return;}
    setBusy(true); setErr(''); setMsg('');
    try{
      const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'uploadTarget',imageBase64:targetBase64})});
      const d=await r.json();
      if(!r.ok||!d.ok) throw new Error(d.error||'Errore upload foto finale');
      setData(d); setMsg('Foto finale caricata. Verrà mostrata solo alla fine del mosaico.');
    }catch(e:any){setErr(e?.message||'Errore upload foto finale');}
    finally{setBusy(false);}
  }

  async function clearGuestPhotos(){
    if(!confirm('Cancellare tutte le foto degli invitati da Google Drive? La foto finale resta.')) return;
    setBusy(true); setErr(''); setMsg('');
    try{
      const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'clearGuestPhotos'})});
      const d=await r.json();
      if(!r.ok||!d.ok) throw new Error(d.error||'Errore cancellazione');
      setMsg(`Foto cancellate: ${d.trashed || 0}.`);
      await load();
    }catch(e:any){setErr(e?.message||'Errore cancellazione');}
    finally{setBusy(false);}
  }

  useEffect(()=>{load();},[]);
  const pct=data?Math.min(100,Math.round((data.receivedCount/data.totalTiles)*100)):0;

  return (
    <main className="container">
      <section className="card">
        <h1>Admin fotomosaico</h1>
        <p>Per 180 invitati consiglio di partire da <b>600 foto</b>. Puoi aumentare se vedi che arrivano molte foto.</p>
        {data && <>
          <div className="bigcount">{data.receivedCount} / {data.totalTiles}</div>
          <div className="progressbar"><div style={{width:`${pct}%`}} /></div>
          <p>{data.complete ? 'Mosaico completo' : `Mancano ${data.missing} foto.`}</p>
          <p><b>Foto finale caricata:</b> {data.hasTarget ? 'SÌ' : 'NO'}</p>
        </>}
        <h2>1. Scegli numero foto</h2>
        <div className="gridBtns">{options.map(n=><button className="btn" disabled={busy} key={n} onClick={()=>setTotal(n)}>{n} foto</button>)}</div>
        <div className="spacer" />
        <h2>2. Carica foto finale</h2>
        <p>Questa è la foto da riprodurre nel mosaico. Non sarà visibile durante la costruzione, ma solo alla fine.</p>
        <input className="field" type="file" accept="image/*" onChange={onTargetChange}/>
        {targetPreview && <img className="preview" src={targetPreview} alt="Foto finale" style={{display:'block'}}/>}
        {targetInfo && <div className="ok">{targetInfo}</div>}
        <div className="spacer" />
        <button className="btn" disabled={busy || !targetBase64} onClick={uploadTarget}>Carica foto finale</button>
        <div className="spacer" />
        <h2>3. Schermo</h2>
        <a className="btn secondary" href="/screen" target="_blank">Apri schermo mosaico</a>
        <div className="spacer" />
        <button className="btn secondary" onClick={load}>Aggiorna stato</button>
        <div className="spacer" />
        <button className="btn danger" disabled={busy} onClick={clearGuestPhotos}>Cancella foto invitati da Drive</button>
        {msg && <><div className="spacer" /><div className="ok">{msg}</div></>}
        {err && <><div className="spacer" /><div className="error" style={{display:'block'}}>{err}</div></>}
      </section>
    </main>
  );
}
