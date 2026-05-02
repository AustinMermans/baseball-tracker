import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const file = path.join(process.cwd(), 'public', 'data', 'pitchers.json');
  if (!fs.existsSync(file)) {
    return NextResponse.json(
      { error: 'pitchers.json not generated yet — run npx tsx scripts/generate-pitchers.ts' },
      { status: 503 },
    );
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return NextResponse.json(data);
}
