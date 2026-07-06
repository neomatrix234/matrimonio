import Link from 'next/link';

export default function Home() {
  const title = process.env.NEXT_PUBLIC_EVENT_TITLE || 'Fotomosaico degli sposi';

  return (
    <main className="container">
      <section className="hero">
        <h1>{title}</h1>
      </section>
      <section className="card" style={{textAlign:'center'}}>
        <h2>Partecipa al mosaico</h2>
        <Link className="btn" href="/upload">Carica foto</Link>
      </section>
    </main>
  );
}
