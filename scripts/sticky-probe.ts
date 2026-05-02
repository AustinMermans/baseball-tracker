/**
 * Quick visual probe of the players page All-view at mobile width with
 * the table horizontally scrolled, to verify sticky-left columns hold.
 */
import { chromium } from 'playwright';
import path from 'path';

const OUT = '/tmp/site-review';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();

  await page.goto('http://localhost:3000/players', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // Click the All button.
  await page.getByRole('tab', { name: /^all$/i }).first().click();
  await page.waitForTimeout(400);

  // Find the scrollable table container and scroll right.
  await page.evaluate(() => {
    const table = document.querySelector('table');
    const wrapper = table?.parentElement;
    if (wrapper) wrapper.scrollLeft = 600;
  });
  await page.waitForTimeout(200);

  await page.screenshot({ path: path.join(OUT, 'players-all-mobile-scrolled.png'), fullPage: false });

  await browser.close();
  console.log(`Saved ${path.join(OUT, 'players-all-mobile-scrolled.png')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
