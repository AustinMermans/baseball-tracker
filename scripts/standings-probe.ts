/**
 * Capture standings page (which includes the bump chart) at desktop and
 * mobile viewports for visual verification of bump-chart sizing.
 */
import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true });

  for (const v of [
    { name: 'desktop', width: 1280, height: 800, isMobile: false },
    { name: 'mobile', width: 390, height: 844, isMobile: true },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      deviceScaleFactor: 2,
      isMobile: v.isMobile,
      hasTouch: v.isMobile,
    });
    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/standings', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500); // give Recharts time to render

    await page.screenshot({
      path: path.join('/tmp/site-review', `standings-${v.name}-bump.png`),
      fullPage: true,
    });
    console.log(`saved standings-${v.name}-bump.png`);
    await ctx.close();
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
