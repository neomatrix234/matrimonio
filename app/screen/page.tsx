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
  patchLum:number[];
  useCount:number;
};

type TargetCell = {
  index:number;
  row:number;
  col:number;
  color:Rgb;
  lab:Lab;
  lum:number;
  sat:number;
  patch:Rgb[];
  patchLum:number[];
  contrast:number;
  importance:number;
};

type MosaicRenderStyle = 'portraitOverlay' | 'classicTiles';
type MosaicTileDensity = '100' | '75' | '60';

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
  tintOpacity: 0.12,
  preserveOriginal: 0.06,
  targetSampleFactor: 8,
  tileCanvasSize: 190,
  patchSize: 10,
  patternWeight: 6.4,
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


function gridForTotal(total:number, aspect:number=1.5){
  const safeAspect = Math.max(0.35, Math.min(3, aspect || 1.5));
  let bestCols = total;
  let bestRows = 1;
  let bestError = Number.POSITIVE_INFINITY;

  for(let rows=1; rows<=Math.sqrt(total)+1; rows++){
    if(total % rows !== 0) continue;
    const cols = total / rows;
    const ratio = cols / rows;
    const error = Math.abs(ratio - safeAspect);
    if(error < bestError){
      bestError = error;
      bestCols = cols;
      bestRows = rows;
    }
  }

  if(bestCols < bestRows){
    const t = bestCols;
    bestCols = bestRows;
    bestRows = t;
  }

  return { cols: bestCols, rows: bestRows };
}

function effectiveTileTotal(total:number, density:MosaicTileDensity='100'){
  const factor = density === '60' ? 0.60 : density === '75' ? 0.75 : 1;
  return Math.max(24, Math.round(total * factor));
}

