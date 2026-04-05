import { NextResponse } from 'next/server';
import { db } from '@/db';
import { teams, players } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const allTeams = await db.select().from(teams);
    const result = [];

    for (const team of allTeams) {
      const roster = await db.select().from(players)
        .where(eq(players.teamId, team.id));
      result.push({ ...team, roster });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 });
  }
}
