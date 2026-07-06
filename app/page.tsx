'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Home() {
  const [bgUrl,setBgUrl]=useState('');
  const [opacity,setOpacity]=useState(0.22);
  const [menu,setMenu]=useState(false);

  useEffect(() => {
    async function loadBg(){
      try{
        const r = await fetch('/api/status?x=' + Date.now());
        const d = await r.json();
        if(d?.panelOpacity !== undefined) setOpacity(Number(d.panelOpacity));
        if(d?.uploadBackgroundFileId){
          const version = d?.uploadBackground?.updated || Date.now();
          setBgUrl(`/api/image?id=${d.uploadBackgroundFileId}&v=${version}`);
        }
      }catch{}
    }
    loadBg();
  }, []);

  return (
    <main className="homeFull" style={{backgroundImage:bgUrl ? `url(${bgUrl})` : 'linear-gradient(135deg,#6d5b4b,#201a16)'}}>
      <button className="hamburger" onClick={()=>setMenu(!menu)}>{menu ? '×' : '☰'}</button>
      {menu && <div className="hamburgerPanel">
        <Link className="btn secondary" href="/admin">Area Admin</Link>
        <Link className="btn secondary" href="/screen">Schermo mosaico</Link>
      </div>}
      <section className="homePanel" style={{background:`rgba(255,255,255,${opacity})`}}>
        <h1 className="uploadTitle">Partecipa al mosaico</h1>
        <Link className="btn" href="/upload">Carica foto</Link>
      </section>
    </main>
  );
}
