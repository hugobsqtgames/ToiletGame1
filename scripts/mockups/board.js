const http = require('http'); const handler = require('serve-handler'); const { chromium } = require('playwright');
const P = process.env.MOCKUP_WORK || require('path').resolve(__dirname, '../../.mockups');
(async () => {
  const server = http.createServer((req, res) => handler(req, res, { public: P + '/board', cleanUrls: false }));
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const [pg, w, h] of [['a', 3200, 1000], ['b', 3200, 1000], ['c', 3200, 1000], ['seq', 3700, 1000], ['hero', 3600, 2100]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`http://localhost:${server.address().port}/board.html?page=${pg}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${P}/board/out_${pg}.png`, fullPage: pg !== 'hero' });
    await page.close();
  }
  await browser.close(); server.close();
})();
