'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}
async function compressImage(file: File): Promise<{base64:string;previewUrl:string;sizeKb:number}> {
  const img = await loadImage(file);
  const size = Number(process.env.NEXT_PUBLIC_MAX_IMAGE_SIZE || 700);
  const q = Number(process.env.NEXT_PUBLIC_JPEG_QUALITY || 0.70);
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile.');
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = Math.floor((img.naturalWidth - side) / 2);
  const sy = Math.floor((img.naturalHeight - side) / 2);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  const dataUrl = canvas.toDataURL('image/jpeg', q);
  const base64 = dataUrl.split(',')[1] || '';
  return { base64, previewUrl: dataUrl, sizeKb: Math.round((base64.length * 0.75) / 1024) };
}

export default function TestUploadPage(){
  const inputRef=useRef<HTMLInputElement|null>(null);
  const stopRef=useRef(false);
  const [logged,setLogged]=useState(false);
  const [password,setPassword]=useState('');
  const [files,setFiles]=useState<File[]>([]);
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(0);
  const [duplicates,setDuplicates]=useState(0);
  const [result,setResult]=useState<any>(null);
  const [err,setErr]=useState('');

  useEffect(()=>{
    const p=sessionStorage.getItem('fm_admin_password');
    if(p){setPassword(p); setLogged(true);}
    const clearAdmin = () => { sessionStorage.removeItem('fm_admin_password'); };
    const onKey = (e:KeyboardEvent) => {
      if(e.key === 'Escape'){
        stopRef.current = true;
        setStatus('Interruzione richiesta...');
      }
    };
    window.addEventListener('pagehide', clearAdmin);
    window.addEventListener('beforeunload', clearAdmin);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pagehide', clearAdmin);
      window.removeEventListener('beforeunload', clearAdmin);
      window.removeEventListener('keydown', onKey);
    };
  },[]);

  async function login(){
    setErr('');
    const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'adminLogin',password})});
    const d=await r.json();
    if(!r.ok||!d.ok){setErr(d.error||'Password non valida');return;}
    sessionStorage.setItem('fm_admin_password',password);
    setLogged(true);
  }

  function onFiles(e:React.ChangeEvent<HTMLInputElement>){
    const selected=Array.from(e.target.files||[]).filter(f=>f.type.startsWith('image/'));
    setFiles(selected);
    setDone(0);
    setDuplicates(0);
    setStatus(`${selected.length} foto selezionate per test.`);
  }

  async function uploadOne(file:File,index:number){
    const r=await compressImage(file);
    const resp=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:`foto_mosaico_test_${Date.now()}_${index+1}.jpg`,imageBase64:r.base64})});
    const data=await resp.json();
    if(!resp.ok||!data.ok) throw new Error(data.error||`Errore foto ${index+1}`);
    return data;
  }

  async function send(){
    if(!files.length){setErr('Scegli prima le foto.');return;}
    setBusy(true);setErr('');setDone(0);setDuplicates(0);setResult(null);stopRef.current=false;
    try{
      let last:any=null;
      for(let i=0;i<files.length;i++){
        if(stopRef.current){ setStatus(`Caricamento interrotto: ${i} foto caricate.`); break; }
        setStatus(`Test upload: foto ${i+1} di ${files.length}`);
        last=await uploadOne(files[i],i);
        setDone(i+1);
        if(last?.duplicate) setDuplicates(prev=>prev+1);
        setResult(last);
        await new Promise(res=>setTimeout(res,150));
      }
      if(!stopRef.current) setStatus(`Test completato: ${files.length} file elaborati.`);
      setFiles([]);
      if(inputRef.current) inputRef.current.value='';
    }catch(e:any){setErr(e?.message||'Errore test upload');}
    finally{setBusy(false);}
  }

  if(!logged){
    return <main className="container"><section className="card">
      <h1>Upload test Admin</h1>
      <p>Password default: admin123</p>
      <input className="field" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password admin" onKeyDown={(e)=>{if(e.key==='Enter') login();}}/>
      <div className="spacer"/><button className="btn" onClick={login}>Accedi</button>
      {err&&<><div className="spacer"/><div className="error" style={{display:'block'}}>{err}</div></>}
    </section></main>
  }

  const pct=files.length?Math.round((done/files.length)*100):0;
  return <main className="container"><section className="card">
    {busy&&<div className="adminSpinnerOverlay"><div className="adminSpinner"/><div style={{fontSize:24,fontWeight:800}}>{status}</div></div>}
    <h1>Upload multiplo per test</h1>
    <p>Solo Admin. Puoi provare blocchi da 50, 100, 300, 400 o 500 foto.</p>
    <input ref={inputRef} className="field" type="file" accept="image/*" multiple onChange={onFiles}/>
    <div className="bigcount">{done} / {files.length}</div>
    <div className="progressbar"><div style={{width:`${pct}%`}}/></div>
    <p className="small">Duplicati reali trovati e non salvati di nuovo: {duplicates}</p>
    <button className="btn" disabled={busy||!files.length} onClick={send}>Carica foto test</button>
    <div className="spacer"/><button className="btn danger" disabled={!busy} onClick={()=>{stopRef.current=true;setStatus('Interruzione richiesta...')}}>Interrompi upload test</button>
    <p className="small">Puoi interrompere anche premendo ESC.</p>
    {status&&<><div className="spacer"/><div className="ok">{status}</div></>}
    {result&&<p>{result.duplicate ? 'Ultima immagine già presente, saltata.' : 'Ultima immagine salvata.'} Mosaico: {result.receivedCount}/{result.totalTiles}. Mancano {result.missing}.</p>}
    {err&&<><div className="spacer"/><div className="error" style={{display:'block'}}>{err}</div></>}
    <div className="spacer"/><Link className="btn secondary" href="/admin">Torna ad Admin</Link>
  </section></main>
}
