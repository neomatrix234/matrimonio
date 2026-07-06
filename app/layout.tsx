import './globals.css';

export const metadata = {
  title: process.env.NEXT_PUBLIC_EVENT_TITLE || 'Fotomosaico',
  description: 'Carica una foto per il fotomosaico',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="it"><body>{children}</body></html>;
}
