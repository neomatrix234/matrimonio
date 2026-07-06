'use client';

import { useEffect, useRef, useState } from 'react';

type Photo = { id:string; name:string; created:number; size:number };
type Rgb = [number,number,number];
type Lab = [number,number,number];

type PhotoFeature = {
  id:string;
  url:string;
  avg:Rgb;
  lab:Lab;
  lum:number;
  sat:number;
  contrast:number;
  useCount:number;
};

type TargetCell = {
  index:number;
  color:Rgb;
  lab:Lab;
  lum:number;
  sat:number;
  importance:number;
};

type Tile = {
  id:string;
  index:number;
  order:number;
  url:string;
  modifiedUrl:string;
  color:Rgb;
  sourceColor:Rgb;
  matchScore:number;
  repeated:number;
};

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

function clamp(v:number,min=0,max=255){
  return Math.max(min, Math.min(max, v));
}

function luminance(c:number[]){
  return (0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]) / 255;
}

function saturation(c:number[]){
  const max=Math.max(c[0],c[1],c[2]);
  const min=Math.min(c[0],c[1],c[2]);
  return max===0 ? 0 : (max-min)/max;
}

function srgbToLinear(v:number){
  const x=v/255;
  return x <= 0.04045 ? x/12.92 : Math.pow((x+0.055)/1.055, 2.4);
}

function rgbToLab(rgb:Rgb):Lab{
  const r=srgbToLinear(rgb[0]);
  const g=srgbToLinear(rgb[1]);
  const b=srgbToLinear(rgb[2]);

  let x = r*0.4124564 + g*0.3575761 + b*0.1804375;
  let y = r*0.2126729 + g*0.7151522 + b*0.0721750;
  let z = r*0.0193339 + g*0.1191920 + b*0.9503041;

  x /= 0.95047;
  y /= 1.00000;
  z /= 1.08883;

  const f=(t:number)=> t > 0.008856 ? Math.cbrt(t) : (7.787*t + 16/116);

  const fx=f(x), fy=f(y), fz=f(z);
  return [
    116*fy - 16,
    500*(fx-fy),
    200*(fy-fz)
  ];
}

function labDistance(a:Lab,b:Lab){
  const dl=a[0]-b[0];
  const da=a[1]-b[1];
  const db=a[2]-b[2];
  return dl*dl*1.35 + da*da + db*db;
}

