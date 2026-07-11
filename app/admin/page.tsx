'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const options = [200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 2500, 3000];

type CropState = {
  src:string;
  width:number;
  height:number;
  baseScale:number;
  zoom:number;
  x:number;
  y:number;
  frameW:number;
  frameH:number;
};

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
function targetCropFrame(width:number, height:number){
  const aspect = Math.max(0.45, Math.min(2.4, width / Math.max(1, height)));
  const maxSide = 320;
  let frameW = maxSide;
  let frameH = Math.round(frameW / aspect);
  if(frameH > 320){
    frameH = 320;
    frameW = Math.round(frameH * aspect);
  }
  frameW = Math.max(220, Math.min(340, frameW));
  frameH = Math.max(220, Math.min(340, frameH));
  return { frameW, frameH };
}
function clampTargetCropPosition(x:number, y:number, crop:CropState, zoom:number){
  const scale = crop.baseScale * zoom;
  const scaledW = crop.width * scale;
  const scaledH = crop.height * scale;
  const minX = Math.min(0, crop.frameW - scaledW);
  const minY = Math.min(0, crop.frameH - scaledH);
  return {
    x: Math.max(minX, Math.min(0, x)),
    y: Math.max(minY, Math.min(0, y))
  };
}
function enhanceTargetCanvas(canvas:HTMLCanvasElement){
  const ctx = canvas.getContext('2d', { willReadFrequently:true });
  if(!ctx) return;
  const w = canvas.width, h = canvas.height;
  const image = ctx.getImageData(0,0,w,h);
  const d = image.data;
  const stride = w * 4;
  let lumSum = 0, lumSq = 0, n = 0;
  for(let i=0;i<d.length;i+=4){
    const lum = 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
    lumSum += lum;
    lumSq += lum*lum;
    n++;
  }
  const mean = lumSum / Math.max(1, n);
  const variance = Math.max(0, lumSq / Math.max(1, n) - mean*mean);
  const deviation = Math.sqrt(variance);
  const contrast = deviation < 38 ? 1.18 : deviation < 52 ? 1.13 : 1.08;
  const saturation = deviation < 40 ? 1.14 : 1.10;
  const brightness = mean < 110 ? 10 : mean < 125 ? 4 : 0;
  const gamma = mean < 118 ? 0.96 : 1.0;

  for(let i=0;i<d.length;i+=4){
    let r = d[i], g = d[i+1], b = d[i+2];
    const gray = 0.299*r + 0.587*g + 0.114*b;
    r = gray + (r-gray) * saturation;
    g = gray + (g-gray) * saturation;
    b = gray + (b-gray) * saturation;
    r = (r - 128) * contrast + 128 + brightness;
    g = (g - 128) * contrast + 128 + brightness;
    b = (b - 128) * contrast + 128 + brightness;
    d[i]   = qClamp(Math.round(255 * Math.pow(Math.max(0, Math.min(255, r)) / 255, gamma)));
    d[i+1] = qClamp(Math.round(255 * Math.pow(Math.max(0, Math.min(255, g)) / 255, gamma)));
    d[i+2] = qClamp(Math.round(255 * Math.pow(Math.max(0, Math.min(255, b)) / 255, gamma)));
  }

  const base = new Uint8ClampedArray(d);
  const sharpen = 0.22;
  for(let y=1;y<h-1;y++){
    for(let x=1;x<w-1;x++){
      const i = y*stride + x*4;
      for(let c=0;c<3;c++){
        const blur = (base[i-4+c] + base[i+4+c] + base[i-stride+c] + base[i+stride+c]) / 4;
        d[i+c] = qClamp(Math.round(base[i+c] + (base[i+c] - blur) * sharpen));
      }
    }
  }
  ctx.putImageData(image,0,0);
}
async function renderOptimizedTargetImage(crop: CropState): Promise<{base64:string;previewUrl:string;sizeKb:number;width:number;height:number}> {
  const img = await loadImageFromSrc(crop.src);
  const scale = crop.baseScale * crop.zoom;
  const srcX = Math.max(0, (-crop.x) / scale);
  const srcY = Math.max(0, (-crop.y) / scale);
  const srcW = Math.min(img.naturalWidth - srcX, crop.frameW / scale);
  const srcH = Math.min(img.naturalHeight - srcY, crop.frameH / scale);
  const aspect = Math.max(0.45, Math.min(2.4, srcW / Math.max(1, srcH)));
  const maxSide = 1800;
  let outW = aspect >= 1 ? maxSide : Math.round(maxSide * aspect);
  let outH = aspect >= 1 ? Math.round(maxSide / aspect) : maxSide;
  outW = Math.max(900, outW);
  outH = Math.max(900, outH);
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if(!ctx) throw new Error('Canvas non disponibile.');
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
  enhanceTargetCanvas(canvas);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const base64 = dataUrl.split(',')[1] || '';
  return { base64, previewUrl:dataUrl, sizeKb:Math.round((base64.length*0.75)/1024), width:outW, height:outH };
}

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

function qClamp(v:number,min=0,max=255){ return Math.max(min, Math.min(max, v)); }
function qSrgbToLinear(v:number){ const x=v/255; return x<=0.04045?x/12.92:Math.pow((x+0.055)/1.055,2.4); }
function qLinearToSrgb(v:number){ const x=Math.max(0,Math.min(1,v)); const s=x<=0.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-0.055; return qClamp(Math.round(s*255)); }
function qLum(c:number[]){ return 0.2126*qSrgbToLinear(c[0])+0.7152*qSrgbToLinear(c[1])+0.0722*qSrgbToLinear(c[2]); }
function qLoadImg(url:string): Promise<HTMLImageElement>{ return new Promise((resolve,reject)=>{ const img=new Image(); img.crossOrigin='anonymous'; img.onload=()=>resolve(img); img.onerror=reject; img.src=url; }); }
function qMix(a:number,b:number,t:number){ return a+(b-a)*t; }
function qMixRgb(a:number[],b:number[],t:number){ return [Math.round(qMix(a[0],b[0],t)),Math.round(qMix(a[1],b[1],t)),Math.round(qMix(a[2],b[2],t))]; }
function qGrid(total:number, aspect:number=1.5){
  // Prima era troppo povera (es. 20×15 = 300 tessere simulate su un mosaico da 1000),
  // quindi il soggetto risultava poco leggibile. Ora la rapida usa molte più tessere,
  // ma resta molto più veloce del render completo.
  const safeAspect = Math.max(0.35, Math.min(3, aspect || 1.5));
  let previewTotal = 0;
  if(total <= 600) previewTotal = Math.round(total * 0.72);
  else if(total <= 1000) previewTotal = Math.round(total * 0.62);
  else if(total <= 1500) previewTotal = Math.round(total * 0.52);
  else if(total <= 2500) previewTotal = Math.round(total * 0.42);
  else previewTotal = Math.round(total * 0.34);
  previewTotal = Math.max(180, Math.min(900, previewTotal));

  let bestCols = Math.max(1, Math.round(Math.sqrt(previewTotal * safeAspect)));
  let bestRows = Math.max(1, Math.round(previewTotal / bestCols));
  while(bestCols * bestRows > 920){
    if(bestCols >= bestRows) bestCols--;
    else bestRows--;
  }
  while(bestCols * bestRows < Math.max(140, previewTotal - Math.max(8, Math.round(bestCols * 0.4)))){
    if((bestCols / Math.max(1,bestRows)) < safeAspect) bestCols++;
    else bestRows++;
    if(bestCols * bestRows > 920) break;
  }
  return {cols:bestCols, rows:bestRows};
}

function effectiveTileTotal(total:number, density:MosaicTileDensity='100'){
  const factor = density === '60' ? 0.60 : density === '75' ? 0.75 : 1;
  return Math.max(24, Math.round(total * factor));
}
async function applyFinalOverlay(canvas:HTMLCanvasElement, targetUrl:string, style:MosaicRenderStyle){
  if(!targetUrl) return;
  const img = await loadImg(targetUrl);
  const ctx = canvas.getContext('2d');
  if(!ctx) return;
  const opacity = style === 'portraitOverlay' ? 0.44 : 0.20;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = opacity;
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  ctx.restore();
}

