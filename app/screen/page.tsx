'use client';

import { useEffect, useRef, useState } from 'react';

type Photo = { id:string; name:string; created:number; size:number };
type Tile = { id:string; index:number; order:number; url:string };

function gridForTotal(total:number){
  if(total <= 600) return {cols:30, rows:20};
  if(total <= 800) return {cols:40, rows:20};
  if(total <= 1000) return {cols:40, rows:25};
  if(total <= 1200) return {cols:40, rows:30};
  return {cols:50, rows:30};
}

function dist(a:number[], b:number[]){
  return (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
}

function loadImg(url:string): Promise<HTMLImageElement>{
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=reject;
    img.src=url;
  });
}

async function avgColor(url:string): Promise<number[]>{
  const img=await loadImg(url);
  const canvas=document.createElement('canvas');
  canvas.width=1; canvas.height=1;
  const ctx=canvas.getContext('2d');
  if(!ctx) return [128,128,128];
  ctx.drawImage(img,0,0,1,1);
  const d=ctx.getImageData(0,0,1,1).data;
  return [d[0],d[1],d[2]];
}

async function targetColors(url:string, cols:number, rows:number): Promise<number[][]>{
  const img=await loadImg(url);
  const canvas=document.createElement('canvas');
  canvas.width=cols; canvas.height=rows;
  const ctx=canvas.getContext('2d');
  if(!ctx) return [];
  ctx.drawImage(img,0,0,cols,rows);
  const data=ctx.getImageData(0,0,cols,rows).data;
  const colors:number[][]=[];
  for(let i=0;i<cols*rows;i++){
    colors.push([data[i*4],data[i*4+1],data[i*4+2]]);
  }
  return colors;
}

export default function ScreenPage(){
  const [status,setStatus]=useState<any>(null);
  const [tiles,setTiles]=useState<Tile[]>([]);
  const [final,setFinal]=useState(false);
  const [completeMsg,setCompleteMsg]=useState(false);
  const [isFullscreen,setIsFullscreen]=useState(false);
  const [replayStarted,setReplayStarted]=useState(false);
  const [paused,setPaused]=useState(false);

  const processing=useRef(false);
  const assignedIds=useRef<Set<string>>(new Set());
  const usedIndexes=useRef<Set<number>>(new Set());
  const targetColorRef=useRef<number[][]>([]);
  const currentRun=useRef(0);

  function targetImageUrl(s:any){
    if(!s?.targetFileId) return '';
    const version = s?.target?.updated || Date.now();
    return `/api/image?id=${s.targetFileId}&v=${version}`;
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
      const url=`/api/image?id=${p.id}`;
      let c=[128,128,128];
      try{ c=await avgColor(url); }catch(e){}
      const colors=targetColorRef.current;
      let best=-1; let bestD=Number.POSITIVE_INFINITY;
      for(let i=0;i<total;i++){
        if(usedIndexes.current.has(i)) continue;
        const d=colors[i]?dist(c, colors[i]):i;
        if(d<bestD){bestD=d; best=i;}
      }
      if(best<0) continue;
      assignedIds.current.add(p.id);
      usedIndexes.current.add(best);
      setTiles(prev=>[...prev,{id:p.id,index:best,order:prev.length+1,url}]);
      await new Promise(res=>setTimeout(res,80));
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
                {t && <img src={t.url} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block',animation:'pop .45s ease'}}/>}
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

      <style>{`@keyframes pop{0%{opacity:0;transform:scale(.75)}100%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}
