/**
 * Data fetching layer that works in both modes:
 * - Local dev: fetches from /api/ routes (server-side)
 * - Static (GitHub Pages): fetches from /data/ JSON files
 *
 * The basePath handles GitHub Pages subdirectory deployment.
 */

const isStatic = process.env.NEXT_PUBLIC_STATIC === 'true';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function dataUrl(path: string): string {
  if (isStatic) {
    // Map API paths to static JSON files
    const staticMap: Record<string, string> = {
      '/api/standings': '/data/standings.json',
      '/api/players': '/data/players.json',
      '/api/teams': '/data/teams.json',
    };

    // Handle /api/teams/[id] -> /data/team-[id].json
    const teamMatch = path.match(/^\/api\/teams\/(\d+)$/);
    if (teamMatch) {
      return `${basePath}/data/team-${teamMatch[1]}.json`;
    }

    return `${basePath}${staticMap[path] || path}`;
  }

  return path;
}

export async function fetchData<T>(path: string): Promise<T> {
  const url = dataUrl(path);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
  return res.json();
}
