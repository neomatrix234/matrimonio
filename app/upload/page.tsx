'use client';
import { useEffect, useRef, useState } from 'react';

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const noticeTimer = useRef<any>(null);

  const [file,setFile]=useState<File|null>(null);
  const [preview,setPreview]=useState('');
  const [status,setStatus]=useState('');
  const [result,setResult]=useState<any>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [bgUrl,setBgUrl]=useState('');
  const [opacity,setOpacity]=useState(0.04);
  const [bgDark,setBgDark]=useState(0.18);
  const [bgLayout,setBgLayout]=useState({fit:'contain',posX:50,posY:50,scale:100});
  const [notice,setNotice]=useState('');

  const [showSplash,setShowSplash]=useState(true);
  const [splashReady,setSplashReady]=useState(false);
  const [showUploader,setShowUploader]=useState(false);

  function resetToInitial(){
    setFile(null);
    setPreview('');
    setStatus('');
    setResult(null);
    setError('');
    setNotice('');
    if(fileInputRef.current) fileInputRef.current.value = '';
  }

  function showThanks(message:string){
    setNotice(message);
    if(noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => {
      resetToInitial();
    }, 5000);
  }

  useEffect(() => {
    async function loadBg(){
      try{
        const r = await fetch('/api/status?x=' + Date.now());
        const d = await r.json();
        if(d?.panelOpacity !== undefined) setOpacity(Number(d.panelOpacity));
        if(d?.backgroundDarkness !== undefined) setBgDark(Number(d.backgroundDarkness));
        if(d?.backgroundLayout) setBgLayout(d.backgroundLayout);
        if(d?.uploadBackgroundFileId){
          const version = d?.uploadBackground?.updated || Date.now();
          setBgUrl(`/api/image?id=${d.uploadBackgroundFileId}&v=${version}`);
        }
      }catch{}
    }
    loadBg();

    const readyTimer = setTimeout(()=>setSplashReady(true), 4300);

    return () => {
      clearTimeout(readyTimer);
      if(noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  function enterUploader(){
    setShowUploader(true);
    setTimeout(()=>setShowSplash(false), 650);
  }

  async function onFileChange(e:React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))[0] || null;
    setFile(selected);
    setError('');
    setResult(null);
    setNotice('');
    setStatus('');
    setPreview('');

    if (selected) {
      try {
        const r = await compressImage(selected);
        setPreview(r.previewUrl);
      } catch {
        setError('Errore preparazione foto.');
      }
    }
  }

  async function sendPhoto() {
    setError('');
    setNotice('');
    if(!file) { setError('Prima carica una foto.'); return; }

    try {
      setBusy(true);
      setStatus('Caricamento in corso...');
      const r = await compressImage(file);
      const resp = await fetch('/api/upload', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          filename:`foto_mosaico_${Date.now()}_1.jpg`,
          imageBase64:r.base64
        })
      });
      const data = await resp.json();
      if(!resp.ok || !data.ok) throw new Error(data.error || 'Errore caricamento foto');

      setResult(data);
      const missing = Math.max(0, Number(data?.missing || 0));
      const totalTiles = Number(data?.totalTiles || 0);
      const received = Number(data?.receivedCount || 0);

      if (data?.duplicate) {
        showThanks(`Questa foto era già stata caricata. Siamo a ${received}/${totalTiles}. Mancano ${missing} foto.`);
      } else {
        showThanks(data?.complete
          ? `Grazie! Fotomosaico completo: ${received}/${totalTiles}.`
          : `Grazie! Siamo a ${received}/${totalTiles}. Mancano ${missing} foto.`
        );
      }
    } catch(err:any) {
      setError(err?.message || 'Errore invio.');
    } finally {
      setBusy(false);
    }
  }

  const bgSize = bgLayout.fit === 'manual' ? `${bgLayout.scale}% auto` : bgLayout.fit;
  const bgPosition = `${bgLayout.posX}% ${bgLayout.posY}%`;

  return (
    <main className="uploadFull" style={{backgroundImage:showUploader ? `url(/splash-wedding.png)` : (bgUrl ? `url(${bgUrl})` : 'linear-gradient(135deg,#6d5b4b,#201a16)'), backgroundSize:showUploader ? 'cover' : bgSize, backgroundPosition:showUploader ? 'center' : bgPosition}}>
      <div className="bgDim" style={{opacity:bgDark}} />

      {showSplash && <div className={`splashCompose ${showUploader ? 'fadeOut' : ''}`}>
        <div className="splashWhiteGlow" />
        <div className="splashLayer splashLayerFull" />
        <div className="splashLayer splashLayerVeilTop" />
        <div className="splashLayer splashLayerGrassTop" />
        <div className="splashLayer splashLayerCenterText" />
        <div className="splashLayer splashLayerFlowerBottom" />
        <div className="splashLayer splashLayerVeilBottom" />
        <button
          className={`splashTodayButton ${splashReady ? 'ready' : ''}`}
          onClick={enterUploader}
          aria-label="Oggi sposi - apri caricamento foto"
        >
          <span className="splashTodayInvisibleText">Oggi sposi</span>
        </button>
      </div>}

      {busy && <div className="spinnerOverlay">
        <div className="spinner" />
        <div style={{fontSize:24,fontWeight:800}}>Caricamento...</div>
      </div>}

      {notice && <div className="centerNotice" onClick={resetToInitial}>
        <div className="centerNoticeBox" onClick={(e)=>e.stopPropagation()}>
          <h2>Grazie!</h2>
          <p>{notice}</p>
          <p style={{fontSize:15}}>Tra pochi secondi puoi caricare un’altra foto.</p>
          <button className="btn" onClick={resetToInitial}>Carica un’altra foto</button>
        </div>
      </div>}

      <section className={`uploadPanel simpleUpload uploadPanelAnimated ${showUploader ? 'visible' : 'hidden'}`} style={{background:`rgba(255,255,255,${opacity})`}}>
        <h1 className="uploadTitle">Partecipa al mosaico</h1>

        <input
          ref={fileInputRef}
          className="hiddenFileInput"
          type="file"
          accept="image/*"
          onChange={onFileChange}
        />

        {!file && !preview && (
          <button className="btn" onClick={()=>fileInputRef.current?.click()} disabled={busy}>
            Carica foto
          </button>
        )}

        {preview && <img className="preview" src={preview} alt="Anteprima" style={{display:'block'}}/>}

        {preview && (
          <>
            <button className="btn" disabled={busy} onClick={sendPhoto}>
              Invia foto
            </button>
            <button className="btn secondary" disabled={busy} onClick={()=>fileInputRef.current?.click()}>
              Cambia foto
            </button>
          </>
        )}

        {error && <div className="error" style={{display:'block'}}>{error}</div>}
      </section>
    </main>
  );
}
