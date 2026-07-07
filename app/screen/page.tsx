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

const PROFESSIONAL_MOSAIC = {
  tintOpacity: 0.38,
  preserveOriginal: 0.08,
  targetSampleFactor: 4,
  tileCanvasSize: 190,
};

function srgbToLinear01(v:number){
  const x=v/255;
  return x <= 0.04045 ? x/12.92 : Math.pow((x+0.055)/1.055, 2.4);
}
function linear01ToSrgb(v:number){
  const x=Math.max(0, Math.min(1, v));
  const s=x <= 0.0031308 ? 12.92*x : 1.055*Math.pow(x, 1/2.4)-0.055;
  return clamp(Math.round(s*255));
}
function linearAverageToRgb(sumR:number,sumG:number,sumB:number,count:number):Rgb{
  if(!count) return [128,128,128];
  return [linear01ToSrgb(sumR/count), linear01ToSrgb(sumG/count), linear01ToSrgb(sumB/count)];
}
function deltaE2000(lab1:Lab, lab2:Lab){
  const [L1,a1,b1]=lab1, [L2,a2,b2]=lab2;
  const avgLp=(L1+L2)/2;
  const C1=Math.sqrt(a1*a1+b1*b1);
  const C2=Math.sqrt(a2*a2+b2*b2);
  const avgC=(C1+C2)/2;
  const G=0.5*(1-Math.sqrt(Math.pow(avgC,7)/(Math.pow(avgC,7)+Math.pow(25,7))));
  const a1p=(1+G)*a1, a2p=(1+G)*a2;
  const C1p=Math.sqrt(a1p*a1p+b1*b1);
  const C2p=Math.sqrt(a2p*a2p+b2*b2);
  const avgCp=(C1p+C2p)/2;
  const h1p=(Math.atan2(b1,a1p)*180/Math.PI+360)%360;
  const h2p=(Math.atan2(b2,a2p)*180/Math.PI+360)%360;
  let dh=h2p-h1p;
  if(C1p*C2p===0) dh=0;
  else if(dh>180) dh-=360;
  else if(dh<-180) dh+=360;
  const dLp=L2-L1, dCp=C2p-C1p, dHp=2*Math.sqrt(C1p*C2p)*Math.sin((dh/2)*Math.PI/180);
  let avgh=(h1p+h2p)/2;
  if(C1p*C2p===0) avgh=h1p+h2p;
  else if(Math.abs(h1p-h2p)>180) avgh=(h1p+h2p+360)/2;
  if(avgh>=360) avgh-=360;
  const T=1 - .17*Math.cos((avgh-30)*Math.PI/180) + .24*Math.cos((2*avgh)*Math.PI/180) + .32*Math.cos((3*avgh+6)*Math.PI/180) - .20*Math.cos((4*avgh-63)*Math.PI/180);
  const dTheta=30*Math.exp(-Math.pow((avgh-275)/25,2));
  const Rc=2*Math.sqrt(Math.pow(avgCp,7)/(Math.pow(avgCp,7)+Math.pow(25,7)));
  const Sl=1+(.015*Math.pow(avgLp-50,2))/Math.sqrt(20+Math.pow(avgLp-50,2));
  const Sc=1+.045*avgCp;
  const Sh=1+.015*avgCp*T;
  const Rt=-Math.sin(2*dTheta*Math.PI/180)*Rc;
  return Math.sqrt(Math.pow(dLp/Sl,2)+Math.pow(dCp/Sc,2)+Math.pow(dHp/Sh,2)+Rt*(dCp/Sc)*(dHp/Sh));
}


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
  return 0.2126*srgbToLinear01(c[0]) + 0.7152*srgbToLinear01(c[1]) + 0.0722*srgbToLinear01(c[2]);
}

function saturation(c:number[]){
  const max=Math.max(c[0],c[1],c[2]);
  const min=Math.min(c[0],c[1],c[2]);
  return max===0 ? 0 : (max-min)/max;
}


function mix(a:number,b:number,t:number){
  return a + (b-a)*t;
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
  if(s===0){
    r=g=b=l;
  }else{
    const q=l<0.5 ? l*(1+s) : l+s-l*s;
    const p=2*l-q;
    r=hue2rgb(p,q,h+1/3);
    g=hue2rgb(p,q,h);
    b=hue2rgb(p,q,h-1/3);
  }
  return [Math.round(r*255),Math.round(g*255),Math.round(b*255)];
}

function mixRgb(a:Rgb,b:Rgb,t:number): Rgb{
  return [
    Math.round(mix(a[0],b[0],t)),
    Math.round(mix(a[1],b[1],t)),
    Math.round(mix(a[2],b[2],t))
  ];
}

function clamp01(v:number){
  return Math.max(0, Math.min(1, v));
}

function sigmoid(x:number){
  return 1 / (1 + Math.exp(-x));
}

function srgbToLinear(v:number){
  const x=v/255;
  return x <= 0.04045 ? x/12.92 : Math.pow((x+0.055)/1.055, 2.4);
}

