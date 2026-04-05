'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [singleDate, setSingleDate] = useState('');
  const [rangeStart, setRangeStart] = useState('2026-03-26');
  const [rangeEnd, setRangeEnd] = useState(new Date().toISOString().split('T')[0]);

  const doSync = async (body: object) => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/stats/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setSyncResult(data.message || JSON.stringify(data));
    } catch (e) {
      setSyncResult(`Error: ${e}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Sync stats and manage the league</p>
      </div>

      {/* Quick sync */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div>
          <p className="text-sm font-medium">Quick Sync</p>
          <p className="text-xs text-muted-foreground">Pull yesterday&apos;s stats from MLB</p>
        </div>
        <button
          onClick={() => doSync({})}
          disabled={syncing}
          className="w-full py-2 px-4 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {syncing ? 'Syncing...' : 'Sync Yesterday'}
        </button>
      </div>

      {/* Single date */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div>
          <p className="text-sm font-medium">Sync Single Date</p>
          <p className="text-xs text-muted-foreground">Pull stats for a specific game date</p>
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={singleDate}
            onChange={e => setSingleDate(e.target.value)}
            className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-background"
          />
          <button
            onClick={() => doSync({ date: singleDate })}
            disabled={syncing || !singleDate}
            className="px-4 py-1.5 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Sync
          </button>
        </div>
      </div>

      {/* Range backfill */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div>
          <p className="text-sm font-medium">Backfill Range</p>
          <p className="text-xs text-muted-foreground">Sync all dates in a range</p>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[11px] text-muted-foreground">Start</label>
            <input
              type="date"
              value={rangeStart}
              onChange={e => setRangeStart(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background"
            />
          </div>
          <div className="flex-1">
            <label className="text-[11px] text-muted-foreground">End</label>
            <input
              type="date"
              value={rangeEnd}
              onChange={e => setRangeEnd(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background"
            />
          </div>
        </div>
        <button
          onClick={() => doSync({ startDate: rangeStart, endDate: rangeEnd })}
          disabled={syncing}
          className="w-full py-2 px-4 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-50 transition-colors"
        >
          {syncing ? 'Syncing...' : 'Backfill'}
        </button>
      </div>

      {/* Result */}
      {syncResult && (
        <div className="border border-border rounded-lg p-3 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground mb-1">Result</p>
          <p className="text-sm">{syncResult}</p>
        </div>
      )}

      {/* League info */}
      <div className="border border-border rounded-lg p-4">
        <p className="text-sm font-medium mb-3">League Info</p>
        <div className="space-y-1.5 text-xs">
          {[
            ['Format', 'Best Ball (10 of 13)'],
            ['Scoring', 'TB + SB + BB + HBP'],
            ['Buy-in', '$25'],
            ['Period 1', 'Mar 26 — May 30'],
            ['Redraft 1', 'May 31'],
            ['Period 2', 'May 31 — Jul 30'],
            ['Redraft 2', 'Jul 31'],
            ['Period 3', 'Jul 31 — Sep 27'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
