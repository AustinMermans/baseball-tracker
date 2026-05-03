import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  // Default to current season's pre-aggregated payload.
  const file = path.join(process.cwd(), 'public', 'data', 'statcast-2026.json');
  if (!fs.existsSync(file)) {
    return NextResponse.json(
      { error: 'statcast-2026.json not generated yet — run npx tsx scripts/build-statcast.ts' },
      { status: 503 },
    );
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return NextResponse.json(data);
}