function rgbToLab(rgb:Rgb):Lab{
  const r=srgbToLinear01(rgb[0]);
  const g=srgbToLinear01(rgb[1]);
  const b=srgbToLinear01(rgb[2]);

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
  const de = deltaE2000(photo.lab, cell.lab);
  const lum = Math.pow((photo.lum-cell.lum)*100,2) * 0.22;
  const sat = Math.pow((photo.sat-cell.sat)*60,2) * 0.06;
  const reusePenalty = photo.useCount <= 0 ? 0 : Math.pow(photo.useCount, 2) * 14;
  const overPenalty = photo.useCount >= maxReuse ? 999999999 : 0;
  return de*de + lum + sat + reusePenalty + overPenalty;
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
  const factor=PROFESSIONAL_MOSAIC.targetSampleFactor;
  const w=cols*factor, h=rows*factor;
  const canvas=document.createElement('canvas');
  canvas.width=w;
  canvas.height=h;
  const ctx=canvas.getContext('2d', { willReadFrequently:true });
  if(!ctx) return [];
  ctx.drawImage(img,0,0,w,h);
  const data=ctx.getImageData(0,0,w,h).data;
  const cells:TargetCell[]=[];

  for(let cy=0;cy<rows;cy++){
    for(let cx=0;cx<cols;cx++){
      let sr=0,sg=0,sb=0,count=0;
      for(let yy=0;yy<factor;yy++){
        for(let xx=0;xx<factor;xx++){
          const px=cx*factor+xx, py=cy*factor+yy;
          const idx=(py*w+px)*4;
          sr+=srgbToLinear01(data[idx]);
          sg+=srgbToLinear01(data[idx+1]);
          sb+=srgbToLinear01(data[idx+2]);
          count++;
        }
      }
      const color:Rgb=linearAverageToRgb(sr,sg,sb,count);
      const lum=luminance(color);
      const sat=saturation(color);
      const index=cy*cols+cx;
      cells.push({index,color,lab:rgbToLab(color),lum,sat,importance:0});
    }
  }

  return cells.map((cell)=>{
    const x=cell.index%cols;
    const y=Math.floor(cell.index/cols);
    const left=x>0?cells[cell.index-1]:cell;
    const right=x<cols-1?cells[cell.index+1]:cell;
    const up=y>0?cells[cell.index-cols]:cell;
    const down=y<rows-1?cells[cell.index+cols]:cell;
    const upDiff = Math.abs(cell.lum - up.lum)*34;
    const downDiff = Math.abs(cell.lum - down.lum)*34;
    const finalImportance = Math.abs(cell.lum - left.lum)*34 + Math.abs(cell.lum - right.lum)*34 + upDiff + downDiff + cell.sat*1.8 + Math.abs(cell.lum-.5)*.55;
    return {...cell, importance: finalImportance};
  });
}

