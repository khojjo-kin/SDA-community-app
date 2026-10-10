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
  check('the three feeds from the iPhone app: For you, Following, Subscribers', (await page.locator('.feed-switch button').allInnerTexts()).join() === 'For you,Following,Subscribers');
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
  await page.waitForSelector('.filter-cell');
  check('the Edit step offers the iPhone app\'s filters', (await page.locator('.filter-cell').count()) === 17, await page.locator('.filter-cell').count());
  await page.locator('.filter-cell').filter({ hasText: 'Moon' }).click();
  await page.getByRole('button', { name: 'Adjustments' }).click();
  check('Plus members get brightness, contrast, saturation and warmth', (await page.locator('.adjust-row').count()) === 4);
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
  const grey = await page.locator('.post-dialog .slide img').first().evaluate(async (img) => {
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 40; c.height = 40;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, 40, 40);
    const d = x.getImageData(0, 0, 40, 40).data;
    let spread = 0;
    for (let i = 0; i < d.length; i += 4) spread = Math.max(spread, Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]));
    return spread;
  });
  check('the Moon filter was baked into the uploaded photo (black and white)', grey <= 6, grey);
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
  await page.waitForSelector('.filter-cell');
  await page.locator('.create-head').getByRole('button', { name: 'Next' }).click();
  await page.waitForSelector('.create-side textarea');
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

  // Chat: typing, saved replies, creator FAQs
  await goto('/direct/t/t1');
  await page.waitForSelector('.chat-head');
  await page.waitForSelector('.chip-btn');
  check("Grace's frequently asked questions show in the chat", (await page.locator('.chip-btn').filter({ hasText: 'When is choir practice?' }).count()) === 1);
  await page.locator('.chip-btn').filter({ hasText: 'When is choir practice?' }).click();
  await page.waitForTimeout(1200);
  check('tapping a question brings her saved answer', (await page.locator('.msg:not(.mine) .bubble').filter({ hasText: 'Thursdays at 7pm' }).count()) === 1);
  await page.getByLabel(/^Message grace/).fill('/service');
  await page.waitForTimeout(500);
  check('typing /shortcut fills in a saved reply', (await page.getByLabel(/^Message grace/).inputValue()).startsWith('Divine service starts'));
  check('typing is shared on the same channel as the iPhone app', await page.evaluate(() => (window.__broadcastsSent || []).some((b) => b.channel === 'typing:t1' && b.event === 'typing' && b.payload.user === 'demo_me')));
  await page.getByLabel(/^Message grace/).fill('');

  // Church: Hymnal favourites, Pod
  await goto('/hymnal/108');
  await page.waitForSelector('.lyrics');
  await page.getByRole('button', { name: 'Add to favourites' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^Favourites/ }).click();
  check('hymn favourites work', (await page.locator('.hymn-row').count()) === 1);
  await goto('/pod');
  await page.waitForSelector('.pod-row');
  await page.locator('.pod-row').first().locator('.pod-cover').click();
  await page.waitForSelector('.now-playing');
  check('Pod opens the player bar', (await page.locator('.now-playing b').innerText()).includes('(sample)'));
  await page.locator('.pod-row').first().getByRole('button', { name: 'Save to library' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Your library' }).click();
  await page.waitForTimeout(500);
  check('saving to Your library works', (await page.locator('.pod-row').count()) === 1);
  await page.getByRole('button', { name: 'Close player' }).click();

  // Creator tools and account
  await goto('/dashboard');
  await page.waitForSelector('.tile-stat');
  check('the professional dashboard shows views and a chart', (await page.locator('.tile-stat').count()) === 4 && (await page.locator('.bar-col').count()) >= 28);
  await goto('/archive');
  await page.waitForSelector('.archive-tile');
  check('the archive keeps my expired stories', (await page.locator('.archive-tile').count()) >= 2);
  await page.getByRole('button', { name: 'New highlight' }).click();
  await page.locator('.archive-tile').first().click();
  await page.getByLabel('Highlight name').fill('Lakes');
  await page.getByRole('button', { name: 'Add highlight' }).click();
  const lakes = await page.locator('.highlight').filter({ hasText: 'Lakes' }).waitFor({ timeout: 5000 }).then(() => true, () => false);
  check('a new highlight from the archive shows on my profile', lakes);
  await goto('/accounts/viewers');
  await page.waitForSelector('.settings-card .row');
  check('Plus: profile viewers are listed', (await page.locator('.settings-card .row').count()) === 2);
  await goto('/help');
  await page.locator('.form-row').filter({ hasText: 'Subject' }).locator('input').fill('Desktop question');
  await page.locator('.form-row').filter({ hasText: 'Message' }).locator('textarea').fill('How do I go live from the Mac?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.waitForSelector('.ticket');
  check('a help request is sent and listed', (await page.locator('.ticket').filter({ hasText: 'Desktop question' }).count()) === 1);

  // Admin console
  await page.locator('.sidebar').getByRole('button', { name: 'More' }).click();
  const moreText = await page.locator('.more-pop').innerText();
  check('the More menu has every section', ['Bible', 'Sabbath School', 'Hymnal', 'Pod', 'Churches', 'Ask Erha', 'Archive', 'Professional dashboard', 'Help', 'Admin console'].every((x) => moreText.includes(x)));
  await page.locator('.more-pop').getByText('Admin console').click();
  await page.waitForSelector('.chart svg');
  check('the admin dashboard shows the key numbers', (await page.locator('.kpi').count()) >= 8);
  check('the dashboard draws the activity chart, donuts and bars', (await page.locator('.chart svg path').count()) > 2 && (await page.locator('.donut').count()) >= 3 && (await page.locator('.hbars li').count()) > 3);
  check('the dashboard lists countries people use the app from', (await page.locator('.hbars').first().innerText()).includes('Ghana'));
  check('the dashboard flags what needs attention', (await page.locator('.alert-chip').count()) >= 2);
  await page.locator('.dash-card').filter({ hasText: 'Activity' }).getByRole('button', { name: 'Messages' }).click();
  const box = await page.locator('.chart').first().boundingBox();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
  await page.waitForSelector('.chart-tip');
  check('hovering the chart shows the value for that day', (await page.locator('.chart-tip').innerText()).includes('Messages'));
  await shot('20-admin-dashboard');
  const navText = await page.locator('.admin-nav').innerText();
  check('the admin console groups every tool', ['Dashboard', 'People', 'Security', 'Audit log', 'Money', 'Content', 'Churches', 'Announcements', 'System', 'Search everything'].every((x) => navText.includes(x)));

  await goto('/admin/people');
  await page.waitForSelector('.table.people tbody tr');
  const everyone = await page.locator('.table.people tbody tr').count();
  check('People lists every account', everyone === 9, everyone);
  await page.locator('.admin .chips').getByRole('button', { name: 'Suspended', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.table.people tbody tr').length === 1);
  check('People can be filtered to suspended accounts', (await page.locator('.table.people tbody tr').innerText()).includes('kwame_deals'));
  await page.locator('.admin .chips').getByRole('button', { name: 'Everyone' }).click();
  await page.getByLabel('Search people').fill('41.66.200.12');
  await page.getByLabel('Search people').press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.table.people tbody tr').length === 3);
  check('People can be found by IP address', true);
  await page.getByLabel('Search people').fill('grace');
  await page.getByLabel('Search people').press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.table.people tbody tr').length === 1);
  await shot('21-admin-people');
  await page.locator('.table.people tbody tr').first().click();
  await page.waitForSelector('.person-head');
  check("a person's record opens with their details", (await page.locator('.person-head').innerText()).includes('Grace Mensah') && (await page.locator('.count-grid .count').count()) === 18);
  await page.getByRole('button', { name: 'Sign-ins and locations' }).click();
  check('their sign-ins show app, address and country', (await page.locator('.table').first().innerText()).includes('41.66.200.12') && (await page.locator('.table').first().innerText()).includes('Ghana'));
  check('other accounts on the same address are listed', (await page.locator('.dash-card').filter({ hasText: 'same addresses' }).innerText()).includes('joseph_k'));
  await page.getByRole('button', { name: 'Money', exact: true }).click();
  check('their payments, donations and subscription are shown', (await page.locator('.person').innerText()).includes('Transactions') && (await page.locator('.person').innerText()).includes('New choir robes'));
  await shot('22-admin-person');

  await goto('/admin/people');
  await page.waitForSelector('.table.people tbody tr');
  await page.locator('.table.people tbody tr').filter({ hasText: 'kwame_deals' }).click();
  await page.waitForSelector('.person-head');
  await page.getByRole('button', { name: 'Lift suspension' }).click();
  await page.waitForFunction(() => !document.querySelector('.person-head .pill.danger'));
  check('a suspension can be lifted', true);
  await page.getByRole('button', { name: 'Suspend', exact: true }).click();
  await page.locator('.modal select').selectOption('30');
  await page.locator('.modal textarea').fill('Spam after a warning');
  await page.locator('.modal').getByRole('button', { name: 'Suspend' }).click();
  await page.waitForSelector('.person-head .pill.danger');
  await page.getByRole('button', { name: 'Safety' }).click();
  check('a timed suspension is recorded with its reason', (await page.locator('.person').innerText()).includes('Spam after a warning'));
  await page.getByRole('button', { name: 'Close account' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Close account' }).click();
  await page.waitForSelector('text=Restore account');
  check('an account can be closed and restored', (await page.locator('.person-head').innerText()).includes('Closing'));
  await page.getByRole('button', { name: 'Restore account' }).click();
  await page.waitForSelector('text=Close account');

  await goto('/admin/search');
  await page.getByLabel('Search everything').fill('choir');
  await page.getByLabel('Search everything').press('Enter');
  await page.waitForSelector('.row.result');
  const found = await page.locator('.settings-body').innerText();
  check('search finds people, posts, groups and fundraisers together', ['Posts', 'Communities and pages', 'Fundraisers'].every((x) => found.includes(x)));

  await goto('/admin/security');
  await page.waitForSelector('.rls-grid');
  check('security shows alerts, warnings and blocked addresses', (await page.locator('.settings-body').innerText()).includes('197.210.53.8') && (await page.locator('.sev-high').count()) >= 1);
  const openBefore = await page.locator('.dash-card').first().locator('tbody tr').count();
  await page.locator('.dash-card').first().getByRole('button', { name: 'Resolve', exact: true }).first().click();
  await page.waitForFunction((n) => document.querySelector('.dash-card tbody').querySelectorAll('tr').length === n - 1, openBefore);
  check('an alert can be resolved', true);
  await page.getByLabel('Address to block').fill('203.0.113.7');
  await page.getByLabel('Reason').fill('Test');
  await page.locator('.inline-form').first().getByRole('button', { name: 'Block' }).click();
  await page.waitForSelector('text=203.0.113.7');
  check('an address can be blocked', true);
  await shot('23-admin-security');

  await goto('/admin/money');
  await page.waitForSelector('.donut');
  check('money shows income, kinds and methods', (await page.locator('.donut').count()) >= 2);
  await page.getByRole('button', { name: 'Donations' }).click();
  await page.waitForSelector('.table tbody tr');
  check('donations are listed', (await page.locator('.table tbody tr').count()) === 7);
  await page.getByRole('button', { name: 'Transactions' }).click();
  await page.waitForSelector('.table tbody tr');
  check('transactions are still there', (await page.locator('.table tbody tr').count()) > 5);

  await goto('/admin/content');
  await page.waitForSelector('.mod-tile');
  check('content can be reviewed', (await page.locator('.mod-tile').count()) >= 10);

  await goto('/admin/churches');
  await page.waitForSelector('.report');
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.waitForTimeout(400);
  check('a new church can be approved', (await page.locator('.report').count()) === 0);

  await goto('/admin/announcements');
  await page.waitForSelector('.announce');
  await page.locator('.form-row').filter({ hasText: 'Title' }).locator('input').fill('Choir concert on Saturday');
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.waitForSelector('.announce.preview:has-text("Choir concert on Saturday")');
  check('an announcement can be published', (await page.locator('.announce').filter({ hasText: 'Choir concert on Saturday' }).count()) === 1);

  await goto('/admin/audit');
  await page.waitForSelector('.table tbody tr');
  const auditText = await page.locator('.table').innerText();
  check('the audit log records what admins did', ['unsuspend', 'suspend', 'close', 'restore'].every((x) => auditText.includes(x)));

  await goto('/admin/system');
  await page.waitForSelector('.hbars');
  check('system health shows storage and scheduled jobs', (await page.locator('.settings-body').innerText()).includes('lift bans'));

  await goto('/');
  await page.waitForSelector('.announce.bar');
  check('everyone sees the announcement at the top of the app', (await page.locator('.announce.bar').innerText()).length > 0);
  await page.locator('.announce.bar').getByRole('button', { name: 'Close announcement' }).click();
  await goto('/admin/dashboard');
  await goto('/admin/reports');
  await page.waitForSelector('.report');
  await page.getByRole('button', { name: 'Action taken' }).click();
  await page.waitForTimeout(500);
  check('a report can be decided', (await page.locator('.report').count()) === 0);
  await goto('/admin/requests');
  await page.waitForSelector('.report');
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.waitForTimeout(700);
  await goto('/u/esther_adjei');
  await page.waitForSelector('.profile-top');
  check('approving a tick request gives the tick', (await page.locator('.profile-top .verified').count()) === 1);
  await goto('/admin/support');
  await page.waitForSelector('.ticket');
  await page.locator('.ticket').filter({ hasText: 'Cannot upload a video' }).click();
  await page.locator('.modal textarea').fill('Videos can be up to 60 seconds. Trim it and try again.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await page.waitForTimeout(500);
  check('support requests can be answered', (await page.locator('.ticket').filter({ hasText: 'Cannot upload a video' }).locator('.pill.status-answered').count()) === 1);

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
  // The desktop app is a desktop layout only: it never turns into the phone layout.
  for (const [w, h, name] of [[1000, 800, 'medium'], [600, 800, 'small']]) {
    const p2 = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
    await p2.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    await p2.goto(BASE);
    await p2.waitForSelector('.feed-post');
    const ov = await p2.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
    if (name === 'medium') check(`no sideways scrolling at ${w}px`, ov <= 0, ov);
    if (name === 'small') check('a small window keeps the desktop sidebar (no phone bottom bar)', (await p2.locator('.sidebar').isVisible()) && (await p2.locator('.bottombar').count()) === 0);
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
