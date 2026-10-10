// A real call between two windows, with the iPhone app's own call code (src/lib/calls.tsx and
// rtc.ts) running in both. One window is signed in as the sample account, the other as Grace;
// their Realtime messages and call rows are passed across by this script. Media is real WebRTC
// with Chromium's pretend camera and microphone.
// Usage: serve dist-demo, then  NODE_PATH=$(npm root -g) node tests/calls.test.cjs http://127.0.0.1:8790/
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8790/';
let failures = 0;
const check = (label, ok, extra) => {
  if (ok) console.log('ok   ' + label);
  else {
    failures++;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const open = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['camera', 'microphone'] });
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    await page.route('**/*', (r) => (r.request().url().startsWith(BASE) || /^(blob|data):/.test(r.request().url()) ? r.continue() : r.abort()));
    if (who) await page.addInitScript((id) => (window.__fakeMe = id), who);
    return page;
  };
  const me = await open(null);
  const grace = await open('u_grace');
  // Pass each window's broadcasts and call rows to the other, as Supabase Realtime would.
  await me.exposeFunction('__relayOut', (m) => grace.evaluate((x) => window.__relayIn && window.__relayIn(x), m).catch(() => {}));
  await grace.exposeFunction('__relayOut', (m) => me.evaluate((x) => window.__relayIn && window.__relayIn(x), m).catch(() => {}));

  await grace.goto(BASE);
  await grace.waitForSelector('.rail');
  await me.goto(BASE + '#/direct/t/t1');
  await me.waitForSelector('.chat-head');

  await me.getByRole('button', { name: 'Video call' }).click();
  await me.waitForSelector('.call-screen');
  await me.waitForFunction(() => (document.querySelector('.call-who h2')?.textContent || '').includes('Grace'), null, { timeout: 5000 }).then(() => check('caller sees the call screen with who they are calling', true), () => check('caller sees the call screen with who they are calling', false));

  await grace.waitForSelector('.call-screen', { timeout: 10000 });
  check('the other window rings, wherever it is in the app', (await grace.locator('.call-who p').innerText()) === 'Incoming video call');
  const named = await grace.waitForFunction(() => (document.querySelector('.call-who h2')?.textContent || '').includes('Demo Account'), null, { timeout: 5000 }).then(() => true, () => false);
  check('it shows who is calling', named, await grace.locator('.call-who h2').innerText().catch(() => ''));
  // "Ringing…" is sent once by the callee and can arrive before the caller is listening (the same on iPhone), so either is fine.
  check('caller sees the call is ringing', ['Ringing…', 'Calling…'].includes(await me.locator('.call-who p').innerText()));

  await grace.getByRole('button', { name: 'Accept', exact: true }).click();
  const connected = (p) => p.waitForFunction(() => /^\d+:\d\d$/.test(document.querySelector('.call-who p')?.textContent || ''), null, { timeout: 20000 }).then(() => true, () => false);
  const [a, b] = await Promise.all([connected(me), connected(grace)]);
  check('both sides connect and show the call timer', a && b);
  const videoPlaying = (p) => p.locator('video.call-remote').evaluate((v) => new Promise((r) => (v.videoWidth > 0 ? r(true) : setTimeout(() => r(v.videoWidth > 0), 3000)))).catch(() => false);
  check("caller sees the other person's video", await videoPlaying(me));
  check("callee sees the caller's video", await videoPlaying(grace));
  await me.getByRole('button', { name: 'Mute', exact: true }).click();
  check('mute toggles', (await me.getByRole('button', { name: 'Unmute', exact: true }).count()) === 1);
  await me.screenshot({ path: process.argv[3] ? process.argv[3] + '/call-connected.png' : '/dev/null' }).catch(() => {});

  await me.getByRole('button', { name: 'End', exact: true }).click();
  await grace.waitForFunction(() => document.querySelector('.call-who p')?.textContent === 'Call ended' || !document.querySelector('.call-screen'), null, { timeout: 8000 }).then(() => check('hanging up ends the call on the other side too', true), () => check('hanging up ends the call on the other side too', false));
  await me.waitForTimeout(2500);
  check('the call screen closes by itself', (await me.locator('.call-screen').count()) === 0);
  await me.waitForTimeout(800);
  check('the call is noted in the chat', (await me.locator('.bubble.call').filter({ hasText: 'Video call' }).count()) >= 1);

  // A declined call
  await me.getByRole('button', { name: 'Voice call' }).click();
  await grace.waitForSelector('.call-screen');
  await grace.getByRole('button', { name: 'Decline', exact: true }).click();
  await me.waitForFunction(() => document.querySelector('.call-who p')?.textContent === 'Declined', null, { timeout: 8000 }).then(() => check('a declined call says so to the caller', true), () => check('a declined call says so to the caller', false));

  check('no script errors', me.errors.length + grace.errors.length === 0, me.errors.concat(grace.errors).join(' | '));
  await browser.close();
  console.log(failures ? failures + ' CHECK(S) FAILED' : 'ALL CALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error('TEST CRASHED: ' + e.message.split('\n').slice(0, 6).join('\n'));
  process.exit(2);
});