async function getImageAspect(url:string): Promise<number>{
  const img = await loadImg(url);
  const w = img.naturalWidth || img.width || 1;
  const h = img.naturalHeight || img.height || 1;
  return w / h;
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
function blendHue(h1:number,h2:number,t:number){
  let diff = h2 - h1;
  if(diff > 0.5) diff -= 1;
  if(diff < -0.5) diff += 1;
  let out = h1 + diff * t;
  if(out < 0) out += 1;
  if(out > 1) out -= 1;
  return out;
}


function adaptiveSquareCrop(iw:number, ih:number, xNorm:number=0.5, yNorm:number=0.5){
  const side = Math.min(iw, ih);
  let sx = 0;
  let sy = 0;

  if(iw > ih){
    const freeX = iw - side;
    sx = Math.round(freeX * Math.max(0, Math.min(1, xNorm)));
  }else if(ih > iw){
    const freeY = ih - side;
    sy = Math.round(freeY * Math.max(0, Math.min(1, yNorm)));
  }

  sx = Math.max(0, Math.min(iw - side, sx));
  sy = Math.max(0, Math.min(ih - side, sy));
  return { side, sx, sy };
}

function clamp01(v:number){
  return Math.max(0, Math.min(1, v));
}

function patchStats(values:number[]){
  if(!values.length) return {mean:.5, std:.1};
  let sum=0;
  for(const v of values) sum += v;
  const mean=sum/values.length;
  let sq=0;
  for(const v of values) sq += (v-mean)*(v-mean);
  const std=Math.sqrt(Math.max(0.0008, sq/values.length));
  return {mean,std};
}

function normalizedPatchDistance(a:number[], b:number[]){
  const n=Math.min(a.length,b.length);
  if(!n) return 0;
  const as=patchStats(a);
  const bs=patchStats(b);
  let sum=0;
  for(let i=0;i<n;i++){
    const av=(a[i]-as.mean)/as.std;
    const bv=(b[i]-bs.mean)/bs.std;
    const diff=av-bv;
    sum += diff*diff;
  }
  return sum/n;
}

function patchContrast(values:number[]){
  return patchStats(values).std;
}

function patchColorAt(patch:Rgb[]|undefined, xNorm:number, yNorm:number, fallback:Rgb):Rgb{
  const ps=PROFESSIONAL_MOSAIC.patchSize;
  if(!patch || patch.length < ps*ps) return fallback;
  const x=Math.max(0, Math.min(ps-1, Math.floor(xNorm*ps)));
  const y=Math.max(0, Math.min(ps-1, Math.floor(yNorm*ps)));
  return patch[y*ps+x] || fallback;
}
function patchEdgeAt(patch:Rgb[]|undefined, xNorm:number, yNorm:number):number{
  const ps=PROFESSIONAL_MOSAIC.patchSize;
  if(!patch || patch.length < ps*ps) return 0;
  const x=Math.max(1, Math.min(ps-2, Math.floor(xNorm*ps)));
  const y=Math.max(1, Math.min(ps-2, Math.floor(yNorm*ps)));
  const c=patch[y*ps+x];
  const l=patch[y*ps+(x-1)];
  const r=patch[y*ps+(x+1)];
  const u=patch[(y-1)*ps+x];
  const d=patch[(y+1)*ps+x];
  const cl=luminance(c), ll=luminance(l), rl=luminance(r), ul=luminance(u), dl=luminance(d);
  return Math.max(0, Math.min(1, (Math.abs(cl-ll)+Math.abs(cl-rl)+Math.abs(cl-ul)+Math.abs(cl-dl))*2.4));
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
  const labFast = labDistance(photo.lab, cell.lab) * 0.012;
  const lum = Math.pow((photo.lum-cell.lum)*100,2) * 0.18;
  const sat = Math.pow((photo.sat-cell.sat)*55,2) * 0.06;
  const contrast = Math.pow((photo.contrast-cell.contrast)*160,2) * 0.035;
  const pattern = normalizedPatchDistance(photo.patchLum, cell.patchLum) * PROFESSIONAL_MOSAIC.patternWeight;
  const reusePenalty = photo.useCount <= 0 ? 0 : Math.pow(photo.useCount, 2) * 14;
  const overPenalty = photo.useCount >= maxReuse ? 999999999 : 0;
  return de*de + labFast + lum + sat + contrast + pattern + reusePenalty + overPenalty;
}

const imagePromiseCache = new Map<string, Promise<HTMLImageElement>>();
function loadImg(url:string): Promise<HTMLImageElement>{
  if(imagePromiseCache.has(url)) return imagePromiseCache.get(url)!;
  const promise = new Promise<HTMLImageElement>((resolve,reject)=>{
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=()=>resolve(img);
    img.onerror=reject;
    img.src=url;
  });
  imagePromiseCache.set(url, promise);
  return promise;
}

async function photoFeature(url:string, id:string): Promise<PhotoFeature>{
  const img=await loadImg(url);
  const patchSize=PROFESSIONAL_MOSAIC.patchSize;
  const canvas=document.createElement('canvas');
  canvas.width=patchSize;
  canvas.height=patchSize;
  const ctx=canvas.getContext('2d', { willReadFrequently:true });
  if(!ctx){
    const avg:Rgb=[128,128,128];
    return {id,url,avg,lab:rgbToLab(avg),lum:.5,sat:.2,contrast:.2,patchLum:[],useCount:0};
  }

  const iw=img.naturalWidth || img.width;
  const ih=img.naturalHeight || img.height;
  const crop=adaptiveSquareCrop(iw,ih,.5,.5);
  ctx.drawImage(img,crop.sx,crop.sy,crop.side,crop.side,0,0,patchSize,patchSize);

  const data=ctx.getImageData(0,0,patchSize,patchSize).data;
  let r=0,g=0,b=0,count=0;
  const patchLum:number[]=[];

  for(let i=0;i<data.length;i+=4){
    const pr=data[i], pg=data[i+1], pb=data[i+2];
    const l=luminance([pr,pg,pb]);
    const weight = l<.025 || l>.985 ? .35 : 1;
    r+=srgbToLinear01(pr)*weight;
    g+=srgbToLinear01(pg)*weight;
    b+=srgbToLinear01(pb)*weight;
    count+=weight;
    patchLum.push(l);
  }

  const avg:Rgb=linearAverageToRgb(r,g,b,count);
  const contrast=patchContrast(patchLum);

  return {
    id,
    url,
    avg,
    lab:rgbToLab(avg),
    lum:luminance(avg),
    sat:saturation(avg),
    contrast,
    patchLum,
    useCount:0
  };
}

async function targetCells(url:string, cols:number, rows:number): Promise<TargetCell[]>{
  const img=await loadImg(url);
  const patchSize=PROFESSIONAL_MOSAIC.patchSize;
  const w=cols*patchSize;
  const h=rows*patchSize;
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
      const patch:Rgb[]=[];
      const patchLum:number[]=[];

      for(let yy=0;yy<patchSize;yy++){
        for(let xx=0;xx<patchSize;xx++){
          const px=cx*patchSize+xx, py=cy*patchSize+yy;
          const idx=(py*w+px)*4;
          const rgb:Rgb=[data[idx],data[idx+1],data[idx+2]];
          patch.push(rgb);
          patchLum.push(luminance(rgb));
          sr+=srgbToLinear01(rgb[0]);
          sg+=srgbToLinear01(rgb[1]);
          sb+=srgbToLinear01(rgb[2]);
          count++;
        }
      }

      const color:Rgb=linearAverageToRgb(sr,sg,sb,count);
      const lum=luminance(color);
      const sat=saturation(color);
      const contrast=patchContrast(patchLum);
      const index=cy*cols+cx;
      cells.push({index,row:cy,col:cx,color,lab:rgbToLab(color),lum,sat,patch,patchLum,contrast,importance:0});
    }
  }

  return cells.map((cell)=>{
    const x=cell.index%cols;
    const y=Math.floor(cell.index/cols);
    const left=x>0?cells[cell.index-1]:cell;
    const right=x<cols-1?cells[cell.index+1]:cell;
    const up=y>0?cells[cell.index-cols]:cell;
    const down=y<rows-1?cells[cell.index+cols]:cell;
    const edge = Math.abs(cell.lum-left.lum)*34 + Math.abs(cell.lum-right.lum)*34 + Math.abs(cell.lum-up.lum)*34 + Math.abs(cell.lum-down.lum)*34;
    const detail = cell.contrast*4.4;
    const importance = edge + detail + cell.sat*1.8 + Math.abs(cell.lum-.5)*.55;
    return {...cell, importance};
  });
}