async function createMosaicTile(url:string, target:Rgb): Promise<string>{
  const img=await loadImg(url);
  const size=PROFESSIONAL_MOSAIC.tileCanvasSize || 190;
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

  let minLum=1, maxLum=0;
  for(let i=0;i<d.length;i+=4){
    const lum=luminance([d[i],d[i+1],d[i+2]]);
    if(lum<minLum) minLum=lum;
    if(lum>maxLum) maxLum=lum;
  }
  const range=Math.max(0.08, maxLum-minLum);

  const [th, ts, tl] = rgbToHsl(target);
  const darkTone  = hslToRgb(th, clamp01(ts*0.96 + 0.02), clamp01(tl*0.16 + 0.015));
  const midTone   = target;
  const lightTone = hslToRgb(th, clamp01(ts*0.42 + 0.08), clamp01(tl + (1-tl)*0.56));
  const preserve = PROFESSIONAL_MOSAIC.preserveOriginal;

  for(let i=0;i<d.length;i+=4){
    const r=d[i], g=d[i+1], b=d[i+2];
    let tone = clamp01((luminance([r,g,b]) - minLum) / range);
    tone = Math.pow(tone, 0.90);
    const mapped = tone < 0.5 ? mixRgb(darkTone, midTone, tone*2) : mixRgb(midTone, lightTone, (tone-0.5)*2);
    d[i]   = clamp((mapped[0]*(1-preserve)+r*preserve-128)*1.025+128);
    d[i+1] = clamp((mapped[1]*(1-preserve)+g*preserve-128)*1.025+128);
    d[i+2] = clamp((mapped[2]*(1-preserve)+b*preserve-128)*1.025+128);
  }

  ctx.putImageData(image,0,0);

  // Tinting professionale regolabile: multiply + screen, 20–40%.
  ctx.globalCompositeOperation='multiply';
  ctx.fillStyle=`rgb(${target[0]},${target[1]},${target[2]})`;
  ctx.globalAlpha=PROFESSIONAL_MOSAIC.tintOpacity;
  ctx.fillRect(0,0,size,size);

  ctx.globalCompositeOperation='screen';
  ctx.globalAlpha=PROFESSIONAL_MOSAIC.tintOpacity*0.42;
  ctx.fillRect(0,0,size,size);

  ctx.globalCompositeOperation='source-over';
  ctx.globalAlpha=1;

  return canvas.toDataURL('image/jpeg', .86);
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

    if(!appendOnly && usedIndexes.current.size === 0){
      resetPhotoUseCounts();
    }

    // IMPORTANTE:
    // prima versione LAB aspettava di analizzare tutte le foto prima di disegnare.
    // Con 200/300/1000 foto poteva sembrare bloccata a 0%.
    // Ora analizziamo e disegniamo subito, a piccoli passaggi.
    let availableFeatures:PhotoFeature[]=[];
    const cellsByImportance = targetCellsRef.current
      .slice()
      .sort((a,b)=>b.importance-a.importance);

    async function getNextFreeImportantCell(){
      for(const c of cellsByImportance){
        if(!usedIndexes.current.has(c.index)) return c;
      }
      return null;
    }

    async function placeFeature(feature:PhotoFeature){
      let bestCell:TargetCell|null=null;
      let bestScore=Number.POSITIVE_INFINITY;

      // cerca una cella adatta tra un sottoinsieme di celle ancora libere:
      // è molto più veloce e permette avvio immediato.
      let checked=0;
      for(const cell of cellsByImportance){
        if(usedIndexes.current.has(cell.index)) continue;
        const score=photoCellScore(feature,cell,maxReuse);
        if(score<bestScore){
          bestScore=score;
          bestCell=cell;
        }
        checked++;
        if(checked > 420) break;
      }

      // se non trova entro il campione, prende la prossima cella importante libera
      if(!bestCell){
        bestCell=await getNextFreeImportantCell();
        bestScore=0;
      }

      if(!bestCell) return false;

      feature.useCount += 1;
      let modifiedUrl=feature.url;
      try{
        modifiedUrl=await createMosaicTile(feature.url, bestCell.color);
      }catch(e){}

      usedIndexes.current.add(bestCell.index);

      setTiles(prev=>{
        // evita doppioni sulla stessa cella se due cicli si sovrappongono
        if(prev.some(x=>x.index===bestCell!.index)) return prev;
        return [...prev,{
          id:feature.id,
          index:bestCell!.index,
          order:prev.length+1,
          url:feature.url,
          modifiedUrl,
          color:bestCell!.color,
          sourceColor:feature.avg,
          matchScore:bestScore,
          repeated:feature.useCount
        }];
      });

      return true;
    }

    // 1) Avvio immediato: analizza una foto e la mette subito nel mosaico.
    for(const p of realPhotos){
      if(paused || runId !== currentRun.current) return;
      if(usedIndexes.current.size >= total) return;

      let f:PhotoFeature|null=null;
      try{
        f=await getFeature(p);
        availableFeatures.push(f);
        await placeFeature(f);
      }catch(e){}

      await new Promise(res=>setTimeout(res,total>2000?4:total>1200?8:14));
    }

    // 2) Se ci sono più tessere che foto, riusa le foto in modo controllato
    // fino a completare il wall mosaic.
    while(usedIndexes.current.size < total && availableFeatures.length){
      if(paused || runId !== currentRun.current) return;

      // prende le foto meno usate e più adatte, così evita ripetizioni troppo ravvicinate
      availableFeatures.sort((a,b)=>a.useCount-b.useCount);

      let placedInRound=false;
      for(const f of availableFeatures){
        if(paused || runId !== currentRun.current) return;
        if(usedIndexes.current.size >= total) return;
        if(f.useCount >= maxReuse) continue;

        const ok=await placeFeature(f);
        if(ok) placedInRound=true;

        await new Promise(res=>setTimeout(res,total>2000?3:total>1200?6:10));
      }

      if(!placedInRound) break;
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
        const oldCount=usedIndexes.current.size;
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

    // Replay veloce: non ricalcola tutto lentamente.
    // Usa le tessere già generate e le rimette a schermo a blocchi rapidi.
    const snapshot = tiles.slice().sort((a,b)=>a.order-b.order);
    if(snapshot.length){
      usedIndexes.current=new Set();
      setTiles([]);

      const chunk = total > 2000 ? 120 : total > 1200 ? 90 : 60;
      for(let i=0;i<snapshot.length;i+=chunk){
        if(runId!==currentRun.current || paused) return;
        const part=snapshot.slice(0, Math.min(snapshot.length, i+chunk));
        part.forEach(t=>usedIndexes.current.add(t.index));
        setTiles(part);
        await new Promise(res=>setTimeout(res,18));
      }

      if(runId===currentRun.current && !paused){
        setTimeout(()=>setFinal(true), 450);
      }
      return;
    }

    // Fallback: se non ci sono tessere già pronte, costruisce comunque il mosaico.
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
      setTimeout(()=>setFinal(true), 450);
    }
  }

  useEffect(()=>{
    fetchStatus();
    const id=setInterval(fetchStatus,9000);
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
            {paused ? 'Mosaico interrotto' : status?.hasTarget ? 'Motore professionale LAB/CIEDE2000 attivo' : 'Carica foto finale da /admin'} · {pct}% · foto caricate: {photoCount}
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
        Grazie per aver contribuito a questo ricordo.
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
