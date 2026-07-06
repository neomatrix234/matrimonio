'use client';
import { useEffect, useState } from 'react';

const options = [600, 800, 1000, 1200, 1500];

function readOriginalFile(file: File): Promise<{base64:string;previewUrl:string;sizeKb:number}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.split(',')[1] || '';
      resolve({
        base64,
        previewUrl: dataUrl,
        sizeKb: Math.round((base64.length * 0.75) / 1024)
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function kb(size:number){
  if(!size) return '0 KB';
  if(size < 1024*1024) return `${Math.round(size/1024)} KB`;
  return `${(size/(1024*1024)).toFixed(1)} MB`;
}

export default function AdminPage(){
  const [data,setData]=useState<any>(null);
  const [msg,setMsg]=useState('');
  const [err,setErr]=useState('');
  const [busy,setBusy]=useState(false);
  const [busyText,setBusyText]=useState('Operazione in corso...');

  const [targetBase64,setTargetBase64]=useState('');
  const [targetPreview,setTargetPreview]=useState('');
  const [targetInfo,setTargetInfo]=useState('');

  const [bgBase64,setBgBase64]=useState('');
  const [bgPreview,setBgPreview]=useState('');
  const [bgInfo,setBgInfo]=useState('');

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
    setBusyText('Aggiorno numero foto...');
    setBusy(true); setErr(''); setMsg('');
    try{
      const d = await adminAction('setTotal',{totalTiles:n}, false);
      setData(d); setMsg(`Obiettivo impostato a ${n} foto/tessere.`);
    }catch{}
    finally{setBusy(false);}
  }

  async function onTargetChange(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];
    setTargetBase64(''); setTargetPreview(''); setTargetInfo(''); setErr('');
    if(!file) return;
    try{
      setBusyText('Leggo foto finale...');
      setBusy(true);
      const r=await readOriginalFile(file);
      setTargetBase64(r.base64);
      setTargetPreview(r.previewUrl);
      setTargetInfo(`Foto finale pronta in dimensione originale, circa ${r.sizeKb} KB.`);
    }catch(e:any){setErr(e?.message||'Errore lettura foto finale');}
    finally{setBusy(false);}
  }

  async function onBgChange(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];
    setBgBase64(''); setBgPreview(''); setBgInfo(''); setErr('');
    if(!file) return;
    try{
      setBusyText('Leggo sfondo...');
      setBusy(true);
      const r=await readOriginalFile(file);
      setBgBase64(r.base64);
      setBgPreview(r.previewUrl);
      setBgInfo(`Sfondo pronto in dimensione originale, circa ${r.sizeKb} KB.`);
    }catch(e:any){setErr(e?.message||'Errore lettura sfondo');}
    finally{setBusy(false);}
  }

  async function adminAction(action:string, extra:any = {}, manageBusy = true){
    if(manageBusy) setBusy(true);
    setErr(''); setMsg('');
    try{
      const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra})});
      const d=await r.json();
      if(!r.ok||!d.ok) throw new Error(d.error||'Errore');
      const newStatus = d.status || d;
      setData(newStatus);
      return newStatus;
    }catch(e:any){setErr(e?.message||'Errore'); throw e;}
    finally{if(manageBusy) setBusy(false);}
  }

  async function uploadTarget(){
    if(!targetBase64){setErr('Scegli prima la foto finale.'); return;}
    try{
      setBusyText('Carico foto finale...');
      await adminAction('uploadTarget',{imageBase64:targetBase64});
      setMsg('Foto finale caricata in dimensione originale.');
      setTargetBase64('');
    }catch{}
  }

  async function uploadBackground(){
    if(!bgBase64){setErr('Scegli prima l’immagine di sfondo.'); return;}
    try{
      setBusyText('Carico sfondo...');
      await adminAction('uploadBackground',{imageBase64:bgBase64});
      setMsg('Sfondo home/caricamento aggiornato.');
      setBgBase64('');
    }catch{}
  }

  async function clearGuestPhotos(){
    if(!confirm('Cancellare tutte le foto degli invitati da Google Drive? La foto finale e lo sfondo restano.')) return;
    try{
      setBusyText('Reset mosaico...');
      const d = await adminAction('clearGuestPhotos');
      setMsg(`Foto invitati cancellate: ${d.trashed || 0}. Foto finale e sfondo NON cancellati.`);
      await load();
    }catch{}
  }

  async function clearTarget(){
    if(!confirm('Cancellare la foto finale del mosaico?')) return;
    try{
      setBusyText('Cancello foto finale...');
      await adminAction('clearTarget');
      setMsg('Foto finale cancellata.');
      await load();
    }catch{}
  }

  async function clearBackground(){
    if(!confirm('Cancellare lo sfondo della pagina home/caricamento?')) return;
    try{
      setBusyText('Cancello sfondo...');
      await adminAction('clearBackground');
      setMsg('Sfondo caricamento cancellato.');
      await load();
    }catch{}
  }

  useEffect(()=>{load();},[]);
  const pct=data?Math.min(100,Math.round((data.receivedCount/data.totalTiles)*100)):0;

  return (
    <main className="container">
      {busy && <div className="adminSpinnerOverlay">
        <div className="adminSpinner" />
        <div style={{fontSize:24,fontWeight:800}}>{busyText}</div>
      </div>}

      {msg && !busy && <div className="adminFloatingMsg" onClick={()=>setMsg('')}>
        <div className="ok">{msg}</div>
        <div className="spacer" />
        <button className="btn" onClick={()=>setMsg('')}>OK</button>
      </div>}

      <section className="card">
        <h1>Admin fotomosaico</h1>

        {data && <div className="adminStatus">
          <div><b>Obiettivo impostato:</b> {data.totalTiles} foto/tessere</div>
          <div><b>Foto invitati caricate:</b> {data.receivedCount}</div>
          <div><b>Mancano:</b> {data.missing}</div>
          <div><b>Foto finale mosaico:</b> {data.hasTarget ? `SÌ — ${data.target?.name} — ${kb(data.target?.size)}` : 'NO'}</div>
          <div><b>Sfondo home/caricamento:</b> {data.hasUploadBackground ? `SÌ — ${data.uploadBackground?.name} — ${kb(data.uploadBackground?.size)}` : 'NO'}</div>
        </div>}

        {data && <>
          <div className="bigcount">{data.receivedCount} / {data.totalTiles}</div>
          <div className="progressbar"><div style={{width:`${pct}%`}} /></div>
        </>}

        <p>Il reset cancella solo le foto degli invitati. Foto finale e sfondo restano, oppure puoi cancellarli con i pulsanti dedicati.</p>

        <h2>1. Scegli numero foto</h2>
        <div className="gridBtns">{options.map(n=><button className="btn" disabled={busy} key={n} onClick={()=>setTotal(n)}>{n} foto</button>)}</div>

        <div className="spacer" />
        <h2>2. Foto finale da riprodurre</h2>
        <p>Viene salvata come <b>__TARGET_MOSAICO.jpg</b> in dimensione originale.</p>
        <input className="field" type="file" accept="image/*" onChange={onTargetChange}/>
        {targetPreview && <img className="preview" src={targetPreview} alt="Foto finale" style={{display:'block'}}/>}
        {targetInfo && <div className="ok">{targetInfo}</div>}
        <div className="spacer" />
        <button className="btn" disabled={busy || !targetBase64} onClick={uploadTarget}>Carica foto finale</button>
        <div className="spacer" />
        <button className="btn danger" disabled={busy || !data?.hasTarget} onClick={clearTarget}>Cancella foto finale</button>

        <div className="spacer" />
        <h2>3. Sfondo home/caricamento</h2>
        <p>Viene salvato come <b>__UPLOAD_BACKGROUND.jpg</b> in dimensione originale.</p>
        <input className="field" type="file" accept="image/*" onChange={onBgChange}/>
        {bgPreview && <img className="preview" src={bgPreview} alt="Sfondo caricamento" style={{display:'block'}}/>}
        {bgInfo && <div className="ok">{bgInfo}</div>}
        <div className="spacer" />
        <button className="btn" disabled={busy || !bgBase64} onClick={uploadBackground}>Aggiorna sfondo home/caricamento</button>
        <div className="spacer" />
        <button className="btn danger" disabled={busy || !data?.hasUploadBackground} onClick={clearBackground}>Cancella sfondo</button>

        <div className="spacer" />
        <h2>4. Schermo</h2>
        <a className="btn secondary" href="/screen" target="_blank">Apri schermo mosaico</a>

        <div className="spacer" />
        <button className="btn secondary" onClick={load}>Aggiorna stato</button>

        <div className="spacer" />
        <button className="btn danger" disabled={busy} onClick={clearGuestPhotos}>Reset mosaico: cancella solo foto invitati</button>

        {err && <><div className="spacer" /><div className="error" style={{display:'block'}}>{err}</div></>}
      </section>
    </main>
  );
}