async function qImageAspect(url:string){
  const img=await qLoadImg(url);
  const w=img.naturalWidth||img.width||1;
  const h=img.naturalHeight||img.height||1;
  return w/h;
}
async function qAvgPhoto(url:string){
  const img=await qLoadImg(url); const s=16; const c=document.createElement('canvas'); c.width=s; c.height=s; const ctx=c.getContext('2d',{willReadFrequently:true}); if(!ctx) return [128,128,128];
  const iw=img.naturalWidth||img.width, ih=img.naturalHeight||img.height, side=Math.min(iw,ih), sx=Math.max(0,(iw-side)/2), sy=Math.max(0,(ih-side)/2);
  ctx.drawImage(img,sx,sy,side,side,0,0,s,s); const d=ctx.getImageData(0,0,s,s).data; let r=0,g=0,b=0,n=0;
  for(let i=0;i<d.length;i+=4){ r+=qSrgbToLinear(d[i]); g+=qSrgbToLinear(d[i+1]); b+=qSrgbToLinear(d[i+2]); n++; }
  return [qLinearToSrgb(r/n),qLinearToSrgb(g/n),qLinearToSrgb(b/n)];
}
async function qTargetColors(url:string, cols:number, rows:number){
  const img=await qLoadImg(url); const factor=4; const w=cols*factor,h=rows*factor; const c=document.createElement('canvas'); c.width=w;c.height=h; const ctx=c.getContext('2d',{willReadFrequently:true}); if(!ctx) return [];
  ctx.drawImage(img,0,0,w,h); const d=ctx.getImageData(0,0,w,h).data; const out:any[]=[];
  for(let cy=0;cy<rows;cy++){ for(let cx=0;cx<cols;cx++){ let r=0,g=0,b=0,n=0; for(let yy=0;yy<factor;yy++){ for(let xx=0;xx<factor;xx++){ const p=((cy*factor+yy)*w+(cx*factor+xx))*4; r+=qSrgbToLinear(d[p]); g+=qSrgbToLinear(d[p+1]); b+=qSrgbToLinear(d[p+2]); n++; }} out.push([qLinearToSrgb(r/n),qLinearToSrgb(g/n),qLinearToSrgb(b/n)]); }}
  return out;
}
function qEnhanceReference(ctx:CanvasRenderingContext2D, w:number, h:number){
  const img=ctx.getImageData(0,0,w,h);
  const d=img.data;
  const contrast=1.12;
  const saturation=1.08;
  for(let i=0;i<d.length;i+=4){
    let r=d[i], g=d[i+1], b=d[i+2];
    const gray=0.299*r+0.587*g+0.114*b;
    r=gray+(r-gray)*saturation;
    g=gray+(g-gray)*saturation;
    b=gray+(b-gray)*saturation;
    d[i]=qClamp((r-128)*contrast+128);
    d[i+1]=qClamp((g-128)*contrast+128);
    d[i+2]=qClamp((b-128)*contrast+128);
  }
  ctx.putImageData(img,0,0);
}
function qDist(a:number[],b:number[]){ return (a[0]-b[0])**2*.30+(a[1]-b[1])**2*.58+(a[2]-b[2])**2*.22+(qLum(a)*255-qLum(b)*255)**2*.65; }
function qDrawFastTile(ctx:CanvasRenderingContext2D,img:HTMLImageElement,target:number[],x:number,y:number,size:number,xNorm:number=0.5,yNorm:number=0.5){
  const iw=img.naturalWidth||img.width||1, ih=img.naturalHeight||img.height||1;
  const side=Math.min(iw,ih);
  let sx=0, sy=0;
  if(iw>ih) sx=Math.round((iw-side)*Math.max(0,Math.min(1,xNorm)));
  else if(ih>iw) sy=Math.round((ih-side)*Math.max(0,Math.min(1,yNorm)));
  ctx.save();
  ctx.drawImage(img,sx,sy,side,side,x,y,size,size);
  // Ricolorazione rapidissima: conserva i dettagli della foto ma la porta
  // verso il colore della cella, senza leggere/modificare ogni pixel.
  ctx.globalCompositeOperation='color';
  ctx.globalAlpha=.78;
  ctx.fillStyle=`rgb(${target[0]},${target[1]},${target[2]})`;
  ctx.fillRect(x,y,size,size);
  ctx.globalCompositeOperation='multiply';
  ctx.globalAlpha=.20;
  ctx.fillStyle=`rgb(${Math.max(35,target[0])},${Math.max(35,target[1])},${Math.max(35,target[2])})`;
  ctx.fillRect(x,y,size,size);
  ctx.restore();
}
async function qTile(url:string,target:number[],tileSize:number,xNorm:number=0.5,yNorm:number=0.5){
  const img=await qLoadImg(url); const c=document.createElement('canvas'); c.width=tileSize;c.height=tileSize; const ctx=c.getContext('2d',{willReadFrequently:true}); if(!ctx) return c;
  const iw=img.naturalWidth||img.width, ih=img.naturalHeight||img.height;
  const side=Math.min(iw,ih);
  let sx=0, sy=0;
  if(iw>ih){ sx=Math.round((iw-side)*Math.max(0,Math.min(1,xNorm))); }
  else if(ih>iw){ sy=Math.round((ih-side)*Math.max(0,Math.min(1,yNorm))); }
  sx=Math.max(0,Math.min(iw-side,sx)); sy=Math.max(0,Math.min(ih-side,sy));
  ctx.drawImage(img,sx,sy,side,side,0,0,tileSize,tileSize); const im=ctx.getImageData(0,0,tileSize,tileSize); const d=im.data; let min=1,max=0;
  for(let i=0;i<d.length;i+=4){ const l=qLum([d[i],d[i+1],d[i+2]]); if(l<min)min=l;if(l>max)max=l; }
  const range=Math.max(.08,max-min);
  const light=[qClamp(target[0]+(255-target[0])*.62),qClamp(target[1]+(255-target[1])*.62),qClamp(target[2]+(255-target[2])*.62)];
  const dark=[target[0]*.12,target[1]*.12,target[2]*.12];
  for(let i=0;i<d.length;i+=4){
    let t=(qLum([d[i],d[i+1],d[i+2]])-min)/range; t=Math.max(0,Math.min(1,Math.pow(t,.88)));
    const m=t<.5?qMixRgb(dark,target,t*2):qMixRgb(target,light,(t-.5)*2);
    d[i]=qClamp(m[0]*.988+d[i]*.012); d[i+1]=qClamp(m[1]*.988+d[i+1]*.012); d[i+2]=qClamp(m[2]*.988+d[i+2]*.012);
  }
  ctx.putImageData(im,0,0);
  ctx.fillStyle=`rgb(${target[0]},${target[1]},${target[2]})`;
  ctx.globalAlpha=.10;
  ctx.fillRect(0,0,tileSize,tileSize);
  ctx.globalAlpha=1;
  return c;
}



type PreviewPhoto = { id:string; name:string; created:number; size:number };
type Rgb = [number,number,number];
type Lab = [number,number,number];
type PreviewFeature = { id:string; url:string; avg:Rgb; lab:Lab; lum:number; sat:number; useCount:number };
type PreviewCell = { index:number; color:Rgb; lab:Lab; lum:number; sat:number; importance:number };
type PreviewTileData = { index:number; row:number; col:number; originalUrl:string; renderedUrl:string; targetColor:Rgb; };
type MosaicRenderStyle = 'portraitOverlay' | 'classicTiles';
type MosaicTileDensity = '100' | '75' | '60';

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
    const t = bestCols; bestCols = bestRows; bestRows = t;
  }
  return {cols:bestCols, rows:bestRows};
}

