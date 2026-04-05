'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/standings', label: 'Standings' },
  { href: '/players', label: 'Players' },
  { href: '/settings', label: 'Settings' },
];

const teamNames = ['Cole', 'Markus', 'J Mill', 'Ryan', 'Joey', 'Jack', 'Austin', 'Bobby'];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <html lang="en">
      <body className="min-h-screen">
        {/* Top nav */}
        <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-50">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex items-center justify-between h-12">
              <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
                Fantasy Baseball <span className="text-muted-foreground font-normal">&apos;26</span>
              </Link>

              <nav className="flex items-center gap-1">
                {navItems.map(({ href, label }) => {
                  const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                        active
                          ? 'bg-accent text-accent-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </Link>
                  );
                })}

                {/* Team dropdown as pills */}
                <div className="ml-2 pl-2 border-l border-border flex items-center gap-1">
                  {teamNames.map((name, i) => {
                    const href = `/teams/${i + 1}`;
                    const active = pathname === href;
                    return (
                      <Link
                        key={i}
                        href={href}
                        className={`px-2 py-1 text-[11px] rounded transition-colors ${
                          active
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        {name}
                      </Link>
                    );
                  })}
                </div>
              </nav>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
