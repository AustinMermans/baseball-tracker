'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/standings', label: 'Standings' },
  { href: '/players', label: 'Players' },
];

const teamNames = ['Cole', 'Markus', 'J Mill', 'Ryan', 'Joey', 'Jack', 'Austin', 'Bobby'];

function LastUpdated() {
  const [lastDate, setLastDate] = useState<string | null>(null);
  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    fetch(`${basePath}/data/meta.json`)
      .then(r => r.json())
      .then(d => setLastDate(d.lastGameDate))
      .catch(() => {});
  }, []);
  if (!lastDate) return null;
  return <span className="text-[11px] text-muted-foreground">Stats through {lastDate}</span>;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <html lang="en">
      <head>
        <link rel="icon" href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/favicon.svg`} type="image/svg+xml" />
        <title>Fantasy Baseball &apos;26</title>
      </head>
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            {/* Top row */}
            <div className="flex items-center justify-between h-12">
              <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
                Fantasy Baseball <span className="text-muted-foreground font-normal">&apos;26</span>
              </Link>

              {/* Desktop nav */}
              <nav className="hidden md:flex items-center gap-1">
                {navItems.map(({ href, label }) => {
                  const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                        active ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </Link>
                  );
                })}
                <div className="ml-2 pl-2 border-l border-border flex items-center gap-1">
                  {teamNames.map((name, i) => {
                    const active = pathname === `/teams/${i + 1}`;
                    return (
                      <Link
                        key={i}
                        href={`/teams/${i + 1}`}
                        className={`px-2 py-1 text-[11px] rounded transition-colors ${
                          active ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        {name}
                      </Link>
                    );
                  })}
                </div>
              </nav>

              {/* Mobile menu button */}
              <button
                className="md:hidden p-2 text-muted-foreground"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {menuOpen ? (
                    <path d="M18 6L6 18M6 6l12 12" />
                  ) : (
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>

            {/* Mobile nav */}
            {menuOpen && (
              <div className="md:hidden pb-3 space-y-2">
                <div className="flex gap-1">
                  {navItems.map(({ href, label }) => {
                    const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        className={`px-3 py-1.5 text-xs rounded-md ${
                          active ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground'
                        }`}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-1">
                  {teamNames.map((name, i) => {
                    const active = pathname === `/teams/${i + 1}`;
                    return (
                      <Link
                        key={i}
                        href={`/teams/${i + 1}`}
                        onClick={() => setMenuOpen(false)}
                        className={`px-2.5 py-1.5 text-xs rounded ${
                          active ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {name}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex-1">
          {children}
        </main>

        <footer className="border-t border-border mt-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
            <span className="text-[11px] text-muted-foreground">
              Best ball &middot; TB + SB + BB + HBP &middot; Top 10 of 13
            </span>
            <LastUpdated />
          </div>
        </footer>
      </body>
    </html>
  );
}
