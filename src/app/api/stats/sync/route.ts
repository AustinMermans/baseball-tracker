import { NextResponse } from 'next/server';
import { syncDate, syncDateRange } from '@/lib/stat-sync';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { date, startDate, endDate } = body;

    if (startDate && endDate) {
      const result = await syncDateRange(startDate, endDate);
      return NextResponse.json({
        message: `Synced ${result.totalSynced} player-days across ${result.totalGames} games over ${result.dates} dates`,
        ...result,
      });
    }

    if (date) {
      const result = await syncDate(date);
      return NextResponse.json({
        message: `Synced ${result.synced} players from ${result.games} games on ${date}`,
        ...result,
      });
    }

    // Default: sync yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    const result = await syncDate(dateStr);

    return NextResponse.json({
      message: `Synced ${result.synced} players from ${result.games} games on ${dateStr}`,
      date: dateStr,
      ...result,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: 'Sync failed', details: String(error) }, { status: 500 });
  }
}
