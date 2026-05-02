/**
 * Playwright smoke-test/aesthetic review of the baseball-tracker site.
 *
 * Crawls every primary page at desktop and mobile viewports, captures
 * screenshots, console errors, and basic layout metrics (viewport overflow,
 * tap-target sizes). Output: /tmp/site-review/.
 *
 * Usage: npx tsx scripts/site-review.ts (dev server must be running on :3000)
 */

import { chromium, type Browser, type Page } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3000';
const OUT = '/tmp/site-review';

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 }, // iPhone 14
];

interface Probe {
  path: string;
  label: string;
  // Optional interaction to perform after load (returns the path of the post-action screenshot suffix).
  after?: (page: Page) => Promise<string | null>;
}

const PROBES: Probe[] = [
  { path: '/', label: 'overview' },
  { path: '/standings', label: 'standings' },
  { path: '/players', label: 'players-fantasy' },
  {
    path: '/players',
    label: 'players-key',
    after: async (page) => {
      await page.getByRole('tab', { name: 'key', exact: true }).first().click();
      await page.waitForTimeout(300);
      return 'key-view';
    },
  },
  {
    path: '/players',
    label: 'players-all',
    after: async (page) => {
      // Two tabs both have name "all" (view tab + draft filter). Pick the
      // view-tab one explicitly via its position in the segmented control.
      await page.getByRole('tab', { name: 'all', exact: true }).first().click();
      await page.waitForTimeout(300);
      return 'all-view';
    },
  },
  { path: '/calendar', label: 'calendar' },
  { path: '/compare', label: 'compare-empty' },
  { path: '/compare?players=aaron-judge,kyle-schwarber,shohei-ohtani', label: 'compare-3' },
  { path: '/pitchers', label: 'pitchers' },
  { path: '/teams/1', label: 'team-1' },
  { path: '/players/aaron-judge', label: 'player-detail' },
];

interface Issue {
  page: string;
  viewport: string;
  kind: string;
  detail: string;
}

async function probe(browser: Browser, probe: Probe, viewport: typeof VIEWPORTS[number]): Promise<Issue[]> {
  const issues: Issue[] = [];
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    isMobile: viewport.name === 'mobile',
    hasTouch: viewport.name === 'mobile',
  });
  const page = await ctx.newPage();

  const consoleErrors: string[] = [];
  page.on('pageerror', e => consoleErrors.push(`[pageerror] ${e.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(`[console] ${msg.text()}`);
  });

  const url = BASE + probe.path;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e: any) {
    issues.push({ page: probe.label, viewport: viewport.name, kind: 'navigation', detail: e.message });
    await ctx.close();
    return issues;
  }

  // Wait for any loading skeletons.
  await page.waitForTimeout(800);

  let suffix: string | null = null;
  if (probe.after) {
    try {
      suffix = await probe.after(page);
    } catch (e: any) {
      issues.push({ page: probe.label, viewport: viewport.name, kind: 'interaction', detail: e.message });
    }
  }

  // Console errors
  for (const err of consoleErrors) {
    issues.push({ page: probe.label, viewport: viewport.name, kind: 'console', detail: err });
  }

  // Horizontal overflow check
  const docOverflow = await page.evaluate((vw) => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      vw,
    };
  }, viewport.width);
  if (docOverflow.scrollWidth > docOverflow.clientWidth + 1) {
    issues.push({
      page: probe.label,
      viewport: viewport.name,
      kind: 'overflow',
      detail: `document scrollWidth=${docOverflow.scrollWidth} > clientWidth=${docOverflow.clientWidth}`,
    });
  }

  // Tap-target check (mobile only)
  if (viewport.name === 'mobile') {
    const tinyTargets = await page.evaluate(() => {
      const targets = Array.from(document.querySelectorAll('a, button, [role="button"]'));
      return targets.filter(el => {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        return (r.width < 32 || r.height < 32);
      }).slice(0, 10).map(el => ({
        tag: el.tagName,
        text: (el.textContent ?? '').trim().slice(0, 20),
        cls: (el as HTMLElement).className.slice(0, 60),
        w: Math.round((el as HTMLElement).getBoundingClientRect().width),
        h: Math.round((el as HTMLElement).getBoundingClientRect().height),
      }));
    });
    for (const t of tinyTargets) {
      issues.push({
        page: probe.label,
        viewport: viewport.name,
        kind: 'tap-target',
        detail: `${t.tag} "${t.text}" (${t.w}x${t.h})`,
      });
    }
  }

  // Screenshot
  const fileName = `${probe.label}${suffix ? '-' + suffix : ''}-${viewport.name}.png`;
  await page.screenshot({ path: path.join(OUT, fileName), fullPage: true });

  await ctx.close();
  return issues;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const allIssues: Issue[] = [];

  for (const v of VIEWPORTS) {
    for (const p of PROBES) {
      console.log(`Probing ${p.label} @ ${v.name}...`);
      const issues = await probe(browser, p, v);
      allIssues.push(...issues);
    }
  }

  await browser.close();

  // Group and report
  const byKind = new Map<string, Issue[]>();
  for (const i of allIssues) {
    if (!byKind.has(i.kind)) byKind.set(i.kind, []);
    byKind.get(i.kind)!.push(i);
  }

  console.log(`\n=== Site review summary ===`);
  console.log(`Total issues: ${allIssues.length}`);
  for (const [kind, list] of byKind) {
    console.log(`\n[${kind}] ${list.length}`);
    for (const i of list.slice(0, 30)) {
      console.log(`  ${i.page}@${i.viewport}: ${i.detail}`);
    }
    if (list.length > 30) console.log(`  ...and ${list.length - 30} more`);
  }

  const reportPath = path.join(OUT, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ allIssues, screenshots: fs.readdirSync(OUT).filter(f => f.endsWith('.png')) }, null, 2));
  console.log(`\nFull report: ${reportPath}`);
  console.log(`Screenshots: ${OUT}/*.png`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
