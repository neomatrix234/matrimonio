'use client';
import { useEffect, useRef, useState } from 'react';

type PreparedUpload = { base64:string; previewUrl:string; sizeKb:number };
type CropState = {
  src:string;
  width:number;
  height:number;
  baseScale:number;
  zoom:number;
  x:number;
  y:number;
};

const CROP_BOX = 300;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImageFromSrc(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function clampCropPosition(x:number, y:number, crop:CropState, zoom:number){
  const scale = crop.baseScale * zoom;
  const scaledW = crop.width * scale;
  const scaledH = crop.height * scale;
  const minX = Math.min(0, CROP_BOX - scaledW);
  const minY = Math.min(0, CROP_BOX - scaledH);
  const maxX = 0;
  const maxY = 0;
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y))
  };
}

async function renderCroppedImage(crop: CropState): Promise<PreparedUpload> {
  const img = await loadImageFromSrc(crop.src);
  const size = Number(process.env.NEXT_PUBLIC_MAX_IMAGE_SIZE || 700);
  const q = Number(process.env.NEXT_PUBLIC_JPEG_QUALITY || 0.70);
  const scale = crop.baseScale * crop.zoom;
  const srcX = Math.max(0, (-crop.x) / scale);
  const srcY = Math.max(0, (-crop.y) / scale);
  const srcW = Math.min(img.naturalWidth - srcX, CROP_BOX / scale);
  const srcH = Math.min(img.naturalHeight - srcY, CROP_BOX / scale);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile.');
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, size, size);
  const dataUrl = canvas.toDataURL('image/jpeg', q);
  const base64 = dataUrl.split(',')[1] || '';
  return { base64, previewUrl: dataUrl, sizeKb: Math.round((base64.length * 0.75) / 1024) };
}

