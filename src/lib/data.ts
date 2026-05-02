/**
 * Data fetching layer - auto-detects static vs API mode.
 * Static: fetches from /data/*.json (GitHub Pages)
 * API: fetches from /api/* routes (local dev)
 */

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

function isStaticMode(): boolean {
  // NEXT_PUBLIC_STATIC is set at build time for GitHub Pages
  if (process.env.NEXT_PUBLIC_STATIC === 'true') return true;
  // Also detect by checking if we're on github.io
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io')) return true;
  return false;
}

export function dataUrl(path: string): string {
  if (!isStaticMode()) return path;

  const staticMap: Record<string, string> = {
    '/api/standings': '/data/standings.json',
    '/api/players': '/data/players.json',
    '/api/teams': '/data/teams.json',
    '/api/rankings': '/data/rankings.json',
    '/api/calendar': '/data/calendar.json',
    '/api/pitchers': '/data/pitchers.json',
  };

  const teamMatch = path.match(/^\/api\/teams\/(\d+)$/);
  if (teamMatch) {
    return `${basePath}/data/team-${teamMatch[1]}.json`;
  }

  const playerMatch = path.match(/^\/api\/players\/([a-z0-9-]+)$/);
  if (playerMatch) {
    return `${basePath}/data/player-${playerMatch[1]}.json`;
  }

  return `${basePath}${staticMap[path] || path}`;
}

export async function fetchData<T>(path: string): Promise<T> {
  const url = dataUrl(path);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
  return res.json();
}