function photoCellScore(photo:PhotoFeature, cell:TargetCell, maxReuse:number){
  const lab = labDistance(photo.lab, cell.lab);
  const lum = Math.pow((photo.lum-cell.lum)*100,2) * 0.70;
  const sat = Math.pow((photo.sat-cell.sat)*80,2) * 0.20;

  // Penalità progressiva: ripete le foto solo quando serve, ma evita di concentrarle troppo.
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

async function photoFeature(url:string, id:string): Promise<PhotoFeature>{
  const img=await loadImg(url);
  const canvas=document.createElement('canvas');
  canvas.width=24;
  canvas.height=24;
  const ctx=canvas.getContext('2d', { willReadFrequently:true });
  if(!ctx){
    const avg:Rgb=[128,128,128];
    return {id,url,avg,lab:rgbToLab(avg),lum:.5,sat:.2,contrast:.2,useCount:0};
  }

  const iw=img.naturalWidth || img.width;
  const ih=img.naturalHeight || img.height;
  const side=Math.min(iw,ih);
  const sx=Math.max(0,Math.floor((iw-side)/2));
  const sy=Math.max(0,Math.floor((ih-side)/2));
  ctx.drawImage(img,sx,sy,side,side,0,0,24,24);

  const data=ctx.getImageData(0,0,24,24).data;
  let r=0,g=0,b=0,count=0;
  let lSum=0,lSq=0;

  for(let i=0;i<data.length;i+=4){
    const pr=data[i], pg=data[i+1], pb=data[i+2];
    const l=(0.2126*pr+0.7152*pg+0.0722*pb)/255;

    // Evita che sfondi bianchi/neri dominino troppo la media.
    const weight = l<.035 || l>.975 ? .28 : 1;
    r+=pr*weight; g+=pg*weight; b+=pb*weight; count+=weight;
    lSum += l;
    lSq += l*l;
  }

  const avg:Rgb=[Math.round(r/count),Math.round(g/count),Math.round(b/count)];
  const mean=lSum/(data.length/4);
  const variance=Math.max(0, lSq/(data.length/4)-mean*mean);
  const contrast=Math.sqrt(variance);

  return {
    id,
    url,
    avg,
    lab:rgbToLab(avg),
    lum:luminance(avg),
    sat:saturation(avg),
    contrast,
    useCount:0
  };
}

async function targetCells(url:string, cols:number, rows:number): Promise<TargetCell[]>{
  const img=await loadImg(url);
  const canvas=document.createElement('canvas');
  canvas.width=cols;
  canvas.height=rows;
  const ctx=canvas.getContext('2d', { willReadFrequently:true });
  if(!ctx) return [];

  ctx.drawImage(img,0,0,cols,rows);
  const data=ctx.getImageData(0,0,cols,rows).data;
  const cells:TargetCell[]=[];

  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      const i=y*cols+x;
      const color:Rgb=[data[i*4],data[i*4+1],data[i*4+2]];
      const lum=luminance(color);
      const sat=saturation(color);

      const left=x>0 ? [data[(i-1)*4],data[(i-1)*4+1],data[(i-1)*4+2]] : color;
      const right=x<cols-1 ? [data[(i+1)*4],data[(i+1)*4+1],data[(i+1)*4+2]] : color;
      const up=y>0 ? [data[(i-cols)*4],data[(i-cols)*4+1],data[(i-cols)*4+2]] : color;
      const down=y<rows-1 ? [data[(i+cols)*4],data[(i+cols)*4+1],data[(i+cols)*4+2]] : color;

      const edge =
        Math.abs(luminance(color)-luminance(left))*35 +
        Math.abs(luminance(color)-luminance(right))*35 +
        Math.abs(luminance(color)-luminance(up))*35 +
        Math.abs(luminance(color)-luminance(down))*35;

      // Le zone con volti, bordi, contrasti e colori saturi vengono riempite prima.
      const importance = edge + sat*2.2 + Math.abs(lum-.5)*.55;

      cells.push({
        index:i,
        color,
        lab:rgbToLab(color),
        lum,
        sat,
        importance
      });
    }
  }

  return cells;
}

async function createMosaicTile(url:string, target:Rgb): Promise<string>{
  const img=await loadImg(url);
  const size=190;
  const canvas=document.createElement('canvas');
  canvas.width=size;
  canvas.height=size;
  const ctx=canvas.getContext('2d', { willReadFrequently:true });
  if(!ctx) return url;

  const iw=img.naturalWidth || img.width;
  const ih=img.naturalHeight || img.height;
  const side=Math.min(iw,ih);
  const sx=Math.max(0,Math.floor((iw-side)/2));
  const sy=Math.max(0,Math.floor((ih-side)/2));
  ctx.drawImage(img,sx,sy,side,side,0,0,size,size);

  const image=ctx.getImageData(0,0,size,size);
  const d=image.data;

  let srcLum=0;
  let srcR=0,srcG=0,srcB=0;
  let count=0;

  for(let i=0;i<d.length;i+=4){
    srcR+=d[i]; srcG+=d[i+1]; srcB+=d[i+2];
    srcLum += (0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2]);
    count++;
  }

  srcR/=count; srcG/=count; srcB/=count; srcLum/=count;
  const targetLum = 0.2126*target[0] + 0.7152*target[1] + 0.0722*target[2];
  const tSat = saturation(target);

  // Più la zona è poco satura, più si preserva la fotografia originale.
  const targetStrength = tSat < .10 ? .58 : tSat > .35 ? .76 : .68;
  const originalStrength = 1 - targetStrength;
  const detailStrength = 0.88;

  for(let i=0;i<d.length;i+=4){
    const r=d[i], g=d[i+1], b=d[i+2];
    const pixLum = 0.2126*r + 0.7152*g + 0.0722*b;
    const detail = (pixLum - srcLum) * detailStrength;

    // Trasferimento colore: usa il colore target come base, ma conserva luci/ombre della foto.
    const targetR = clamp(target[0] + detail);
    const targetG = clamp(target[1] + detail);
    const targetB = clamp(target[2] + detail);

    // Bilanciamento: corregge anche la foto originale verso la luminosità della cella.
    const ratio = targetLum / Math.max(20, srcLum);
    const corrR = clamp(r * (0.68 + ratio*0.32));
    const corrG = clamp(g * (0.68 + ratio*0.32));
    const corrB = clamp(b * (0.68 + ratio*0.32));

    let nr = targetR*targetStrength + corrR*originalStrength;
    let ng = targetG*targetStrength + corrG*originalStrength;
    let nb = targetB*targetStrength + corrB*originalStrength;

    // Micro contrasto e recupero dettagli.
    nr = (nr-128)*1.08 + 128;
    ng = (ng-128)*1.08 + 128;
    nb = (nb-128)*1.08 + 128;

    d[i]=clamp(nr);
    d[i+1]=clamp(ng);
    d[i+2]=clamp(nb);
  }

  ctx.putImageData(image,0,0);

  // Fusione finale molto delicata. Da lontano aiuta a leggere la foto finale, da vicino mantiene la foto invitato.
  ctx.globalCompositeOperation='soft-light';
  ctx.fillStyle=`rgb(${target[0]},${target[1]},${target[2]})`;
  ctx.globalAlpha=.22;
  ctx.fillRect(0,0,size,size);

  ctx.globalCompositeOperation='source-over';
  ctx.globalAlpha=1;

  return canvas.toDataURL('image/jpeg', .84);
}

