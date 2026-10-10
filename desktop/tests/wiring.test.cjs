// Checks the live sign-in path with stand-ins: the app is built as for release (Clerk, real
// settings from .env) but the database is the in-memory stand-in and Clerk's scripts are replaced
// by a small fake that records what the app asks of it. Proves the app's own wiring, not Clerk's
// or Supabase's configuration.
// Usage: node build.mjs --wire, serve dist-wire, then
//        NODE_PATH=$(npm root -g) node tests/wiring.test.cjs http://127.0.0.1:8791/
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:8791/';
const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8').split('\n').map((l) => /^\s*(EXPO_PUBLIC_[A-Z_]+)\s*=\s*(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
);
const KEY = env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const HOST = Buffer.from(KEY.split('_').slice(2).join('_'), 'base64').toString().replace(/\$+$/, '');
let failures = 0;
const check = (label, ok, extra) => {
  if (ok) console.log('ok   ' + label);
  else {
    failures++;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

const CLERK_UI = 'window.__internal_ClerkUICtor = function ClerkUI() {};';
const CLERK_JS = `
  window.__clerk = { tag: document.querySelector('script[data-clerk-publishable-key]')?.getAttribute('data-clerk-publishable-key'), mounted: [] };
  window.Clerk = {
    user: null, session: null, _l: [],
    async load(o) { window.__clerk.load = o; },
    addListener(fn) { this._l.push(fn); },
    _emit() { this._l.forEach((fn) => fn({ user: this.user, session: this.session })); },
    mountSignIn(el, o) {
      window.__clerk.mounted.push('sign-in');
      el.innerHTML = '<button id="stub-sign-in">Stub sign in</button>';
      el.querySelector('button').onclick = () => {
        window.__fakeMe = 'user_3NewMember';
        this.user = { id: 'user_3NewMember', fullName: 'Kojo Mensah', firstName: 'Kojo', lastName: 'Mensah', username: null, primaryEmailAddress: { emailAddress: 'Kojo.Mensah@example.com' }, hasImage: false };
        this.session = { getToken: async () => 'clerk-session-token' };
        this._emit();
      };
    },
    unmountSignIn(el) { el.innerHTML = ''; },
    mountSignUp(el) { window.__clerk.mounted.push('sign-up'); el.innerHTML = '<p>stub sign up</p>'; },
    unmountSignUp(el) { el.innerHTML = ''; },
    async signOut(o) { window.__clerk.signOut = o; this.user = null; this.session = null; this._emit(); },
    openUserProfile() { window.__clerk.profileOpened = true; },
  };`;

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
  const errors = [];
  const outside = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  const js = (body) => ({ status: 200, contentType: 'application/javascript', body });
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u === `https://${HOST}/npm/@clerk/ui@1/dist/ui.browser.js`) return r.fulfill(js(CLERK_UI));
    if (u === `https://${HOST}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`) return r.fulfill(js(CLERK_JS));
    if (u.startsWith(BASE) || u.startsWith('blob:') || u.startsWith('data:')) return r.continue();
    outside.push(u);
    return r.abort();
  });

  await page.goto(BASE);
  await page.waitForSelector('.login');
  await page.waitForSelector('#stub-sign-in');
  check('signed out: log-in page with the Clerk form', (await page.locator('.clerk-box #stub-sign-in').count()) === 1);
  check('no demo banner in the real app', (await page.locator('.demo-banner').count()) === 0);
  check('Clerk is loaded from its own domain with the key from .env', (await page.evaluate(() => window.__clerk.tag)) === KEY, HOST);
  const load = await page.evaluate(() => ({ ui: !!window.__clerk.load?.ui?.ClerkUI, back: window.__clerk.load?.signInForceRedirectUrl, color: window.__clerk.load?.appearance?.variables?.colorPrimary }));
  check('Clerk gets its screens bundle, this page as the return address, and the app colour', load.ui && load.back === BASE && load.color === '#1fbf5a', JSON.stringify(load));
  const sb = await page.evaluate(() => ({ url: window.__sbClient?.url, key: window.__sbClient?.key }));
  check('Supabase client uses the project URL and publishable key from .env', sb.url === env.EXPO_PUBLIC_SUPABASE_URL && sb.key === env.EXPO_PUBLIC_SUPABASE_KEY, JSON.stringify(sb));
  check('signed out, the database gets no token', (await page.evaluate(() => window.__sbClient.opts.accessToken())) === null);

  await page.locator('a', { hasText: 'Sign up' }).click();
  await page.waitForTimeout(300);
  check('"Sign up" swaps in Clerk\'s sign-up form', (await page.evaluate(() => window.__clerk.mounted.at(-1))) === 'sign-up');
  await page.locator('a', { hasText: 'Log in' }).click();
  await page.waitForSelector('#stub-sign-in');

  await page.click('#stub-sign-in');
  await page.waitForSelector('.onboard');
  check('a new Clerk account is asked to pick a username', (await page.getByText('Create your profile').count()) === 1);
  check('username is suggested from the email address', (await page.getByLabel('Username').inputValue()) === 'kojomensah', await page.getByLabel('Username').inputValue());
  check('signed in, every database request carries the Clerk session token', (await page.evaluate(() => window.__sbClient.opts.accessToken())) === 'clerk-session-token');
  await page.getByLabel('Username').fill('kojo.mensah');
  await page.getByRole('button', { name: 'Next' }).click();
  check('usernames follow the iPhone app rule (no dots)', (await page.locator('.field-error').innerText()).includes('lowercase letters, numbers or underscores'));
  await page.getByLabel('Username').fill('kojo_mensah');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForSelector('.sidebar');
  check('after choosing a username the app opens', (await page.locator('.sidebar').count()) === 1);
  await page.locator('.sidebar').getByRole('link', { name: 'Profile' }).click();
  await page.waitForSelector('.profile-head');
  check('the profile was created under the Clerk user id', (await page.locator('.profile-top h1').innerText()).startsWith('kojo_mensah'));

  await page.locator('.sidebar').getByRole('button', { name: 'More' }).click();
  await page.locator('.more-pop').getByRole('button', { name: 'Email and password' }).click();
  check('"Email and password" opens Clerk\'s account screen', await page.evaluate(() => window.__clerk.profileOpened === true));
  await page.locator('.sidebar').getByRole('button', { name: 'More' }).click();
  await page.locator('.more-pop').getByRole('button', { name: 'Log out' }).click();
  await page.waitForSelector('.login');
  check('log out goes through Clerk and back to the log-in page', (await page.evaluate(() => window.__clerk.signOut?.redirectUrl)) === BASE);

  const strays = outside.filter((u) => !/fonts\.(googleapis|gstatic)\.com/.test(u));
  check('the app contacts nothing but Clerk and fonts here', strays.length === 0, strays.join(' '));
  check('no script errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures ? failures + ' CHECK(S) FAILED' : 'ALL WIRING CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error('TEST CRASHED: ' + e.message.split('\n').slice(0, 6).join('\n'));
  process.exit(2);
});
