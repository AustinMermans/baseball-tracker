import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  await page.goto('http://localhost:3000/players', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // 1. Click All view → URL should reflect view=all
  await page.getByRole('tab', { name: /^all$/i }).first().click();
  await page.waitForTimeout(300);
  console.log('After clicking All view:', page.url());

  // 2. Set MLB team filter to NYY
  await page.locator('select[aria-label="Filter by MLB team"]').selectOption('NYY');
  await page.waitForTimeout(300);
  console.log('After NYY filter:', page.url());

  // 3. Type in search
  await page.locator('input[placeholder*="Search"]').fill('judge');
  await page.waitForTimeout(400);
  console.log('After search:', page.url());

  // 4. Now navigate fresh to a URL with all params and verify state restored
  const restoreUrl = 'http://localhost:3000/players?view=key&team=LAD&drafted=undrafted&q=ohtani';
  await page.goto(restoreUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const viewTab = await page.locator('button[role="tab"][aria-selected="true"]').first().textContent();
  const teamSelect = await page.locator('select[aria-label="Filter by MLB team"]').inputValue();
  const searchInput = await page.locator('input[placeholder*="Search"]').inputValue();
  console.log(`Restored: view=${viewTab?.trim()} team=${teamSelect} search=${searchInput}`);

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