async function previewImageAspect(url:string): Promise<number>{
  const img = await loadImg(url);
  const w = img.naturalWidth || img.width || 1;
  const h = img.naturalHeight || img.height || 1;
  return w / h;
}
function previewAdaptiveSquareCrop(iw:number, ih:number, xNorm:number=0.5, yNorm:number=0.5){
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
  return {side,sx,sy};
}
function previewNeighborPenalty(photoId:string, cellIndex:number, cols:number, rows:number, assigned:Map<number,string>){
  let penalty = 0;
  const x = cellIndex % cols;
  const y = Math.floor(cellIndex / cols);
  for(let dy=-2; dy<=2; dy++){
    for(let dx=-2; dx<=2; dx++){
      if(dx===0 && dy===0) continue;
      const nx=x+dx, ny=y+dy;
      if(nx<0||ny<0||nx>=cols||ny>=rows) continue;
      const idx = ny*cols+nx;
      const pid = assigned.get(idx);
      if(pid===photoId){
        const dist = Math.abs(dx)+Math.abs(dy);
        if(dist<=1) penalty += 90000;
        else if(dist===2) penalty += 24000;
        else penalty += 9000;
      }
    }
  }
  return penalty;
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
async function createPreviewMosaicTile(
  sourceUrl:string,
  targetUrl:string,
  cols:number,
  rows:number,
  col:number,
  row:number,
  renderSize:number=180,
  style:MosaicRenderStyle='portraitOverlay'
): Promise<HTMLCanvasElement>{
  const [sourceImg,targetImg]=await Promise.all([loadImg(sourceUrl),loadImg(targetUrl)]);
  const canvas=document.createElement('canvas');
  canvas.width=renderSize;
  canvas.height=renderSize;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx) return canvas;

  const iw=sourceImg.naturalWidth||sourceImg.width;
  const ih=sourceImg.naturalHeight||sourceImg.height;
  const crop=previewAdaptiveSquareCrop(iw,ih,col/Math.max(1,cols-1),row/Math.max(1,rows-1));
  ctx.drawImage(sourceImg,crop.sx,crop.sy,crop.side,crop.side,0,0,renderSize,renderSize);

  const targetCanvas=document.createElement('canvas');
  targetCanvas.width=renderSize;
  targetCanvas.height=renderSize;
  const tctx=targetCanvas.getContext('2d',{willReadFrequently:true});
  if(!tctx) return canvas;
  const tw=targetImg.naturalWidth||targetImg.width||cols;
  const th=targetImg.naturalHeight||targetImg.height||rows;
  const sx=Math.max(0,Math.floor((col/cols)*tw));
  const sy=Math.max(0,Math.floor((row/rows)*th));
  const ex=Math.min(tw,Math.ceil(((col+1)/cols)*tw));
  const ey=Math.min(th,Math.ceil(((row+1)/rows)*th));
  tctx.drawImage(targetImg,sx,sy,Math.max(1,ex-sx),Math.max(1,ey-sy),0,0,renderSize,renderSize);

  const source=ctx.getImageData(0,0,renderSize,renderSize);
  const target=tctx.getImageData(0,0,renderSize,renderSize);
  const d=source.data, td=target.data;
  let minLum=1,maxLum=0;
  for(let i=0;i<d.length;i+=4){
    const lum=(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2])/255;
    if(lum<minLum) minLum=lum;
    if(lum>maxLum) maxLum=lum;
  }
  const range=Math.max(0.06,maxLum-minLum);

  const mode = style === 'classicTiles' ? {
    wTargetBase:0.28, wTargetEdge:0.05, wSoft:0.10, wPhotoLum:0.22, keepOriginal:0.56,
    textureSoft:0.06, textureMultiply:0.02, overlaySoft:0.04, overlayColor:0.05, overlaySource:0.015
  } : {
    wTargetBase:0.42, wTargetEdge:0.06, wSoft:0.16, wPhotoLum:0.17, keepOriginal:0.36,
    textureSoft:0.09, textureMultiply:0.03, overlaySoft:0.10, overlayColor:0.14, overlaySource:0.07
  };

  for(let i=0;i<d.length;i+=4){
    const srcLum=(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2])/255;
    const A=clamp01((srcLum-minLum)/range);
    const sr=d[i], sg=d[i+1], sb=d[i+2];
    const tr=td[i],tg=td[i+1],tb=td[i+2];
    const targetLum=(0.2126*tr+0.7152*tg+0.0722*tb)/255;
    const midMask=clamp01(4*targetLum*(1-targetLum));
    const blend=(tc:number, sc:number)=>{
      const B=tc/255;
      const soft=(1-2*B)*(A*A)+2*B*A;
      const wTarget=mode.wTargetBase+(1-midMask)*mode.wTargetEdge;
      const wSoft=mode.wSoft+midMask*0.03;
      const wPhotoLum=mode.wPhotoLum+midMask*0.06;
      const fused=clamp01(B*wTarget+soft*wSoft+A*wPhotoLum);
      const keepOriginal=mode.keepOriginal;
      return clamp(Math.round((fused*(1-keepOriginal)+(sc/255)*keepOriginal)*255));
    };
    d[i]=blend(tr,sr); d[i+1]=blend(tg,sg); d[i+2]=blend(tb,sb); d[i+3]=255;
  }
  ctx.putImageData(source,0,0);

  const textureCanvas=document.createElement('canvas');
  textureCanvas.width=renderSize;
  textureCanvas.height=renderSize;
  const tx=textureCanvas.getContext('2d',{willReadFrequently:true});
  if(tx){
    tx.drawImage(sourceImg,crop.sx,crop.sy,crop.side,crop.side,0,0,renderSize,renderSize);
    const ximg=tx.getImageData(0,0,renderSize,renderSize);
    const xd=ximg.data;
    for(let i=0;i<xd.length;i+=4){
      const lum=(0.2126*xd[i]+0.7152*xd[i+1]+0.0722*xd[i+2])/255;
      const gray=clamp(Math.round(lum*255));
      xd[i]=gray; xd[i+1]=gray; xd[i+2]=gray; xd[i+3]=style === 'classicTiles' ? 42 : 48;
    }
    tx.putImageData(ximg,0,0);
    ctx.globalCompositeOperation='soft-light';
    ctx.globalAlpha=mode.textureSoft;
    ctx.drawImage(textureCanvas,0,0,renderSize,renderSize);
    ctx.globalCompositeOperation='multiply';
    ctx.globalAlpha=mode.textureMultiply;
    ctx.drawImage(textureCanvas,0,0,renderSize,renderSize);
  }
  ctx.globalCompositeOperation='soft-light';
  ctx.globalAlpha=mode.overlaySoft;
  ctx.drawImage(targetCanvas,0,0,renderSize,renderSize);
  ctx.globalCompositeOperation='color';
  ctx.globalAlpha=mode.overlayColor;
  ctx.drawImage(targetCanvas,0,0,renderSize,renderSize);
  ctx.globalCompositeOperation='source-over';
  ctx.globalAlpha=mode.overlaySource;
  ctx.drawImage(targetCanvas,0,0,renderSize,renderSize);
  if(style === 'portraitOverlay'){
    ctx.globalCompositeOperation='overlay';
    ctx.globalAlpha=0.08;
    ctx.drawImage(targetCanvas,0,0,renderSize,renderSize);
  }
  ctx.globalAlpha=1;
  return canvas;
}