export default function ScreenPage(){
  const [status,setStatus]=useState<any>(null);
  const [tiles,setTiles]=useState<Tile[]>([]);
  const [final,setFinal]=useState(false);
  const [completeMsg,setCompleteMsg]=useState(false);
  const [isFullscreen,setIsFullscreen]=useState(false);
  const [replayStarted,setReplayStarted]=useState(false);
  const [paused,setPaused]=useState(false);
  const [selectedTile,setSelectedTile]=useState<Tile|null>(null);

  const processing=useRef(false);
  const usedIndexes=useRef<Set<number>>(new Set());
  const targetCellsRef=useRef<TargetCell[]>([]);
  const photoFeatureCache=useRef<Map<string,PhotoFeature>>(new Map());
  const currentRun=useRef(0);

  function targetImageUrl(s:any){
    if(!s?.targetFileId) return '';
    const version = s?.target?.updated || Date.now();
    return `/api/image?id=${s.targetFileId}&v=${version}`;
  }

  async function getFeature(p:Photo){
    const cached=photoFeatureCache.current.get(p.id);
    if(cached) return cached;
    const url=`/api/image?id=${p.id}`;
    const f=await photoFeature(url,p.id);
    photoFeatureCache.current.set(p.id,f);
    return f;
  }

  function resetPhotoUseCounts(){
    photoFeatureCache.current.forEach(f=>{ f.useCount=0; });
  }

  async function buildWallMosaic(photos:Photo[], total:number, runId:number, appendOnly:boolean){
    if(!targetCellsRef.current.length) return;

    const realPhotos=photos.slice().sort((a,b)=>a.created-b.created);
    if(!realPhotos.length) return;

    const maxReuse = Math.max(1, Math.ceil(total / realPhotos.length));
    const batchCells = targetCellsRef.current
      .filter(c=>!usedIndexes.current.has(c.index))
      .sort((a,b)=>b.importance-a.importance);

    const featureList:PhotoFeature[]=[];
    for(const p of realPhotos){
      if(paused || runId !== currentRun.current) return;
      try{ featureList.push(await getFeature(p)); }catch{}
    }

    if(!appendOnly){
      resetPhotoUseCounts();
    }

    for(const cell of batchCells){
      if(paused || runId !== currentRun.current) break;

      let best:PhotoFeature|null=null;
      let bestScore=Number.POSITIVE_INFINITY;

      // Scelta percettiva in LAB. Con poche foto consente ripetizioni bilanciate.
      for(const f of featureList){
        const score=photoCellScore(f,cell,maxReuse);
        if(score<bestScore){
          bestScore=score;
          best=f;
        }
      }

      if(!best) continue;
      best.useCount += 1;

      let modifiedUrl=best.url;
      try{
        modifiedUrl=await createMosaicTile(best.url, cell.color);
      }catch(e){}

      usedIndexes.current.add(cell.index);

      setTiles(prev=>[...prev,{
        id:best!.id,
        index:cell.index,
        order:prev.length+1,
        url:best!.url,
        modifiedUrl,
        color:cell.color,
        sourceColor:best!.avg,
        matchScore:bestScore,
        repeated:best!.useCount
      }]);

      if(usedIndexes.current.size >= total) break;
      await new Promise(res=>setTimeout(res,total>2000?8:total>1200?14:24));
    }
  }

  async function fetchStatus(){
    if(paused) return;
    try{
      const r=await fetch('/api/status?x='+Date.now());
      const s=await r.json();
      if(!s.ok) return;
      setStatus(s);

      const total=s.totalTiles || 600;
      const {cols,rows}=gridForTotal(total);

      if(s.targetFileId && targetCellsRef.current.length !== (cols*rows)){
        targetCellsRef.current=await targetCells(targetImageUrl(s), cols, rows);
      }

      if(!processing.current && targetCellsRef.current.length && !replayStarted){
        processing.current=true;
        const oldCount=tiles.length;
        await buildWallMosaic(s.photos || [], total, currentRun.current, oldCount>0);
        processing.current=false;
      }

      if((s.photos || []).length > 0 && targetCellsRef.current.length && usedIndexes.current.size >= total && !final && !replayStarted){
        setReplayStarted(true);
        setCompleteMsg(true);
        setTimeout(()=>setCompleteMsg(false),2500);
        setTimeout(()=>startReplay(total),3000);
      }
    }catch(e){}
  }

  function stopMosaic(){
    currentRun.current += 1;
    setPaused(true);
    setReplayStarted(false);
    setFinal(false);
    setCompleteMsg(false);
    processing.current=false;
  }

  function restartMosaic(){
    currentRun.current += 1;
    setPaused(false);
    setReplayStarted(false);
    setFinal(false);
    setCompleteMsg(false);
    usedIndexes.current=new Set();
    targetCellsRef.current=[];
    resetPhotoUseCounts();
    setTiles([]);
    setTimeout(()=>fetchStatus(),250);
  }

  async function startReplay(total:number){
    currentRun.current += 1;
    const runId=currentRun.current;
    setPaused(false);
    setFinal(false);
    setCompleteMsg(false);
    setReplayStarted(true);
    usedIndexes.current=new Set();
    resetPhotoUseCounts();
    setTiles([]);

    const r=await fetch('/api/status?x='+Date.now());
    const s=await r.json();
    setStatus(s);

    const {cols,rows}=gridForTotal(total);
    if(s.targetFileId){
      targetCellsRef.current=await targetCells(targetImageUrl(s), cols, rows);
    }

    await buildWallMosaic((s.photos || []),total,runId,false);
    if(runId===currentRun.current && !paused){
      setTimeout(()=>setFinal(true), 1200);
    }
  }

  useEffect(()=>{
    fetchStatus();
    const id=setInterval(fetchStatus,6500);
    const fs=()=>setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange',fs);
    return ()=>{
      clearInterval(id);
      document.removeEventListener('fullscreenchange',fs);
    };
  },[replayStarted,final,paused]);

  const total=status?.totalTiles || 600;
  const {cols,rows}=gridForTotal(total);
  const cells=Array.from({length:total});
  const tileMap=new Map<number,Tile>();
  tiles.forEach(t=>tileMap.set(t.index,t));
  const targetUrl=targetImageUrl(status);
  const count=tiles.length;
  const pct=Math.min(100,Math.round((count/total)*100));
  const photoCount=(status?.photos || []).length;

  return (
    <div style={{height:'100vh',background:'#111',color:'#fff',fontFamily:'Arial, sans-serif',overflow:'hidden',position:'relative'}}>
      {!isFullscreen && <div style={{position:'absolute',top:22,left:28,right:88,display:'flex',justifyContent:'space-between',zIndex:5}}>
        <div>
          <div style={{background:'#ffffff18',border:'1px solid #ffffff33',borderRadius:999,padding:'10px 16px',fontSize:20}}>
            {count} / {total} tessere
          </div>
          <div style={{fontSize:15,color:'#ddd',marginTop:8}}>
            {paused ? 'Mosaico interrotto' : status?.hasTarget ? 'Motore LAB wall mosaic attivo' : 'Carica foto finale da /admin'} · {pct}% · foto caricate: {photoCount}
          </div>
        </div>
        <div style={{background:'#ffffff18',border:'1px solid #ffffff33',borderRadius:999,padding:'10px 16px',fontSize:20}}>
          {count>=total ? 'Completo' : `Mancano ${Math.max(0,total-count)}`}
        </div>
      </div>}

      <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',padding:isFullscreen ? 0 : 24,boxSizing:'border-box'}}>
        <div style={{
          position:'relative',
          width:isFullscreen ? '100vw' : `min(94vw, ${cols*28}px)`,
          height:isFullscreen ? '100vh' : undefined,
          aspectRatio:isFullscreen ? undefined : `${cols}/${rows}`,
          background:'#202020',
          borderRadius:isFullscreen ? 0 : 10,
          overflow:'hidden',
          boxShadow:isFullscreen ? 'none' : '0 12px 50px #0009'
        }}>
          <div style={{display:'grid',gridTemplateColumns:`repeat(${cols},1fr)`,gridTemplateRows:`repeat(${rows},1fr)`,width:'100%',height:'100%'}}>
            {cells.map((_,i)=>{
              const t=tileMap.get(i);
              return <div key={i} style={{background:'#222',border:isFullscreen?'0':'1px solid rgba(255,255,255,.025)',overflow:'hidden'}}>
                {t && <button className="tileButton" onClick={()=>setSelectedTile(t)} title="Vedi foto">
                  <img src={t.modifiedUrl} alt="" style={{animation:'pop .45s ease'}}/>
                </button>}
              </div>
            })}
          </div>
          {targetUrl && <img src={targetUrl} alt="" style={{
            position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',
            opacity:final?1:0,transition:'opacity 3s ease',zIndex:3
          }}/>}
          {completeMsg && !isFullscreen && <div style={{
            position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',
            background:'rgba(0,0,0,.55)',fontSize:'clamp(36px,7vw,92px)',fontWeight:900,zIndex:4,textShadow:'0 4px 22px #000'
          }}>MOSAICO COMPLETO</div>}
        </div>
      </div>

      {final && <div style={{
        position:'absolute',
        bottom: isFullscreen ? 42 : 86,
        left:0,
        right:0,
        textAlign:'center',
        fontSize: isFullscreen ? 'clamp(28px,4vw,56px)' : 28,
        fontWeight:800,
        textShadow:'0 3px 18px #000',
        zIndex:6,
        padding:'0 20px'
      }}>
        Grazie per aver costruito con noi questo ricordo.
      </div>}

      {!isFullscreen && <div className="screenBottomControls">
        <button onClick={()=>startReplay(total)}>Replay finale</button>
        <button onClick={()=>document.documentElement.requestFullscreen()}>Schermo intero</button>
        <button className="danger" onClick={stopMosaic}>Interrompi</button>
        <button onClick={restartMosaic}>Riparti</button>
      </div>}

      {selectedTile && <div className="tileModal" onClick={()=>setSelectedTile(null)}>
        <div className="tileModalBox" onClick={(e)=>e.stopPropagation()}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:12}}>
            <h2 style={{margin:0}}>Foto tessera</h2>
            <button className="btn danger" style={{width:'auto'}} onClick={()=>setSelectedTile(null)}>Chiudi</button>
          </div>
          <div className="tileModalGrid">
            <div>
              <p className="tileModalTitle">Originale</p>
              <img src={selectedTile.url} alt="Foto originale" />
            </div>
            <div>
              <p className="tileModalTitle">Modificata per il mosaico</p>
              <img src={selectedTile.modifiedUrl} alt="Foto modificata per il mosaico" />
              <p style={{fontSize:13,opacity:.72,marginTop:8}}>
                Colore target: RGB {selectedTile.color.join(', ')} · ripetizione foto: {selectedTile.repeated}
              </p>
            </div>
          </div>
        </div>
      </div>}

      <style>{`@keyframes pop{0%{opacity:0;transform:scale(.75)}100%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}
