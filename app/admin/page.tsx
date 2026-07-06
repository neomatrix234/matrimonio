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
    applyStatusToAdmin(st);
    if(st?.backgroundLayout){ setBgFit(st.backgroundLayout.fit || 'contain'); setBgPosX(Number(st.backgroundLayout.posX ?? 50)); setBgPosY(Number(st.backgroundLayout.posY ?? 50)); setBgScale(Number(st.backgroundLayout.scale ?? 100)); }
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
