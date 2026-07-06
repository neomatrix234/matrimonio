import Link from 'next/link';

export default function Home() {
  const title = process.env.NEXT_PUBLIC_EVENT_TITLE || 'Fotomosaico degli sposi';
  const subtitle = process.env.NEXT_PUBLIC_EVENT_SUBTITLE || 'Carica una foto per costruire insieme il ricordo di questo giorno';

  return (
    <main className="container">
      <section className="hero">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </section>
      <section className="card">
        <h2>Partecipa al mosaico</h2>
        <p>Scegli una foto dal telefono. Verrà ridotta automaticamente e diventerà una tessera del mosaico.</p>
        <Link className="btn" href="/upload">Carica una foto</Link>
        <p className="small">Non serve installare nessuna app.</p>
      </section>
    </main>
  );
}
