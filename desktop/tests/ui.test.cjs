// Clicks through the demo build in Chromium the way a person would and checks the results.
// Usage: serve dist-demo, then  NODE_PATH=$(npm root -g) node tests/ui.test.cjs http://127.0.0.1:8790/ [screenshot dir]
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:8790/';
const SHOTS = process.argv[3] || '';
const MEDIA = path.join(__dirname, '../src/fake/media');
let failures = 0;
const check = (label, ok, extra) => {
  if (ok) console.log('ok   ' + label);
  else {
    failures++;
    console.log('FAIL ' + label + (extra !== undefined ? '  -> ' + extra : ''));
  }
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    return u.startsWith(BASE) || u.startsWith('blob:') || u.startsWith('data:') ? r.continue() : r.abort();
  });
  const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
  const wait = (ms = 400) => page.waitForTimeout(ms);
  const goto = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await wait(700);
  };

  await page.goto(BASE);
  await page.waitForSelector('.feed-post');
  const feed = page.locator('.feed-post');

  // Home
  check('home feed shows posts from people I follow', (await feed.count()) >= 8, await feed.count());
  check('story tray lists 5 people with stories plus mine', (await page.locator('.tray-item').count()) === 6, await page.locator('.tray-item').count());
  check('suggestions list someone I do not follow', (await page.locator('.home-aside .suggestion').count()) >= 1);
  check('unread messages badge on the sidebar', (await page.locator('.sidebar .nav-badge').innerText()) === '1');

  // Like, double-click like, save, comment
  const first = feed.first();
  const likes = async (p) => p.locator('.likes').innerText();
  const before = await likes(first);
  await first.getByRole('button', { name: 'Unlike' }).click();
  await wait();
  check('unlike lowers the count', (await likes(first)) !== before, await likes(first));
  await first.locator('.carousel').dblclick();
  await wait(500);
  check('double-click likes again', (await likes(first)) === before && (await first.getByRole('button', { name: 'Unlike' }).count()) === 1);
  await first.getByRole('button', { name: 'Save', exact: true }).click();
  await wait();
  check('save shows a confirmation', (await page.locator('.toast').filter({ hasText: 'Saved' }).count()) === 1);
  await first.getByLabel('Add a comment').fill('Amen to that');
  await first.getByRole('button', { name: 'Post', exact: true }).click();
  await wait(500);
  check('comment from the feed appears under the post', (await first.getByText('Amen to that').count()) === 1);

  // Carousel arrows
  const second = feed.nth(1);
  await second.getByRole('button', { name: 'Next' }).click();
  await wait();
  check('carousel moves to the second photo', (await second.locator('.dots-overlay i.on').count()) === 1 && (await second.locator('.dots-overlay i').nth(1).getAttribute('class')) === 'on');

  // Post dialog with comments
  await first.getByRole('button', { name: /View all/ }).click();
  await page.waitForSelector('.post-dialog .comments');
  await wait(400);
  check('post dialog shows caption, two comments and mine', (await page.locator('.post-dialog .comment').count()) === 4, await page.locator('.post-dialog .comment').count());
  await page.locator('.post-dialog').getByLabel('Add a comment').fill('Second comment');
  await page.locator('.post-dialog').getByRole('button', { name: 'Post', exact: true }).click();
  await wait(600);
  check('comment in the dialog appears', (await page.locator('.post-dialog .comment').count()) === 5);
  await page.locator('.post-dialog .comment').last().getByRole('button', { name: 'Delete' }).click();
  await wait(500);
  check('own comment can be deleted', (await page.locator('.post-dialog .comment').count()) === 4);
  await page.locator('.post-dialog .comment').nth(1).getByRole('button', { name: 'Like comment' }).click();
  await wait();
  check('liking a comment shows its count', (await page.locator('.post-dialog .comment').nth(1).getByText('1 like').count()) === 1);
  await shot('01-post');
  await page.keyboard.press('Escape');
  await wait();

  // Share a post to someone
  await feed.nth(2).getByRole('button', { name: 'Share' }).click();
  await page.waitForSelector('.share .row');
  await page.locator('.share .row').first().click();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await wait(1200);
  check('sharing a post confirms it was sent', (await page.locator('.toast').filter({ hasText: 'Sent' }).count()) >= 1);

  // Stories
  await page.locator('.tray-item').nth(1).locator('button').first().click();
  await page.waitForSelector('.story-stage');
  check('story viewer opens with progress bars', (await page.locator('.story-stage .bars span').count()) >= 1);
  await page.getByLabel('Reply').fill('Lovely!');
  await page.locator('.story-reply').getByRole('button', { name: 'Send' }).click();
  await wait(800);
  check('story reply is sent', (await page.locator('.toast').filter({ hasText: 'Sent' }).count()) >= 1);
  await page.keyboard.press('ArrowRight');
  await wait();
  await shot('02-story');
  await page.keyboard.press('Escape');
  await wait();
  check('viewer closes with Escape', (await page.locator('.story-stage').count()) === 0);

  // Create a post with two photos, crop 1:1, caption
  await page.locator('.sidebar').getByRole('button', { name: 'Create' }).click();
  await page.locator('.create-pop').getByRole('button', { name: /^Post/ }).click();
  await page.setInputFiles('[data-testid=create-files]', [path.join(MEDIA, '09.jpg'), path.join(MEDIA, '05.jpg')]);
  await page.waitForSelector('.crop-bar');
  check('two photos are ready to crop', (await page.locator('.thumb-bar .thumb:not(.add)').count()) === 2);
  await page.locator('.crop-bar').getByRole('button', { name: '1:1' }).click();
  await page.locator('.create-head').getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Caption').fill('Test post from the desktop app');
  await page.getByLabel('Location').fill('Hillside');
  await shot('03-create');
  await page.locator('.create-head').getByRole('button', { name: 'Share' }).click();
  await page.waitForSelector('.profile-head', { timeout: 15000 });
  await page.waitForSelector('.grid .tile');
  check('after sharing, my profile shows 3 posts', (await page.locator('.grid .tile').count()) === 3, await page.locator('.grid .tile').count());
  await page.locator('.grid .tile').first().click();
  await page.waitForSelector('.post-dialog');
  await wait(500);
  check('the new post has its caption and location', (await page.locator('.post-dialog').getByText('Test post from the desktop app').count()) === 1 && (await page.locator('.post-dialog').getByText('Hillside').count()) === 1);
  const ratio = await page.locator('.post-dialog .carousel').evaluate((el) => el.clientWidth / el.clientHeight);
  check('the new post was cropped square', Math.abs(ratio - 1) < 0.03, ratio.toFixed(3));
  // Delete it again
  await page.locator('.post-dialog').getByRole('button', { name: 'More options' }).click();
  await page.locator('.choices').getByRole('button', { name: 'Delete' }).click();
  await page.locator('.confirm').getByRole('button', { name: 'Delete' }).click();
  await wait(800);
  await goto('/u/you');
  await page.waitForSelector('.grid .tile');
  check('deleted post is gone from my profile', (await page.locator('.grid .tile').count()) === 2);

  // Share a story
  await page.locator('.sidebar').getByRole('button', { name: 'Create' }).click();
  await page.locator('.create-pop').getByRole('button', { name: /^Story/ }).click();
  await page.setInputFiles('[data-testid=create-files]', [path.join(MEDIA, '11.jpg')]);
  await page.waitForSelector('.create-side');
  await page.getByLabel('Caption').fill('My first desktop story');
  await page.locator('.create-head').getByRole('button', { name: 'Share' }).click();
  await page.waitForSelector('.tray', { timeout: 15000 });
  await wait(800);
  await page.locator('.tray-item').first().locator('button').first().click();
  await page.waitForSelector('.story-stage');
  check('my story plays with its caption', (await page.locator('.story-caption').filter({ hasText: 'My first desktop story' }).count()) === 1);
  check('my story shows who has seen it', (await page.locator('.seen-by').count()) === 1);
  await page.keyboard.press('Escape');

  // Explore and reels
  await goto('/explore');
  await page.waitForSelector('.mosaic .tile');
  check('explore shows every post', (await page.locator('.mosaic .tile').count()) >= 13, await page.locator('.mosaic .tile').count());
  check('explore has tall tiles in the mosaic', (await page.locator('.mosaic .tile.tall').count()) >= 1);
  await goto('/reels');
  await page.waitForSelector('.reel video');
  check('reels shows the two reels', (await page.locator('.reel').count()) === 2);
  await page.locator('.reel').first().getByRole('button', { name: 'Like' }).click();
  await wait();
  check('liking a reel updates its count', (await page.locator('.reel').first().locator('.reel-actions span').first().innerText()) === '342');

  // Search and profile, follow, followers list
  await page.locator('.sidebar').getByRole('button', { name: 'Search' }).click();
  await page.getByLabel('Search people').fill('esther');
  await page.waitForSelector('.side-panel .row-main');
  await page.locator('.side-panel .row-main').first().click();
  await page.waitForSelector('.profile-head');
  check('search opens the profile', (await page.locator('.profile-top h1').innerText()).startsWith('esther_adjei'));
  const stats = () => page.locator('.profile-stats').innerText();
  check('esther has 0 followers before', /0\s+followers/.test(await stats()), await stats());
  await page.locator('.profile-top').getByRole('button', { name: 'Follow back' }).click();
  await wait();
  check('following raises the count', /1\s+follower/.test(await stats()), await stats());
  await page.getByRole('button', { name: /follower/ }).click();
  await page.waitForSelector('.people-modal .row');
  check('followers list shows me', (await page.locator('.people-modal .row').filter({ hasText: 'you' }).count()) === 1);
  await page.keyboard.press('Escape');
  await page.locator('.profile-top').getByRole('button', { name: /Following/ }).click();
  await page.getByRole('button', { name: 'Add to close friends' }).click();
  await wait();
  check('adding to close friends confirms', (await page.locator('.toast').filter({ hasText: 'close friends' }).count()) >= 1);

  // Messages: open, send, live reply, Erha
  await page.locator('.profile-top').getByRole('button', { name: 'Message' }).click();
  await page.waitForSelector('.chat-head');
  check('Message opens a new chat with esther', (await page.locator('.chat-who').innerText()).includes('esther_adjei'));
  await page.getByLabel(/^Message esther/).fill('Hello Esther, see you on Sabbath');
  await page.locator('.composer').getByRole('button', { name: 'Send' }).click();
  await page.waitForSelector('.bubble.mine');
  await page.waitForTimeout(2600);
  check('the reply arrives live without reloading', (await page.locator('.msg:not(.mine) .bubble').count()) >= 1);
  check('the new chat is listed', (await page.locator('.thread-row').filter({ hasText: 'Esther' }).count()) === 1);
  await page.locator('.thread-row').filter({ hasText: 'Erha' }).click();
  await page.waitForSelector('.chat-head');
  await page.getByLabel(/^Message erha/).fill('Which hymn is Blessed Assurance?');
  await page.locator('.composer').getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(2200);
  check('Erha answers in the chat', (await page.locator('.msg:not(.mine) .bubble').filter({ hasText: 'sample answer' }).count()) === 1);
  await page.locator('.thread-row').filter({ hasText: 'Grace' }).click();
  await page.waitForSelector('.shared-post, .bubble');
  await wait(500);
  await shot('04-messages');

  // Notifications
  await page.locator('.sidebar').getByRole('button', { name: 'Notifications' }).click();
  await page.waitForSelector('.notice');
  check('notifications list likes, comments and follows', (await page.locator('.notice').count()) >= 4, await page.locator('.notice').count());
  await page.keyboard.press('Escape');

  // Settings
  await goto('/accounts/edit');
  await page.locator('.form-row').filter({ hasText: 'Bio' }).locator('textarea').fill('Edited from the Mac app');
  await page.getByRole('button', { name: 'Submit' }).click();
  await wait(700);
  await goto('/u/you');
  await page.waitForSelector('.profile-bio');
  check('profile edit shows on the profile', (await page.locator('.profile-bio').innerText()).includes('Edited from the Mac app'));
  await goto('/accounts/privacy');
  await page.getByRole('switch', { name: 'Private account' }).click();
  await wait(600);
  check('private account switch turns on', (await page.getByRole('switch', { name: 'Private account' }).getAttribute('aria-checked')) === 'true');

  // Saved tab, activity, hymnal, groups
  await goto('/u/you/saved');
  await page.waitForSelector('.grid .tile');
  check('saved tab shows 2 saved posts', (await page.locator('.grid .tile').count()) === 2);
  await goto('/hymnal');
  await page.getByLabel('Search hymns').fill('grace');
  await page.locator('.hymn-row').first().click();
  await page.waitForSelector('.lyrics');
  check('hymnal search opens Amazing Grace', (await page.locator('.hymn h1').innerText()) === 'Amazing Grace');
  await goto('/groups');
  await page.waitForSelector('.group-card');
  await page.locator('.group-card').filter({ hasText: 'Hillside Choir' }).click();
  await page.getByRole('button', { name: 'Follow', exact: true }).click();
  await wait(700);
  check('following a page works', (await page.getByRole('button', { name: 'Following', exact: true }).count()) === 1);
  await goto('/churches');
  await page.locator('.hymn-row').first().click();
  await wait(500);
  check('church details show service times', (await page.locator('.church').getByText('Sabbath School 9:00').count()) === 1);

  // Log out and back in
  await page.locator('.sidebar').getByRole('button', { name: 'More' }).click();
  await page.locator('.more-pop').getByRole('button', { name: 'Log out' }).click();
  await page.waitForSelector('.login');
  await shot('05-login');
  await page.getByRole('button', { name: 'Log in to the demo' }).click();
  await page.waitForSelector('.sidebar');
  check('logging back in works', true);

  const over = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
  check('no sideways scrolling at 1440px', over <= 0, over);

  // Narrow window and phone width
  for (const [w, h, name] of [[1000, 800, 'medium'], [420, 860, 'phone']]) {
    const p2 = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
    await p2.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    await p2.goto(BASE);
    await p2.waitForSelector('.feed-post');
    const ov = await p2.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
    check(`no sideways scrolling at ${w}px`, ov <= 0, ov);
    if (name === 'phone') check('phone width uses the bottom bar', await p2.locator('.bottombar').isVisible());
    if (name === 'medium') check('medium width uses the narrow sidebar', (await p2.locator('.sidebar').evaluate((el) => el.clientWidth)) <= 73);
    if (SHOTS) await p2.screenshot({ path: `${SHOTS}/06-${name}.png` });
  }

  check('no script errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures ? failures + ' CHECK(S) FAILED' : 'ALL UI CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error('TEST CRASHED: ' + e.message.split('\n').slice(0, 6).join('\n'));
  process.exit(2);
});
