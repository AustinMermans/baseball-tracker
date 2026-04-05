'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Zap, Calendar } from 'lucide-react';

export default function SettingsPage() {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [singleDate, setSingleDate] = useState('');
  const [rangeStart, setRangeStart] = useState('2026-03-26');
  const [rangeEnd, setRangeEnd] = useState(new Date().toISOString().split('T')[0]);

  const syncSingleDate = async () => {
    if (!singleDate) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/stats/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: singleDate }),
      });
      const data = await res.json();
      setSyncResult(data.message || JSON.stringify(data));
    } catch (e) {
      setSyncResult(`Error: ${e}`);
    } finally {
      setSyncing(false);
    }
  };

  const syncRange = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/stats/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: rangeStart, endDate: rangeEnd }),
      });
      const data = await res.json();
      setSyncResult(data.message || JSON.stringify(data));
    } catch (e) {
      setSyncResult(`Error: ${e}`);
    } finally {
      setSyncing(false);
    }
  };

  const syncYesterday = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/stats/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">Manage stat sync and league configuration</p>
      </div>

      {/* Quick Sync */}
      <Card className="p-5 bg-card border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Quick Sync</h2>
            <p className="text-xs text-muted-foreground">Sync yesterday&apos;s stats from MLB</p>
          </div>
        </div>
        <Button onClick={syncYesterday} disabled={syncing} className="w-full" variant="default">
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync Yesterday'}
        </Button>
      </Card>

      {/* Single Date Sync */}
      <Card className="p-5 bg-card border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Sync Single Date</h2>
            <p className="text-xs text-muted-foreground">Pull stats for a specific game date</p>
          </div>
        </div>
        <div className="flex gap-3">
          <input
            type="date"
            value={singleDate}
            onChange={e => setSingleDate(e.target.value)}
            className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm"
          />
          <Button onClick={syncSingleDate} disabled={syncing || !singleDate} variant="secondary">
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        </div>
      </Card>

      {/* Range Sync (Backfill) */}
      <Card className="p-5 bg-card border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
            <RefreshCw className="w-4 h-4 text-orange-500" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Backfill Range</h2>
            <p className="text-xs text-muted-foreground">Sync all dates in a range (may take a while)</p>
          </div>
        </div>
        <div className="flex gap-3 mb-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Start</label>
            <input
              type="date"
              value={rangeStart}
              onChange={e => setRangeStart(e.target.value)}
              className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">End</label>
            <input
              type="date"
              value={rangeEnd}
              onChange={e => setRangeEnd(e.target.value)}
              className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <Button onClick={syncRange} disabled={syncing} variant="secondary" className="w-full">
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Backfill Range'}
        </Button>
      </Card>

      {/* Sync Result */}
      {syncResult && (
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="default" className="text-[10px]">Result</Badge>
          </div>
          <p className="text-sm font-mono">{syncResult}</p>
        </Card>
      )}

      {/* League Info */}
      <Card className="p-5 bg-card border-border">
        <h2 className="font-semibold text-sm mb-3">League Info</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Format</span>
            <span>Best Ball (10 of 13)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Scoring</span>
            <span>TB + SB + BB + HBP</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Buy-in</span>
            <span>$25</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Period 1</span>
            <span>Mar 26 - May 30</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Redraft 1</span>
            <span>May 31</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Period 2</span>
            <span>May 31 - Jul 30</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Redraft 2</span>
            <span>Jul 31</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Period 3</span>
            <span>Jul 31 - Sep 27</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
