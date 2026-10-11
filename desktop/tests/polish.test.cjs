// The polish pass from the iPhone app's two newest updates: Settings → Payments (saved cards,
// subscriptions, every transaction), the sign-in pages in Dark and White (on the wiring build, with a
// stand-in for Clerk), the empty profile signed in a handwriting script, Subscribe only where it
// means something, skeletons while pages load, and no boxed banners or explanatory lines on the main
// pages. Usage: WIRE_URL=http://127.0.0.1:8933/ node tests/polish.test.cjs http://127.0.0.1:8833/ [screenshot dir]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:8833/';
const SHOTS = process.argv[3] || '';
const WIRE = process.env.WIRE_URL || BASE.replace(/:(\d+)\/?$/, (_m, p) => ':' + (Number(p) + 100) + '/');
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || extra === '' ? '' : ' (' + extra + ')'));
  if (!ok) failed++;
};

/** True when an element draws no box: no background colour or picture, and no border. */
const PLAIN = (el) => {
  const s = getComputedStyle(el);
  const clear = (c) => c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
  return clear(s.backgroundColor) && s.backgroundImage === 'none' && (s.borderTopWidth === '0px' || clear(s.borderTopColor));
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Remembers every skeleton that was ever drawn, however briefly, so loading states can be checked.
  await ctx.addInitScript(() => {
    window.__skeletons = new Set();
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('.sk-group')) window.__skeletons.add(el.className);
    }).observe(document, { childList: true, subtree: true });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    return u.startsWith(BASE) || u.startsWith('blob:') || u.startsWith('data:') ? r.continue() : r.abort();
  });
  const wait = (ms = 400) => page.waitForTimeout(ms);
  const goto = async (hash, ms = 800) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await wait(ms);
  };
  const shot = async (name) => {
    if (!SHOTS) return;
    await wait(300);
    await page.screenshot({ path: path.join(SHOTS, name + '.png') });
  };
  const theme = async (look) => {
    await page.evaluate((l) => {
      localStorage.setItem('community.appearance', l);
      document.documentElement.dataset.theme = l;
    }, look);
    await wait(250);
  };
  const seen = () => page.evaluate(() => [...window.__skeletons].join(' | '));

  try {
    await page.goto(BASE);
    await page.waitForSelector('.feed-post');

    /* ---------- skeletons instead of spinners ---------- */
    check('the feed shows the shapes of its posts while it loads', (await seen()).includes('sk-feed'), await seen());
    await goto('/explore', 1200);
    check('Explore shows a shimmering mosaic while it loads', (await seen()).includes('sk-grid-mosaic'), await seen());
    await goto('/u/grace_mensah', 1200);
    check('a profile shows its picture, name and grid as shapes while it loads', (await seen()).includes('sk-profile'), await seen());
    await goto('/u/grace_mensah/shorts', 1200);
    check('a Shorts tab shows tall tiles while it loads', (await seen()).includes('sk-grid-shorts'), await seen());
    await goto('/accounts/payments', 1500);
    check('Settings → Payments shows rows of shapes while it loads', (await seen()).includes('sk-rows'), await seen());
    const shimmer = await page.evaluate(() => {
      const el = document.createElement('span');
      el.className = 'sk';
      document.body.appendChild(el);
      const s = getComputedStyle(el);
      const out = s.animationName + ' ' + s.backgroundImage.slice(0, 15);
      el.remove();
      return out;
    });
    check('a skeleton shape shimmers in the theme colours', shimmer.startsWith('sk-shimmer linear-gradient'), shimmer);

    /* ---------- Settings → Payments ---------- */
    await goto('/accounts/payments', 1200);
    await page.waitForSelector('.po-card');
    const nav = await page.locator('.st-nav').innerText();
    check('Payments is in the Settings column', /Payments/.test(nav));
    check('it replaces Ads and payments (and its Plus row)', !/Ads and payments/.test(nav) && (await page.locator('.st-nav-item', { hasText: 'Your ads' }).getAttribute('href')) === '#/dashboard/ads');
    check('the column shows names only, no lines under them', (await page.locator('.st-nav-item small').count()) === 1, await page.locator('.st-nav-item small').count());
    check('the page is called Payments', (await page.locator('.st-title').innerText()) === 'Payments');
    const blocks = (await page.locator('.st-block-head h2').allInnerTexts()).join('|');
    check('saved cards, subscriptions and transactions', blocks === 'Saved cards|Subscriptions|Transactions', blocks);
    check('the saved card shows with its expiry and as the default', (await page.locator('.po-card').first().innerText()).replace(/\s+/g, ' ').includes('Visa •••• 4242 Expires 12/29 Default'));
    await shot('polish-payments-dark');

    // Add a card: the card dialog (a sample form in the demo), then it is listed.
    await page.locator('.po-add').click();
    await page.waitForSelector('.pay-sheet');
    check('Add card opens the card dialog to save one', (await page.locator('.pay-sheet').innerText()).includes('Add a card'));
    await page.locator('.pay-sheet .btn.block').click();
    await page.waitForFunction(() => document.querySelectorAll('.po-card').length === 2, null, { timeout: 5000 });
    check('the new card is listed', (await page.locator('.po-card').nth(1).innerText()).includes('Mastercard •••• 4444'));
    // Make it the default, then remove it.
    await page.locator('.po-card').nth(1).click();
    await page.locator('.choices button', { hasText: 'Make default' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.po-card')[1]?.innerText.includes('Default'), null, { timeout: 5000 });
    check('a card can be made the default', !(await page.locator('.po-card').first().innerText()).includes('Default'));
    await page.locator('.po-card').nth(1).click();
    await page.locator('.choices button', { hasText: 'Remove card' }).click();
    check('removing asks first', (await page.locator('.confirm-text').innerText()).includes('Remove this card?'));
    await page.locator('.confirm').getByRole('button', { name: 'Remove' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.po-card').length === 1, null, { timeout: 5000 });
    check('and the card is gone', (await page.locator('.po-card').count()) === 1);

    // Subscriptions: Community Plus, the creators I subscribe to, and the way to my own.
    const plusRow = page.locator('.po-sub').first();
    check('Community Plus shows its plan and when it renews', /Community Plus\s+Monthly · Renews/.test(await plusRow.innerText()), await plusRow.innerText());
    await plusRow.getByRole('button', { name: 'Cancel' }).click();
    check('cancelling Plus asks first, with what happens', (await page.locator('.confirm-text').innerText()).includes('Cancel Plus?'));
    await page.locator('.confirm').getByRole('button', { name: 'Cancel subscription' }).click();
    await page.waitForFunction(() => document.querySelector('.po-sub')?.innerText.includes('Ends'), null, { timeout: 5000 });
    check('Plus then ends at the end of the period', (await plusRow.innerText()).includes('Ends'));
    await plusRow.getByRole('button', { name: 'Resume' }).click();
    await page.locator('.confirm').getByRole('button', { name: 'Resume' }).click();
    await page.waitForFunction(() => document.querySelector('.po-sub')?.innerText.includes('Renews'), null, { timeout: 5000 });
    check('and can be renewed again', (await plusRow.innerText()).includes('Renews'));
    const samuel = page.locator('.po-sub', { hasText: 'samuel_boateng' });
    check('a creator subscription shows its price and renewal', /£1\.99 a month · Renews/.test(await samuel.innerText()), await samuel.innerText());
    await samuel.getByRole('button', { name: 'Cancel' }).click();
    await page.locator('.confirm').getByRole('button', { name: 'Cancel subscription' }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.po-sub')].some((r) => r.innerText.includes('samuel_boateng') && r.innerText.includes('Resume')), null, { timeout: 5000 });
    check('it can be cancelled, then resumed', (await samuel.innerText()).includes('Ends'));
    await samuel.getByRole('button', { name: 'Resume' }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.po-sub')].some((r) => r.innerText.includes('samuel_boateng') && r.innerText.includes('Renews')), null, { timeout: 5000 });
    check('and renews again', (await samuel.innerText()).includes('Renews'));
    check('Creator subscriptions opens my own', (await page.locator('.po-sub-all').getAttribute('href')) === '#/accounts/subscriptions');

    // Every transaction, by month, each opening its details.
    const months = await page.locator('.po-month-h').allInnerTexts();
    check('transactions are grouped by month', months.length >= 1, months.join());
    const txs = page.locator('.po-tx');
    check('every payment is listed', (await txs.count()) >= 2, await txs.count());
    const refunded = page.locator('.po-tx', { hasText: 'Ad · 1 day' });
    check('a refunded payment says so', (await refunded.innerText()).includes('Refunded'));
    await refunded.click();
    await page.waitForSelector('.po-detail');
    const detail = (await page.locator('.po-detail').innerText()).replace(/\s+/g, ' ');
    check('a payment opens with its status, date, method and reference', /Status Refunded Date .+ Method Visa •••• 4242 Reference pi_demo_pm4/.test(detail), detail);
    await shot('polish-payment-detail-dark');
    await page.keyboard.press('Escape');
    await goto('/accounts/ads');
    check('the old Ads and payments address opens Payments', (await page.locator('.st-title').innerText()) === 'Payments');
    await page.locator('.st-search input').fill('card');
    check('searching Settings for "card" finds Payments', (await page.locator('.st-nav-list .st-nav-item').allInnerTexts()).some((x) => x.includes('Payments')));
    await page.locator('.st-search input').fill('');
    await theme('white');
    await goto('/accounts/payments', 1200);
    await shot('polish-payments-white');
    await goto('/accounts/edit', 1000);
    await shot('polish-settings-white');
    await theme('dark');
    await goto('/accounts/edit', 1000);
    await shot('polish-settings-dark');

    /* ---------- no explanatory lines or boxed banners ---------- */
    for (const id of ['edit', 'account', 'payments', 'professional', 'creator', 'subscriptions', 'viewers', 'content', 'shorts', 'counts', 'streaks', 'appearance', 'archive', 'language', 'accessibility', 'family', 'status']) {
      await goto('/accounts/' + id, 700);
      const extra = await page.evaluate(() => ({
        intro: document.querySelectorAll('.st-body .st-intro, .st-body .st-note, .st-body .st-hint').length,
        // Lines under a row's name, leaving out what members wrote themselves (saved replies, questions and answers).
        subs: [...document.querySelectorAll('.st-body .st-row-text:not(.wrap) > span')].filter((s) => s.innerText.split(' ').length > 9).map((s) => s.innerText),
      }));
      check(`Settings → ${id}: no intro, footnote or explaining line`, (id === 'viewers' ? extra.intro <= 1 : extra.intro === 0) && extra.subs.length === 0, JSON.stringify(extra));
    }
    const boxes = [];
    for (const to of ['/', '/explore', '/u/you', '/dashboard', '/dashboard/ads', '/plus', '/help', '/lessons', '/pod', '/churches', '/groups', '/accounts/appearance', '/accounts/creator', '/accounts/family', '/accounts/status']) {
      await goto(to, 900);
      const found = await page.evaluate((plain) => {
        const isPlain = new Function('return ' + plain)();
        return [...document.querySelectorAll('.main [class*="notice"], .main [class*="banner"], .main [class*="upsell"], .main .st-summary, .main .st-status, .main .announce, .main .st-help-hero, .main .pro-tick-link')]
          .filter((el) => !el.closest('.notices') && !el.classList.contains('demo-banner') && el.offsetParent !== null && !isPlain(el))
          .map((el) => el.className);
      }, PLAIN.toString());
      if (found.length) boxes.push(to + ': ' + found.join(', '));
    }
    check('no boxed banners or info boxes on the main pages', boxes.length === 0, boxes.join(' ; '));
    await goto('/', 600);
    await page.locator('.rail').getByRole('button', { name: 'Church apps' }).click();
    await page.waitForSelector('.apps-pop');
    check('the Church apps menu lists names only', (await page.locator('.apps-pop .app-text > span').count()) === 0 && (await page.locator('.apps-pop [role=menuitem]').count()) >= 8);
    await page.keyboard.press('Escape');
    await page.mouse.click(900, 500);

    /* ---------- Subscribe only where it means something ---------- */
    await goto('/u/grace_mensah', 1000);
    const actions = page.locator('.prof-head');
    check('a creator with subscriptions on and posts for subscribers shows Subscribe', (await actions.getByRole('button', { name: 'Subscribe', exact: true }).count()) === 1);
    check('and her subscriber posts are offered as plain words under the grid', (await page.locator('.po-subwords').count()) === 1 && (await page.locator('.po-subwords').evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgba(0, 0, 0, 0)');
    await page.evaluate(() => {
      const d = window.__profileDemo;
      d.T('community_profiles').find((p) => p.id === 'u_daniel').sub_price_pence = 199;
      d.announce('profile');
    });
    await goto('/u/daniel_owusu', 1000);
    check('a creator with subscriptions on but no subscriber posts shows no Subscribe', (await page.locator('.prof-head').getByRole('button', { name: 'Subscribe', exact: true }).count()) === 0);
    await page.evaluate(() => {
      const d = window.__profileDemo;
      d.T('community_posts').find((p) => p.id === 'p3').audience = 'subscribers';
      d.announce('profile');
    });
    await goto('/explore', 400);
    await goto('/u/daniel_owusu', 1000);
    check('once he keeps a post for subscribers, Subscribe shows', (await page.locator('.prof-head').getByRole('button', { name: 'Subscribe', exact: true }).count()) === 1);
    await page.evaluate(() => {
      const d = window.__profileDemo;
      d.T('community_profiles').find((p) => p.id === 'u_daniel').sub_price_pence = null;
      d.announce('profile');
    });
    await goto('/explore', 400);
    await goto('/u/daniel_owusu', 1000);
    check('with subscriptions off there is no Subscribe and nothing offered under the grid', (await page.locator('.prof-head').getByRole('button', { name: 'Subscribe', exact: true }).count()) === 0 && (await page.locator('.po-subwords').count()) === 0);
    await page.evaluate(() => {
      window.__profileDemo.T('community_posts').find((p) => p.id === 'p3').audience = 'everyone';
    });
    await goto('/u/samuel_boateng', 1000);
    check('someone I already subscribe to shows Subscribed', (await page.locator('.prof-head').getByRole('button', { name: /^Subscribed/ }).count()) === 1);

    /* ---------- the empty profile signs itself in a handwriting script ---------- */
    await page.evaluate(() => {
      sessionStorage.setItem('community.demoAs', 'user_3KTkRcnk7CCL3EaTDjWtptR4YMO');
      location.hash = '#/u/erha';
    });
    await page.reload();
    await page.waitForSelector('.pp-first');
    check('my empty Posts tab says "Share your first post", as the iPhone', (await page.locator('.pp-first').getAttribute('aria-label')) === 'Share your first post');
    check('with no line explaining it', (await page.locator('.pp-first-body').count()) === 0);
    const face = await page.locator('.po-script').evaluate((el) => getComputedStyle(el).fontFamily);
    check('in a handwriting script (Snell Roundhand on a Mac, else Great Vibes)', /Snell Roundhand/.test(face) && /Great Vibes/.test(face) && /cursive/.test(face), face);
    check('the script is asked for from Google Fonts', (await page.locator('link[href*="Great+Vibes"]').count()) === 1);
    const inks = await page.evaluate(() => [getComputedStyle(document.querySelector('.po-script .pp-written')).color, getComputedStyle(document.body).color]);
    check('in the page text colour (white in Dark)', inks[0] === inks[1] && inks[0] === 'rgb(243, 245, 247)', inks.join(' vs '));
    await wait(900);
    const [part, total] = await page.locator('.po-script .pp-writing').evaluate((el) => [Number(el.dataset.shown), Number(el.dataset.total)]);
    check('it writes itself letter by letter', part > 0 && part < total, part + '/' + total);
    await page.waitForFunction(() => document.querySelector('.po-script .pp-writing')?.classList.contains('done'), null, { timeout: 6000 }).catch(() => {});
    check('then a fine stroke is drawn under it', await page.locator('.po-script .pp-writing.done').count() === 1);
    await page.locator('.pp-first').scrollIntoViewIfNeeded();
    await shot('polish-empty-profile-dark');
    await theme('white');
    const inkWhite = await page.evaluate(() => getComputedStyle(document.querySelector('.po-script .pp-written')).color);
    check('and dark ink in White', inkWhite === 'rgb(15, 20, 25)', inkWhite);
    await shot('polish-empty-profile-white');
    await theme('dark');
    await goto('/u/erha/shorts', 900);
    check('the empty Shorts tab too', (await page.locator('.pp-first').getAttribute('aria-label')) === 'Share your first Short' && (await page.locator('.pp-first .po-script').count()) === 1);
    await page.evaluate(() => sessionStorage.removeItem('community.demoAs'));
    await page.reload();
    await page.waitForSelector('.rail');

    /* ---------- the demo's log-in page follows the appearance ---------- */
    await page.locator('.rail').getByRole('button', { name: 'More' }).click();
    await page.locator('.more-pop').getByRole('menuitem', { name: /Log out/ }).click();
    await page.waitForSelector('.en-login');
    check('the log-in page has the pictures on the left and the form on the right', (await page.locator('.en-art .en-photo').count()) === 3 && (await page.locator('.en-side .en-brand').count()) === 1);
    check('with the mark, the name and "Seventh-day Adventist"', (await page.locator('.en-eyebrow').innerText()).toLowerCase() === 'seventh-day adventist');
    check('and no tagline or explaining note', (await page.locator('.login-tag, .login-note, .demo-login p').count()) === 0);
    await page.getByRole('button', { name: 'Switch appearance' }).click();
    check('the corner button switches it to White', (await page.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor].join())) === 'white,rgb(255, 255, 255)');
    await page.getByRole('button', { name: 'Switch appearance' }).click();
    check('and back to Dark', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
    await page.getByRole('button', { name: 'Log in to the demo' }).click();
    await page.waitForSelector('.rail');

    const over = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
    check('no sideways scrolling', over <= 0, over);
  } catch (e) {
    console.log('TEST CRASHED: ' + e.message.split('\n').slice(0, 4).join('\n'));
    failed++;
  }
  check('no script errors', errors.length === 0, errors.join(' | '));
  await ctx.close();

  /* ---------- the real sign-in page (wiring build, Clerk stood in for) in Dark and White ---------- */
  const up = await fetch(WIRE).then((r) => r.ok, () => false);
  if (!up) {
    console.log('FAIL the sign-in page on the wiring build: nothing at ' + WIRE + ' (build with --wire and set WIRE_URL)');
    failed++;
  } else {
    const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8').split('\n').map((l) => /^\s*(EXPO_PUBLIC_[A-Z_]+)\s*=\s*(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
    const KEY = env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const HOST = Buffer.from(KEY.split('_').slice(2).join('_'), 'base64').toString().replace(/\$+$/, '');
    // A stand-in for Clerk that draws a small form and remembers the colours it was given.
    const CLERK_JS = `window.__clerk = { mounts: [] };
      window.Clerk = { user: null, session: null, _l: [],
      async load(o) { window.__clerk.load = o; }, addListener(fn) { this._l.push(fn); },
      _emit() { this._l.forEach((fn) => fn({ user: this.user, session: this.session })); },
      mountSignIn(el, o) {
        window.__clerk.mounts.push(['sign-in', o.appearance.variables.colorBackground, o.appearance.variables.colorText]);
        el.innerHTML = '<label>Email <input id="stub-email"></label><button id="stub-sign-in">Continue</button>';
        el.querySelector('button').onclick = () => {
          window.__fakeMe = 'user_3PolishNew';
          this.user = { id: 'user_3PolishNew', fullName: 'Ama Owusu', firstName: 'Ama', lastName: 'Owusu', username: null, primaryEmailAddress: { emailAddress: 'ama@example.com' }, hasImage: false };
          this.session = { getToken: async () => 'token' };
          this._emit();
        };
      },
      unmountSignIn(el) { el.innerHTML = ''; },
      mountSignUp(el, o) { window.__clerk.mounts.push(['sign-up', o.appearance.variables.colorBackground]); el.innerHTML = '<p>stub sign up</p>'; },
      unmountSignUp(el) { el.innerHTML = ''; },
      async signOut() {}, openUserProfile() {} };`;
    const w = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const wErrors = [];
    w.on('pageerror', (e) => wErrors.push(e.message));
    const js = (body) => ({ status: 200, contentType: 'application/javascript', body });
    await w.route('**/*', (r) => {
      const u = r.request().url();
      if (u === `https://${HOST}/npm/@clerk/ui@1/dist/ui.browser.js`) return r.fulfill(js('window.__internal_ClerkUICtor = function () {};'));
      if (u === `https://${HOST}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`) return r.fulfill(js(CLERK_JS));
      return u.startsWith(WIRE) || u.startsWith('blob:') || u.startsWith('data:') ? r.continue() : r.abort();
    });
    try {
      await w.goto(WIRE);
      await w.waitForSelector('.en-login .clerk-box #stub-sign-in');
      check('sign-in: the Clerk form sits on the right, the pictures on the left', (await w.locator('.en-side .clerk-box').count()) === 1 && (await w.locator('.en-art .en-photo').count()) === 3);
      check('sign-in: Clerk is coloured for Dark', (await w.evaluate(() => [window.__clerk.load.appearance.variables.colorBackground, window.__clerk.mounts.at(-1)[1]].join())) === '#0b1014,#0b1014');
      check('sign-in: the page is dark', (await w.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(11, 16, 20)');
      check('sign-in: "Sign up" under a line, no tagline or note', (await w.locator('.en-switch').innerText()).includes("Don't have an account? Sign up") && (await w.locator('.login-tag, .login-note').count()) === 0);
      await w.locator('#stub-email').focus();
      await w.waitForTimeout(200);
      check('sign-in: the pictures step back while typing', (await w.locator('.en-art.typing').count()) === 1);
      await w.locator('#stub-email').blur();
      if (SHOTS) await w.screenshot({ path: path.join(SHOTS, 'polish-sign-in-dark.png') });
      await w.getByRole('button', { name: 'Switch appearance' }).click();
      await w.waitForTimeout(400);
      check('sign-in: White turns the page white', (await w.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(255, 255, 255)');
      check('sign-in: and Clerk is drawn again in the White colours', (await w.evaluate(() => window.__clerk.mounts.at(-1).join())) === 'sign-in,#ffffff,#0f1419');
      if (SHOTS) await w.screenshot({ path: path.join(SHOTS, 'polish-sign-in-white.png') });
      await w.locator('a', { hasText: 'Sign up' }).click();
      await w.waitForTimeout(300);
      check('sign-up: Clerk\'s sign-up form, in White, with the iPhone\'s line', (await w.evaluate(() => window.__clerk.mounts.at(-1).join())) === 'sign-up,#ffffff' && (await w.locator('.en-tag').innerText()).includes('Join your church family'));
      await w.locator('a', { hasText: 'Log in' }).click();
      await w.waitForSelector('#stub-sign-in');
      // A new account: setting it up follows the appearance too, with the same mark and name.
      await w.click('#stub-sign-in');
      await w.getByText('Enter your date of birth').waitFor();
      check('setting up an account: the mark, the name and White', (await w.locator('.en-onboard .en-brand').count()) === 1 && (await w.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(255, 255, 255)');
      if (SHOTS) await w.screenshot({ path: path.join(SHOTS, 'polish-onboard-white.png') });
      await w.getByRole('button', { name: 'Switch appearance' }).click();
      await w.waitForTimeout(300);
      check('setting up an account: and Dark', (await w.evaluate(() => getComputedStyle(document.querySelector('.en-onboard .login-card')).backgroundColor)) === 'rgb(11, 16, 20)');
      if (SHOTS) await w.screenshot({ path: path.join(SHOTS, 'polish-onboard-dark.png') });
    } catch (e) {
      console.log('TEST CRASHED (sign-in): ' + e.message.split('\n').slice(0, 4).join('\n'));
      failed++;
    }
    check('sign-in: no script errors', wErrors.length === 0, wErrors.join(' | '));
  }

  await browser.close();
  console.log(failed ? `${failed} CHECK(S) FAILED` : 'ALL POLISH CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})();
