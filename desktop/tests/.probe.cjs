const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('CONSOLE ' + m.text()));
  await p.goto(process.argv[2] + (process.argv[3] || ''));
  await p.waitForTimeout(4000);
  console.log((await p.locator('body').innerText()).slice(0, 800));
  console.log(errs.slice(0, 15).join('\n'));
  await p.screenshot({ path: '/tmp/claude-0/shots/probe.png' });
  await b.close();
})();
