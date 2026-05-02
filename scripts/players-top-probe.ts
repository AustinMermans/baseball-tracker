import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true });
  for (const v of [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      deviceScaleFactor: 2,
      isMobile: v.name === 'mobile',
      hasTouch: v.name === 'mobile',
    });
    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/players', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join('/tmp/site-review', `players-top-${v.name}.png`), fullPage: false });

    // Also: click YFR (or first non-default) team filter and screenshot
    await page.locator('select[aria-label="Filter by MLB team"]').selectOption('NYY');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join('/tmp/site-review', `players-nyy-${v.name}.png`), fullPage: false });

    // Also: also test overview
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join('/tmp/site-review', `overview-top-${v.name}.png`), fullPage: false });
    await ctx.close();
  }
  await browser.close();
  console.log('done');
}

main().catch(e => { console.error(e); process.exit(1); });
