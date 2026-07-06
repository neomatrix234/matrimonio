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

export default function UploadPage() {
  const [files,setFiles]=useState<File[]>([]);
  const [preview,setPreview]=useState('');
  const [status,setStatus]=useState('');
  const [result,setResult]=useState<any>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(0);
  const [total,setTotal]=useState(0);

  async function onFileChange(e:React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    setFiles(selected);
    setError('');
    setResult(null);
    setDone(0);
    setTotal(selected.length);
    setStatus(selected.length === 1 ? '1 foto selezionata.' : `${selected.length} foto selezionate.`);
    setPreview('');

    if (selected[0]) {
      try {
        const r = await compressImage(selected[0]);
        setPreview(r.previewUrl);
      } catch {}
    }
  }

  async function uploadOne(file: File, index: number) {
    const r = await compressImage(file);
    if (index === 0) setPreview(r.previewUrl);

    const resp = await fetch('/api/upload', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        filename:`foto_mosaico_${Date.now()}_${index+1}.jpg`,
        imageBase64:r.base64
      })
    });

    const data = await resp.json();
    if(!resp.ok || !data.ok) throw new Error(data.error || `Errore caricamento foto ${index+1}`);
    return data;
  }

  async function sendPhotos() {
    setError('');
    if(!files.length) { setError('Prima scegli una o più foto.'); return; }

    try {
      setBusy(true);
      setDone(0);
      setTotal(files.length);
      setStatus('Caricamento in corso...');

      let last:any = null;
      for (let i=0; i<files.length; i++) {
        setStatus(`Riduco e invio foto ${i+1} di ${files.length}...`);
        last = await uploadOne(files[i], i);
        setDone(i+1);
        setResult(last);
        await new Promise(res => setTimeout(res, 180));
      }

      setStatus(files.length === 1 ? 'Foto caricata.' : `${files.length} foto caricate.`);
      setFiles([]);
    } catch(err:any) {
      setError(err?.message || 'Errore invio.');
    } finally {
      setBusy(false);
    }
  }

  const pctUpload = total ? Math.round((done/total)*100) : 0;
  const pctMosaic = result ? Math.min(100,Math.round((result.receivedCount/result.totalTiles)*100)) : 0;

  return (
    <main className="container">
      <section className="card">
        <h1>Carica foto</h1>
        <p>Puoi scegliere una sola foto oppure più foto insieme. Ogni foto viene ridotta prima dell’invio.</p>

        <input className="field" type="file" accept="image/*" multiple onChange={onFileChange}/>

        {preview && <img className="preview" src={preview} alt="Anteprima" style={{display:'block'}}/>}

        {status && <div className="ok">{status}</div>}

        {total > 0 && <>
          <div className="bigcount">{done} / {total} caricate</div>
          <div className="progressbar"><div style={{width:`${pctUpload}%`}} /></div>
        </>}

        {result && <>
          <div className="bigcount">Mosaico: {result.receivedCount} / {result.totalTiles}</div>
          <div className="progressbar"><div style={{width:`${pctMosaic}%`}} /></div>
          <p>{result.complete ? 'Mosaico completo!' : `Mancano ${result.missing} foto.`}</p>
        </>}

        {error && <div className="error" style={{display:'block'}}>{error}</div>}

        <div className="spacer" />
        <button className="btn" disabled={busy || !files.length} onClick={sendPhotos}>
          {busy ? 'Caricamento...' : files.length > 1 ? `Invia ${files.length} foto` : 'Invia foto'}
        </button>

        <p className="small">
          Per fare test, carica gruppi da 20–50 foto alla volta. Per 100 o più foto conviene fare più blocchi.
        </p>
      </section>
    </main>
  );
}
