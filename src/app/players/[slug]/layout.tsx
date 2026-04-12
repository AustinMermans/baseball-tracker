import fs from 'fs';
import path from 'path';

export function generateStaticParams() {
  const dataPath = path.join(process.cwd(), 'public', 'data', 'players.json');
  if (fs.existsSync(dataPath)) {
    const players = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    return players.map((p: { slug: string }) => ({ slug: p.slug }));
  }
  return [];
}

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
