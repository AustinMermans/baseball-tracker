import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true });
  for (const v of [
    { name: 'desktop', width: 1280, height: 1100 },
    { name: 'mobile', width: 390, height: 1500 },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      deviceScaleFactor: 2,
      isMobile: v.name === 'mobile',
      hasTouch: v.name === 'mobile',
    });
    const page = await ctx.newPage();

    await page.goto('http://localhost:3000/pitchers', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join('/tmp/site-review', `pitchers-list-${v.name}.png`), fullPage: false });

    // Click first pitcher to open detail
    await page.evaluate(() => {
      const rows = document.querySelectorAll('tbody tr');
      (rows[0] as HTMLElement)?.click();
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join('/tmp/site-review', `pitchers-detail-${v.name}.png`), fullPage: false });

    // Calendar with pitcher names
    await page.goto('http://localhost:3000/calendar', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join('/tmp/site-review', `calendar-with-pitchers-${v.name}.png`), fullPage: false });

    await ctx.close();
  }
  await browser.close();
  console.log('done');
}

main().catch(e => { console.error(e); process.exit(1); });
