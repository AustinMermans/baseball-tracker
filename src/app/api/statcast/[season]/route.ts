import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(_req: Request, { params }: { params: { season: string } }) {
  const season = params.season;
  if (!/^\d{4}$/.test(season)) {
    return NextResponse.json({ error: 'invalid season' }, { status: 400 });
  }
  const file = path.join(process.cwd(), 'public', 'data', `statcast-${season}.json`);
  if (!fs.existsSync(file)) {
    return NextResponse.json({ error: `no statcast data for ${season}` }, { status: 404 });
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return NextResponse.json(data);
}
