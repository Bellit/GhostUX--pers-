const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:3000';
  const headless = process.env.LOCAL_DEBUG ? false : true;
  const browser = await puppeteer.launch({ headless, args: ['--no-sandbox','--disable-setuid-sandbox'], protocolTimeout: 120000 });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(30000);
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  try {
    // go to login page
    await page.goto(BACKEND + '/admin/login', { waitUntil: 'domcontentloaded' });
    // fill token and save
    await page.type('#token', 'dev-admin-token');
    await sleep(500);
    await page.evaluate(() => { const el = document.getElementById('save'); if (el) el.click(); });
    // wait for dashboard's refresh button to appear (redirect)
    await page.waitForSelector('#refresh', { timeout: 10000 });

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
    await sleep(500);
    await page.evaluate(() => { const el = document.getElementById('export'); if (el) el.click(); });
    await sleep(1000);
    if (!exportOk) throw new Error('export failed');

    // click cleanup with days=0 (no-op)
    await page.evaluate(() => { document.getElementById('days').value = '0'; });
    let cleanupOk = false;
    page.on('response', async (res) => {
      if (res.url().endsWith('/admin/cleanup')) {
        if (res.status() === 200) cleanupOk = true;
      }
    });
    await sleep(500);
    await page.evaluate(() => { const el = document.getElementById('cleanup'); if (el) el.click(); });
    await sleep(1000);
    if (!cleanupOk) throw new Error('cleanup failed');

    console.log('ADMIN UI test passed');
    await browser.close();
    process.exit(0);
  } catch (e) {
    console.error('ADMIN UI test failed:', e);
    try {
      if (!fs.existsSync('tmp')) fs.mkdirSync('tmp')
      await page.screenshot({ path: 'tmp/admin-ui-failure.png', fullPage: true })
      const html = await page.content()
      fs.writeFileSync('tmp/admin-ui-failure.html', html)
      console.log('Saved failure artifacts to tmp/')
    } catch (err) {
      console.error('Failed saving artifacts:', err)
    }
    await browser.close();
    process.exit(2);
  }
})();
