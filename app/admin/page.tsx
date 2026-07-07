'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const options = [600, 800, 1000, 1200, 1500, 2000, 2500, 3000];

function readOriginalFile(file: File): Promise<{base64:string;previewUrl:string;sizeKb:number}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.split(',')[1] || '';
      resolve({ base64, previewUrl:dataUrl, sizeKb:Math.round((base64.length*0.75)/1024) });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function kb(size:number){ if(!size) return '0 KB'; if(size<1024*1024) return `${Math.round(size/1024)} KB`; return `${(size/(1024*1024)).toFixed(1)} MB`; }


type PreviewPhoto = { id:string; name:string; created:number; size:number };
type Rgb = [number,number,number];
type Lab = [number,number,number];
type PreviewFeature = { id:string; url:string; avg:Rgb; lab:Lab; lum:number; sat:number; useCount:number };
type PreviewCell = { index:number; color:Rgb; lab:Lab; lum:number; sat:number; importance:number };

function gridForTotal(total:number){
  if(total <= 600) return {cols:30, rows:20};
  if(total <= 800) return {cols:40, rows:20};
  if(total <= 1000) return {cols:40, rows:25};
  if(total <= 1200) return {cols:40, rows:30};
  if(total <= 1500) return {cols:50, rows:30};
  if(total <= 2000) return {cols:50, rows:40};
  if(total <= 2500) return {cols:50, rows:50};
  return {cols:60, rows:50};
}
function clamp(v:number,min=0,max=255){ return Math.max(min, Math.min(max, v)); }
function clamp01(v:number){ return Math.max(0, Math.min(1, v)); }
function mix(a:number,b:number,t:number){ return a + (b-a)*t; }
function mixRgb(a:Rgb,b:Rgb,t:number): Rgb{ return [Math.round(mix(a[0],b[0],t)),Math.round(mix(a[1],b[1],t)),Math.round(mix(a[2],b[2],t))]; }
function luminance(c:number[]){ return (0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]) / 255; }
function saturation(c:number[]){ const max=Math.max(c[0],c[1],c[2]); const min=Math.min(c[0],c[1],c[2]); return max===0 ? 0 : (max-min)/max; }
function srgbToLinear(v:number){ const x=v/255; return x <= 0.04045 ? x/12.92 : Math.pow((x+0.055)/1.055, 2.4); }
function rgbToLab(rgb:Rgb):Lab{
  const r=srgbToLinear(rgb[0]), g=srgbToLinear(rgb[1]), b=srgbToLinear(rgb[2]);
  let x = r*0.4124564 + g*0.3575761 + b*0.1804375;
  let y = r*0.2126729 + g*0.7151522 + b*0.0721750;
  let z = r*0.0193339 + g*0.1191920 + b*0.9503041;
  x /= 0.95047; y /= 1.0; z /= 1.08883;
  const f=(t:number)=> t > 0.008856 ? Math.cbrt(t) : (7.787*t + 16/116);
  const fx=f(x), fy=f(y), fz=f(z);
  return [116*fy - 16, 500*(fx-fy), 200*(fy-fz)];
}
function labDistance(a:Lab,b:Lab){
  const dl=a[0]-b[0], da=a[1]-b[1], db=a[2]-b[2];
  return dl*dl*1.35 + da*da + db*db;
}
function rgbToHsl(rgb:Rgb): [number,number,number]{
  const r=rgb[0]/255, g=rgb[1]/255, b=rgb[2]/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h=0, s=0;
  const l=(max+min)/2;
  if(max!==min){
    const d=max-min;
    s=l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h=(g-b)/d + (g<b ? 6 : 0); break;
      case g: h=(b-r)/d + 2; break;
      default: h=(r-g)/d + 4; break;
    }
    h/=6;
  }
  return [h,s,l];
}
function hue2rgb(p:number,q:number,t:number){
  if(t<0) t+=1;
  if(t>1) t-=1;
  if(t<1/6) return p+(q-p)*6*t;
  if(t<1/2) return q;
  if(t<2/3) return p+(q-p)*(2/3-t)*6;
  return p;
}
function hslToRgb(h:number,s:number,l:number): Rgb{
  let r:number,g:number,b:number;
  if(s===0){ r=g=b=l; }
  else{
    const q=l<0.5 ? l*(1+s) : l+s-l*s;
    const p=2*l-q;
    r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);
  }
  return [Math.round(r*255),Math.round(g*255),Math.round(b*255)];
}
function previewPhotoCellScore(photo:PreviewFeature, cell:PreviewCell, maxReuse:number){
  const lab = labDistance(photo.lab, cell.lab);
  const lum = Math.pow((photo.lum-cell.lum)*100,2) * 0.72;
  const sat = Math.pow((photo.sat-cell.sat)*80,2) * 0.18;
  const reusePenalty = photo.useCount <= 0 ? 0 : Math.pow(photo.useCount, 2) * 820;
  const overPenalty = photo.useCount >= maxReuse ? 999999999 : 0;
  return lab + lum + sat + reusePenalty + overPenalty;
}
function loadImg(url:string): Promise<HTMLImageElement>{
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=()=>resolve(img);
    img.onerror=reject;
    img.src=url;
  });
}
async function previewPhotoFeature(url:string, id:string): Promise<PreviewFeature>{
  const img=await loadImg(url);
  const canvas=document.createElement('canvas');
  canvas.width=20; canvas.height=20;
  const ctx=canvas.getContext('2d', { willReadFrequently:true });
  if(!ctx){
    const avg:Rgb=[128,128,128];
    return {id,url,avg,lab:rgbToLab(avg),lum:.5,sat:.2,useCount:0};
  }
  const iw=img.naturalWidth || img.width, ih=img.naturalHeight || img.height;
  const side=Math.min(iw,ih), sx=Math.max(0,Math.floor((iw-side)/2)), sy=Math.max(0,Math.floor((ih-side)/2));
  ctx.drawImage(img,sx,sy,side,side,0,0,20,20);
  const data=ctx.getImageData(0,0,20,20).data;
  let r=0,g=0,b=0,count=0;
  for(let i=0;i<data.length;i+=4){
    const pr=data[i], pg=data[i+1], pb=data[i+2];
    const l=(0.2126*pr+0.7152*pg+0.0722*pb)/255;
    const weight = l<.03 || l>.97 ? .28 : 1;
    r+=pr*weight; g+=pg*weight; b+=pb*weight; count+=weight;
  }
  const avg:Rgb=[Math.round(r/count),Math.round(g/count),Math.round(b/count)];
  return {id,url,avg,lab:rgbToLab(avg),lum:luminance(avg),sat:saturation(avg),useCount:0};
}
async function previewTargetCells(url:string, cols:number, rows:number): Promise<PreviewCell[]>{
  const img=await loadImg(url);
  const canvas=document.createElement('canvas');
  canvas.width=cols; canvas.height=rows;
  const ctx=canvas.getContext('2d', { willReadFrequently:true });
  if(!ctx) return [];
  ctx.drawImage(img,0,0,cols,rows);
  const data=ctx.getImageData(0,0,cols,rows).data;
  const cells:PreviewCell[]=[];
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      const i=y*cols+x;
      const color:Rgb=[data[i*4],data[i*4+1],data[i*4+2]];
      const lum=luminance(color), sat=saturation(color);
      const left=x>0 ? [data[(i-1)*4],data[(i-1)*4+1],data[(i-1)*4+2]] : color;
      const right=x<cols-1 ? [data[(i+1)*4],data[(i+1)*4+1],data[(i+1)*4+2]] : color;
      const up=y>0 ? [data[(i-cols)*4],data[(i-cols)*4+1],data[(i-cols)*4+2]] : color;
      const down=y<rows-1 ? [data[(i+cols)*4],data[(i+cols)*4+1],data[(i+cols)*4+2]] : color;
      const edge = Math.abs(luminance(color)-luminance(left))*35 + Math.abs(luminance(color)-luminance(right))*35 + Math.abs(luminance(color)-luminance(up))*35 + Math.abs(luminance(color)-luminance(down))*35;
      const importance = edge + sat*2.2 + Math.abs(lum-.5)*.55;
      cells.push({index:i,color,lab:rgbToLab(color),lum,sat,importance});
    }
  }
  return cells;
}
async function createPreviewMosaicTile(url:string, target:Rgb, size:number): Promise<HTMLCanvasElement>{
  const img=await loadImg(url);
  const canvas=document.createElement('canvas');
  canvas.width=size; canvas.height=size;
  const ctx=canvas.getContext('2d', { willReadFrequently:true });
  if(!ctx) return canvas;

  const iw=img.naturalWidth || img.width, ih=img.naturalHeight || img.height;
  const side=Math.min(iw,ih), sx=Math.max(0,Math.floor((iw-side)/2)), sy=Math.max(0,Math.floor((ih-side)/2));
  ctx.drawImage(img,sx,sy,side,side,0,0,size,size);
  const image=ctx.getImageData(0,0,size,size), d=image.data;

  let minLum=1, maxLum=0;
  for(let i=0;i<d.length;i+=4){
    const lum=(0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2]) / 255;
    if(lum<minLum) minLum=lum;
    if(lum>maxLum) maxLum=lum;
  }
  const range=Math.max(0.08, maxLum-minLum);
  const [th, ts, tl] = rgbToHsl(target);
  const darkTone  = hslToRgb(th, clamp01(ts*0.95 + 0.02), clamp01(tl*0.18 + 0.02));
  const midTone   = target;
  const lightTone = hslToRgb(th, clamp01(ts*0.48 + 0.10), clamp01(tl + (1-tl)*0.48));
  const preserveOriginal = 0.03;

  for(let i=0;i<d.length;i+=4){
    const r=d[i], g=d[i+1], b=d[i+2];
    const lum=(0.2126*r + 0.7152*g + 0.0722*b) / 255;
    let tonePos = clamp01((lum - minLum) / range);
    tonePos = Math.pow(tonePos, 0.92);
    const mapped = tonePos < 0.5 ? mixRgb(darkTone, midTone, tonePos*2) : mixRgb(midTone, lightTone, (tonePos-0.5)*2);
    const nr = mapped[0] * (1 - preserveOriginal) + r * preserveOriginal;
    const ng = mapped[1] * (1 - preserveOriginal) + g * preserveOriginal;
    const nb = mapped[2] * (1 - preserveOriginal) + b * preserveOriginal;
    d[i]=clamp((nr-128)*1.03+128);
    d[i+1]=clamp((ng-128)*1.03+128);
    d[i+2]=clamp((nb-128)*1.03+128);
  }
  ctx.putImageData(image,0,0);
  ctx.globalCompositeOperation='multiply';
  ctx.fillStyle=`rgb(${target[0]},${target[1]},${target[2]})`;
  ctx.globalAlpha=.22;
  ctx.fillRect(0,0,size,size);
  ctx.globalCompositeOperation='screen';
  ctx.fillStyle=`rgb(${target[0]},${target[1]},${target[2]})`;
  ctx.globalAlpha=.14;
  ctx.fillRect(0,0,size,size);
  ctx.globalCompositeOperation='source-over';
  ctx.globalAlpha=1;
  return canvas;
}


