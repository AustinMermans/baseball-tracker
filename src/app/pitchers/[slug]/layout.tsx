import fs from 'fs';
import path from 'path';

export function generateStaticParams() {
  const dataPath = path.join(process.cwd(), 'public', 'data', 'pitchers.json');
  if (fs.existsSync(dataPath)) {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    return (data.pitchers ?? []).map((p: { slug: string }) => ({ slug: p.slug }));
  }
  return [];
}

export default function PitcherLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