async function createTargetDominantPreviewTile(sourceUrl:string, targetUrl:string, cols:number, rows:number, col:number, row:number, size:number=240): Promise<{tileUrl:string; targetPatchUrl:string}>{
  const [sourceImg, targetImg] = await Promise.all([loadImg(sourceUrl), loadImg(targetUrl)]);

  const patchCanvas=document.createElement('canvas');
  patchCanvas.width=size; patchCanvas.height=size;
  const pctx=patchCanvas.getContext('2d', { willReadFrequently:true });
  if(!pctx) return { tileUrl: sourceUrl, targetPatchUrl: targetUrl };

  const tw = targetImg.naturalWidth || targetImg.width || cols;
  const th = targetImg.naturalHeight || targetImg.height || rows;
  const sx = Math.max(0, Math.floor((col / cols) * tw));
  const sy = Math.max(0, Math.floor((row / rows) * th));
  const ex = Math.min(tw, Math.ceil(((col + 1) / cols) * tw));
  const ey = Math.min(th, Math.ceil(((row + 1) / rows) * th));
  const sw = Math.max(1, ex - sx);
  const sh = Math.max(1, ey - sy);
  pctx.drawImage(targetImg, sx, sy, sw, sh, 0, 0, size, size);
  const targetPatchUrl = patchCanvas.toDataURL('image/jpeg', 0.94);

  const outCanvas=document.createElement('canvas');
  outCanvas.width=size; outCanvas.height=size;
  const octx=outCanvas.getContext('2d', { willReadFrequently:true });
  if(!octx) return { tileUrl: targetPatchUrl, targetPatchUrl };
  octx.drawImage(patchCanvas,0,0,size,size);

  const srcCanvas=document.createElement('canvas');
  srcCanvas.width=size; srcCanvas.height=size;
  const sctx=srcCanvas.getContext('2d', { willReadFrequently:true });
  if(!sctx) return { tileUrl: targetPatchUrl, targetPatchUrl };
  const iw=sourceImg.naturalWidth || sourceImg.width, ih=sourceImg.naturalHeight || sourceImg.height;
  const crop = previewAdaptiveSquareCrop(iw, ih, col / Math.max(1, cols-1), row / Math.max(1, rows-1));
  sctx.drawImage(sourceImg, crop.sx, crop.sy, crop.side, crop.side, 0, 0, size, size);

  const srcImage=sctx.getImageData(0,0,size,size);
  const d=srcImage.data;
  let minLum=1, maxLum=0;
  for(let i=0;i<d.length;i+=4){
    const lum=(0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2]) / 255;
    if(lum<minLum) minLum=lum;
    if(lum>maxLum) maxLum=lum;
  }
  const range=Math.max(0.08, maxLum-minLum);
  for(let i=0;i<d.length;i+=4){
    const lum=(0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2]) / 255;
    const gray=clamp(Math.round(255 * Math.pow(clamp01((lum-minLum)/range), 0.95)));
    d[i]=gray; d[i+1]=gray; d[i+2]=gray;
    d[i+3]=56;
  }
  sctx.putImageData(srcImage,0,0);

  octx.globalCompositeOperation='soft-light';
  octx.globalAlpha=0.11;
  octx.drawImage(srcCanvas,0,0,size,size);
  octx.globalCompositeOperation='multiply';
  octx.globalAlpha=0.04;
  octx.drawImage(srcCanvas,0,0,size,size);
  octx.globalCompositeOperation='color';
  octx.globalAlpha=0.06;
  octx.drawImage(patchCanvas,0,0,size,size);
  octx.globalCompositeOperation='source-over';
  octx.globalAlpha=0.03;
  octx.drawImage(patchCanvas,0,0,size,size);
  octx.globalAlpha=1;

  return { tileUrl: outCanvas.toDataURL('image/jpeg', 0.94), targetPatchUrl };
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
  const targetFileInputRef = useRef<HTMLInputElement|null>(null);
  const targetCropDragRef = useRef<{startX:number;startY:number;originX:number;originY:number} | null>(null);
  const targetCropStateRef = useRef<CropState|null>(null);

  const [targetBase64,setTargetBase64]=useState('');
  const [targetPreview,setTargetPreview]=useState('');
  const [targetInfo,setTargetInfo]=useState('');
  const [targetCropOpen,setTargetCropOpen]=useState(false);
  const [targetCropBusy,setTargetCropBusy]=useState(false);
  const [targetCropState,setTargetCropState]=useState<CropState|null>(null);
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
  const [previewFastUrl,setPreviewFastUrl]=useState('');
  const [previewText,setPreviewText]=useState('');
  const [previewRunning,setPreviewRunning]=useState(false);
  const [previewBusy,setPreviewBusy]=useState(false);
  const [previewProgress,setPreviewProgress]=useState('');
  const [previewUrl,setPreviewUrl]=useState('');
  const [previewFastTiles,setPreviewFastTiles]=useState<PreviewTileData[]>([]);
  const [previewFastMeta,setPreviewFastMeta]=useState<{cols:number;rows:number;cellSize:number}|null>(null);
  const [previewFullTiles,setPreviewFullTiles]=useState<PreviewTileData[]>([]);
  const [previewFullMeta,setPreviewFullMeta]=useState<{cols:number;rows:number;cellSize:number}|null>(null);
  const [interactivePreview,setInteractivePreview]=useState<{title:string; tiles:PreviewTileData[]; cols:number; rows:number; cellSize:number}|null>(null);
  const [interactivePreviewZoom,setInteractivePreviewZoom]=useState(2);
  const [selectedPreviewTile,setSelectedPreviewTile]=useState<PreviewTileData|null>(null);
  const [selectedPreviewDetailUrl,setSelectedPreviewDetailUrl]=useState('');
  const [selectedPreviewTargetPatchUrl,setSelectedPreviewTargetPatchUrl]=useState('');
  const [selectedPreviewLoading,setSelectedPreviewLoading]=useState(false);
  const [mosaicStyle,setMosaicStyle]=useState<MosaicRenderStyle>('portraitOverlay');
  const [mosaicTileDensity,setMosaicTileDensity]=useState<MosaicTileDensity>('100');

  useEffect(()=>{ targetCropStateRef.current = targetCropState; }, [targetCropState]);
  useEffect(()=>{
    if(typeof window==='undefined') return;
    const saved = window.localStorage.getItem('fm_mosaic_style');
    if(saved === 'portraitOverlay' || saved === 'classicTiles') setMosaicStyle(saved);
    const savedDensity = window.localStorage.getItem('fm_mosaic_tile_density');
    if(savedDensity === '100' || savedDensity === '75' || savedDensity === '60') setMosaicTileDensity(savedDensity);
  }, []);
  useEffect(()=>{
    if(typeof window==='undefined') return;
    window.localStorage.setItem('fm_mosaic_style', mosaicStyle);
  }, [mosaicStyle]);
  useEffect(()=>{
    if(typeof window==='undefined') return;
    window.localStorage.setItem('fm_mosaic_tile_density', mosaicTileDensity);
  }, [mosaicTileDensity]);

  useEffect(()=>{
    const onEscape=(e:KeyboardEvent)=>{
      if(e.key!=='Escape') return;
      if(selectedPreviewTile){
        setSelectedPreviewTile(null);
        setSelectedPreviewDetailUrl('');
        setSelectedPreviewTargetPatchUrl('');
        return;
      }
      if(interactivePreview) closeInteractivePreview();
    };
    window.addEventListener('keydown',onEscape);
    return ()=>window.removeEventListener('keydown',onEscape);
  },[interactivePreview,selectedPreviewTile]);

  useEffect(()=>{
    const p=sessionStorage.getItem('fm_admin_password');
    if(p){setPassword(p); setLogged(true); load(p);}
    const clearAdmin = () => { sessionStorage.removeItem('fm_admin_password'); };
    const onPointerMove = (e: PointerEvent) => {
      if(!targetCropDragRef.current || !targetCropStateRef.current) return;
      const current = targetCropStateRef.current;
      const nextX = targetCropDragRef.current.originX + (e.clientX - targetCropDragRef.current.startX);
      const nextY = targetCropDragRef.current.originY + (e.clientY - targetCropDragRef.current.startY);
      const clamped = clampTargetCropPosition(nextX, nextY, current, current.zoom);
      setTargetCropState({...current, x:clamped.x, y:clamped.y});
    };
    const onPointerUp = () => { targetCropDragRef.current = null; };
    window.addEventListener('pagehide', clearAdmin);
    window.addEventListener('beforeunload', clearAdmin);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pagehide', clearAdmin);
      window.removeEventListener('beforeunload', clearAdmin);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
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

  async function setTotal(n:number){ setBusyText('Aggiorno numero foto...'); setData((prev:any)=>prev ? {...prev, totalTiles:n, missing:Math.max(0, n - Number(prev.receivedCount||0))} : prev); try{await adminAction('setTotal',{totalTiles:n});showAdminMsg(`Obiettivo impostato a ${n} foto/tessere.`);}catch{} }
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

  async function openTargetCropper(file: File){
    const src = await readFileAsDataUrl(file);
    const img = await loadImageFromSrc(src);
    const { frameW, frameH } = targetCropFrame(img.naturalWidth, img.naturalHeight);
    const baseScale = Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight);
    const scaledW = img.naturalWidth * baseScale;
    const scaledH = img.naturalHeight * baseScale;
    setTargetCropState({
      src,
      width:img.naturalWidth,
      height:img.naturalHeight,
      baseScale,
      zoom:1,
      x:(frameW - scaledW) / 2,
      y:(frameH - scaledH) / 2,
      frameW,
      frameH,
    });
    setTargetCropOpen(true);
  }
  async function onTargetChange(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]; setTargetBase64(''); setTargetPreview(''); setTargetInfo(''); setErr('');
    if(!file) return;
    try{
      await openTargetCropper(file);
    }catch(e:any){
      setErr(e?.message||'Errore preparazione foto finale');
    }
  }
  function onTargetCropPointerDown(e:React.PointerEvent<HTMLDivElement>){
    if(!targetCropState) return;
    e.preventDefault();
    targetCropDragRef.current = {
      startX:e.clientX,
      startY:e.clientY,
      originX:targetCropState.x,
      originY:targetCropState.y,
    };
  }
  function onTargetCropZoomChange(nextZoom:number){
    if(!targetCropState) return;
    const oldScale = targetCropState.baseScale * targetCropState.zoom;
    const newScale = targetCropState.baseScale * nextZoom;
    const centerSourceX = (targetCropState.frameW / 2 - targetCropState.x) / oldScale;
    const centerSourceY = (targetCropState.frameH / 2 - targetCropState.y) / oldScale;
    const nextX = targetCropState.frameW / 2 - centerSourceX * newScale;
    const nextY = targetCropState.frameH / 2 - centerSourceY * newScale;
    const clamped = clampTargetCropPosition(nextX, nextY, targetCropState, nextZoom);
    setTargetCropState({...targetCropState, zoom:nextZoom, x:clamped.x, y:clamped.y});
  }
  function resetTargetCrop(){
    if(!targetCropState) return;
    const scaledW = targetCropState.width * targetCropState.baseScale;
    const scaledH = targetCropState.height * targetCropState.baseScale;
    setTargetCropState({
      ...targetCropState,
      zoom:1,
      x:(targetCropState.frameW - scaledW) / 2,
      y:(targetCropState.frameH - scaledH) / 2,
    });
  }
  async function confirmTargetCrop(){
    if(!targetCropState) return;
    try{
      setTargetCropBusy(true);
      const prepared = await renderOptimizedTargetImage(targetCropState);
      setTargetBase64(prepared.base64);
      setTargetPreview(prepared.previewUrl);
      setTargetInfo(`Area scelta e ottimizzata per il mosaico: ${prepared.width}×${prepared.height}, circa ${prepared.sizeKb} KB.`);
      setTargetCropOpen(false);
    }catch(e:any){
      setErr(e?.message||'Errore adattamento foto finale');
    }finally{
      setTargetCropBusy(false);
    }
  }
  function reopenTargetCrop(){
    if(targetCropState) setTargetCropOpen(true);
    else targetFileInputRef.current?.click();
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

  function openInteractivePreview(kind:'fast'|'full'){
    const tiles = kind==='fast' ? previewFastTiles : previewFullTiles;
    const meta = kind==='fast' ? previewFastMeta : previewFullMeta;
    if(!tiles.length || !meta) return;
    setSelectedPreviewTile(null);
    setInteractivePreview({
      title: kind==='fast' ? 'Anteprima rapida interattiva' : 'Anteprima qualità completa interattiva',
      tiles,
      cols: meta.cols,
      rows: meta.rows,
      cellSize: meta.cellSize
    });
    setInteractivePreviewZoom(kind==='fast' ? 2.2 : 1.8);
  }
  function closeInteractivePreview(){
    setSelectedPreviewTile(null);
    setSelectedPreviewDetailUrl('');
    setSelectedPreviewTargetPatchUrl('');
    setInteractivePreview(null);
  }
  async function openPreviewTileDetail(tile:PreviewTileData){
    if(!interactivePreview || !data?.targetFileId) return;
    const targetUrlNow = `/api/image?id=${data.targetFileId}&v=${data?.target?.updated || Date.now()}`;
    setSelectedPreviewTile(tile);
    setSelectedPreviewDetailUrl('');
    setSelectedPreviewTargetPatchUrl('');
    setSelectedPreviewLoading(true);
    try{
      const detail = await createTargetDominantPreviewTile(tile.originalUrl, targetUrlNow, interactivePreview.cols, interactivePreview.rows, tile.col, tile.row, 260);
      setSelectedPreviewDetailUrl(detail.tileUrl);
      setSelectedPreviewTargetPatchUrl(detail.targetPatchUrl);
    }catch(e){
      setSelectedPreviewDetailUrl(tile.renderedUrl);
      setSelectedPreviewTargetPatchUrl('');
    }finally{
      setSelectedPreviewLoading(false);
    }
  }

  async function buildQuickPreview(){
    setErr('');
    setPreviewRunning(true);
    setPreviewFastUrl('');
    setPreviewFastTiles([]);
    setPreviewFastMeta(null);
    setPreviewText('Preparo anteprima istantanea...');
    try{
      if(!data?.targetFileId) throw new Error('Carica prima la foto finale.');
      const photos=(data?.photos||[]).slice();
      if(!photos.length) throw new Error('Carica prima alcune foto invitati o usa Upload test.');
      const configuredTotal=Number(data?.totalTiles||600);
      const total=effectiveTileTotal(configuredTotal, mosaicTileDensity);
      const targetUrlLocal=`/api/image?id=${data.targetFileId}&v=${data?.target?.updated||Date.now()}`;
      const aspect=await qImageAspect(targetUrlLocal);
      const quickTotal = total <= 600 ? Math.max(240, Math.round(total * 0.72)) : total <= 1200 ? Math.max(420, Math.round(total * 0.64)) : Math.max(620, Math.round(total * 0.56));
      const {cols,rows}=qGrid(quickTotal,aspect);
      const tileSize = quickTotal >= 1800 ? 14 : quickTotal >= 1000 ? 15 : 16;
      setPreviewFastMeta({cols,rows,cellSize:tileSize});
      const previewTiles:PreviewTileData[]=[];
      const canvas=document.createElement('canvas');
      canvas.width=cols*tileSize;
      canvas.height=rows*tileSize;
      const ctx=canvas.getContext('2d');
      if(!ctx) throw new Error('Canvas non disponibile.');
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);

      const targetColors=await qTargetColors(targetUrlLocal,cols,rows);
      const maxPhotos=Math.min(photos.length,320);
      setPreviewText(`Carico miniature 0 / ${maxPhotos}...`);

      // Caricamento concorrente e una sola decodifica per foto. In precedenza
      // ogni tessera ricaricava la stessa immagine, causando il blocco 60/217.
      const jobs=photos.slice(0,maxPhotos).map(async(p:any,index:number)=>{
        const url=`/api/image?id=${p.id}`;
        try{
          const [img,avg]=await Promise.all([qLoadImg(url),qAvgPhoto(url)]);
          if(index%20===0) setPreviewText(`Carico miniature ${Math.min(index+20,maxPhotos)} / ${maxPhotos}...`);
          return {id:p.id,url,img,avg,use:0};
        }catch{return null;}
      });
      const loaded=await Promise.all(jobs);
      const features=loaded.filter(Boolean) as Array<{id:string;url:string;img:HTMLImageElement;avg:number[];use:number}>;
      if(!features.length) throw new Error('Non riesco ad analizzare le foto.');

      const assigned=new Map<number,string>();
      setPreviewText(`Compongo ${cols*rows} tessere leggere...`);
      for(let i=0;i<targetColors.length;i++){
        const target=targetColors[i];
        const x=i%cols, y=Math.floor(i/cols);
        let best=features[0], bestScore=Number.POSITIVE_INFINITY;
        for(const f of features){
          let score=qDist(f.avg,target)+f.use*f.use*80;
          const left=assigned.get(i-1), up=assigned.get(i-cols);
          const left2=assigned.get(i-2), up2=assigned.get(i-cols*2);
          if(left===f.id) score+=28000;
          if(up===f.id) score+=28000;
          if(left2===f.id) score+=9000;
          if(up2===f.id) score+=9000;
          if(score<bestScore){bestScore=score;best=f;}
        }
        best.use++;
        assigned.set(i,best.id);
        const tileCanvas=await createPreviewMosaicTile(best.url,targetUrlLocal,cols,rows,x,y,180,mosaicStyle);
        ctx.drawImage(tileCanvas,x*tileSize,y*tileSize,tileSize,tileSize);
        previewTiles.push({
          index:i,
          row:y,
          col:x,
          originalUrl:best.url,
          renderedUrl:tileCanvas.toDataURL('image/jpeg',0.94),
          targetColor:[target[0],target[1],target[2]] as Rgb
        });
        if(i>0 && i%120===0){
          setPreviewFastUrl(canvas.toDataURL('image/jpeg',.80));
          await new Promise(r=>setTimeout(r,0));
        }
      }

      await applyFinalOverlay(canvas, targetUrlLocal, mosaicStyle);
      setPreviewFastTiles(previewTiles);
      setPreviewFastUrl(canvas.toDataURL('image/jpeg',.90));
      setPreviewText(`Anteprima rapida pronta: ${cols}×${rows} (${cols*rows} tessere simulate). Composizione attiva: ${total} tessere effettive su ${configuredTotal} impostate. Puoi aprirla a schermo intero e cliccare ogni tessera.`);
      showAdminMsg('Anteprima rapida pronta.');
    }catch(e:any){
      setErr(e?.message||'Errore anteprima rapida');
    }finally{
      setPreviewRunning(false);
    }
  }

  async function buildAdminPreview(){
    setErr('');
    setPreviewBusy(true);
    setPreviewUrl('');
    setPreviewFullTiles([]);
    setPreviewFullMeta(null);
    setPreviewProgress('Preparo anteprima...');
    try{
      if(!data?.targetFileId) throw new Error('Carica prima la foto finale da riprodurre.');
      const photos:PreviewPhoto[] = (data?.photos || []).slice();
      if(!photos.length) throw new Error('Non ci sono ancora foto invitati caricate.');
      const configuredTotal = Number(data?.totalTiles || 600);
      const total = effectiveTileTotal(configuredTotal, mosaicTileDensity);
      const cellSize = total >= 2500 ? 10 : total >= 1500 ? 11 : total >= 1000 ? 12 : 14;

      const targetUrlLocal = `/api/image?id=${data.targetFileId}&v=${data?.target?.updated || Date.now()}`;
      const aspect = await previewImageAspect(targetUrlLocal);
      const {cols,rows} = gridForTotal(total, aspect);
      setPreviewFullMeta({cols,rows,cellSize});
      const previewTiles:PreviewTileData[]=[];
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
      const assigned = new Map<number,string>();
      setPreviewProgress(features.length < total ? `Foto insufficienti per il totale richiesto: per il test riuso automaticamente le ${features.length} foto disponibili.` : 'Creo anteprima...');

      for(let i=0;i<sortedCells.length;i++){
        const cell = sortedCells[i];
        let best:PreviewFeature|null=null;
        let bestScore=Number.POSITIVE_INFINITY;

        for(const f of features){
          const score = previewPhotoCellScore(f, cell, maxReuse) + previewNeighborPenalty(f.id, cell.index, cols, rows, assigned);
          if(score < bestScore){
            bestScore = score;
            best = f;
          }
        }
        if(!best) continue;

        best.useCount += 1;
        const xNorm = cols <= 1 ? 0.5 : (cell.index % cols) / (cols - 1);
        const yNorm = rows <= 1 ? 0.5 : Math.floor(cell.index / cols) / (rows - 1);
        const tileCanvas = await createPreviewMosaicTile(best.url, targetUrlLocal, cols, rows, cell.index % cols, Math.floor(cell.index / cols), 220, mosaicStyle);
        const x = (cell.index % cols) * cellSize;
        const y = Math.floor(cell.index / cols) * cellSize;
        ctx.drawImage(tileCanvas, x, y, cellSize, cellSize);
        previewTiles.push({
          index:cell.index,
          row:Math.floor(cell.index / cols),
          col:cell.index % cols,
          originalUrl:best.url,
          renderedUrl:tileCanvas.toDataURL('image/jpeg', 0.92),
          targetColor:cell.color
        });
        used.add(cell.index);
        assigned.set(cell.index, best.id);

        if((i+1)%24===0 || i===sortedCells.length-1){
          setPreviewProgress(`Creo anteprima ${i+1} / ${sortedCells.length} tessere...`);
          setPreviewUrl(canvas.toDataURL('image/jpeg', 0.86));
          await new Promise(r=>setTimeout(r,0));
        }
      }

      await applyFinalOverlay(canvas, targetUrlLocal, mosaicStyle);
      setPreviewFullTiles(previewTiles);
      setPreviewUrl(canvas.toDataURL('image/jpeg', 0.92));
      setPreviewProgress(`Anteprima pronta: ${used.size} tessere renderizzate. Composizione attiva: ${total} tessere effettive su ${configuredTotal} impostate.`);
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
        <h1 style={{textAlign:'center'}}>Accesso Admin</h1>
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

        <div className="spacer"/><h2>Stile di composizione del mosaico</h2>
        <p>Scegli tra i due modi di resa. <b>Ritratto morbido</b> è il più simile all'esempio della donna, con tessere visibili ma più integrate. <b>Tessere evidenti</b> mette più in risalto le singole foto.</p>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:14}}>
          <button type="button" onClick={()=>setMosaicStyle('portraitOverlay')} style={{textAlign:'left', padding:'16px 18px', borderRadius:18, border:mosaicStyle==='portraitOverlay'?'2px solid #7d0f22':'1px solid rgba(0,0,0,.12)', background:mosaicStyle==='portraitOverlay'?'#fff3f4':'#fff', cursor:'pointer'}}>
            <div style={{fontWeight:800, fontSize:18, marginBottom:6}}>Ritratto morbido</div>
            <div className="small">Più vicino all'esempio della donna: immagine finale molto leggibile, ma con foto tessere ancora visibili dentro.</div>
          </button>
          <button type="button" onClick={()=>setMosaicStyle('classicTiles')} style={{textAlign:'left', padding:'16px 18px', borderRadius:18, border:mosaicStyle==='classicTiles'?'2px solid #7d0f22':'1px solid rgba(0,0,0,.12)', background:mosaicStyle==='classicTiles'?'#fff3f4':'#fff', cursor:'pointer'}}>
            <div style={{fontWeight:800, fontSize:18, marginBottom:6}}>Tessere evidenti</div>
            <div className="small">Stile più a mosaico classico: si notano di più le singole foto e la griglia resta più evidente.</div>
          </button>
        </div>
        <div className="spacer"/><h2>Quantità tessere in composizione</h2>
        <p>Se vuoi vedere meglio le singole foto, puoi usare una composizione con meno tessere visive. L'immagine finale resta più leggibile grazie alla sovrapposizione finale.</p>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:14}}>
          <button type="button" onClick={()=>setMosaicTileDensity('100')} style={{textAlign:'left', padding:'16px 18px', borderRadius:18, border:mosaicTileDensity==='100'?'2px solid #7d0f22':'1px solid rgba(0,0,0,.12)', background:mosaicTileDensity==='100'?'#fff3f4':'#fff', cursor:'pointer'}}>
            <div style={{fontWeight:800, fontSize:18, marginBottom:6}}>Normale</div>
            <div className="small">Usa tutte le tessere impostate.</div>
          </button>
          <button type="button" onClick={()=>setMosaicTileDensity('75')} style={{textAlign:'left', padding:'16px 18px', borderRadius:18, border:mosaicTileDensity==='75'?'2px solid #7d0f22':'1px solid rgba(0,0,0,.12)', background:mosaicTileDensity==='75'?'#fff3f4':'#fff', cursor:'pointer'}}>
            <div style={{fontWeight:800, fontSize:18, marginBottom:6}}>Meno tessere</div>
            <div className="small">Usa circa il 75% delle tessere: foto un po' più grandi.</div>
          </button>
          <button type="button" onClick={()=>setMosaicTileDensity('60')} style={{textAlign:'left', padding:'16px 18px', borderRadius:18, border:mosaicTileDensity==='60'?'2px solid #7d0f22':'1px solid rgba(0,0,0,.12)', background:mosaicTileDensity==='60'?'#fff3f4':'#fff', cursor:'pointer'}}>
            <div style={{fontWeight:800, fontSize:18, marginBottom:6}}>Molte meno tessere</div>
            <div className="small">Usa circa il 60% delle tessere: foto più grandi e più leggibili.</div>
          </button>
        </div>
        <div className="small" style={{marginTop:8}}>Attualmente: <b>{effectiveTileTotal(Number(data?.totalTiles || 600), mosaicTileDensity)}</b> tessere effettive su <b>{Number(data?.totalTiles || 600)}</b> impostate.</div>
        <div className="spacer"/><h2>Anteprima risultato finale del mosaico</h2>
        <p>Da qui puoi vedere prima il risultato finale del tuo fotomosaico. L’anteprima usa lo stile e la quantità di tessere selezionati qui sopra. Quando clicchi una tessera, si apre la <b>foto originale</b> che compone quella cella.</p>
        <div className="gridBtns">
          <button className="btn" disabled={previewRunning || previewBusy || busy || !data?.hasTarget || !data?.receivedCount} onClick={buildQuickPreview}>{previewRunning ? 'Creo anteprima rapida...' : 'Anteprima rapida'}</button>
          <button className="btn secondary" disabled={previewRunning || previewBusy || busy || !data?.hasTarget || !data?.receivedCount} onClick={buildAdminPreview}>{previewBusy ? 'Creo qualità completa...' : 'Anteprima qualità completa'}</button>
          <Link className="btn secondary" href="/screen" onClick={()=>sessionStorage.removeItem('fm_admin_password')}>Apri schermo mosaico</Link>
        </div>
        <p style={{marginTop:10}}><b>Anteprima rapida:</b> usa poche tessere simulate e miniature già caricate, quindi non esegue il pesante processo finale. <b>Qualità completa:</b> serve solo per un controllo approfondito.</p>
        {(previewRunning || previewText) && <div className="ok" style={{display:'block', marginTop:12}}>{previewText}</div>}
        {previewFastUrl && <div className="mosaicPreviewWrap">
          <div className="mosaicPreviewCard">
            <b>Anteprima rapida</b>
            <img src={previewFastUrl} alt="Anteprima rapida fotomosaico" style={{cursor:'zoom-in'}} onClick={()=>openInteractivePreview('fast')} />
            <div className="spacer"/>
            <button className="btn secondary" type="button" onClick={()=>openInteractivePreview('fast')} disabled={!previewFastTiles.length}>Apri a schermo intero e clicca le tessere</button>
          </div>
          <div className="mosaicPreviewCard">
            <b>Immagine finale di riferimento</b>
            {targetUrl ? <img src={targetUrl} alt="Immagine finale" /> : <p>Non caricata</p>}
          </div>
        </div>}
        {(previewBusy || previewProgress) && <div className="ok" style={{display:'block', marginTop:12}}>{previewBusy ? previewProgress || 'Creo anteprima...' : previewProgress}</div>}
        {previewUrl && <div className="mosaicPreviewWrap">
          <div className="mosaicPreviewCard">
            <b>Anteprima fotomosaico</b>
            <img src={previewUrl} alt="Anteprima mosaico" style={{cursor:'zoom-in'}} onClick={()=>openInteractivePreview('full')} />
            <div className="spacer"/>
            <button className="btn secondary" type="button" onClick={()=>openInteractivePreview('full')} disabled={!previewFullTiles.length}>Apri a schermo intero e clicca le tessere</button>
          </div>
          <div className="mosaicPreviewCard">
            <b>Immagine finale di riferimento</b>
            {targetUrl ? <img src={targetUrl} alt="Immagine finale" /> : <p>Non caricata</p>}
          </div>
        </div>}

        <div className="spacer"/><h2>Anteprima veloce fotomosaico</h2>
        <p>Per verificare rapidamente il risultato, apri lo schermo mosaico dopo aver caricato alcune foto test. Il motore ora usa campionamento area, gamma correction e LAB/CIEDE2000.</p>
        <div className="gridBtns">
          <Link className="btn secondary" href="/screen" onClick={()=>sessionStorage.removeItem('fm_admin_password')}>Apri anteprima / schermo mosaico</Link>
          <Link className="btn secondary" href="/test-upload">Carica foto test</Link>
        </div>

        <h2>1. Numero foto</h2>
        <div className="gridBtns">{options.map(n=><button className="btn" disabled={busy} key={n} onClick={()=>setTotal(n)}>{n} foto</button>)}</div>
        <div className="spacer"/><h2>2. Foto finale da riprodurre</h2>
        <p>Prima scegli il <b>campo da riprodurre</b>: centra bene i soggetti, togli più sfondo inutile possibile e poi il sistema adatta automaticamente l’immagine per il mosaico con contrasto, saturazione e nitidezza migliorati. Salvata come <b>__TARGET_MOSAICO.jpg</b>.</p>
        <input ref={targetFileInputRef} className="field" type="file" accept="image/*" onClick={(e)=>{(e.currentTarget as HTMLInputElement).value='';}} onChange={onTargetChange}/>
        <div className="gridBtns" style={{marginTop:10}}>
          <button className="btn secondary" type="button" onClick={()=>targetFileInputRef.current?.click()}>Scegli foto / cambia foto</button>
          <button className="btn secondary" type="button" disabled={!targetCropState} onClick={reopenTargetCrop}>Scegli campo da riprodurre</button>
        </div>
        {targetPreview&&<img className="preview" src={targetPreview} alt="Foto finale ottimizzata" style={{display:'block'}}/>}
        {targetInfo&&<div className="ok">{targetInfo}</div>}
        <div className="small" style={{marginTop:8}}>Suggerimento: per i ritratti viene molto meglio se i volti occupano gran parte dell’immagine. Meno sfondo = più tessere usate sui dettagli importanti.</div>
        <div className="spacer"/><button className="btn" disabled={busy||!targetBase64} onClick={uploadTarget}>Carica foto finale adattata</button>
        <div className="spacer"/><button className="btn danger" disabled={busy||!data?.hasTarget} onClick={clearTarget}>Cancella foto finale</button>

        <div className="spacer"/><h2>3. Sfondo home/upload</h2>
        <p>Salvato come <b>__UPLOAD_BACKGROUND.jpg</b> in dimensione originale.</p>
        <input className="field" type="file" accept="image/*" onChange={onBgChange}/>
        {bgPreview&&<img className="preview" src={bgPreview} alt="Sfondo" style={{display:'block'}}/>}
        {bgInfo&&<div className="ok">{bgInfo}</div>}
        <div className="spacer"/><button className="btn" disabled={busy||!bgBase64} onClick={uploadBackground}>Aggiorna sfondo</button>
        <div className="spacer"/><button className="btn danger" disabled={busy||!data?.hasUploadBackground} onClick={clearBackground}>Cancella sfondo</button>
        <div className="spacer"/><h2>4. Test e schermo</h2>
        <Link className="btn secondary" href="/test-upload">Upload multiplo per test</Link>
        <div className="spacer"/><Link className="btn secondary" href="/screen">Apri schermo mosaico</Link>
        <div className="spacer"/><button className="btn secondary" onClick={()=>load()}>Aggiorna stato</button>
        <div className="spacer"/><button className="btn danger" disabled={busy} onClick={clearGuestPhotos}>Reset mosaico: cancella solo foto invitati</button>
        <div className="spacer"/><h2>5. Cambia password Admin</h2>
        <input className="field" type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="Nuova password admin" onKeyDown={(e)=>{if(e.key==='Enter' && newPassword.length>=6) changePassword();}}/>
        <div className="spacer"/><button className="btn" disabled={busy||newPassword.length<6} onClick={changePassword}>Aggiorna password</button>

        {interactivePreview && (
          <div style={{position:'fixed', inset:0, zIndex:80, background:'#000', display:'flex', flexDirection:'column'}}>
            <div style={{display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderBottom:'1px solid rgba(255,255,255,.12)', color:'#fff', flexWrap:'wrap'}}>
              <div style={{fontWeight:800, fontSize:20}}>{interactivePreview.title}</div>
              <div style={{fontSize:13, opacity:.88}}>Griglia {interactivePreview.cols}×{interactivePreview.rows} — clicca una tessera per vedere il dettaglio.</div>
              <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
                <label style={{fontSize:13}}>Zoom {interactivePreviewZoom.toFixed(1)}×</label>
                <input type='range' min='1' max='5' step='0.1' value={interactivePreviewZoom} onChange={e=>setInteractivePreviewZoom(Number(e.target.value))} />
                <button className='btn secondary' type='button' onClick={()=>setInteractivePreviewZoom(v=>Math.max(1, Math.round((v-0.2)*10)/10))}>-</button>
                <button className='btn secondary' type='button' onClick={()=>setInteractivePreviewZoom(v=>Math.min(5, Math.round((v+0.2)*10)/10))}>+</button>
                <button className='btn danger' type='button' onClick={closeInteractivePreview}>Chiudi</button>
              </div>
            </div>
            <div style={{flex:1, overflow:'auto', padding:16}}>
              <div style={{width:'fit-content', margin:'0 auto', background:'#111', padding:10, borderRadius:16, boxShadow:'0 20px 60px rgba(0,0,0,.35)'}}>
                <div style={{display:'grid', gridTemplateColumns:`repeat(${interactivePreview.cols}, ${Math.max(10, Math.round(interactivePreview.cellSize * interactivePreviewZoom))}px)`, gap:1, background:'#0a0a0a'}}>
                  {interactivePreview.tiles.sort((a,b)=>a.index-b.index).map(tile => (
                    <button key={tile.index} type='button' onClick={()=>{ setSelectedPreviewTile(tile); setSelectedPreviewDetailUrl(tile.originalUrl); setSelectedPreviewTargetPatchUrl(''); setSelectedPreviewLoading(false); }} title={`Tessera ${tile.row+1}-${tile.col+1}`} style={{padding:0, border:'none', background:'transparent', width:Math.max(10, Math.round(interactivePreview.cellSize * interactivePreviewZoom)), height:Math.max(10, Math.round(interactivePreview.cellSize * interactivePreviewZoom)), cursor:'zoom-in'}}>
                      <img src={tile.renderedUrl} alt={`Tessera ${tile.index+1}`} style={{display:'block', width:'100%', height:'100%', objectFit:'cover'}} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {selectedPreviewTile && (
              <div style={{position:'fixed', inset:0, zIndex:81, background:'rgba(0,0,0,.72)', display:'flex', alignItems:'center', justifyContent:'center', padding:16}} onClick={()=>{setSelectedPreviewTile(null); setSelectedPreviewDetailUrl(''); setSelectedPreviewTargetPatchUrl('');}}>
                <div style={{maxWidth:'min(94vw, 980px)', maxHeight:'94vh', display:'flex', alignItems:'center', justifyContent:'center'}} onClick={e=>e.stopPropagation()}>
                  <img src={selectedPreviewTile.originalUrl} alt='Foto originale tessera' style={{display:'block', maxWidth:'100%', maxHeight:'94vh', borderRadius:18, boxShadow:'0 24px 60px rgba(0,0,0,.45)'}} />
                </div>
              </div>
            )}
          </div>
        )}

        {targetCropOpen && targetCropState && (
          <div style={{position:'fixed', inset:0, zIndex:70, background:'rgba(15,10,8,.82)', display:'flex', alignItems:'center', justifyContent:'center', padding:16}}>
            <div style={{width:'min(94vw, 460px)', borderRadius:24, padding:'18px 18px 16px', background:'rgba(255,250,244,.96)', boxShadow:'0 30px 80px rgba(0,0,0,.38)', backdropFilter:'blur(10px)', color:'#4f3c2f'}}>
              <h2 style={{margin:'0 0 8px', textAlign:'center', fontSize:26}}>Scegli il campo da riprodurre</h2>
              <p style={{margin:'0 0 12px', textAlign:'center', fontSize:14, lineHeight:1.45}}>Sposta e zooma l’immagine: il mosaico renderà meglio se i soggetti importanti sono grandi e ben centrati. Alla conferma l’immagine verrà ottimizzata automaticamente per il fotomosaico.</p>
              <div style={{display:'flex', justifyContent:'center'}}>
                <div
                  onPointerDown={onTargetCropPointerDown}
                  style={{width:targetCropState.frameW, height:targetCropState.frameH, overflow:'hidden', position:'relative', borderRadius:20, border:'2px solid rgba(201,168,112,.9)', boxShadow:'0 0 0 9999px rgba(0,0,0,.26) inset, 0 8px 30px rgba(0,0,0,.18)', background:'#f4eee7', touchAction:'none', userSelect:'none'}}
                >
                  <img
                    src={targetCropState.src}
                    alt="Campo da riprodurre"
                    draggable={false}
                    style={{position:'absolute', left:targetCropState.x, top:targetCropState.y, width:targetCropState.width * targetCropState.baseScale * targetCropState.zoom, height:targetCropState.height * targetCropState.baseScale * targetCropState.zoom, maxWidth:'none', maxHeight:'none', pointerEvents:'none', userSelect:'none'}}
                  />
                  <div style={{position:'absolute', inset:0, border:'2px solid rgba(255,255,255,.95)', borderRadius:20, boxSizing:'border-box', boxShadow:'inset 0 0 0 1px rgba(0,0,0,.1)'}} />
                </div>
              </div>
              <div style={{marginTop:16}}>
                <div style={{display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6}}>
                  <span>Zoom</span>
                  <span>{targetCropState.zoom.toFixed(2)}×</span>
                </div>
                <input type="range" min="1" max="3.2" step="0.01" value={targetCropState.zoom} onChange={(e)=>onTargetCropZoomChange(Number(e.target.value))} style={{width:'100%'}} />
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:16}}>
                <button className="btn secondary" type="button" onClick={()=>setTargetCropOpen(false)} disabled={targetCropBusy}>Annulla</button>
                <button className="btn secondary" type="button" onClick={resetTargetCrop} disabled={targetCropBusy}>Reimposta</button>
                <button className="btn secondary" type="button" onClick={()=>targetFileInputRef.current?.click()} disabled={targetCropBusy}>Cambia foto</button>
                <button className="btn" type="button" onClick={confirmTargetCrop} disabled={targetCropBusy}>{targetCropBusy ? 'Adatto immagine...' : 'Conferma area e adatta'}</button>
              </div>
            </div>
          </div>
        )}

        {err&&<><div className="spacer"/><div className="error" style={{display:'block'}}>{err}</div></>}
      </section>
    </main>
  );
}
