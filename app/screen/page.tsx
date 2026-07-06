'use client';

import { useEffect, useRef, useState } from 'react';

type Photo = { id:string; name:string; created:number; size:number };
type Rgb = [number,number,number];

type PhotoFeature = {
  id:string;
  url:string;
  avg:Rgb;
  lum:number;
  sat:number;
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
};

function gridForTotal(total:number){
  if(total <= 600) return {cols:30, rows:20};
  if(total <= 800) return {cols:40, rows:20};
  if(total <= 1000) return {cols:40, rows:25};
  if(total <= 1200) return {cols:40, rows:30};
  return {cols:50, rows:30};
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

function colorDistancePhotoMosaic(a:PhotoFeature, target:Rgb){
  const tl = luminance(target);
  const ts = saturation(target);
  const dr = a.avg[0]-target[0];
  const dg = a.avg[1]-target[1];
  const db = a.avg[2]-target[2];

  // Distanza più vicina alla percezione umana: il verde e la luminosità contano di più.
  const rgbDist = dr*dr*0.30 + dg*dg*0.58 + db*db*0.22;
  const lumDist = Math.pow((a.lum - tl) * 255, 2) * 1.55;
  const satDist = Math.pow((a.sat - ts) * 180, 2) * 0.22;

  return rgbDist + lumDist + satDist;
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
  canvas.width=18;
  canvas.height=18;
  const ctx=canvas.getContext('2d', { willReadFrequently:true });
  if(!ctx) return {id,url,avg:[128,128,128],lum:.5,sat:.2};

  const side=Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const sx=Math.max(0,Math.floor(((img.naturalWidth || img.width)-side)/2));
  const sy=Math.max(0,Math.floor(((img.naturalHeight || img.height)-side)/2));
  ctx.drawImage(img,sx,sy,side,side,0,0,18,18);

  const data=ctx.getImageData(0,0,18,18).data;
  let r=0,g=0,b=0,count=0;

  // Media leggermente robusta: ignora pixel quasi bianchi/neri estremi solo se sono pochi dettagli.
  for(let i=0;i<data.length;i+=4){
    const pr=data[i], pg=data[i+1], pb=data[i+2];
    const l=(0.2126*pr+0.7152*pg+0.0722*pb)/255;
    const weight = l<.04 || l>.97 ? .35 : 1;
    r+=pr*weight; g+=pg*weight; b+=pb*weight; count+=weight;
  }

  const avg:Rgb=[Math.round(r/count),Math.round(g/count),Math.round(b/count)];
  return {id,url,avg,lum:luminance(avg),sat:saturation(avg)};
}

async function targetColors(url:string, cols:number, rows:number): Promise<Rgb[]>{
  const img=await loadImg(url);
  const canvas=document.createElement('canvas');
  canvas.width=cols;
  canvas.height=rows;
  const ctx=canvas.getContext('2d', { willReadFrequently:true });
  if(!ctx) return [];
  ctx.drawImage(img,0,0,cols,rows);
  const data=ctx.getImageData(0,0,cols,rows).data;
  const colors:Rgb[]=[];
  for(let i=0;i<cols*rows;i++){
    colors.push([data[i*4],data[i*4+1],data[i*4+2]]);
  }
  return colors;
}

function chooseBestUnusedCell(feature:PhotoFeature, colors:Rgb[], total:number, used:Set<number>){
  let best=-1;
  let bestScore=Number.POSITIVE_INFINITY;

  for(let i=0;i<total;i++){
    if(used.has(i)) continue;
    const target=colors[i] || [128,128,128];
    const score=colorDistancePhotoMosaic(feature,target);
    if(score<bestScore){
      bestScore=score;
      best=i;
    }
  }

  return {index:best, score:bestScore};
}

async function createMosaicTile(url:string, target:Rgb): Promise<string>{
  const img=await loadImg(url);
  const size=180;
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
  let count=0;
  for(let i=0;i<d.length;i+=4){
    srcLum += (0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2]);
    count++;
  }
  srcLum = count ? srcLum/count : 128;

  const targetLum = 0.2126*target[0] + 0.7152*target[1] + 0.0722*target[2];
  const tSat = saturation(target);
  const preserveTexture = 0.78;
  const targetStrength = tSat < .12 ? .74 : .66;
  const originalStrength = 1 - targetStrength;

  for(let i=0;i<d.length;i+=4){
    const r=d[i], g=d[i+1], b=d[i+2];
    const pixLum = 0.2126*r + 0.7152*g + 0.0722*b;
    const detail = (pixLum - srcLum) * preserveTexture;

    // Ricrea la foto partendo dal colore della cella finale e mantenendo luci/ombre della foto originale.
    const mappedR = clamp(target[0] + detail);
    const mappedG = clamp(target[1] + detail);
    const mappedB = clamp(target[2] + detail);

    // Correzione luminosità per non perdere volti/dettagli.
    const ratio = targetLum / Math.max(22, srcLum);
    const correctedR = clamp(r * (0.72 + ratio*0.28));
    const correctedG = clamp(g * (0.72 + ratio*0.28));
    const correctedB = clamp(b * (0.72 + ratio*0.28));

    d[i]   = clamp(mappedR*targetStrength + correctedR*originalStrength);
    d[i+1] = clamp(mappedG*targetStrength + correctedG*originalStrength);
    d[i+2] = clamp(mappedB*targetStrength + correctedB*originalStrength);

    // Micro-contrasto delicato per rendere leggibile la foto dentro la tessera.
    d[i]   = clamp((d[i]-128)*1.07 + 128);
    d[i+1] = clamp((d[i+1]-128)*1.07 + 128);
    d[i+2] = clamp((d[i+2]-128)*1.07 + 128);
  }

  ctx.putImageData(image,0,0);

  // Velo finale molto leggero sul colore target: aiuta il mosaico a leggere bene da lontano.
  ctx.globalCompositeOperation='soft-light';
  ctx.fillStyle=`rgb(${target[0]},${target[1]},${target[2]})`;
  ctx.globalAlpha=.28;
  ctx.fillRect(0,0,size,size);

  ctx.globalCompositeOperation='source-over';
  ctx.globalAlpha=1;

  return canvas.toDataURL('image/jpeg', .82);
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
  const assignedIds=useRef<Set<string>>(new Set());
  const usedIndexes=useRef<Set<number>>(new Set());
  const targetColorRef=useRef<Rgb[]>([]);
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

  async function fetchStatus(){
    if(paused) return;
    try{
      const r=await fetch('/api/status?x='+Date.now());
      const s=await r.json();
      if(!s.ok) return;
      setStatus(s);

      const {cols,rows}=gridForTotal(s.totalTiles || 600);

      if(s.targetFileId && targetColorRef.current.length !== (cols*rows)){
        targetColorRef.current=await targetColors(targetImageUrl(s), cols, rows);
      }

      if(!processing.current && targetColorRef.current.length && !replayStarted){
        processing.current=true;
        await addNewPhotos(s.photos || [], s.totalTiles || 600, currentRun.current);
        processing.current=false;
      }

      if(s.complete && !final && !replayStarted){
        setReplayStarted(true);
        setCompleteMsg(true);
        setTimeout(()=>setCompleteMsg(false),2500);
        setTimeout(()=>startReplay(s.totalTiles || 600),3000);
      }
    }catch(e){}
  }

  async function addNewPhotos(photos:Photo[], total:number, runId:number){
    const available=photos.filter(p=>!assignedIds.current.has(p.id)).slice(0, Math.max(0,total-assignedIds.current.size));
    for(const p of available){
      if(paused || runId !== currentRun.current) break;

      let feature:PhotoFeature;
      try{
        feature=await getFeature(p);
      }catch(e){
        feature={id:p.id,url:`/api/image?id=${p.id}`,avg:[128,128,128],lum:.5,sat:.2};
      }

      const colors=targetColorRef.current;
      const best=chooseBestUnusedCell(feature, colors, total, usedIndexes.current);
      if(best.index<0) continue;

      const targetColor=colors[best.index] || [128,128,128];
      let modifiedUrl=feature.url;
      try{
        modifiedUrl=await createMosaicTile(feature.url, targetColor);
      }catch(e){}

      assignedIds.current.add(p.id);
      usedIndexes.current.add(best.index);
      setTiles(prev=>[...prev,{
        id:p.id,
        index:best.index,
        order:prev.length+1,
        url:feature.url,
        modifiedUrl,
        color:targetColor,
        sourceColor:feature.avg,
        matchScore:best.score
      }]);

      await new Promise(res=>setTimeout(res,55));
    }
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
    assignedIds.current=new Set();
    usedIndexes.current=new Set();
    targetColorRef.current=[];
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
    assignedIds.current=new Set();
    usedIndexes.current=new Set();
    setTiles([]);

    const r=await fetch('/api/status?x='+Date.now());
    const s=await r.json();
    const currentPhotos:Photo[]=(s.photos || []).slice(0,total);
    setStatus(s);

    await addNewPhotos(currentPhotos,total,runId);
    if(runId===currentRun.current && !paused){
      setTimeout(()=>setFinal(true), 1200);
    }
  }

  useEffect(()=>{
    fetchStatus();
    const id=setInterval(fetchStatus,3500);
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

  return (
    <div style={{height:'100vh',background:'#111',color:'#fff',fontFamily:'Arial, sans-serif',overflow:'hidden',position:'relative'}}>
      {!isFullscreen && <div style={{position:'absolute',top:22,left:28,right:88,display:'flex',justifyContent:'space-between',zIndex:5}}>
        <div>
          <div style={{background:'#ffffff18',border:'1px solid #ffffff33',borderRadius:999,padding:'10px 16px',fontSize:20}}>
            {count} / {total} tessere
          </div>
          <div style={{fontSize:15,color:'#ddd',marginTop:8}}>
            {paused ? 'Mosaico interrotto' : status?.hasTarget ? 'Foto finale caricata' : 'Carica foto finale da /admin'} · {pct}%
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
            </div>
          </div>
        </div>
      </div>}

      <style>{`@keyframes pop{0%{opacity:0;transform:scale(.75)}100%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}