export default function AdminPage(){
  const [logged,setLogged]=useState(false);
  const [password,setPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');

  const [data,setData]=useState<any>(null);
  const [msg,setMsg]=useState('');
  const [err,setErr]=useState('');
  const [busy,setBusy]=useState(false);
  const [busyText,setBusyText]=useState('Operazione in corso...');
  const msgTimer = useRef<any>(null);

  const [targetBase64,setTargetBase64]=useState('');
  const [targetPreview,setTargetPreview]=useState('');
  const [targetInfo,setTargetInfo]=useState('');
  const [bgBase64,setBgBase64]=useState('');
  const [bgPreview,setBgPreview]=useState('');
  const [bgInfo,setBgInfo]=useState('');
  const [splashLine1,setSplashLine1]=useState('Ester & Elia');
  const [splashLine2,setSplashLine2]=useState('Oggi sposi');
  const [splashLine3,setSplashLine3]=useState('22/08/2026');
  const [bgFit,setBgFit]=useState('contain');
  const [bgPosX,setBgPosX]=useState(50);
  const [bgPosY,setBgPosY]=useState(50);
  const [bgScale,setBgScale]=useState(100);
  const [previewBusy,setPreviewBusy]=useState(false);
  const [previewProgress,setPreviewProgress]=useState('');
  const [previewUrl,setPreviewUrl]=useState('');

  useEffect(()=>{
    const p=sessionStorage.getItem('fm_admin_password');
    if(p){setPassword(p); setLogged(true); load(p);}
    const clearAdmin = () => { sessionStorage.removeItem('fm_admin_password'); };
    window.addEventListener('pagehide', clearAdmin);
    window.addEventListener('beforeunload', clearAdmin);
    return () => {
      window.removeEventListener('pagehide', clearAdmin);
      window.removeEventListener('beforeunload', clearAdmin);
    };
  },[]);

  function showAdminMsg(text:string){
    setMsg(text);
    if(msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(()=>setMsg(''), 1500);
  }

  function applyStatusToAdmin(st:any){
    if(st?.splashText){
      setSplashLine1(st.splashText.line1 || 'Ester & Elia');
      setSplashLine2(st.splashText.line2 || 'Oggi sposi');
      setSplashLine3(st.splashText.line3 || '22/08/2026');
    }
    if(st?.backgroundLayout){
      setBgFit(st.backgroundLayout.fit || 'contain');
      setBgPosX(Number(st.backgroundLayout.posX ?? 50));
      setBgPosY(Number(st.backgroundLayout.posY ?? 50));
      setBgScale(Number(st.backgroundLayout.scale ?? 100));
    }
  }

  async function login(){
    setErr(''); setBusyText('Accesso admin...'); setBusy(true);
    try{
      const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'adminLogin',password})});
      const d=await r.json();
      if(!r.ok||!d.ok) throw new Error(d.error||'Password non valida');
      sessionStorage.setItem('fm_admin_password',password);
      setLogged(true);
      const st = d.status || d;
      setData(st);
      applyStatusToAdmin(st);
      showAdminMsg('Accesso effettuato.');
    }catch(e:any){setErr(e?.message||'Errore accesso');}
    finally{setBusy(false);}
  }
  function logout(){ sessionStorage.removeItem('fm_admin_password'); setLogged(false); setPassword(''); setData(null); }

  async function load(p=password){
    setErr('');
    try{
      const r=await fetch('/api/status?x='+Date.now());
      const d=await r.json();
      if(!r.ok||!d.ok) throw new Error(d.error||'Errore');
      setData(d);
      applyStatusToAdmin(d);
    }catch(e:any){setErr(e?.message||'Errore caricamento');}
  }

  async function adminAction(action:string, extra:any = {}){
    setBusy(true); setErr(''); setMsg('');
    try{
      const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,adminPassword:password,...extra})});
      const d=await r.json();
      if(!r.ok||!d.ok) throw new Error(d.error||'Errore');
      const newStatus=d.status||d;
      setData(newStatus);
      return d;
    }catch(e:any){setErr(e?.message||'Errore'); throw e;}
    finally{setBusy(false);}
  }

  async function setTotal(n:number){ setBusyText('Aggiorno numero foto...'); try{await adminAction('setTotal',{totalTiles:n});showAdminMsg(`Obiettivo impostato a ${n} foto/tessere.`);}catch{} }
  async function setOpacity(v:number){
    setData((prev:any)=>prev ? {...prev, panelOpacity:v} : prev);
    try{
      const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'setPanelOpacity',adminPassword:password,panelOpacity:v})});
      const d=await r.json();
      if(d?.ok) setData(d.status||d);
    }catch{}
  }
  async function setBackgroundDarkness(v:number){
    setData((prev:any)=>prev ? {...prev, backgroundDarkness:v} : prev);
    try{
      const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'setBackgroundDarkness',adminPassword:password,backgroundDarkness:v})});
      const d=await r.json();
      if(d?.ok) setData(d.status||d);
    }catch{}
  }

  async function saveBackgroundLayout(next:any = {}){
    const fit = next.fit ?? bgFit;
    const posX = next.posX ?? bgPosX;
    const posY = next.posY ?? bgPosY;
    const scale = next.scale ?? bgScale;
    setBgFit(fit); setBgPosX(Number(posX)); setBgPosY(Number(posY)); setBgScale(Number(scale));
    try{
      const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'setBackgroundLayout',adminPassword:password,fit,posX, posY, scale})});
      const d=await r.json();
      if(d?.ok) setData(d.status||d);
    }catch{}
  }

  async function saveSplashText(){
    setBusyText('Salvo testi splash...');
    try{
      await adminAction('setSplashText',{line1:splashLine1,line2:splashLine2,line3:splashLine3});
      showAdminMsg('Testi splash aggiornati.');
    }catch{}
  }

  async function changePassword(){
    if(newPassword.length<6){setErr('La nuova password deve avere almeno 6 caratteri.'); return;}
    setBusyText('Cambio password...');
    try{
      await adminAction('changeAdminPassword',{newPassword});
      sessionStorage.setItem('fm_admin_password',newPassword);
      setPassword(newPassword);
      setNewPassword('');
      showAdminMsg('Password Admin aggiornata.');
    }catch{}
  }

  async function onTargetChange(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]; setTargetBase64(''); setTargetPreview(''); setTargetInfo(''); setErr('');
    if(!file) return;
    try{setBusyText('Leggo foto finale...'); setBusy(true); const r=await readOriginalFile(file); setTargetBase64(r.base64); setTargetPreview(r.previewUrl); setTargetInfo(`Foto finale pronta in originale, circa ${r.sizeKb} KB.`);}
    catch(e:any){setErr(e?.message||'Errore lettura foto finale');} finally{setBusy(false);}
  }
  async function onBgChange(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]; setBgBase64(''); setBgPreview(''); setBgInfo(''); setErr('');
    if(!file) return;
    try{setBusyText('Leggo sfondo...'); setBusy(true); const r=await readOriginalFile(file); setBgBase64(r.base64); setBgPreview(r.previewUrl); setBgInfo(`Sfondo pronto in originale, circa ${r.sizeKb} KB.`);}
    catch(e:any){setErr(e?.message||'Errore lettura sfondo');} finally{setBusy(false);}
  }
  async function uploadTarget(){ if(!targetBase64){setErr('Scegli prima la foto finale.');return;} setBusyText('Carico foto finale...'); try{await adminAction('uploadTarget',{imageBase64:targetBase64});showAdminMsg('Foto finale caricata.');setTargetBase64('');}catch{} }
  async function uploadBackground(){ if(!bgBase64){setErr('Scegli prima lo sfondo.');return;} setBusyText('Carico sfondo...'); try{await adminAction('uploadBackground',{imageBase64:bgBase64});showAdminMsg('Sfondo aggiornato.');setBgBase64('');}catch{} }
  async function clearGuestPhotos(){ if(!confirm('Cancellare solo le foto invitati?'))return; setBusyText('Reset mosaico...'); try{const d=await adminAction('clearGuestPhotos');showAdminMsg(`Foto invitati cancellate: ${d.trashed||0}.`);}catch{} }
  async function clearTarget(){ if(!confirm('Cancellare la foto finale?'))return; setBusyText('Cancello foto finale...'); try{await adminAction('clearTarget');showAdminMsg('Foto finale cancellata.');}catch{} }
  async function clearBackground(){ if(!confirm('Cancellare lo sfondo?'))return; setBusyText('Cancello sfondo...'); try{await adminAction('clearBackground');showAdminMsg('Sfondo cancellato.');}catch{} }

  async function buildAdminPreview(){
    setErr('');
    setPreviewBusy(true);
    setPreviewProgress('Preparo anteprima...');
    try{
      if(!data?.targetFileId) throw new Error('Carica prima la foto finale da riprodurre.');
      const photos:PreviewPhoto[] = (data?.photos || []).slice();
      if(!photos.length) throw new Error('Non ci sono ancora foto invitati caricate.');
      const total = Number(data?.totalTiles || 600);
      const {cols,rows} = gridForTotal(total);
      const cellSize = total >= 2500 ? 10 : total >= 1500 ? 11 : total >= 1000 ? 12 : 14;

      const targetUrlLocal = `/api/image?id=${data.targetFileId}&v=${data?.target?.updated || Date.now()}`;
      const cells = await previewTargetCells(targetUrlLocal, cols, rows);
      const sortedCells = cells.slice().sort((a,b)=>b.importance-a.importance);

      const canvas=document.createElement('canvas');
      canvas.width=cols*cellSize;
      canvas.height=rows*cellSize;
      const ctx=canvas.getContext('2d');
      if(!ctx) throw new Error('Canvas anteprima non disponibile.');
      ctx.fillStyle='#ffffff';
      ctx.fillRect(0,0,canvas.width,canvas.height);

      const features:PreviewFeature[]=[];
      setPreviewProgress('Analizzo le foto caricate...');
      for(let i=0;i<photos.length;i++){
        const p=photos[i];
        const feature = await previewPhotoFeature(`/api/image?id=${p.id}`, p.id);
        features.push(feature);
        if((i+1)%12===0 || i===photos.length-1){
          setPreviewProgress(`Analizzo foto ${i+1} / ${photos.length}...`);
          await new Promise(r=>setTimeout(r,0));
        }
      }

      const maxReuse = Math.max(1, Math.ceil(total / Math.max(1, features.length)));
      const used = new Set<number>();

      for(let i=0;i<sortedCells.length;i++){
        const cell = sortedCells[i];
        let best:PreviewFeature|null=null;
        let bestScore=Number.POSITIVE_INFINITY;

        for(const f of features){
          const score = previewPhotoCellScore(f, cell, maxReuse);
          if(score < bestScore){
            bestScore = score;
            best = f;
          }
        }
        if(!best) continue;

        best.useCount += 1;
        const tileCanvas = await createPreviewMosaicTile(best.url, cell.color, cellSize);
        const x = (cell.index % cols) * cellSize;
        const y = Math.floor(cell.index / cols) * cellSize;
        ctx.drawImage(tileCanvas, x, y, cellSize, cellSize);
        used.add(cell.index);

        if((i+1)%24===0 || i===sortedCells.length-1){
          setPreviewProgress(`Creo anteprima ${i+1} / ${sortedCells.length} tessere...`);
          setPreviewUrl(canvas.toDataURL('image/jpeg', 0.86));
          await new Promise(r=>setTimeout(r,0));
        }
      }

      setPreviewUrl(canvas.toDataURL('image/jpeg', 0.92));
      setPreviewProgress(`Anteprima pronta: ${used.size} tessere renderizzate.`);
      showAdminMsg('Anteprima mosaico generata.');
    }catch(e:any){
      setErr(e?.message || 'Errore creazione anteprima');
    }finally{
      setPreviewBusy(false);
    }
  }


  if(!logged){
    return <main className="container">
      {busy && <div className="adminSpinnerOverlay"><div className="adminSpinner"/><div style={{fontSize:24,fontWeight:800}}>{busyText}</div></div>}
      <section className="card">
        <h1>Accesso Admin</h1>
        <input className="field" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password admin" onKeyDown={(e)=>{if(e.key==='Enter') login();}}/>
        <div className="spacer"/><button className="btn" onClick={login}>Accedi</button>
        {err&&<><div className="spacer"/><div className="error" style={{display:'block'}}>{err}</div></>}
      </section>
    </main>
  }

  const pct=data?Math.min(100,Math.round((data.receivedCount/data.totalTiles)*100)):0;
  const bgUrl=data?.uploadBackgroundFileId?`/api/image?id=${data.uploadBackgroundFileId}&v=${data?.uploadBackground?.updated || Date.now()}`:'';
  const previewBgSize = bgFit === 'manual' ? `${bgScale}% auto` : bgFit;
  const previewBgPosition = `${bgPosX}% ${bgPosY}%`;
  const targetUrl=data?.targetFileId?`/api/image?id=${data.targetFileId}&v=${data?.target?.updated || Date.now()}`:'';
  const opacity=Number(data?.panelOpacity ?? 0.10);
  const bgDark=Number(data?.backgroundDarkness ?? 0.18);

  return (
    <main className="container">
      {busy&&<div className="adminSpinnerOverlay"><div className="adminSpinner"/><div style={{fontSize:24,fontWeight:800}}>{busyText}</div></div>}
      {msg&&!busy&&<div className="adminFloatingMsg" onClick={()=>setMsg('')}><div className="ok">{msg}</div><div className="spacer"/><button className="btn" onClick={()=>setMsg('')}>OK</button></div>}

      <section className="card">
        <div className="mobileAdminTop">
          <h1 style={{margin:0}}>Admin fotomosaico</h1>
          <button className="btn danger" onClick={logout}>Esci</button>
        </div>
        <div className="adminNavGrid">
          <Link className="btn secondary" href="/" onClick={()=>sessionStorage.removeItem('fm_admin_password')}>Home</Link>
          <Link className="btn secondary" href="/upload" onClick={()=>sessionStorage.removeItem('fm_admin_password')}>Upload invitato</Link>
          <Link className="btn secondary" href="/test-upload" onClick={()=>sessionStorage.removeItem('fm_admin_password')}>Upload test</Link>
          <Link className="btn secondary" href="/screen" onClick={()=>sessionStorage.removeItem('fm_admin_password')}>Schermo</Link>
        </div>
        <div className="spacer" />
        {data&&<div className="adminStatus">
          <div><b>Obiettivo:</b> {data.totalTiles} foto/tessere</div>
          <div><b>Foto invitati:</b> {data.receivedCount}</div>
          <div><b>Mancano:</b> {data.missing}</div>
          <div><b>Trasparenza box:</b> {Math.round((1-opacity)*100)}% trasparente</div>
          <div><b>Oscuramento sfondo:</b> {Math.round(bgDark*100)}%</div>
          <div><b>Foto finale:</b> {data.hasTarget?`SÌ — ${data.target?.name} — ${kb(data.target?.size)}`:'NO'}</div>
          <div><b>Sfondo:</b> {data.hasUploadBackground?`SÌ — ${data.uploadBackground?.name} — ${kb(data.uploadBackground?.size)}`:'NO'}</div>
        </div>}
        {data&&<><div className="bigcount">{data.receivedCount} / {data.totalTiles}</div><div className="progressbar"><div style={{width:`${pct}%`}}/></div></>}

        <h2>Anteprima file impostati</h2>
        <div className="specialPreview">
          <div className="specialPreviewCard"><b>Foto finale mosaico</b>{targetUrl?<img src={targetUrl} alt="Foto finale"/>:<p>Non caricata</p>}</div>
          <div className="specialPreviewCard"><b>Sfondo home/upload</b>{bgUrl?<img src={bgUrl} alt="Sfondo"/>:<p>Non caricato</p>}</div>
        </div>

        <div className="spacer"/><h2>Anteprima risultato finale del mosaico</h2>
        <p>Da qui puoi vedere prima il risultato finale del tuo fotomosaico. L’anteprima usa la stessa logica di ricolorazione delle tessere: ogni foto viene adattata al colore della propria cella per ricreare l’immagine finale.</p>
        <div className="gridBtns">
          <button className="btn" disabled={previewBusy || busy || !data?.hasTarget || !data?.receivedCount} onClick={buildAdminPreview}>Genera anteprima mosaico</button>
          <Link className="btn secondary" href="/screen" onClick={()=>sessionStorage.removeItem('fm_admin_password')}>Apri schermo mosaico</Link>
        </div>
        {(previewBusy || previewProgress) && <div className="ok" style={{display:'block', marginTop:12}}>{previewBusy ? previewProgress || 'Creo anteprima...' : previewProgress}</div>}
        {previewUrl && <div className="mosaicPreviewWrap">
          <div className="mosaicPreviewCard">
            <b>Anteprima fotomosaico</b>
            <img src={previewUrl} alt="Anteprima mosaico" />
          </div>
          <div className="mosaicPreviewCard">
            <b>Immagine finale di riferimento</b>
            {targetUrl ? <img src={targetUrl} alt="Immagine finale" /> : <p>Non caricata</p>}
          </div>
        </div>}

        <h2>1. Numero foto</h2>
        <div className="gridBtns">{options.map(n=><button className="btn" disabled={busy} key={n} onClick={()=>setTotal(n)}>{n} foto</button>)}</div>

        <div className="spacer"/><h2>2. Trasparenza box e sfondo</h2>
        <p>Le modifiche sono applicate subito, senza finestra di conferma.</p>
        <label><b>Trasparenza box</b></label>
        <input className="field" type="range" min="0.02" max="0.95" step="0.01" value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/>
        <label><b>Oscuramento immagine sfondo</b></label>
        <input className="field" type="range" min="0" max="0.85" step="0.01" value={bgDark} onChange={e=>setBackgroundDarkness(Number(e.target.value))}/>
        <div className="transparencyPreview" style={{backgroundImage:bgUrl?`url(${bgUrl})`:'linear-gradient(135deg,#6d5b4b,#201a16)', position:'relative'}}>
          <div className="bgDim" style={{opacity:bgDark}} />
          <div className="transparencyBox" style={{background:`rgba(255,255,255,${opacity})`, position:'relative', zIndex:2}}>Esempio box</div>
        </div>

        <div className="spacer"/><h2>3. Foto finale da riprodurre</h2>
        <p>Salvata come <b>__TARGET_MOSAICO.jpg</b> in dimensione originale.</p>
        <input className="field" type="file" accept="image/*" onChange={onTargetChange}/>
        {targetPreview&&<img className="preview" src={targetPreview} alt="Foto finale" style={{display:'block'}}/>}
        {targetInfo&&<div className="ok">{targetInfo}</div>}
        <div className="spacer"/><button className="btn" disabled={busy||!targetBase64} onClick={uploadTarget}>Carica foto finale</button>
        <div className="spacer"/><button className="btn danger" disabled={busy||!data?.hasTarget} onClick={clearTarget}>Cancella foto finale</button>

        <div className="spacer"/><h2>4. Sfondo home/upload</h2>
        <p>Salvato come <b>__UPLOAD_BACKGROUND.jpg</b> in dimensione originale.</p>
        <input className="field" type="file" accept="image/*" onChange={onBgChange}/>
        {bgPreview&&<img className="preview" src={bgPreview} alt="Sfondo" style={{display:'block'}}/>}
        {bgInfo&&<div className="ok">{bgInfo}</div>}
        <div className="spacer"/><button className="btn" disabled={busy||!bgBase64} onClick={uploadBackground}>Aggiorna sfondo</button>
        <div className="spacer"/><button className="btn danger" disabled={busy||!data?.hasUploadBackground} onClick={clearBackground}>Cancella sfondo</button>

        <div className="spacer"/><h2>5. Adatta sfondo su smartphone</h2>
        <p>Qui vedi l’anteprima verticale come su telefono. Se lo sfondo è troppo grande, usa “Contieni” o regola la scala manuale.</p>
        <div className="gridBtns">
          <button className="btn secondary" onClick={()=>saveBackgroundLayout({fit:'contain'})}>Contieni</button>
          <button className="btn secondary" onClick={()=>saveBackgroundLayout({fit:'cover'})}>Riempi</button>
          <button className="btn secondary" onClick={()=>saveBackgroundLayout({fit:'manual'})}>Manuale</button>
        </div>
        <div className="spacer"/>
        <label><b>Posizione orizzontale</b></label>
        <input className="field" type="range" min="0" max="100" step="1" value={bgPosX} onChange={e=>saveBackgroundLayout({posX:Number(e.target.value), fit:bgFit})}/>
        <label><b>Posizione verticale</b></label>
        <input className="field" type="range" min="0" max="100" step="1" value={bgPosY} onChange={e=>saveBackgroundLayout({posY:Number(e.target.value), fit:bgFit})}/>
        <label><b>Scala manuale</b></label>
        <input className="field" type="range" min="30" max="260" step="1" value={bgScale} onChange={e=>saveBackgroundLayout({scale:Number(e.target.value), fit:'manual'})}/>
        <div className="phoneBgPreview" style={{backgroundImage:bgUrl?`url(${bgUrl})`:'linear-gradient(135deg,#6d5b4b,#201a16)', backgroundSize:previewBgSize, backgroundPosition:previewBgPosition}}>
          <div className="bgDim" style={{opacity:bgDark}} />
          <div className="phoneBgPreviewBox" style={{background:`rgba(255,255,255,${opacity})`}}>Carica foto</div>
        </div>

        <div className="spacer"/><h2>6. Test e schermo</h2>
        <Link className="btn secondary" href="/test-upload">Upload multiplo per test</Link>
        <div className="spacer"/><Link className="btn secondary" href="/screen">Apri schermo mosaico</Link>
        <div className="spacer"/><button className="btn secondary" onClick={()=>load()}>Aggiorna stato</button>
        <div className="spacer"/><button className="btn danger" disabled={busy} onClick={clearGuestPhotos}>Reset mosaico: cancella solo foto invitati</button>

        <div className="spacer"/><h2>7. Testi splash screen</h2>
        <p>Questi testi appaiono per 5 secondi prima della pagina di caricamento.</p>
        <input className="field" value={splashLine1} onChange={e=>setSplashLine1(e.target.value)} placeholder="Prima riga"/>
        <div className="spacer"/>
        <input className="field" value={splashLine2} onChange={e=>setSplashLine2(e.target.value)} placeholder="Seconda riga"/>
        <div className="spacer"/>
        <input className="field" value={splashLine3} onChange={e=>setSplashLine3(e.target.value)} placeholder="Terza riga"/>
        <div className="spacer"/>
        <button className="btn" disabled={busy} onClick={saveSplashText}>Salva testi splash</button>

        <div className="spacer"/><h2>8. Cambia password Admin</h2>
        <input className="field" type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="Nuova password admin" onKeyDown={(e)=>{if(e.key==='Enter' && newPassword.length>=6) changePassword();}}/>
        <div className="spacer"/><button className="btn" disabled={busy||newPassword.length<6} onClick={changePassword}>Aggiorna password</button>

        {err&&<><div className="spacer"/><div className="error" style={{display:'block'}}>{err}</div></>}
      </section>
    </main>
  );
}
