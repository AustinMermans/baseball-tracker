import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', msg => console.log(`[console.${msg.type()}]`, msg.text()));
  page.on('pageerror', err => console.log('[pageerror]', err.message));
  await page.goto('http://localhost:3000/teams/1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  // Inspect the raw fetch response
  const r = await page.evaluate(async () => {
    const res = await fetch('/api/teams/1');
    const data = await res.json();
    return data.roster.slice(0, 3);
  });
  console.log('First 3 roster entries:', JSON.stringify(r, null, 2));
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
