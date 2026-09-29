import type { ReactNode } from 'react';
import { Footer, Navbar } from '../(landing-page)/landing-page';

/** Public chrome around the catalog pages. */
export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-6">{children}</main>
      <Footer />
    </div>
  );
}
