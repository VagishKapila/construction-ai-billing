const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'https://construction-ai-billing-staging.up.railway.app';
const EMAIL = 'mike.rodriguez.test@constructinv.com';
const PASS  = 'TestPass123!';
const OUT   = '/sessions/sharp-sleepy-carson/mnt/construction-ai-billing/screens';

fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // 1. LOGIN page (unauthenticated)
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(OUT, '01-login.png'), fullPage: false });
  console.log('✅ 01-login.png');

  // 2. SIGNUP page (unauthenticated)
  await page.goto(`${BASE}/register`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(OUT, '02-signup.png'), fullPage: false });
  console.log('✅ 02-signup.png');

  // Log in
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/dashboard`, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  // Dismiss any modals
  try {
    const skipBtn = page.locator('button:has-text("Skip"), button:has-text("Not now")');
    if (await skipBtn.count() > 0) await skipBtn.first().click();
    const notNowBtn = page.locator('button:has-text("Not now")');
    if (await notNowBtn.count() > 0) await notNowBtn.first().click();
  } catch(e) {}
  await page.waitForTimeout(1000);

  // 3. DASHBOARD
  await page.screenshot({ path: path.join(OUT, '03-dashboard.png'), fullPage: false });
  console.log('✅ 03-dashboard.png');

  // 4. SETTINGS
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState('networkidle');
  try {
    const skipBtn = page.locator('button:has-text("Skip")');
    if (await skipBtn.count() > 0) await skipBtn.first().click();
  } catch(e) {}
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '04-settings.png'), fullPage: false });
  console.log('✅ 04-settings.png');

  // 5. SETTINGS-PAYMENTS (Payments page)
  await page.goto(`${BASE}/payments`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(OUT, '05-settings-payments.png'), fullPage: false });
  console.log('✅ 05-settings-payments.png');

  // 6. INVOICES (Reports page)
  await page.goto(`${BASE}/reports`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(OUT, '06-invoices.png'), fullPage: false });
  console.log('✅ 06-invoices.png');

  // 7. NEW INVOICE (New Project wizard)
  await page.goto(`${BASE}/projects/new`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(OUT, '07-new-invoice.png'), fullPage: false });
  console.log('✅ 07-new-invoice.png');

  await browser.close();
  console.log('\nAll 7 screenshots saved to:', OUT);
})();
