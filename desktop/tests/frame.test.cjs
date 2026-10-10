// The desktop frame: the rail, its menus, appearance, switching accounts, the floating Messages
// button and its inbox, notification filters, and search above Explore.
// Usage: node tests/frame.test.cjs http://127.0.0.1:8790/
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8790/';
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || extra === '' ? '' : ' (' + extra + ')'));
  if (!ok) failed++;
};

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    return u.startsWith(BASE) || u.startsWith('blob:') || u.startsWith('data:') ? r.continue() : r.abort();
  });
  const goto = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForTimeout(600);
  };
  try {
    await page.goto(BASE);
    await page.waitForSelector('.feed-post');
    const rail = page.locator('.rail');
    check('the rail is narrow at rest', (await rail.evaluate((el) => el.clientWidth)) <= 73);
    await rail.locator('.nav-item').nth(3).hover();
    await page.waitForTimeout(600);
    check('the rail widens to show labels under the pointer', (await rail.evaluate((el) => el.clientWidth)) >= 240);
    await page.mouse.move(900, 500);

    // Appearance
    await rail.getByRole('button', { name: 'More' }).click();
    await page.locator('.more-pop').getByRole('menuitem', { name: 'Switch appearance' }).click();
    await page.locator('.pop-toggle').click();
    check('switching appearance turns the app white', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'white');
    check('the white background is white', (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(255, 255, 255)');
    await page.reload();
    await page.waitForSelector('.feed-post');
    check('appearance is remembered', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'white');
    await rail.getByRole('button', { name: 'More' }).click();
    await page.locator('.more-pop').getByRole('menuitem', { name: 'Switch appearance' }).click();
    await page.locator('.pop-toggle').click();
    check('and back to dark', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
    await page.mouse.click(900, 500);

    // Create menu
    await rail.getByRole('button', { name: 'Create' }).click();
    check('Create offers Post, Story, Short, Live video and Ad', (await page.locator('.create-pop [role=menuitem]').allInnerTexts()).map((t) => t.trim()).join() === 'Post,Story,Short,Live video,Ad');
    await page.mouse.click(900, 500);

    // Floating Messages button
    await page.locator('.dock-pill').click();
    await page.waitForSelector('.dock-row');
    check('the small inbox lists chats', (await page.locator('.dock-row').count()) >= 3);
    await page.locator('.dock-row').first().click();
    await page.waitForTimeout(800);
    check('a chat in the small inbox opens it', (await page.evaluate(() => location.hash)).startsWith('#/direct/t/'));
    check('the floating button hides in the full inbox', (await page.locator('.dock-pill, .dock-panel').count()) === 0);
    await goto('/');

    // Notifications filters
    await rail.getByRole('button', { name: 'Notifications' }).click();
    await page.waitForSelector('.notice');
    const all = await page.locator('.notice').count();
    await page.locator('.filter-chip', { hasText: 'Follows' }).click();
    const follows = await page.locator('.notice').count();
    check('notification filters narrow the list', follows >= 1 && follows < all, `${follows} of ${all}`);
    check('notifications are grouped by day', (await page.locator('.panel-h').allInnerTexts()).length >= 1);
    await page.keyboard.press('Escape');

    // Search above Explore
    await goto('/explore');
    await page.getByLabel('Search people').click();
    check('search shows recent searches before typing', (await page.locator('.search-drop').innerText()).includes('Recent'));
    await page.getByLabel('Search people').fill('grace');
    await page.waitForSelector('.search-drop .row-main');
    check('search finds people as you type', (await page.locator('.search-drop .row-main').first().innerText()).includes('grace_mensah'));
    await page.keyboard.press('Escape');
    check('Explore shows a four-column grid', (await page.locator('.mosaic').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)) === 4);

    // Suggested page
    await goto('/explore/people');
    await page.waitForSelector('.suggested-page .suggestion');
    check('Suggested lists people with a reason', (await page.locator('.suggested-page .reason').first().innerText()).length > 0);

    // Switch accounts (two sample accounts in the demo)
    await goto('/');
    await page.locator('.home-aside').getByRole('button', { name: 'Switch' }).click();
    check('Switch accounts lists both sample accounts', (await page.locator('.switch-row').count()) === 2);
    await page.locator('.switch-row', { hasText: 'grace_mensah' }).click();
    await page.waitForSelector('.feed-post');
    await page.waitForTimeout(600);
    check('switching account starts the app again as that account', (await page.locator('.home-aside .me-row .uname').first().innerText()) === 'grace_mensah');
    await page.locator('.home-aside').getByRole('button', { name: 'Switch' }).click();
    await page.locator('.switch-row', { hasText: 'you' }).click();
    await page.waitForSelector('.feed-post');
    await page.waitForTimeout(600);
    check('and back', (await page.locator('.home-aside .me-row .uname').first().innerText()) === 'you');

    // Church apps
    await rail.getByRole('button', { name: 'Church apps' }).click();
    await page.locator('.apps-pop').getByRole('menuitem', { name: /Hymnal/ }).click();
    await page.waitForTimeout(600);
    check('Church apps opens the Hymnal', (await page.evaluate(() => location.hash)) === '#/hymnal');

    check('no script errors', errors.length === 0, errors.join(' | '));
  } catch (e) {
    console.log('TEST CRASHED: ' + e.message);
    failed++;
  }
  await browser.close();
  console.log(failed ? `${failed} CHECK(S) FAILED` : 'ALL FRAME CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})();
