// The profile: your own (header, buttons, the options menu, tabs, the portrait grid, Discover people,
// highlights and editing them, Profile style) and other people's (Follow, Message, Subscribe and
// managing it, the bell, About this account, the fundraiser card, Remind me, Report, Block, a live
// broadcast, hidden lists, private accounts and the under-14 rules), in Dark and White.
// Usage: node tests/profile.test.cjs http://127.0.0.1:8801/ [screenshot dir]
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:8801/';
const SHOTS = process.argv[3] || '';
const MEDIA = path.join(__dirname, '../src/fake/media');
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || extra === '' ? '' : ' (' + extra + ')'));
  if (!ok) failed++;
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    return u.startsWith(BASE) || u.startsWith('blob:') || u.startsWith('data:') ? r.continue() : r.abort();
  });
  const wait = (ms = 400) => page.waitForTimeout(ms);
  const goto = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await wait(900);
  };
  const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
  // The demo's in-memory tables (src/fake/ext/profile.ts hands them to the test).
  const rows = (table) => page.evaluate((t) => JSON.parse(JSON.stringify(window.__profileDemo.T(t))), table);
  const patch = (table, id, change) =>
    page.evaluate(({ table, id, change }) => {
      const d = window.__profileDemo;
      Object.assign(d.T(table).find((r) => r.id === id), change);
      d.announce('profile');
    }, { table, id, change });
  const toast = (text) => page.locator('.toast').filter({ hasText: text }).first().waitFor({ timeout: 4000 }).then(() => true, () => false);
  const head = page.locator('.prof-head');
  const actions = page.locator('.prof-actions');

  try {
    await page.goto(BASE);
    await page.waitForSelector('.feed-post');

    /* ---------- your own profile ---------- */
    await goto('/u/you');
    await page.waitForSelector('.prof-head h1');
    check('my profile shows my username with the tick', (await head.locator('h1').innerText()).trim() === 'you' && (await head.locator('h1 .verified').count()) === 1);
    check('the counts read posts, followers and following', /2\s+posts\s+3\s+followers\s+6\s+following/.test((await page.locator('.prof-stats').innerText()).replace(/\n/g, ' ')), await page.locator('.prof-stats').innerText());
    check('the picture is 150 points', (await page.locator('.prof-pic .avatar').evaluate((el) => el.getBoundingClientRect().width)) === 150);
    check('my category shows under the counts', (await page.locator('.prof-category').innerText()).includes('Youth leader'));
    check('Plus members see their profile views', (await page.locator('.prof-views').innerText()).includes('profile views this week'));
    check('Edit profile and View archive are wide buttons', (await actions.getByRole('button', { name: 'Edit profile' }).evaluate((el) => el.getBoundingClientRect().width)) > 250 && (await actions.getByRole('button', { name: 'View archive' }).count()) === 1);
    await actions.getByRole('button', { name: 'Edit profile' }).click();
    await wait(500);
    check('Edit profile opens the settings', (await page.evaluate(() => location.hash)) === '#/accounts/edit');
    await goto('/u/you');
    await actions.getByRole('button', { name: 'View archive' }).click();
    await wait(500);
    check('View archive opens the archive', (await page.evaluate(() => location.hash)) === '#/archive');
    await goto('/u/you');

    // The options (gear) menu
    await head.getByRole('button', { name: 'Options' }).click();
    const gear = (await page.locator('.choices button').allInnerTexts()).map((t) => t.trim());
    check('the gear menu offers settings, Profile style, archive, activity and Log out', ['Settings and privacy', 'Profile style', 'Archive', 'Your activity', 'About this account', 'Copy profile link', 'Log out'].every((x) => gear.includes(x)), gear.join(','));
    await page.locator('.choices').getByRole('button', { name: 'Your activity' }).click();
    await wait(500);
    check('Your activity opens from the gear', (await page.evaluate(() => location.hash)) === '#/activity');
    await goto('/u/you');

    // Tabs and the grid
    const tabs = page.locator('.prof-tabs [role=tab]');
    check('five icon tabs on my own profile', (await tabs.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).join() === 'Posts,Shorts,Saved,Reposts,Tagged');
    check('the tabs are icons only', (await page.locator('.prof-tabs').innerText()).trim() === '');
    check('Posts is the open tab', (await page.locator('.prof-tab.on').getAttribute('aria-label')) === 'Posts');
    await page.waitForSelector('.prof-grid .tile');
    check('my posts show in the grid', (await page.locator('.prof-grid .tile').count()) === 2);
    check('the grid has three columns', (await page.locator('.prof-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)) === 3);
    const ratio = await page.locator('.prof-grid .tile').first().evaluate((el) => el.clientWidth / el.clientHeight);
    check('tiles are portrait 3:4', Math.abs(ratio - 0.75) < 0.02, ratio.toFixed(3));
    const gap = await page.locator('.prof-grid').evaluate((el) => parseFloat(getComputedStyle(el).columnGap));
    check('tiles have small gaps', gap > 0 && gap <= 4, gap);
    await page.locator('.prof-tab[aria-label=Tagged]').click();
    await wait(800);
    check('the Tagged tab has its own address', (await page.evaluate(() => location.hash)) === '#/u/you/tagged');
    await page.waitForSelector('.prof-grid .tile');
    // Two sample posts tag me, and the posts area's sample post with tags (pp_tags) a third.
    check('Tagged shows the posts I am tagged in', (await page.locator('.prof-grid .tile').count()) === 3, await page.locator('.prof-grid .tile').count());
    await goto('/u/you/shorts');
    check('Shorts is the open tab at /shorts', (await page.locator('.prof-tab.on').getAttribute('aria-label')) === 'Shorts');
    check('my empty Shorts tab invites me to share one', (await page.locator('.pp-first').getAttribute('aria-label')) === 'Share your first Short');
    await goto('/u/you/reposts');
    check('an empty Reposts tab says so', (await page.locator('.empty h2').innerText()) === 'No reposts yet');
    await goto('/u/you/saved');
    await page.waitForSelector('.prof-grid .tile');
    check('Saved shows what I saved', (await page.locator('.prof-grid .tile').count()) >= 1);
    await goto('/u/you');
    await page.waitForSelector('.prof-grid .tile');
    await page.locator('.prof-grid .tile').first().click();
    await page.waitForSelector('.post-dialog');
    check('a tile opens the post', true);
    await page.keyboard.press('Escape');
    await wait();

    // Discover people
    await page.waitForSelector('.prof-discover .prof-dcard');
    check('Discover people shows on my profile', (await page.locator('.prof-dcard').count()) >= 1);
    const card = page.locator('.prof-dcard').first();
    check('a suggestion has a name and a reason', (await card.locator('.prof-dcard-why').innerText()).length > 0);
    const who = (await card.locator('.prof-dcard-name').innerText()).trim();
    await card.getByRole('button', { name: /^Follow/ }).click();
    await wait(600);
    check('Follow on a suggestion follows them', (await card.getByRole('button', { name: 'Following' }).count()) === 1 && (await rows('community_follows')).some((f) => f.follower_id === 'demo_me' && f.following_id === 'u_esther'), who);
    await card.getByRole('button', { name: /^Stop suggesting/ }).click();
    await wait(600);
    check('the X stops suggesting them', (await page.locator('.prof-dcard').filter({ hasText: who }).count()) === 0 && (await rows('community_suggestion_dismissals')).some((d) => d.user_id === 'demo_me'));
    check('See all goes to the suggestions page', (await page.locator('.prof-discover').getByRole('link', { name: 'See all' }).getAttribute('href')) === '#/explore/people');
    await page.getByRole('button', { name: 'Close Discover people' }).click();
    check('Discover people can be closed', (await page.locator('.prof-discover').count()) === 0);
    await actions.getByRole('button', { name: 'Discover people' }).click();
    check('and opened again from the person button', (await page.locator('.prof-discover').count()) === 1);

    // Highlights
    check('my highlights end with New', (await page.locator('.prof-hl-row .highlight').allInnerTexts()).map((t) => t.trim()).join() === 'Sabbath,New');
    await page.locator('.highlight', { hasText: 'Sabbath' }).click();
    await page.waitForSelector('.story-stage');
    check('a highlight opens in the story viewer', (await page.locator('.story-stage .bars span').count()) === 2);
    await page.keyboard.press('Escape');
    await wait();
    await page.locator('.highlight', { hasText: 'Sabbath' }).click({ button: 'right' });
    await page.waitForSelector('.prof-hl-edit .prof-hl-story');
    check('right-clicking my highlight opens the editor', (await page.locator('.prof-hl-edit .prof-hl-story').count()) === 2);
    await page.getByLabel('Highlight title').fill('Sabbath days');
    await page.locator('.prof-hl-edit').getByRole('button', { name: 'Edit cover' }).first().click();
    check('the cover can be chosen from its stories', (await page.locator('.prof-cover-choice').count()) === 2);
    await page.locator('.prof-cover-choice[aria-checked=false]').click();
    check('picking a story picture makes it the cover', (await page.locator('.prof-cover-choice').nth(1).getAttribute('aria-checked')) === 'true');
    await page.locator('.prof-hl-edit').getByRole('button', { name: /^Remove the story/ }).first().click();
    check('a story can be taken out', (await page.locator('.prof-hl-story.out').count()) === 1);
    await page.setInputFiles('input[aria-label="Upload a cover photo"]', path.join(MEDIA, '11.jpg'));
    await page.waitForFunction(() => document.querySelector('.prof-hl-edit-top img')?.getAttribute('src')?.startsWith('blob:'), null, { timeout: 5000 }).catch(() => {});
    check('Plus members can upload their own cover', ((await page.locator('.prof-hl-edit-top img').getAttribute('src')) || '').startsWith('blob:'));
    await shot('profile-highlight-editor-dark');
    await page.locator('.prof-hl-edit-foot').getByRole('button', { name: 'Save' }).click();
    check('saving the highlight confirms', await toast('Highlight saved'));
    await wait(600);
    const h1 = (await rows('community_highlights')).find((h) => h.id === 'h1');
    check('the highlight is renamed with its new cover', h1.title === 'Sabbath days' && h1.cover_url.startsWith('blob:'));
    check('the story taken out is gone from it', (await rows('community_highlight_items')).filter((i) => i.highlight_id === 'h1').length === 1);
    check('the row shows the new name', (await page.locator('.highlight', { hasText: 'Sabbath days' }).count()) === 1);
    await page.locator('.prof-hl', { hasText: 'Sabbath days' }).hover();
    await page.getByRole('button', { name: 'Edit Sabbath days' }).click();
    await page.waitForSelector('.prof-hl-edit');
    await page.locator('.prof-hl-edit-foot').getByRole('button', { name: 'Delete highlight' }).click();
    await page.locator('.confirm').getByRole('button', { name: 'Delete' }).click();
    check('a highlight can be deleted', await toast('Highlight deleted'));
    await wait(600);
    check('and leaves the row', (await page.locator('.highlight', { hasText: 'Sabbath' }).count()) === 0);
    await page.locator('.highlight', { hasText: 'New' }).click();
    await wait(500);
    check('New goes to the archive, where highlights are made', (await page.evaluate(() => location.hash)) === '#/archive');
    await goto('/u/you');

    // Profile style (Plus)
    await head.getByRole('button', { name: 'Options' }).click();
    await page.locator('.choices').getByRole('button', { name: 'Profile style' }).click();
    await page.waitForSelector('.prof-style');
    check('Profile style offers every ring colour and theme', (await page.locator('.prof-swatch').count()) === 9 && (await page.locator('.prof-theme-card').count()) === 8);
    await page.getByRole('radio', { name: 'Rose ring' }).click();
    await page.getByRole('radio', { name: 'Ocean theme' }).click();
    check('the preview takes the theme', (await page.locator('.prof-style-band.on').count()) === 1);
    await wait(300);
    await shot('profile-style-dark');
    await page.locator('.prof-style-foot').getByRole('button', { name: 'Save' }).click();
    check('saving the profile style confirms', await toast('Profile style saved'));
    await wait(800);
    const mine = (await rows('community_profiles')).find((p) => p.id === 'demo_me');
    check('the ring colour and theme are saved', mine.ring_color === 'rose' && mine.profile_theme === 'ocean');
    check('my profile now wears the theme', (await page.locator('.prof-head.prof-band').count()) === 1);
    await shot('profile-own-themed-dark');

    // Without Plus: the dialog explains Plus instead
    await patch('community_profiles', 'demo_me', { plus_until: null });
    await wait(600);
    await head.getByRole('button', { name: 'Options' }).click();
    await page.locator('.choices').getByRole('button', { name: 'Profile style' }).click();
    await page.waitForSelector('.prof-style');
    check('without Plus, Profile style offers Community Plus', (await page.locator('.prof-style .prof-upsell').getByRole('button', { name: 'Get Community Plus' }).count()) === 1 && (await page.locator('.prof-style-foot').count()) === 0);
    await page.getByRole('radio', { name: 'Gold ring' }).click();
    check('and choices say they are part of Plus', await toast('Profile style is part of Community Plus'));
    await page.locator('.prof-style').getByRole('button', { name: 'Get Community Plus' }).click();
    await wait(500);
    check('the upsell opens Plus', (await page.evaluate(() => location.hash)) === '#/plus');
    await page.evaluate(() => {
      const d = window.__profileDemo;
      d.T('community_profiles').find((p) => p.id === 'demo_me').plus_until = new Date(Date.now() + 20 * 86400e3).toISOString();
      d.announce('profile');
    });
    await goto('/u/you');

    /* ---------- someone else's profile ---------- */
    await goto('/u/grace_mensah');
    await page.waitForSelector('.prof-head h1');
    check("Grace's Plus theme draws its band", (await page.locator('.prof-head.prof-band').count()) === 1);
    const ringStyle = await page.locator('.prof-pic .prof-ring').getAttribute('style');
    check('her ring wears her Plus colour (gold) for a new story', (await page.locator('.prof-pic .prof-ring.story').count()) === 1 && /#f5b40b/i.test(ringStyle || ''), ringStyle);
    check('Following, Message, Subscribe and the bell show', (await actions.getByRole('button', { name: /^Following/ }).count()) === 1 && (await actions.getByRole('button', { name: 'Message' }).count()) === 1 && (await actions.getByRole('button', { name: 'Subscribe' }).count()) === 1 && (await actions.getByRole('button', { name: /^Notifications from/ }).count()) === 1);
    check('no gear on someone else, but a … menu', (await head.getByRole('button', { name: 'Options', exact: true }).count()) === 0 && (await head.getByRole('button', { name: 'More options' }).count()) === 1);
    check('the bio links @mentions', (await page.locator('.prof-bio a.prof-link').getAttribute('href')) === '#/u/daniel_owusu');
    check('the website shows', (await page.locator('.prof-website').innerText()).includes('hillside.church/choir'));
    check('a Saved tab only on your own profile', (await page.locator('.prof-tabs [role=tab]').count()) === 4);

    // Fundraiser card
    const fund = page.locator('.prof-fund');
    check('the fundraiser card shows title, progress and raised of goal', (await fund.innerText()).includes('New choir robes') && (await fund.innerText()).includes('raised of') && (await fund.locator('[role=progressbar]').getAttribute('aria-valuenow')) === '13');
    await fund.getByRole('button', { name: 'Donate' }).click();
    await wait(500);
    check('Donate opens the fundraiser', (await page.evaluate(() => location.hash)) === '#/fundraisers/fr1');
    await goto('/u/grace_mensah');

    // Upcoming lives with Remind me
    await page.waitForSelector('.prof-live-card');
    check('her planned lives are listed', (await page.locator('.prof-live-card').count()) === 2 && (await page.locator('.prof-live-card').first().innerText()).includes('Tomorrow'));
    await page.locator('.prof-live-card').first().getByRole('button', { name: 'Remind me' }).click();
    check('Remind me sets a reminder', await toast("You'll be told when it starts"));
    check('the reminder is saved', (await rows('community_live_reminders')).some((r) => r.schedule_id === 'ls1' && r.user_id === 'demo_me') && (await page.locator('.prof-live-card').first().getByRole('button', { name: 'Reminder set' }).count()) === 1);
    await page.locator('.prof-live-card').first().getByRole('button', { name: 'Reminder set' }).click();
    check('pressing it again removes it', await toast('Reminder removed'));
    await wait(400);
    check('and the reminder is gone', !(await rows('community_live_reminders')).some((r) => r.schedule_id === 'ls1'));

    // The bell
    await actions.getByRole('button', { name: /^Notifications from/ }).click();
    await page.waitForSelector('.prof-alert-row');
    check('the bell offers posts, stories, Shorts and live videos', (await page.locator('.prof-alert-row').allInnerTexts()).map((t) => t.trim()).join() === 'Posts,Stories,Shorts,Live videos');
    await page.getByRole('switch', { name: 'Posts from grace_mensah' }).click({ force: true });
    await page.getByRole('switch', { name: 'Live videos from grace_mensah' }).click({ force: true });
    await wait(700);
    const alerts = (await rows('community_follow_alerts')).find((a) => a.user_id === 'demo_me' && a.target_id === 'u_grace');
    check('the switches are saved', !!alerts && alerts.posts === true && alerts.live === true && alerts.stories === false, JSON.stringify(alerts));
    check('the bell shows it is on', (await actions.getByRole('button', { name: 'Notifications from grace_mensah are on' }).count()) === 1);
    await page.keyboard.press('Escape');
    await actions.getByRole('button', { name: /^Notifications from/ }).click();
    await page.waitForSelector('.prof-alert-row');
    check('and they are remembered', (await page.getByRole('switch', { name: 'Posts from grace_mensah' }).isChecked()) && !(await page.getByRole('switch', { name: 'Stories from grace_mensah' }).isChecked()));
    await page.keyboard.press('Escape');
    check('Escape closes the bell menu', (await page.locator('.prof-alerts').count()) === 0);

    // Subscribe, then manage it
    await actions.getByRole('button', { name: 'Subscribe' }).click();
    await page.waitForSelector('.pay-sheet');
    check('Subscribe opens the payment dialog at her price', (await page.locator('.pay-sheet').innerText()).includes('£2.99'));
    await wait(300);
    await shot('profile-subscribe-pay-dark');
    await page.locator('.pay-sheet .btn.block').click();
    check('paying subscribes', await toast("You're subscribed to grace_mensah"));
    await wait(800);
    check('the button now says Subscribed', (await actions.getByRole('button', { name: /^Subscribed/ }).count()) === 1);
    check('the subscription is on', (await rows('community_creator_subs')).some((s) => s.creator_id === 'u_grace' && s.subscriber_id === 'demo_me' && s.status === 'active'));
    await actions.getByRole('button', { name: /^Subscribed/ }).click();
    await page.waitForSelector('.prof-sub-status');
    check('managing it shows when it renews', (await page.locator('.prof-sub-status').innerText()).includes('renews'));
    await page.locator('.prof-sub-foot').getByRole('button', { name: 'Cancel subscription' }).click();
    await page.locator('.confirm').getByRole('button', { name: 'Cancel subscription' }).click();
    check('it can be cancelled', await toast('Your subscription ends on'));
    await wait(500);
    check('then shows when it ends, with Resume', (await page.locator('.prof-sub-status').innerText()).includes('ends') && (await page.locator('.prof-sub-foot').getByRole('button', { name: 'Resume subscription' }).count()) === 1);
    await page.locator('.prof-sub-foot').getByRole('button', { name: 'Resume subscription' }).click();
    check('and resumed', await toast('Your subscription will renew'));
    await page.keyboard.press('Escape');
    await wait();

    // About this account, copy link, report
    await head.getByRole('button', { name: 'More options' }).click();
    const more = (await page.locator('.choices button').allInnerTexts()).map((t) => t.trim());
    check('the … menu has Block, Report, About this account and Copy profile link', ['Block', 'Report', 'About this account', 'Copy profile link'].every((x) => more.includes(x)), more.join(','));
    await page.locator('.choices').getByRole('button', { name: 'About this account' }).click();
    await page.waitForSelector('.prof-about');
    const about = await page.locator('.prof-about').innerText();
    check('About this account shows when she joined, where she is based, her tick and account type', ['Date joined', 'Account based in', 'Ghana', 'Verified (notable account)', 'Creator account · Choir director'].every((x) => about.includes(x)), about.replace(/\n/g, ' | '));
    await wait(300);
    await shot('profile-about-dark');
    await page.keyboard.press('Escape');
    await head.getByRole('button', { name: 'More options' }).click();
    await page.locator('.choices').getByRole('button', { name: 'Copy profile link' }).click();
    check('Copy profile link confirms', await toast('Profile link copied'));
    check('the link is on the clipboard', (await page.evaluate(() => navigator.clipboard.readText())).endsWith('#/u/grace_mensah'));
    await head.getByRole('button', { name: 'More options' }).click();
    await page.locator('.choices').getByRole('button', { name: 'Report' }).click();
    await page.locator('.prof-report').getByRole('button', { name: 'Spam' }).click();
    check('reporting thanks you', await toast('Thanks. We will review this account.'));
    check('the report is sent', (await rows('community_reports')).some((r) => r.target_user_id === 'u_grace' && r.reason === 'Spam'));

    // Her highlights and her story
    check('her highlights show, with no New circle', (await page.locator('.prof-hl-row .highlight').allInnerTexts()).map((t) => t.trim()).join() === 'Choir,Camp');
    check("her highlights wear her ring colour", /#f5b40b/i.test((await page.locator('.prof-hl-ring').first().getAttribute('style')) || ''));
    check('no editing on someone else\'s highlights', (await page.locator('.prof-hl-more').count()) === 0);
    await page.locator('.highlight', { hasText: 'Choir' }).click();
    await page.waitForSelector('.story-stage');
    check("her highlight plays its two stories", (await page.locator('.story-stage .bars span').count()) === 2);
    await page.keyboard.press('Escape');
    await wait();
    await page.getByRole('button', { name: 'View story' }).click();
    await page.waitForSelector('.story-stage');
    check('the ring opens her story', true);
    await page.keyboard.press('Escape');
    await wait(600);

    // Tabs on someone else; picking one keeps the page where it was
    await page.waitForSelector('.prof-grid .tile');
    await page.evaluate(() => window.scrollTo(0, 400));
    await wait(200);
    await page.locator('.prof-tab[aria-label=Tagged]').click();
    await wait(900);
    check('changing tabs keeps the scroll position', Math.abs((await page.evaluate(() => window.scrollY)) - 400) < 40, await page.evaluate(() => window.scrollY));
    await goto('/u/grace_mensah/tagged');
    await page.waitForSelector('.prof-grid .tile');
    check('her Tagged tab shows posts she is tagged in', (await page.locator('.prof-grid .tile').count()) === 2, await page.locator('.prof-grid .tile').count());
    await goto('/u/grace_mensah/shorts');
    check('an empty Shorts tab on someone else', (await page.locator('.empty h2').innerText()) === 'No Shorts yet');
    await goto('/u/samuel_boateng/shorts');
    await page.waitForSelector('.prof-short');
    check('Shorts are tall tiles with view counts', (await page.locator('.prof-short-views').innerText()).trim().length > 0 && Math.abs((await page.locator('.prof-short').first().evaluate((el) => el.clientWidth / el.clientHeight)) - 9 / 16) < 0.02);
    await goto('/u/grace_mensah');

    // Following menu, unfollow and follow again
    await page.waitForSelector('.prof-actions');
    await actions.getByRole('button', { name: /^Following/ }).click();
    await page.waitForSelector('.prof-fmenu');
    check('the Following menu offers close friends, the subscription and Unfollow', (await page.locator('.prof-fmenu').innerText()).includes('Add to close friends') && (await page.locator('.prof-fmenu').innerText()).includes('Unfollow'));
    await page.locator('.prof-fmenu').getByRole('button', { name: 'Unfollow' }).click();
    await wait(600);
    check('Unfollow turns the button back to Follow back', (await actions.getByRole('button', { name: 'Follow back' }).count()) === 1);
    check('and the bell goes', (await actions.getByRole('button', { name: /^Notifications from/ }).count()) === 0);
    check('Discover people stays shut on someone else at first', (await page.locator('.prof-discover').count()) === 0);
    await actions.getByRole('button', { name: 'Follow back' }).click();
    await wait(700);
    check('following again', (await actions.getByRole('button', { name: /^Following/ }).count()) === 1 && (await rows('community_follows')).some((f) => f.follower_id === 'demo_me' && f.following_id === 'u_grace'));
    check('following opens Discover people, as on Instagram', (await page.locator('.prof-discover').count()) === 1);
    await shot('profile-grace-dark');
    await actions.getByRole('button', { name: 'Message' }).click();
    await wait(600);
    check('Message opens the chat', (await page.evaluate(() => location.hash)).startsWith('#/direct/'));

    // Someone who is live, and someone who hides their lists
    const liveId = await page.evaluate(() => window.__profileDemo.insertRow('community_lives', { user_id: 'u_daniel', title: 'Youth night', started_at: new Date().toISOString(), ended_at: null, viewers: 4, audience: 'followers' }).id);
    await patch('community_profiles', 'u_daniel', { hide_connections: true });
    await goto('/u/daniel_owusu');
    await page.waitForSelector('.prof-head h1');
    check('a LIVE badge shows while they broadcast', (await page.locator('.prof-pic .live-badge').innerText()) === 'LIVE' && (await page.locator('.prof-ring.live').count()) === 1);
    check('hidden lists show the counts but do not open', (await page.locator('.prof-stats button').count()) === 0 && /follower/.test(await page.locator('.prof-stats').innerText()));
    await page.getByRole('button', { name: 'Watch live' }).click();
    await wait(600);
    check('the LIVE ring opens the broadcast', (await page.evaluate(() => location.hash)) === '#/live/' + liveId);
    await page.evaluate((id) => {
      const d = window.__profileDemo;
      d.T('community_lives').find((l) => l.id === id).ended_at = new Date().toISOString();
      d.T('community_profiles').find((p) => p.id === 'u_daniel').hide_connections = false;
    }, liveId);
    await goto('/');

    // A private account
    await goto('/u/kwame_deals');
    await page.waitForSelector('.prof-private');
    check('a private account I do not follow shows the lock', (await page.locator('.prof-private h2').innerText()) === 'This account is private' && (await page.locator('.prof-grid, .prof-tabs, .prof-hl-row').count()) === 0);
    check('its lists do not open', (await page.locator('.prof-stats button').count()) === 0);
    await page.locator('.prof-private').getByRole('button', { name: 'Follow' }).click();
    check('Follow sends a request', await toast('Requested to follow kwame_deals'));
    check('the request is saved and the buttons say Requested', (await rows('community_follow_requests')).some((r) => r.requester_id === 'demo_me' && r.target_id === 'u_kwame') && (await actions.getByRole('button', { name: 'Requested' }).count()) === 1);
    await actions.getByRole('button', { name: 'Requested' }).click();
    await page.locator('.confirm').getByRole('button', { name: 'Withdraw' }).click();
    await wait(600);
    check('the request can be withdrawn', (await actions.getByRole('button', { name: 'Follow' }).count()) === 1 && !(await rows('community_follow_requests')).some((r) => r.target_id === 'u_kwame'));
    await shot('profile-private-dark');

    // Block asks first
    await head.getByRole('button', { name: 'More options' }).click();
    await page.locator('.choices').getByRole('button', { name: 'Block' }).click();
    check('Block asks first', (await page.locator('.confirm').innerText()).includes('Block kwame_deals?'));
    await page.locator('.confirm').getByRole('button', { name: 'Block' }).click();
    check('blocking confirms', await toast('Blocked kwame_deals'));
    check('the block is saved', (await rows('community_blocks')).some((b) => b.blocker_id === 'demo_me' && b.blocked_id === 'u_kwame'));

    // Under 14: the account stays private, and Message only for people you follow
    await page.evaluate(() => {
      const d = window.__profileDemo;
      Object.assign(d.T('community_profiles').find((p) => p.id === 'demo_me'), { restricted: true, is_private: true });
      d.announce('profile');
    });
    await wait(600);
    await goto('/u/esther_adjei');
    await goto('/u/kwame_deals');
    await page.waitForSelector('.prof-actions');
    check('under 14, Message hides for people you do not follow', (await actions.getByRole('button', { name: 'Message' }).count()) === 0);
    await goto('/u/you');
    check('under 14, my profile says it stays private', (await page.locator('.prof-lock').count()) === 1 && (await page.locator('.prof-bio').innerText()).includes('under 14 stay private'));
    await page.evaluate(() => {
      const d = window.__profileDemo;
      Object.assign(d.T('community_profiles').find((p) => p.id === 'demo_me'), { restricted: false, is_private: false });
      d.announce('profile');
    });
    await wait(600);

    /* ---------- both appearances ---------- */
    await page.evaluate(() => {
      localStorage.setItem('community.appearance', 'white');
      location.hash = '/';
    });
    await page.reload();
    await page.waitForSelector('.feed-post');
    await goto('/u/grace_mensah');
    await page.waitForSelector('.prof-head h1');
    check('White: the page is white', (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(255, 255, 255)');
    check('White: the name on her band stays white', (await page.locator('.prof-head h1').evaluate((el) => getComputedStyle(el).color)) === 'rgb(255, 255, 255)');
    const grid = await page.locator('.prof-tab.on').evaluate((el) => getComputedStyle(el).color);
    check('White: the open tab is dark', grid !== 'rgb(255, 255, 255)' && grid.startsWith('rgb(15'), grid);
    await shot('profile-grace-white');
    await goto('/u/you');
    await page.waitForSelector('.prof-head h1');
    check('White: my name reads dark on white', (await page.locator('.prof-head h1').evaluate((el) => getComputedStyle(el).color)) === 'rgb(15, 20, 25)');
    await shot('profile-own-white');
    await page.evaluate(() => {
      localStorage.setItem('community.appearance', 'dark');
      location.hash = '/';
    });
    await page.reload();
    await page.waitForSelector('.feed-post');
    await goto('/u/you');
    await page.waitForSelector('.prof-head h1');
    check('Dark: my name reads light', (await page.locator('.prof-head h1').evaluate((el) => getComputedStyle(el).color)) === 'rgb(243, 245, 247)');
    await shot('profile-own-dark');

    check('no script errors', errors.length === 0, errors.join(' | '));
  } catch (e) {
    console.log('TEST CRASHED: ' + e.message);
    failed++;
  }
  await browser.close();
  console.log(failed ? `${failed} CHECK(S) FAILED` : 'ALL PROFILE CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})();
