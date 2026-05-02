'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/standings', label: 'Standings' },
  { href: '/players', label: 'Players' },
  { href: '/calendar', label: 'Calendar' },
];

const teamNames = ['Cole', 'Markus', 'J Mill', 'Ryan', 'Joey', 'Jack', 'Austin', 'Bobby'];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <html lang="en">
      <body className="min-h-screen">
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
              <div className="md:hidden pb-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex gap-1.5 flex-wrap">
                  {navItems.map(({ href, label }) => {
                    const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        className={`min-h-[40px] px-4 py-2 text-sm rounded-md flex items-center ${
                          active ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {teamNames.map((name, i) => {
                    const active = pathname === `/teams/${i + 1}`;
                    return (
                      <Link
                        key={i}
                        href={`/teams/${i + 1}`}
                        onClick={() => setMenuOpen(false)}
                        className={`min-h-[40px] px-3.5 py-2 text-sm rounded flex items-center ${
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

        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div key={pathname} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