export default function UploadPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const noticeTimer = useRef<any>(null);
  const dragRef = useRef<{startX:number;startY:number;originX:number;originY:number} | null>(null);
  const cropStateRef = useRef<CropState | null>(null);

  const [file,setFile]=useState<File|null>(null);
  const [preparedUpload,setPreparedUpload]=useState<PreparedUpload|null>(null);
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

  const [cropOpen,setCropOpen]=useState(false);
  const [cropState,setCropState]=useState<CropState|null>(null);
  const [cropBusy,setCropBusy]=useState(false);

  useEffect(() => { cropStateRef.current = cropState; }, [cropState]);

  function resetToInitial(){
    setFile(null);
    setPreparedUpload(null);
    setStatus('');
    setResult(null);
    setError('');
    setNotice('');
    setCropOpen(false);
    setCropState(null);
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

    const readyTimer = setTimeout(()=>setSplashReady(true), 6200);

    const onPointerMove = (e: PointerEvent) => {
      if(!dragRef.current || !cropStateRef.current) return;
      const current = cropStateRef.current;
      const nextX = dragRef.current.originX + (e.clientX - dragRef.current.startX);
      const nextY = dragRef.current.originY + (e.clientY - dragRef.current.startY);
      const clamped = clampCropPosition(nextX, nextY, current, current.zoom);
      setCropState({...current, x:clamped.x, y:clamped.y});
    };
    const onPointerUp = () => { dragRef.current = null; };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      clearTimeout(readyTimer);
      if(noticeTimer.current) clearTimeout(noticeTimer.current);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  function enterUploader(){
    setShowUploader(true);
    setTimeout(()=>setShowSplash(false), 650);
  }

  async function openCropper(selected: File){
    const src = await readFileAsDataUrl(selected);
    const img = await loadImageFromSrc(src);
    const baseScale = Math.max(CROP_BOX / img.naturalWidth, CROP_BOX / img.naturalHeight);
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const scaledW = width * baseScale;
    const scaledH = height * baseScale;
    setCropState({
      src,
      width,
      height,
      baseScale,
      zoom:1,
      x:(CROP_BOX - scaledW) / 2,
      y:(CROP_BOX - scaledH) / 2,
    });
    setCropOpen(true);
  }

  async function onFileChange(e:React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))[0] || null;
    setFile(selected);
    setPreparedUpload(null);
    setError('');
    setResult(null);
    setNotice('');
    setStatus('');
    setCropOpen(false);
    setCropState(null);

    if (selected) {
      try {
        await openCropper(selected);
      } catch {
        setError('Errore preparazione foto.');
      }
    }
  }

  function onCropPointerDown(e:React.PointerEvent<HTMLDivElement>){
    if(!cropState) return;
    e.preventDefault();
    dragRef.current = {
      startX:e.clientX,
      startY:e.clientY,
      originX:cropState.x,
      originY:cropState.y,
    };
  }

  function onZoomChange(nextZoom:number){
    if(!cropState) return;
    const oldScale = cropState.baseScale * cropState.zoom;
    const newScale = cropState.baseScale * nextZoom;
    const centerSourceX = (CROP_BOX / 2 - cropState.x) / oldScale;
    const centerSourceY = (CROP_BOX / 2 - cropState.y) / oldScale;
    const nextX = CROP_BOX / 2 - centerSourceX * newScale;
    const nextY = CROP_BOX / 2 - centerSourceY * newScale;
    const clamped = clampCropPosition(nextX, nextY, cropState, nextZoom);
    setCropState({...cropState, zoom:nextZoom, x:clamped.x, y:clamped.y});
  }

  function resetCrop(){
    if(!cropState) return;
    const scaledW = cropState.width * cropState.baseScale;
    const scaledH = cropState.height * cropState.baseScale;
    setCropState({
      ...cropState,
      zoom:1,
      x:(CROP_BOX - scaledW) / 2,
      y:(CROP_BOX - scaledH) / 2,
    });
  }

  async function confirmCrop(){
    if(!cropState) return;
    try{
      setCropBusy(true);
      const prepared = await renderCroppedImage(cropState);
      setPreparedUpload(prepared);
      setStatus(`Foto ritagliata e pronta all'invio (${prepared.sizeKb} KB).`);
      setCropOpen(false);
    }catch{
      setError('Errore durante il ritaglio della foto.');
    }finally{
      setCropBusy(false);
    }
  }

  function cancelCrop(){
    resetToInitial();
  }

  async function sendPhoto() {
    setError('');
    setNotice('');
    if(!file || !preparedUpload) { setError('Prima scegli e ritaglia una foto.'); return; }

    try {
      setBusy(true);
      setStatus('Caricamento in corso...');
      const resp = await fetch('/api/upload', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          filename:`foto_mosaico_${Date.now()}_1.jpg`,
          imageBase64:preparedUpload.base64
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
  const preview = preparedUpload?.previewUrl || '';

  return (
    <main className={`uploadFull ${showUploader ? 'uploaderActive' : ''}`} style={{backgroundImage:showUploader ? `url(/splash-wedding.png)` : (bgUrl ? `url(${bgUrl})` : 'linear-gradient(135deg,#6d5b4b,#201a16)'), backgroundSize:showUploader ? 'cover' : bgSize, backgroundPosition:showUploader ? 'center' : bgPosition}}>
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

      {(busy || cropBusy) && <div className="spinnerOverlay">
        <div className="spinner" />
        <div style={{fontSize:24,fontWeight:800}}>{busy ? 'Caricamento...' : 'Preparazione foto...'}</div>
      </div>}

      {notice && <div className="centerNotice" onClick={resetToInitial}>
        <div className="centerNoticeBox" onClick={(e)=>e.stopPropagation()}>
          <h2>Grazie!</h2>
          <p>{notice}</p>
          <p style={{fontSize:15}}>Tra pochi secondi puoi caricare un’altra foto.</p>
          <button className="btn" onClick={resetToInitial}>Carica un’altra foto</button>
        </div>
      </div>}

      {cropOpen && cropState && (
        <div style={{position:'fixed', inset:0, zIndex:60, background:'rgba(15,10,8,.82)', display:'flex', alignItems:'center', justifyContent:'center', padding:16}}>
          <div style={{width:'min(92vw, 430px)', borderRadius:24, padding:'18px 18px 16px', background:'rgba(255,250,244,.92)', boxShadow:'0 30px 80px rgba(0,0,0,.38)', backdropFilter:'blur(10px)', color:'#4f3c2f'}}>
            <h2 style={{margin:'0 0 8px', textAlign:'center', fontSize:26}}>Ritaglia la foto</h2>
            <p style={{margin:'0 0 12px', textAlign:'center', fontSize:14, lineHeight:1.4}}>Sposta la foto con il dito o con il mouse e usa lo zoom. Il ritaglio è obbligatorio prima dell’invio.</p>

            <div style={{display:'flex', justifyContent:'center'}}>
              <div
                onPointerDown={onCropPointerDown}
                style={{width:CROP_BOX, height:CROP_BOX, overflow:'hidden', position:'relative', borderRadius:20, border:'2px solid rgba(201,168,112,.9)', boxShadow:'0 0 0 9999px rgba(0,0,0,.26) inset, 0 8px 30px rgba(0,0,0,.18)', background:'#f4eee7', touchAction:'none', userSelect:'none'}}
              >
                <img
                  src={cropState.src}
                  alt="Ritaglio"
                  draggable={false}
                  style={{position:'absolute', left:cropState.x, top:cropState.y, width:cropState.width * cropState.baseScale * cropState.zoom, height:cropState.height * cropState.baseScale * cropState.zoom, maxWidth:'none', maxHeight:'none', pointerEvents:'none', userSelect:'none'}}
                />
                <div style={{position:'absolute', inset:0, border:'2px solid rgba(255,255,255,.95)', borderRadius:20, boxSizing:'border-box', boxShadow:'inset 0 0 0 1px rgba(0,0,0,.1)'}} />
              </div>
            </div>

            <div style={{marginTop:16}}>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6}}>
                <span>Zoom</span>
                <span>{cropState.zoom.toFixed(2)}×</span>
              </div>
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={cropState.zoom}
                onChange={(e)=>onZoomChange(Number(e.target.value))}
                style={{width:'100%'}}
              />
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:16}}>
              <button className="btn secondary" onClick={cancelCrop} disabled={cropBusy}>Annulla</button>
              <button className="btn secondary" onClick={resetCrop} disabled={cropBusy}>Reimposta</button>
              <button className="btn secondary" onClick={()=>fileInputRef.current?.click()} disabled={cropBusy}>Cambia foto</button>
              <button className="btn" onClick={confirmCrop} disabled={cropBusy}>Conferma ritaglio</button>
            </div>
          </div>
        </div>
      )}

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
          <button className="btn" onClick={()=>fileInputRef.current?.click()} disabled={busy || cropBusy}>
            Carica foto
          </button>
        )}

        {preview && <img className="preview" src={preview} alt="Anteprima ritagliata" style={{display:'block'}}/>}

        {preview && (
          <>
            <button className="btn" disabled={busy || cropBusy} onClick={sendPhoto}>
              Invia foto
            </button>
            <button className="btn secondary" disabled={busy || cropBusy} onClick={()=>setCropOpen(true)}>
              Ritaglia di nuovo
            </button>
            <button className="btn secondary" disabled={busy || cropBusy} onClick={()=>fileInputRef.current?.click()}>
              Cambia foto
            </button>
          </>
        )}

        {!preview && file && !cropOpen && (
          <div className="error" style={{display:'block'}}>Devi ritagliare la foto prima dell’invio.</div>
        )}

        {status && !notice && <div className="ok" style={{display:'block'}}>{status}</div>}
        {error && <div className="error" style={{display:'block'}}>{error}</div>}
      </section>
    </main>
  );
}
