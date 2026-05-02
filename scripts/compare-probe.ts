import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true });
  for (const v of [
    { name: 'desktop', width: 1280, height: 1000 },
    { name: 'mobile', width: 390, height: 1500 },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      deviceScaleFactor: 2,
      isMobile: v.name === 'mobile',
      hasTouch: v.name === 'mobile',
    });
    const page = await ctx.newPage();

    // Empty /compare
    await page.goto('http://localhost:3000/compare', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join('/tmp/site-review', `compare-empty-${v.name}.png`), fullPage: false });

    // Loaded comparison
    await page.goto('http://localhost:3000/compare?players=aaron-judge,shohei-ohtani,kyle-schwarber', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join('/tmp/site-review', `compare-loaded-${v.name}.png`), fullPage: true });

    // Players page with compare-bar workflow.
    // Direct DOM click bypasses sticky-thead pointer interception.
    await page.goto('http://localhost:3000/players', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button[aria-label^="Add "]')).slice(0, 2) as HTMLButtonElement[];
      for (const b of buttons) b.click();
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join('/tmp/site-review', `players-with-compare-${v.name}.png`), fullPage: false });

    await ctx.close();
  }
  await browser.close();
  console.log('done');
}

main().catch(e => { console.error(e); process.exit(1); });
