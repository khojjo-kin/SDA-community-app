// The Professional dashboard (Insights and Ad tools), ads paid by card, billing, Plus with its free
// week, the tick application, and fundraisers: on the demo build, the way a person would use them.
// Usage: node tests/pro.test.cjs http://127.0.0.1:8805/ [screenshot dir]
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:8805/';
const SHOTS = process.argv[3] || '';
const MEDIA = path.join(__dirname, '../src/fake/media');
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || extra === '' ? '' : ' (' + extra + ')'));
  if (!ok) failed++;
};

/** A new window signed in as `as` (a sample person's id, or the demo account), in Dark or White. */
async function open(browser, { as = '', theme = 'dark' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(([a, t]) => {
    try {
      localStorage.setItem('community.appearance', t);
      if (a) sessionStorage.setItem('community.demoAs', a);
    } catch {}
  }, [as, theme]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    return u.startsWith(BASE) || u.startsWith('blob:') || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.goto(BASE);
  await page.waitForSelector('.rail');
  const goto = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForTimeout(700);
  };
  const toast = (text) => page.locator('.toast', { hasText: text }).first().waitFor({ timeout: 6000 }).then(() => true, () => false);
  const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
  return { ctx, page, errors, goto, toast, shot };
}

/** Confirms the demo payment dialog with its button (Pay / Save card / Start free week / Give). */
async function confirmPayment(page, button) {
  await page.waitForSelector('.pay-sheet');
  const btn = page.locator('.pay-sheet .btn.block');
  const label = (await btn.innerText()).trim();
  await btn.click();
  await page.waitForSelector('.pay-sheet', { state: 'detached', timeout: 6000 });
  return !button || label === button ? true : label;
}

(async () => {
  const browser = await chromium.launch();
  try {
    /* ---------------- the demo account: creator, Plus, verified ---------------- */
    const A = await open(browser);
    const { page, goto, toast } = A;

    // Insights
    await goto('/dashboard');
    await page.waitForSelector('.pro-tile');
    check('the dashboard is titled Professional dashboard', (await page.locator('.pro-title').innerText()) === 'Professional dashboard');
    check('pill tabs: Insights, Ad tools and Fundraisers', (await page.locator('.pro-tabs .pro-pill').allInnerTexts()).map((t) => t.trim()).join() === 'Insights,Ad tools,Fundraisers');
    check('Insights shows six tiles', (await page.locator('.pro-tile').count()) === 6);
    const labels = (await page.locator('.pro-tile-label').allInnerTexts()).join('|');
    check('the tiles are views, reach, followers, content, likes and comments', ['Views', 'Accounts reached', 'Followers gained', 'Content shared', 'Likes', 'Comments'].every((x) => labels.includes(x)), labels);
    check('the views and followers chart is drawn', (await page.locator('.pro-card .chart svg path').count()) >= 2);
    await page.locator('.pro-legend button', { hasText: 'New followers' }).click();
    await page.waitForTimeout(300);
    check('the chart switches to new followers', (await page.locator('.pro-card').first().innerText()).includes('new follower'));
    const range30 = await page.locator('.pro-ins-head p').innerText();
    await page.getByRole('tab', { name: 'Last 7 days' }).click();
    await page.waitForTimeout(900);
    check('the period changes the dates shown', (await page.locator('.pro-ins-head p').innerText()) !== range30);
    check('top content and the monthly recap are shown', (await page.locator('.pro-top').count()) >= 1 && (await page.locator('.pro-recap-banner').innerText()).includes('Your '));
    await page.getByRole('tab', { name: 'Last 30 days' }).click();
    await page.waitForTimeout(600);
    await A.shot('pro-01-insights-dark');

    // The Insights menu
    await page.locator('.pro-tabs .pro-pill', { hasText: 'Insights' }).click();
    const items = (await page.locator('.pro-menu [role=menuitemradio]').allInnerTexts()).map((t) => t.trim()).join();
    check('Insights opens a menu of Overview, Content, Audience and Income', items === 'Overview,Content,Audience,Income', items);
    await page.getByRole('menuitemradio', { name: 'Content' }).click();
    await page.waitForTimeout(700);
    check('Content opens its own page', (await page.evaluate(() => location.hash)) === '#/dashboard/content' && (await page.locator('.pro-ins-head h2').innerText()) === 'Content');
    check('Content lists posts with their views', (await page.locator('.pro-table tbody tr').count()) >= 1);
    await page.locator('.pro-tabs .pro-pill', { hasText: 'Insights' }).click();
    await page.getByRole('menuitemradio', { name: 'Audience' }).click();
    await page.waitForTimeout(700);
    check('Audience shows followers over time and new followers', (await page.locator('.pro-card-head h3').allInnerTexts()).join().includes('Followers over time') && (await page.locator('.pro-person').count()) >= 1);
    await page.locator('.pro-tabs .pro-pill', { hasText: 'Insights' }).click();
    await page.getByRole('menuitemradio', { name: 'Income' }).click();
    await page.waitForTimeout(900);
    const income = await page.locator('.pro-tiles').innerText();
    check('Income shows subscribers, monthly income, fundraisers and Plus', income.includes('Subscribers') && income.includes('£5.98') && income.includes('Raised by your fundraisers') && income.includes('Active'), income.replace(/\n/g, ' '));

    // Ad tools
    await page.locator('.pro-tabs .pro-pill', { hasText: 'Ad tools' }).click();
    await page.waitForTimeout(800);
    check('Ad tools opens /dashboard/ads', (await page.evaluate(() => location.hash)) === '#/dashboard/ads');
    check('"Ad tools has a new look" shows the first time', (await page.locator('.pro-newlook h2').innerText()) === 'Ad tools has a new look');
    await A.shot('pro-02-newlook-dark');
    await page.getByRole('button', { name: 'Got it' }).click();
    await page.locator('.pro-tabs .pro-pill', { hasText: 'Insights' }).hover();
    await page.waitForTimeout(300);
    check('hovering Insights explains it', (await page.locator('.pro-tip').evaluate((el) => getComputedStyle(el).opacity)) === '1' && (await page.locator('.pro-tip').innerText()) === 'See how your content is performing.');
    await page.reload();
    await page.waitForSelector('.pro-ads-table');
    await page.waitForTimeout(500);
    check('the new look note is remembered once dismissed', (await page.locator('.pro-newlook').count()) === 0);
    const head = (await page.locator('.pro-ads-table thead').innerText()).replace(/\s+/g, ' ');
    check('the ads table has Ads, Views, Ad goal, Spend, Status and Ends', ['Ads', 'Views', 'Ad goal', 'Spend', 'Status', 'Ends'].every((x) => head.includes(x)), head);
    check('my earlier ads are listed', (await page.locator('.pro-ad-row').count()) === 2);
    await page.locator('.pro-filters .pro-pill', { hasText: 'All ads' }).click();
    await page.getByRole('menuitemradio', { name: 'Refunded' }).click();
    await page.waitForTimeout(300);
    check('the Refunded filter shows the refunded ad', (await page.locator('.pro-ad-row').count()) === 1 && (await page.locator('.pro-ad-row .pro-tag').innerText()) === 'Refunded');
    await page.locator('.pro-filters .pro-pill', { hasText: 'Refunded' }).click();
    await page.getByRole('menuitemradio', { name: 'Active' }).click();
    await page.waitForTimeout(300);
    check('no active ads yet: the filter says so', (await page.locator('.pro-ad-row').count()) === 0 && (await page.locator('.pro-empty h3').innerText()) === 'No active ads');

    // Promote the top post
    check('Your current top post is offered', (await page.locator('.pro-next').first().innerText()).includes('Your current top post'));
    await page.locator('.pro-next').first().click();
    await page.waitForSelector('.pro-promo-post');
    check('promoting opens the top post', (await page.locator('.pro-promo-post').innerText()).includes('Soft morning on the dunes'));
    await page.getByRole('radio', { name: '3 days' }).click();
    check('the total follows the days chosen', (await page.locator('.pro-total strong').innerText()) === '£3.00');
    await page.getByRole('button', { name: 'One day more' }).click();
    await page.getByRole('button', { name: 'One day more' }).click();
    await page.getByRole('button', { name: 'One day more' }).click();
    await page.getByRole('button', { name: 'One day more' }).click();
    check('the stepper adds days one at a time', (await page.locator('.pro-total strong').innerText()) === '£7.00' && (await page.locator('.pro-stepper b').innerText()) === '7 days');
    check('the one-off terms are beside the button', (await page.locator('.pro-modal .pro-terms').innerText()) === "£7.00, one-off. It doesn't renew.");
    await A.shot('pro-03-promote-dark');
    await page.getByRole('button', { name: 'Pay £7.00' }).click();
    check('the card payment dialog asks for £7.00', (await confirmPayment(page, 'Pay £7.00')) === true);
    check('the ad starts once paid', await toast('Your post is being promoted'));
    await page.waitForTimeout(600);
    check('the new ad is listed as Active', (await page.locator('.pro-ad-row').count()) === 1 && (await page.locator('.pro-ad-row .pro-tag').innerText()) === 'Active');
    await page.locator('.pro-filters .pro-pill', { hasText: 'Active' }).click();
    await page.getByRole('menuitemradio', { name: 'All ads' }).click();
    await page.locator('.pro-filters .pro-pill', { hasText: 'Latest' }).click();
    await page.getByRole('menuitemradio', { name: 'Most spent' }).click();
    await page.waitForTimeout(300);
    const spends = await page.locator('.pro-ad-row td:nth-child(4)').allInnerTexts();
    check('sorting by Most spent puts the £7.00 ad first', spends[0] === '£7.00' && spends.length === 3, spends.join());
    await page.locator('.pro-filters .pro-pill', { hasText: 'Most spent' }).click();
    await page.getByRole('menuitemradio', { name: 'Oldest' }).click();
    await page.waitForTimeout(300);
    check('sorting by Oldest puts the ended ad first', (await page.locator('.pro-ad-row .pro-tag').first().innerText()) === 'Ended');
    await page.locator('.pro-filters .pro-pill', { hasText: 'Columns' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Ad goal' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Days' }).click();
    await page.keyboard.press('Escape');
    const head2 = await page.locator('.pro-ads-table thead').innerText();
    check('Columns hides Ad goal and adds Days', !head2.includes('Ad goal') && head2.includes('Days'));
    await A.shot('pro-04-ads-dark');

    // Billing: add a card (a setup intent), then remove it
    const cards = page.locator('.pro-aside .pro-card-row');
    check('my saved card is shown with Default', (await cards.count()) === 1 && (await cards.first().innerText()).includes('Default'));
    await page.locator('.pro-aside .pro-cards').getByRole('button', { name: 'Add card' }).click();
    check('adding a card saves it without charging', (await confirmPayment(page, 'Save card')) === true);
    check('the card is saved', await toast('Card saved'));
    await page.waitForTimeout(300);
    check('two cards are listed', (await cards.count()) === 2 && (await cards.nth(1).innerText()).includes('Mastercard •••• 4444'));
    await page.getByRole('button', { name: 'Options for Mastercard •••• 4444' }).click();
    await page.locator('.choices button', { hasText: 'Remove card' }).click();
    await page.locator('.choices.confirm button', { hasText: 'Remove' }).click();
    check('removing a card asks first, then removes it', await toast('Card removed'));
    await page.waitForTimeout(300);
    check('one card is left', (await cards.count()) === 1);
    await page.locator('.pro-link-row', { hasText: 'Billing and payments' }).click();
    await page.waitForSelector('.pro-billing .pro-table tbody tr');
    check('payment history lists the ad just paid for', /Ad\s+7 days[\s\S]*£7\.00/.test(await page.locator('.pro-billing .pro-table tbody tr').first().innerText()));
    await A.shot('pro-05-billing-dark');

    // Plus settings: hide my tick
    await goto('/plus');
    await page.waitForSelector('.pro-plan');
    check('Plus shows my plan and when it renews', (await page.locator('.pro-box-row').innerText()).includes('Renews on'));
    const tick = page.getByRole('switch', { name: 'Hide my tick' });
    await tick.click();
    check('hiding my tick says I am still verified', await toast('Your tick is hidden'));
    check('the switch shows the tick is hidden', (await tick.getAttribute('aria-checked')) === 'true');
    await tick.click();
    check('and it shows again', await toast('Your tick shows again'));
    check('Plus links to profile style and profile viewers', (await page.locator('.pro-box-link', { hasText: 'Profile style' }).getAttribute('href')) === '#/u/you?style=1' && (await page.locator('.pro-box-link', { hasText: 'Profile viewers' }).count()) === 1);

    // Give £10 anonymously
    await goto('/fundraisers/fr1');
    await page.waitForSelector('.pro-raised');
    check('the fundraiser shows what has been raised', (await page.locator('.pro-raised strong').innerText()) === '£195.00');
    check('anonymous gifts say Anonymous', (await page.locator('.pro-supporters').innerText()).includes('Anonymous'));
    await page.getByRole('button', { name: 'Donate' }).click();
    await page.waitForSelector('.pro-presets');
    check('the gift dialog starts on £10', (await page.getByRole('radio', { name: '£10' }).getAttribute('aria-checked')) === 'true');
    await page.getByRole('radio', { name: '£5', exact: true }).click();
    await page.getByRole('radio', { name: '£10', exact: true }).click();
    await page.getByRole('switch', { name: 'Give anonymously' }).click();
    await A.shot('pro-06-donate-dark');
    await page.getByRole('button', { name: 'Continue · £10.00' }).click();
    check('the gift is paid by card', (await confirmPayment(page, 'Give £10.00')) === true);
    await page.waitForSelector('.pro-thanks');
    check('a thank-you follows the gift', (await page.locator('.pro-thanks h2').innerText()) === 'Thank you for your gift');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForTimeout(800);
    check('the total includes the gift', (await page.locator('.pro-raised strong').innerText()) === '£205.00');
    const first = await page.locator('.pro-supporters li').first().innerText();
    check('the gift tops the supporters, anonymously', first.includes('Anonymous') && first.includes('£10.00'), first.replace(/\n/g, ' '));
    await page.getByRole('button', { name: 'Share' }).click();
    check('Share copies the link', await toast('Link copied').then((ok) => ok || page.locator('.toast', { hasText: '#/fundraisers/fr1' }).count().then((n) => n > 0)));

    // Start a fundraiser, set up payouts, end it
    await goto('/dashboard/fundraisers');
    await page.locator('a.btn', { hasText: 'Start a fundraiser' }).click();
    await page.waitForSelector('.pro-cover-pick');
    await page.locator('input[type=file][aria-label="Cover photo"]').setInputFiles(path.join(MEDIA, '05.jpg'));
    await page.waitForSelector('.pro-cover-pick img');
    await page.locator('.form-row', { hasText: 'Title' }).locator('input').fill('Youth camp bus');
    await page.getByLabel('Goal in pounds').fill('2,500');
    await page.locator('.form-row', { hasText: 'Story' }).locator('textarea').fill('A minibus for Pathfinder trips.');
    await page.getByRole('radio', { name: '30 days' }).click();
    await A.shot('pro-07-new-fundraiser-dark');
    await page.getByRole('button', { name: 'Start fundraiser' }).click();
    await page.waitForSelector('.pro-verify-done');
    check('a new fundraiser without payouts asks to set them up', (await page.locator('.pro-verify-done').innerText()).includes('Set up payouts to start receiving donations'));
    await page.getByRole('button', { name: 'View fundraiser' }).click();
    await page.waitForSelector('.pro-fund-main h1');
    check('the new fundraiser has its page', (await page.locator('.pro-fund-main h1').innerText()) === 'Youth camp bus' && (await page.locator('.pro-raised').innerText()).includes('£2500.00'));
    check('its cover photo was uploaded', (await page.locator('.pro-fund-cover img').count()) === 1);
    check('the owner sees it is not taking donations yet', (await page.locator('.pro-notice.warn').innerText()).includes('Not taking donations yet'));
    await page.locator('.pro-notice').getByRole('button', { name: 'Set up payouts' }).click();
    await page.locator('.pro-modal .pro-payouts').getByRole('button', { name: 'Set up payouts' }).click();
    await page.waitForTimeout(900);
    check('setting up payouts finishes (in the demo)', (await page.locator('.pro-modal .pro-payout-status').innerText()).includes('Payouts enabled'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    check('the fundraiser can take donations now', (await page.locator('.pro-notice.warn').count()) === 0);
    await page.getByRole('button', { name: 'End fundraiser' }).click();
    await page.locator('.choices.confirm button', { hasText: 'End fundraiser' }).click();
    check('ending it asks first', await toast('Fundraiser ended'));
    await page.waitForTimeout(500);
    check('the fundraiser shows it has ended', (await page.locator('.pro-fund-ended').innerText()).startsWith('This fundraiser has ended'));
    await goto('/dashboard/fundraisers');
    await page.waitForSelector('.pro-fund-row');
    check('the Fundraisers tab lists it as Ended', (await page.locator('.pro-fund-row', { hasText: 'Youth camp bus' }).innerText()).includes('Ended'));

    check('no script errors (demo account)', A.errors.length === 0, A.errors.join(' | '));
    await A.ctx.close();

    /* ---------------- Ruth: no ads, no Plus, not verified ---------------- */
    const B = await open(browser, { as: 'u_ruth' });
    await B.goto('/dashboard/ads');
    await B.page.waitForSelector('.pro-newlook');
    await B.page.getByRole('button', { name: 'Got it' }).click();
    await B.page.waitForSelector('.pro-empty');
    check('an account with no ads sees No ads available', (await B.page.locator('.pro-empty h3').innerText()) === 'No ads available' && (await B.page.locator('.pro-empty p').innerText()) === 'Ads that you create will appear here.');
    await B.shot('pro-08-no-ads-dark');

    // Plus: yearly with the free week, then cancel and resume
    await B.goto('/plus');
    await B.page.waitForSelector('.pro-plan');
    check('a new member is offered a free week', (await B.page.locator('.pro-plus-hero h1').innerText()).includes('free for one week'));
    await B.page.getByRole('radio', { name: /Yearly/ }).click();
    check('the renewal terms sit beside the button', (await B.page.locator('.pro-plan-box .pro-terms').first().innerText()).startsWith('Free for 7 days, then £49.99 a year · Renews automatically until cancelled'));
    await B.shot('pro-09-plus-offer-dark');
    await B.page.getByRole('button', { name: 'Try for £0.00' }).click();
    check('the free week saves a card without charging', (await confirmPayment(B.page, 'Start free week')) === true);
    check('the free week starts', await B.toast('Your free week has started'));
    await B.page.waitForSelector('.pro-plus-have');
    const sub = await B.page.locator('.pro-box-row').innerText();
    check('Plus is on, yearly, in the free week', sub.includes('Yearly') && sub.includes('Free week ends on'), sub.replace(/\n/g, ' '));
    await B.page.getByRole('button', { name: 'Cancel subscription' }).click();
    check('cancelling explains nothing is charged', (await B.page.locator('.choices.confirm').innerText()).includes("You won't be charged"));
    await B.page.locator('.choices.confirm button', { hasText: 'Cancel subscription' }).click();
    check('cancelling keeps Plus to the end of the week', await B.toast('Plus will end on'));
    check('the subscription says when it ends', (await B.page.locator('.pro-sub-line').innerText()).startsWith('Ends on'));
    await B.page.getByRole('button', { name: 'Resume subscription' }).click();
    await B.page.locator('.choices.confirm button', { hasText: 'Resume' }).click();
    check('resuming renews as normal', await B.toast('Plus will renew as normal'));
    check('the free week carries on', (await B.page.locator('.pro-sub-line').innerText()).startsWith('Free week ends on'));
    await B.shot('pro-10-plus-member-dark');

    // The tick application with two photos
    await B.goto('/verify');
    await B.page.waitForSelector('.pro-paths');
    check('verification offers the free notable path and the Plus path', (await B.page.locator('.pro-path h3').allInnerTexts()).join() === 'Apply as a notable account,Get verified with Community Plus');
    await B.page.getByRole('button', { name: 'Apply', exact: true }).click();
    await B.page.locator('.form-row', { hasText: 'Full legal name' }).locator('input').fill('Ruth Asante');
    await B.page.getByRole('radio', { name: 'Passport' }).click();
    await B.page.getByRole('button', { name: 'Next' }).click();
    check('the form asks for the document photo first', (await B.page.locator('.pro-verify-foot .form-error').innerText()) === 'Add a photo of your document.');
    await B.page.locator('input[type=file][aria-label="Document photo"]').setInputFiles(path.join(MEDIA, '09.jpg'));
    await B.page.locator('input[type=file][aria-label="Selfie"]').setInputFiles(path.join(MEDIA, '04.jpg'));
    await B.page.waitForFunction(() => document.querySelectorAll('.pro-drop-zone img').length === 2);
    check('both photos show a preview', (await B.page.locator('.pro-drop-zone img').count()) === 2);
    await B.shot('pro-11-verify-dark');
    await B.page.getByRole('button', { name: 'Next' }).click();
    await B.page.getByRole('radio', { name: 'Musician or choir' }).click();
    await B.page.getByLabel('Country or region').fill('Ghana');
    await B.page.getByLabel('Who follows you and why?').fill('Health ministry members follow my plant-based recipes and talks.');
    await B.page.getByRole('button', { name: 'Next' }).click();
    check('the review shows both photos', (await B.page.locator('.pro-review-photos img').count()) === 2);
    await B.page.getByRole('button', { name: 'Send request' }).click();
    await B.page.waitForSelector('.pro-verify-done', { timeout: 8000 });
    check('the request is sent', (await B.page.locator('.pro-verify-done h2').innerText()) === 'Request sent');
    await B.goto('/');
    await B.goto('/verify');
    await B.page.waitForSelector('.pro-verify-done');
    check('coming back shows the request is being reviewed', (await B.page.locator('.pro-verify-done h2').innerText()) === 'Your request is being reviewed' && (await B.page.locator('.pro-requests .pro-tag').first().innerText()) === 'Waiting for review');
    check('no script errors (Ruth)', B.errors.length === 0, B.errors.join(' | '));
    await B.ctx.close();

    /* ---------------- White ---------------- */
    if (SHOTS) {
      const W = await open(browser, { theme: 'white' });
      check('White is applied', (await W.page.evaluate(() => document.documentElement.dataset.theme)) === 'white');
      await W.goto('/dashboard');
      await W.page.waitForSelector('.pro-tile');
      await W.page.waitForTimeout(500);
      await W.shot('pro-12-insights-white');
      await W.goto('/dashboard/ads');
      await W.page.waitForSelector('.pro-newlook');
      await W.shot('pro-13-newlook-white');
      await W.page.getByRole('button', { name: 'Got it' }).click();
      await W.page.waitForTimeout(400);
      await W.shot('pro-14-ads-white');
      await W.page.locator('.pro-next').nth(1).click();
      await W.page.waitForSelector('.pro-pick');
      await W.page.waitForTimeout(500);
      await W.shot('pro-15-create-ad-white');
      await W.page.keyboard.press('Escape');
      await W.goto('/plus');
      await W.page.waitForSelector('.pro-plan');
      await W.shot('pro-16-plus-white');
      await W.goto('/fundraisers/fr1');
      await W.page.waitForSelector('.pro-raised');
      await W.shot('pro-17-fundraiser-white');
      await W.goto('/dashboard/income');
      await W.page.waitForSelector('.pro-tile');
      await W.shot('pro-18-income-white');
      check('no script errors (White)', W.errors.length === 0, W.errors.join(' | '));
      await W.ctx.close();
      const V = await open(browser, { as: 'u_ruth', theme: 'white' });
      await V.goto('/verify');
      await V.page.waitForSelector('.pro-paths');
      await V.shot('pro-19-verify-white');
      await V.goto('/plus');
      await V.page.waitForSelector('.pro-plan');
      await V.shot('pro-20-plus-offer-white');
      await V.ctx.close();
    }
  } catch (e) {
    console.log('TEST CRASHED: ' + e.message);
    failed++;
  }
  await browser.close();
  console.log(failed ? `${failed} CHECK(S) FAILED` : 'ALL PRO CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})();
