// Opens the packaged Mac app, waits for its window, and saves a screenshot and what the page shows,
// so a blank window is caught before anything reaches TestFlight.
// Usage: node scripts/smoke-electron.cjs <path to Community.app/Contents/MacOS/Community> <out dir>
const { _electron } = require('playwright');
const fs = require('fs');

(async () => {
  const [exe, out] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const logs = [];
  const app = await _electron.launch({ executablePath: exe, timeout: 90000 });
  app.process().stdout?.on('data', (d) => logs.push('stdout: ' + d));
  app.process().stderr?.on('data', (d) => logs.push('stderr: ' + d));
  const win = await app.firstWindow({ timeout: 90000 });
  win.on('console', (m) => logs.push(`console.${m.type()}: ${m.text()}`));
  win.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await win.waitForTimeout(12000);
  await win.screenshot({ path: `${out}/smoke.png` });
  const info = await win.evaluate(() => ({ url: location.href, title: document.title, rootLength: document.getElementById('root')?.innerHTML.length ?? -1, text: document.body.innerText.slice(0, 600) }));
  fs.writeFileSync(`${out}/smoke.txt`, JSON.stringify(info, null, 2) + '\n\n' + logs.join('\n'));
  console.log(JSON.stringify(info, null, 2));
  await app.close();
  if (info.rootLength < 50) {
    console.log('BLANK: the window has (almost) nothing in it');
    process.exit(1);
  }
})().catch((e) => {
  console.log('SMOKE TEST CRASHED: ' + e.message);
  process.exit(1);
});
