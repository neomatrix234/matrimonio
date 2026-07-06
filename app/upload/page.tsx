'use client';
import { useState } from 'react';

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

async function compressImage(file: File, maxSize?: number, quality?: number): Promise<{base64:string;previewUrl:string;sizeKb:number}> {
  const img = await loadImage(file);
  const size = maxSize || Number(process.env.NEXT_PUBLIC_MAX_IMAGE_SIZE || 700);
  const q = quality || Number(process.env.NEXT_PUBLIC_JPEG_QUALITY || 0.70);
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

export default function UploadPage() {
  const [base64,setBase64]=useState('');
  const [preview,setPreview]=useState('');
  const [status,setStatus]=useState('');
  const [result,setResult]=useState<any>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);

  async function onFileChange(e:React.ChangeEvent<HTMLInputElement>) {
    const file=e.target.files?.[0];
    setError(''); setStatus(''); setBase64(''); setPreview(''); setResult(null);
    if(!file) return;
    if(!file.type.startsWith('image/')) { setError('Scegli una foto valida.'); return; }
    try {
      setBusy(true);
      setStatus('Preparo e riduco la foto...');
      const r=await compressImage(file);
      setBase64(r.base64); setPreview(r.previewUrl);
      setStatus(`Anteprima pronta. Foto ridotta a circa ${r.sizeKb} KB.`);
    } catch(err:any) {
      setError(err?.message || 'Errore preparazione foto.');
    } finally { setBusy(false); }
  }

  async function sendPhoto() {
    setError('');
    if(!base64) { setError('Prima scegli una foto.'); return; }
    try {
      setBusy(true); setStatus('Invio foto...');
      const resp=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:`foto_mosaico_${Date.now()}.jpg`,imageBase64:base64})});
      const data=await resp.json();
      if(!resp.ok || !data.ok) throw new Error(data.error || 'Upload non riuscito.');
      setResult(data);
      setStatus(data.complete ? 'Grazie! Il fotomosaico è completo.' : 'Grazie! La tua foto è stata aggiunta.');
      setBase64(''); setPreview('');
    } catch(err:any) {
      setError(err?.message || 'Errore invio.');
    } finally { setBusy(false); }
  }

  const pct=result?Math.min(100,Math.round((result.receivedCount/result.totalTiles)*100)):0;

  return (
    <main className="container">
      <section className="card">
        <h1>Carica una foto</h1>
        <p>La foto viene ridotta prima dell’invio e diventerà una tessera del mosaico.</p>
        <input className="field" type="file" accept="image/*" onChange={onFileChange}/>
        {preview && <img className="preview" src={preview} alt="Anteprima" style={{display:'block'}}/>}
        {status && <div className="ok">{status}</div>}
        {result && <>
          <div className="bigcount">{result.receivedCount} / {result.totalTiles}</div>
          <div className="progressbar"><div style={{width:`${pct}%`}} /></div>
          <p>{result.complete ? 'Mosaico completo!' : `Mancano ${result.missing} foto.`}</p>
        </>}
        {error && <div className="error" style={{display:'block'}}>{error}</div>}
        <div className="spacer" />
        <button className="btn" disabled={busy || !base64} onClick={sendPhoto}>{busy ? 'Attendi...' : 'Invia foto'}</button>
      </section>
    </main>
  );
}
