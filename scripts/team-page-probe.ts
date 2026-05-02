import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true });
  for (const v of [
    { name: 'desktop', width: 1280, height: 1200 },
    { name: 'mobile', width: 390, height: 1400 },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      deviceScaleFactor: 2,
      isMobile: v.name === 'mobile',
      hasTouch: v.name === 'mobile',
    });
    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/teams/1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 9999));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join('/tmp/site-review', `team-bottom-${v.name}.png`), fullPage: false });
    await ctx.close();
  }
  await browser.close();
  console.log('done');
}

main().catch(e => { console.error(e); process.exit(1); });
