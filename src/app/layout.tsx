'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Trophy, Users, BarChart3, User, Settings, Zap } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: BarChart3 },
  { href: '/standings', label: 'Standings', icon: Trophy },
  { href: '/teams/1', label: 'Teams', icon: Users },
  { href: '/players', label: 'Players', icon: User },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex">
        {/* Sidebar */}
        <aside className="w-60 border-r border-border bg-card flex flex-col fixed h-screen">
          <div className="p-5 border-b border-border">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h1 className="font-bold text-sm tracking-tight">Baseball Tracker</h1>
                <p className="text-[10px] text-muted-foreground">Fantasy League 2026</p>
              </div>
            </Link>
          </div>

          <nav className="flex-1 p-3 space-y-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = href === '/'
                ? pathname === '/'
                : pathname.startsWith(href.split('/').slice(0, 2).join('/'));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="p-3 border-t border-border">
            <div className="text-[10px] text-muted-foreground text-center">
              8 Teams &middot; 104 Players
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 ml-60 min-h-screen">
          <div className="max-w-7xl mx-auto p-6">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
