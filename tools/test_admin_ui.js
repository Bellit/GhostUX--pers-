const puppeteer = require('puppeteer');

(async () => {
  const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:3000';
  const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  try {
    // go to login page
    await page.goto(BACKEND + '/admin/login', { waitUntil: 'networkidle2' });
    // fill token and save
    await page.type('#token', 'dev-admin-token');
    await page.click('#save');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // now on dashboard
    await page.waitForSelector('#refresh');
    // intercept export and cleanup responses
    let exportOk = false;
    page.on('response', async (res) => {
      const url = res.url();
      if (url.endsWith('/admin/export?limit=10000')) {
        if (res.status() === 200) exportOk = true;
      }
    });

    // click export
    await page.click('#export');
    await page.waitForTimeout(1000);
    if (!exportOk) throw new Error('export failed');

    // click cleanup with days=0 (no-op)
    await page.evaluate(() => { document.getElementById('days').value = '0'; });
    let cleanupOk = false;
    page.on('response', async (res) => {
      if (res.url().endsWith('/admin/cleanup')) {
        if (res.status() === 200) cleanupOk = true;
      }
    });
    await page.click('#cleanup');
    await page.waitForTimeout(1000);
    if (!cleanupOk) throw new Error('cleanup failed');

    console.log('ADMIN UI test passed');
    await browser.close();
    process.exit(0);
  } catch (e) {
    console.error('ADMIN UI test failed:', e);
    await browser.close();
    process.exit(2);
  }
})();
