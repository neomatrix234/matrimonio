'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Home() {
  const [bgUrl,setBgUrl]=useState('');

  useEffect(() => {
    async function loadBg(){
      try{
        const r = await fetch('/api/status?x=' + Date.now());
        const d = await r.json();
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
      <section className="homePanel">
        <h1 className="uploadTitle">Partecipa al mosaico</h1>
        <Link className="btn" href="/upload">Carica foto</Link>
      </section>
    </main>
  );
}