async function extractExactTargetPatch(targetUrl:string, col:number, row:number, cols:number, rows:number, size:number): Promise<HTMLCanvasElement>{
  const img = await loadImg(targetUrl);
  const canvas=document.createElement('canvas');
  canvas.width=size;
  canvas.height=size;
  const ctx=canvas.getContext('2d', { willReadFrequently:true });
  if(!ctx) return canvas;
  const tw = img.naturalWidth || img.width || cols;
  const th = img.naturalHeight || img.height || rows;
  const sx = Math.max(0, Math.floor((col / cols) * tw));
  const sy = Math.max(0, Math.floor((row / rows) * th));
  const ex = Math.min(tw, Math.ceil(((col + 1) / cols) * tw));
  const ey = Math.min(th, Math.ceil(((row + 1) / rows) * th));
  const sw = Math.max(1, ex - sx);
  const sh = Math.max(1, ey - sy);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
  return canvas;
}

async function createMosaicTile(url:string, target:Rgb, targetPatch:Rgb[]=[], xNorm:number=0.5, yNorm:number=0.5, targetUrl:string='', col:number=0, row:number=0, cols:number=1, rows:number=1, style:MosaicRenderStyle='portraitOverlay'): Promise<string>{
  const img=await loadImg(url);
  const size=PROFESSIONAL_MOSAIC.tileCanvasSize || 190;
  const canvas=document.createElement('canvas');
  canvas.width=size;
  canvas.height=size;
  const ctx=canvas.getContext('2d');
  if(!ctx) return url;

  const iw=img.naturalWidth || img.width;
  const ih=img.naturalHeight || img.height;
  const crop = adaptiveSquareCrop(iw, ih, xNorm, yNorm);

  // 1) Base: la foto ospite originale, nitida e ben riconoscibile.
  ctx.drawImage(img,crop.sx,crop.sy,crop.side,crop.side,0,0,size,size);

  // 2) Estrai la vera porzione dell'immagine target corrispondente a questa cella:
  //    ogni tessera prende esattamente il pezzo di volto/immagine che le spetta,
  //    così ricomponendo tutte le tessere si ricompone il volto intero.
  let targetCanvas:HTMLCanvasElement | null = null;
  try{
    if(targetUrl) targetCanvas = await extractExactTargetPatch(targetUrl, col, row, cols, rows, size);
  }catch(e){ targetCanvas = null; }

  // Fallback se il target non è disponibile: tinta piatta col colore medio della cella.
  if(!targetCanvas){
    targetCanvas=document.createElement('canvas');
    targetCanvas.width=size;
    targetCanvas.height=size;
    const tctx=targetCanvas.getContext('2d');
    if(tctx){
      tctx.fillStyle=`rgb(${target[0]},${target[1]},${target[2]})`;
      tctx.fillRect(0,0,size,size);
    }
  }

  // 3) Doppia esposizione fotografica: è la tecnica reale usata nei mosaici in cui
  //    un volto grande e nitido emerge sopra un muro di foto piccole (come nel
  //    riferimento). Si ottiene sovrapponendo l'immagine target alla tessera con
  //    tre passaggi di compositing nativo del canvas:
  //    - "multiply": scurisce dove il target è scuro (capelli, sopracciglia,
  //      pupille, ombre), facendo emergere i tratti scuri del volto;
  //    - "screen": schiarisce dove il target è chiaro (pelle, luci, riflessi),
  //      così anche le zone luminose del volto restano leggibili;
  //    - "overlay": aumenta il contrasto locale seguendo la forma del target e
  //      ne trasferisce leggermente il colore, "incollando" i due livelli.
  //    Dove il target è neutro (es. sfondo uniforme) l'effetto è minimo e la
  //    foto della tessera resta ben visibile sotto, esattamente come nel muro
  //    di riferimento.
  const weights = style === 'classicTiles'
    ? { multiply:0.30, screen:0.16, overlay:0.22 }
    : { multiply:0.52, screen:0.30, overlay:0.42 };

  ctx.globalCompositeOperation='multiply';
  ctx.globalAlpha=weights.multiply;
  ctx.drawImage(targetCanvas,0,0,size,size);

  ctx.globalCompositeOperation='screen';
  ctx.globalAlpha=weights.screen;
  ctx.drawImage(targetCanvas,0,0,size,size);

  ctx.globalCompositeOperation='overlay';
  ctx.globalAlpha=weights.overlay;
  ctx.drawImage(targetCanvas,0,0,size,size);

  ctx.globalCompositeOperation='source-over';
  ctx.globalAlpha=1;

  return canvas.toDataURL('image/jpeg', .92);
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
  const [targetAspect,setTargetAspect]=useState(1.5);
  const [escapedFullscreen,setEscapedFullscreen]=useState(false);
  const [mosaicStyle,setMosaicStyle]=useState<MosaicRenderStyle>('portraitOverlay');
  const [mosaicTileDensity,setMosaicTileDensity]=useState<MosaicTileDensity>('100');
  const [showFsStop,setShowFsStop]=useState(false);

  const processing=useRef(false);
  const usedIndexes=useRef<Set<number>>(new Set());
  const targetCellsRef=useRef<TargetCell[]>([]);
  const photoFeatureCache=useRef<Map<string,PhotoFeature>>(new Map());
  const assignedPhotoByIndex=useRef<Map<number,string>>(new Map());
  const targetAspectRef=useRef(1.5);
  const currentTargetUrlRef=useRef('');
  const currentRun=useRef(0);
  const fsUiTimer=useRef<any>(null);

  useEffect(()=>{
    if(typeof window==='undefined') return;
    const saved = window.localStorage.getItem('fm_mosaic_style');
    if(saved === 'portraitOverlay' || saved === 'classicTiles') setMosaicStyle(saved);
    const savedDensity = window.localStorage.getItem('fm_mosaic_tile_density');
    if(savedDensity === '100' || savedDensity === '75' || savedDensity === '60') setMosaicTileDensity(savedDensity);
    const onStorage = () => {
      const next = window.localStorage.getItem('fm_mosaic_style');
      if(next === 'portraitOverlay' || next === 'classicTiles') setMosaicStyle(next);
      const nextDensity = window.localStorage.getItem('fm_mosaic_tile_density');
      if(nextDensity === '100' || nextDensity === '75' || nextDensity === '60') setMosaicTileDensity(nextDensity);
    };
    window.addEventListener('storage', onStorage);
    return ()=>window.removeEventListener('storage', onStorage);
  }, []);

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
    assignedPhotoByIndex.current = new Map();
  }

  function neighborDuplicatePenalty(photoId:string, cellIndex:number, cols:number, rows:number){
    let penalty = 0;
    const x = cellIndex % cols;
    const y = Math.floor(cellIndex / cols);

    for(let dy=-2; dy<=2; dy++){
      for(let dx=-2; dx<=2; dx++){
        if(dx===0 && dy===0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if(nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nIndex = ny * cols + nx;
        const assigned = assignedPhotoByIndex.current.get(nIndex);
        if(!assigned) continue;
        if(assigned === photoId){
          const dist = Math.abs(dx) + Math.abs(dy);
          if(dist <= 1) penalty += 90000;
          else if(dist === 2) penalty += 24000;
          else penalty += 9000;
        }
      }
    }
    return penalty;
  }

  async function buildWallMosaic(photos:Photo[], total:number, runId:number, appendOnly:boolean){
    if(!targetCellsRef.current.length) return;

    const realPhotos=photos.slice().sort((a,b)=>a.created-b.created);
    if(!realPhotos.length) return;

    const maxReuse = Math.max(1, Math.ceil(total / realPhotos.length));
    const { cols, rows } = gridForTotal(total, targetAspectRef.current);

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
      const fullSearchAtStart = usedIndexes.current.size < Math.min(180, Math.round(total * 0.18));
      const maxChecked = fullSearchAtStart ? cellsByImportance.length : (total >= 2500 ? 1400 : total >= 1500 ? 1100 : total >= 1000 ? 850 : 520);
      for(const cell of cellsByImportance){
        if(usedIndexes.current.has(cell.index)) continue;
        const score=photoCellScore(feature,cell,maxReuse) + neighborDuplicatePenalty(feature.id, cell.index, cols, rows);
        if(score<bestScore){
          bestScore=score;
          bestCell=cell;
        }
        checked++;
        if(checked > maxChecked) break;
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
        const xNorm = cols <= 1 ? 0.5 : (bestCell.index % cols) / (cols - 1);
        const yNorm = rows <= 1 ? 0.5 : Math.floor(bestCell.index / cols) / (rows - 1);
        modifiedUrl=await createMosaicTile(feature.url, bestCell.color, bestCell.patch, xNorm, yNorm, currentTargetUrlRef.current, bestCell.col, bestCell.row, cols, rows, mosaicStyle);
      }catch(e){}

      usedIndexes.current.add(bestCell.index);
      assignedPhotoByIndex.current.set(bestCell.index, feature.id);

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

      const configuredTotal = s.totalTiles || 600;
      const total=effectiveTileTotal(configuredTotal, mosaicTileDensity);
      if(s.targetFileId){
        const targetUrl = targetImageUrl(s);
        currentTargetUrlRef.current = targetUrl;
        const aspect = await getImageAspect(targetUrl);
        targetAspectRef.current = aspect;
        setTargetAspect(aspect);
        const {cols,rows}=gridForTotal(total, aspect);
        if(targetCellsRef.current.length !== (cols*rows)){
          targetCellsRef.current=await targetCells(targetUrl, cols, rows);
        }
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
    assignedPhotoByIndex.current=new Map();
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
      assignedPhotoByIndex.current=new Map();
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

    const {cols,rows}=gridForTotal(total, targetAspect);
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
    let wasFullscreen=Boolean(document.fullscreenElement);
    const fs=()=>{
      const nowFullscreen=Boolean(document.fullscreenElement);
      setIsFullscreen(nowFullscreen);
      if(wasFullscreen && !nowFullscreen){
        // Uscendo dal pieno schermo la creazione continua normalmente.
        setEscapedFullscreen(true);
        setShowFsStop(false);
      }
      if(nowFullscreen){
        setEscapedFullscreen(false);
      }
      wasFullscreen=nowFullscreen;
    };
    const onKeyDown=(e:KeyboardEvent)=>{
      if(e.key !== 'Escape') return;
      if(selectedTile){
        setSelectedTile(null);
        return;
      }
      // Il browser gestisce l'uscita dal pieno schermo; la creazione non si interrompe.
    };
    const onMouseMove=()=>{
      if(!document.fullscreenElement) return;
      setShowFsStop(true);
      if(fsUiTimer.current) clearTimeout(fsUiTimer.current);
      fsUiTimer.current=setTimeout(()=>setShowFsStop(false), 1800);
    };
    document.addEventListener('fullscreenchange',fs);
    window.addEventListener('keydown',onKeyDown);
    window.addEventListener('mousemove',onMouseMove);
    return ()=>{
      clearInterval(id);
      if(fsUiTimer.current) clearTimeout(fsUiTimer.current);
      document.removeEventListener('fullscreenchange',fs);
      window.removeEventListener('keydown',onKeyDown);
      window.removeEventListener('mousemove',onMouseMove);
    };
  },[replayStarted,final,paused,selectedTile,mosaicTileDensity,mosaicStyle]);

  const configuredTotal=status?.totalTiles || 600;
  const total=effectiveTileTotal(configuredTotal, mosaicTileDensity);
  const {cols,rows}=gridForTotal(total, targetAspect);
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
            {paused ? 'Mosaico interrotto' : status?.hasTarget ? `Stile: ${mosaicStyle==='portraitOverlay' ? 'Ritratto morbido' : 'Tessere evidenti'} · composizione ${total}/${configuredTotal} tessere` : 'Carica foto finale da /admin'} · {pct}% · foto caricate: {photoCount}
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
              return <div key={i} style={{background:'#222',border:isFullscreen?'1px solid rgba(0,0,0,.20)':'1px solid rgba(255,255,255,.06)',overflow:'hidden', boxSizing:'border-box'}}>
                {t && <button className="tileButton" onClick={()=>setSelectedTile(t)} title="Vedi foto">
                  <img src={t.modifiedUrl} alt="" style={{animation:'pop .45s ease'}}/>
                </button>}
              </div>
            })}
          </div>
          {final && targetUrl && mosaicStyle==='portraitOverlay' && <img src={targetUrl} alt="" style={{position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:0.46, pointerEvents:'none', userSelect:'none'}} />}
          {final && targetUrl && mosaicStyle==='classicTiles' && <img src={targetUrl} alt="" style={{position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:0.22, pointerEvents:'none', userSelect:'none'}} />}
          {completeMsg && !isFullscreen && <div style={{
            position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',
            background:'rgba(0,0,0,.55)',fontSize:'clamp(36px,7vw,92px)',fontWeight:900,zIndex:4,textShadow:'0 4px 22px #000'
          }}>MOSAICO COMPLETO</div>}
        </div>
      </div>

      {final && !isFullscreen && <div style={{
        position:'absolute',
        bottom: 86,
        left:0,
        right:0,
        textAlign:'center',
        fontSize: 28,
        fontWeight:800,
        textShadow:'0 3px 18px #000',
        zIndex:6,
        padding:'0 20px'
      }}>
        Grazie per aver contribuito a questo ricordo.
      </div>}

      {!isFullscreen && <div className="screenBottomControls">
        <button onClick={()=>startReplay(total)}>Replay finale</button>
        <button onClick={()=>{setEscapedFullscreen(false); document.documentElement.requestFullscreen();}}>Schermo intero</button>
        <button className="danger" onClick={stopMosaic}>Interrompi</button>
        <button onClick={restartMosaic}>Riparti</button>
      </div>}

      {isFullscreen && showFsStop && (
        <button onClick={stopMosaic} style={{position:'fixed', right:18, bottom:18, zIndex:20, border:'none', borderRadius:999, padding:'12px 18px', background:'rgba(125,15,34,.92)', color:'#fff', fontWeight:800, boxShadow:'0 10px 30px rgba(0,0,0,.35)', cursor:'pointer'}}>
          Interrompi
        </button>
      )}

      {selectedTile && <div className="tileModal" onClick={()=>setSelectedTile(null)}>
        <div style={{maxWidth:'min(94vw, 980px)', maxHeight:'94vh', display:'flex', alignItems:'center', justifyContent:'center'}} onClick={(e)=>e.stopPropagation()}>
          <img src={selectedTile.url} alt="Foto originale tessera" style={{display:'block', maxWidth:'100%', maxHeight:'94vh', borderRadius:18, boxShadow:'0 24px 60px rgba(0,0,0,.45)'}} />
        </div>
      </div>}

      <style>{`@keyframes pop{0%{opacity:0;transform:scale(.75)}100%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}
