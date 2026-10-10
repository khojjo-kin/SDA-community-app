// Stories, Shorts and live: the story tray (live first, Plus ring colours, grey once watched, the
// loading shimmer), the story viewer (side previews, reply bar, next and previous, keys, menus, who
// watched my story, story alerts, highlights), the Shorts page (actions beside the video, caption,
// up and down, captions with CC and translation), watching a live (stored comments, Donate), and
// going live from the computer with Chromium's pretend camera (practice, schedule and cancel), then a
// real broadcast between two windows whose Realtime messages this script passes across.
// Usage: serve the demo build, then  node tests/stories.test.cjs http://127.0.0.1:8803/ [screenshot dir]
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8803/';
const SHOTS = process.argv[3] || '';
const DEMO_LIVE = '5a3e1000-0000-4000-8000-000000000001';
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || extra === '' ? '' : ' (' + extra + ')'));
  if (!ok) failed++;
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const open = async (who, slow) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera', 'microphone'] });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    await page.route('**/*', (r) => {
      const u = r.request().url();
      return u.startsWith(BASE) || u.startsWith('blob:') || u.startsWith('data:') ? r.continue() : r.abort();
    });
    if (who) await page.addInitScript((id) => (window.__fakeMe = id), who);
    // The stand-in database answers in 60 to 150 ms; this makes it slow, so the loading shimmer can be seen.
    if (slow) await page.addInitScript(() => { const st = window.setTimeout; window.setTimeout = (fn, ms, ...a) => st(fn, ms >= 60 && ms <= 150 ? ms + 1500 : ms, ...a); });
    return page;
  };
  const shot = (page, name, clip) => (SHOTS ? page.screenshot({ path: `${SHOTS}/stories-${name}.png`, clip }) : null);

  try {
    /* ---------- loading shimmer ---------- */
    let page = await open(null, true);
    await page.goto(BASE);
    await page.waitForSelector('.sv-tray', { timeout: 15000 });
    check('the story tray shimmers while it loads', (await page.locator('.sv-tray .sv-skeleton .sv-shimmer').count()) >= 5);
    await page.evaluate(() => (location.hash = '/shorts'));
    await page.waitForSelector('.sh-skeleton', { timeout: 5000 }).catch(() => {});
    check('Shorts show a skeleton while they load', (await page.locator('.sh-skeleton .sv-shimmer').count()) >= 5);
    await page.context().close();

    page = await open();
    const wait = (ms = 400) => page.waitForTimeout(ms);
    const goto = async (hash) => {
      await page.evaluate((h) => (location.hash = h), hash);
      await wait(900);
    };
    await page.goto(BASE);
    await page.waitForSelector('.feed-post');
    await page.waitForSelector('.sv-tray .tray-item.is-live');
    await wait(500);

    /* ---------- the tray ---------- */
    const items = page.locator('.sv-tray .tray-item');
    const names = await items.evaluateAll((els) => els.map((e) => e.querySelector('.tray-name').textContent));
    check('someone live comes first, with the LIVE badge', (await items.first().getAttribute('class')).includes('is-live') && names[0] === 'samuel_boateng' && (await items.first().locator('.live-badge').innerText()) === 'LIVE', names.join());
    check('then Your story', names[1] === 'Your story');
    check('someone live shows once, as live', names.filter((n) => n === 'samuel_boateng').length === 1);
    check('the circles are large, as on Instagram', (await items.nth(2).locator('.sv-circle').evaluate((el) => el.getBoundingClientRect().width)) >= 84);
    // Ring colours arrive a moment after the circles (they come with the owners' profiles).
    await page.waitForFunction(() => [...document.querySelectorAll('.sv-tray .sv-circle')].some((el) => el.style.getPropertyValue('--sv-ring')), null, { timeout: 5000 }).catch(() => {});
    const ruthRing = await page.locator('.tray-item', { hasText: 'ruth_asante' }).locator('.sv-circle').evaluate((el) => el.style.getPropertyValue('--sv-ring'));
    check("a Plus member's ring is in the colour she chose", ruthRing.includes('#ff7a45'), ruthRing);
    check('a Plus member comes first among unwatched stories', names[2] === 'ruth_asante', names.join());
    check('everyone else has the green ring', (await page.locator('.tray-item', { hasText: 'grace_mensah' }).locator('.ring-new').count()) === 1);
    await shot(page, 'tray-dark', { x: 72, y: 0, width: 1368, height: 300 });
    await page.evaluate(() => (document.documentElement.dataset.theme = 'white'));
    await wait(200);
    check('in White the names are dark on white', (await page.locator('.tray-item', { hasText: 'grace_mensah' }).locator('.tray-name').evaluate((el) => getComputedStyle(el).color)) === 'rgb(15, 20, 25)');
    await shot(page, 'tray-white', { x: 72, y: 0, width: 1368, height: 300 });
    await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
    check('the tray scrolls with an arrow when it overflows, or fits', (await page.locator('.sv-arrow.right').count()) === 1 || (await page.locator('.sv-tray').evaluate((el) => el.scrollWidth <= el.clientWidth)));

    /* ---------- the viewer ---------- */
    // Joseph is in the middle of the order and has two stories (a photo, then a video).
    await page.locator('.tray-item', { hasText: 'joseph_k' }).locator('button').first().click();
    await page.waitForSelector('.sv-stage');
    await wait(600);
    const stage = page.locator('.sv-stage');
    const who = () => stage.locator('.sv-who-link b').innerText();
    check('the viewer opens on Joseph with a bar per story', (await who()) === 'joseph_k' && (await stage.locator('.sv-bars span').count()) === 2);
    check('the Community wordmark is top left and Close top right', (await stage.locator('.sv-brand .wordmark').innerText()) === 'Community' && (await stage.getByRole('button', { name: 'Close', exact: true }).count()) === 1);
    const card = await stage.locator('.sv-card').boundingBox();
    check('the story is a tall 9:16 card in the middle', Math.abs(card.width / card.height - 9 / 16) < 0.01 && card.height >= 820 && Math.abs(card.x + card.width / 2 - 720) < 4, JSON.stringify(card));
    const peeks = await stage.locator('.sv-peek:not(.empty)').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, w: r.width })));
    check('the people before and after show as smaller, dimmed cards on both sides', peeks.filter((p) => p.x < card.x).length === 2 && peeks.filter((p) => p.x > card.x + card.width).length === 2 && peeks.every((p) => p.w < card.width / 2), JSON.stringify(peeks));
    // Ruth and Grace both have Plus (Grace from the profile area's sample data), so both come before Joseph.
    check('the side cards show who and when', (await stage.locator('.sv-peek-who b').allInnerTexts()).join() === 'ruth_asante,grace_mensah,samuel_boateng,daniel_owusu' && (await stage.locator('.sv-peek-who .avatar').count()) === 4, (await stage.locator('.sv-peek-who b').allInnerTexts()).join());
    check('the reply bar asks to reply to Joseph, with heart and share', (await stage.getByLabel('Reply to joseph_k').count()) === 1 && (await stage.getByRole('button', { name: 'Send a heart' }).count()) === 1 && (await stage.getByRole('button', { name: 'Share' }).count()) === 1);
    check('round previous and next buttons beside the card', (await stage.locator('.sv-nav.left').count()) === 1 && (await stage.locator('.sv-nav.right').count()) === 1);
    await shot(page, 'viewer');
    await page.keyboard.press(' ');
    await wait(200);
    check('Space pauses', (await stage.getByRole('button', { name: 'Play', exact: true }).count()) === 1);
    await page.keyboard.press(' ');
    await wait(200);
    check('and plays again', (await stage.getByRole('button', { name: 'Pause', exact: true }).count()) === 1);
    await stage.getByRole('button', { name: 'Send a heart' }).click();
    await wait(800);
    check('a heart is sent to Joseph', (await page.locator('.toast', { hasText: 'Sent' }).count()) >= 1 && (await stage.getByRole('button', { name: 'Heart sent' }).count()) === 1);
    await page.keyboard.press('ArrowRight');
    await wait(300);
    check('→ moves to his next story', (await who()) === 'joseph_k' && (await stage.locator('.sv-bars span:first-child i').evaluate((el) => el.style.width)) === '100%');
    await page.keyboard.press('ArrowRight');
    await wait(300);
    check('→ again moves to the next person', (await who()) === 'samuel_boateng');
    await page.keyboard.press('ArrowLeft');
    await wait(300);
    check('← goes back', (await who()) === 'joseph_k');
    await stage.locator('.sv-nav.right').click();
    await wait(300);
    await stage.locator('.sv-nav.right').click();
    await wait(300);
    check('the round next button moves on', (await who()) === 'samuel_boateng');
    await stage.locator('.sv-nav.left').click();
    await wait(300);
    check('the round previous button goes back', (await who()) === 'joseph_k');
    await stage.locator('.sv-peek:not(.empty)').last().click();
    await wait(400);
    check('clicking a side card opens that person', (await who()) === 'daniel_owusu');
    for (let i = 0; i < 4 && (await who()) !== 'joseph_k'; i++) {
      await page.keyboard.press('ArrowLeft');
      await wait(250);
    }
    await stage.getByRole('button', { name: 'More options' }).click();
    await page.waitForSelector('.sv-menu');
    const menu = await page.locator('.sv-menu').innerText();
    check("someone else's story offers Report, Mute and About this account", ['Report', 'Mute', 'About this account'].every((x) => menu.includes(x)), menu);
    const alerts = page.getByRole('switch', { name: "Get notified about joseph_k's stories" });
    await alerts.waitFor({ timeout: 3000 }).catch(() => {});
    check('and story notifications for him (I follow him)', (await alerts.count()) === 1 && !(await alerts.isChecked()));
    await page.locator('.sv-menu .sv-switch-row').click();
    await wait(600);
    check('turning them on says so', (await page.locator('.toast', { hasText: "You'll be told when joseph_k shares a story" }).count()) === 1);
    await page.locator('.sv-menu').getByRole('button', { name: 'Cancel' }).click();
    await stage.getByRole('button', { name: 'More options' }).click();
    await page.waitForSelector('.sv-menu');
    await wait(600);
    check('and it stays on', await page.getByRole('switch', { name: "Get notified about joseph_k's stories" }).isChecked());
    await page.locator('.sv-menu').getByRole('button', { name: 'About this account' }).click();
    await page.waitForSelector('.sv-about-row');
    check('About this account shows when he joined', (await page.locator('.sv-about').innerText()).includes('Date joined'));
    await page.keyboard.press('Escape');
    await wait(300);
    check('a sheet closes with Esc and the story stays open', (await page.locator('.sv-stage').count()) === 1);
    await stage.getByRole('button', { name: 'More options' }).click();
    await page.locator('.sv-menu').getByRole('button', { name: 'Report' }).click();
    await page.locator('.sv-reasons button', { hasText: 'Spam' }).click();
    await wait(500);
    check('reporting a story thanks you', (await page.locator('.toast', { hasText: 'We will review this story' }).count()) === 1);
    await page.keyboard.press('Escape');
    await wait(800);
    check('Esc closes the viewer', (await page.locator('.sv-stage').count()) === 0);
    await wait(800);
    const joseph = page.locator('.tray-item', { hasText: 'joseph_k' });
    check("Joseph's ring is grey now that both his stories are watched", (await joseph.locator('.ring-seen').count()) === 1 && (await joseph.locator('.tray-name.seen').count()) === 1);
    check('Grace, not opened yet, keeps her green ring', (await page.locator('.tray-item', { hasText: 'grace_mensah' }).locator('.ring-new').count()) === 1);
    const order = await items.evaluateAll((els) => els.map((e) => e.querySelector('.tray-name').textContent));
    check('and watched people move after the rest', order.indexOf('joseph_k') > order.indexOf('grace_mensah'), order.join());

    // Mute (kept on this computer)
    await page.locator('.tray-item', { hasText: 'grace_mensah' }).locator('button').first().click();
    await page.waitForSelector('.sv-stage');
    await stage.getByRole('button', { name: 'More options' }).click();
    await page.locator('.sv-menu').getByRole('button', { name: 'Mute', exact: true }).click();
    await page.keyboard.press('Escape');
    await wait(900);
    check('muting someone moves them to the end of the tray', (await items.last().innerText()).includes('grace_mensah') && (await items.last().getAttribute('class')).includes('is-muted'));
    await page.locator('.tray-item', { hasText: 'grace_mensah' }).locator('button').first().click();
    await page.waitForSelector('.sv-stage');
    await stage.getByRole('button', { name: 'More options' }).click();
    await page.locator('.sv-menu').getByRole('button', { name: 'Unmute' }).click();
    await page.keyboard.press('Escape');
    await wait(600);
    check('and unmuting brings them back', !(await items.last().getAttribute('class')).includes('is-muted'));
    /* ---------- my own story ---------- */
    await page.locator('.tray-item.is-me button').first().click();
    await page.waitForSelector('.sv-stage');
    await wait(700);
    check('my story shows who saw it instead of a reply bar', (await stage.locator('.seen-by').innerText()).includes('Seen by 4') && (await stage.locator('.sv-reply').count()) === 0);
    check('with the first viewers\' faces', (await stage.locator('.sv-faces .avatar').count()) === 3);
    await stage.locator('.seen-by').click();
    await page.waitForSelector('.sv-viewer');
    const rows = page.locator('.sv-viewers .sv-viewer');
    check('Viewers lists everyone who watched, last watched first', (await rows.count()) === 4 && (await rows.first().innerText()).includes('grace_mensah'));
    check('as a Plus member I see rewatches and times', (await rows.first().innerText()).includes('Watched 3 times') && (await rows.first().locator('.sv-when').count()) === 1);
    check("story alerts: I'm told when Grace watches (the bell is on)", (await rows.first().getByRole('button', { name: 'Stop telling me when grace_mensah watches' }).getAttribute('aria-pressed')) === 'true');
    await rows.nth(1).getByRole('button', { name: /Tell me when/ }).click();
    await wait(500);
    check('ringing the bell for another viewer turns their alert on', (await rows.nth(1).getByRole('button', { name: /Stop telling me when/ }).getAttribute('aria-pressed')) === 'true' && (await page.locator('.toast', { hasText: "We'll tell you when" }).count()) === 1);
    await shot(page, 'viewers');
    await page.keyboard.press('Escape');
    await wait(300);
    await stage.getByRole('button', { name: 'More options' }).click();
    const mine = await page.locator('.sv-menu').innerText();
    check('my story offers Delete, Add to highlight and Story settings', ['Delete', 'Add to highlight', 'Story settings'].every((x) => mine.includes(x)), mine);
    await page.locator('.sv-menu').getByRole('button', { name: 'Story settings' }).click();
    await page.waitForSelector('.sv-settings');
    await page.waitForSelector('.sv-settings .sv-viewer', { timeout: 5000 }).catch(() => {});
    const settings = await page.locator('.sv-settings').innerText();
    check('Story settings: who can reply, close friends, archive and story alerts', ['Allow replies', 'Close friends', 'Story archive', 'Story alerts', 'grace_mensah'].every((x) => settings.includes(x)), settings);
    await page.keyboard.press('Escape');
    await wait(300);
    await page.keyboard.press('Escape');
    await wait(500);

    // A highlight plays in the same viewer, without the parts that belong to a live story.
    await goto('/u/you');
    await page.waitForSelector('.highlights .highlight');
    await page.locator('.highlights .highlight').first().click();
    await page.waitForSelector('.sv-stage');
    check('a highlight opens in the same viewer', (await stage.locator('.sv-card').count()) === 1 && (await stage.locator('.seen-by').count()) === 0 && (await stage.locator('.sv-reply').count()) === 0);
    await page.keyboard.press('Escape');
    await wait(400);

    /* ---------- Shorts ---------- */
    await goto('/shorts');
    await page.waitForSelector('.sh-item video');
    await wait(600);
    const v = await page.locator('.sh-item').first().locator('.sh-frame').boundingBox();
    const acts = await page.locator('.sh-item').first().locator('.sh-actions').boundingBox();
    const info = await page.locator('.sh-item').first().locator('.sh-info').boundingBox();
    const list = await page.locator('.sh-list').boundingBox();
    check('one tall 9:16 video, centred, filling the height', Math.abs(v.width / v.height - 9 / 16) < 0.01 && v.height >= list.height - 50 && Math.abs(v.x + v.width / 2 - (72 + 1368 / 2)) < 60, JSON.stringify(v));
    check('the actions sit to the right of the video, at its bottom', acts.x >= v.x + v.width && Math.abs(acts.y + acts.height - (v.y + v.height)) < 12);
    check('the name and caption sit at the bottom left, beside the video', info.x + info.width <= v.x && Math.abs(info.y + info.height - (v.y + v.height)) < 12);
    const first = page.locator('.sh-item').first();
    check('the caption block has the name, the sound and the caption (no Follow: I follow him)', (await first.locator('.sh-who .uname').innerText()) === 'samuel_boateng' && (await first.locator('.sh-follow').count()) === 0 && (await first.locator('.sh-audio').innerText()).includes('samuel_boateng · Original audio') && (await first.locator('.sh-caption').innerText()).startsWith('Moonrise'));
    const mute = await first.locator('.sh-mute').boundingBox();
    check("the sound button is in the video's bottom-right corner", mute.x > v.x + v.width - 60 && mute.y > v.y + v.height - 60);
    const up = await page.getByRole('button', { name: 'Next Short' }).boundingBox();
    check('round up and down buttons at the far right', up.x > 1300 && (await page.getByRole('button', { name: 'Previous Short' }).isDisabled()));
    const actions = first.locator('.sh-actions');
    let all = (await first.locator('.sh-audio-cover').count()) === 1;
    for (const name of ['Like', 'Comments', 'Share', 'Save', 'More options']) all = all && (await actions.getByRole('button', { name, exact: true }).count()) === 1;
    check('likes, comments, share, save, more and the audio cover', all && (await actions.locator('span').first().innerText()) === '341');
    check('captions show in time with the video', (await first.locator('.sh-line').innerText()) === 'The moon is rising over the hills');
    await shot(page, 'shorts');
    const cc = first.getByRole('switch', { name: 'Captions' });
    await cc.click();
    await wait(300);
    check('CC turns captions off', (await first.locator('.sh-line').count()) === 0 && (await cc.getAttribute('aria-checked')) === 'false');
    await cc.click();
    await wait(300);
    check('and on again', (await first.locator('.sh-line').count()) === 1);
    await first.getByRole('button', { name: 'Translate captions' }).click();
    // Picking closes the list (click, not check: the radio is gone once chosen).
    await page.getByRole('radio', { name: 'Spanish' }).click();
    await page.waitForFunction(() => document.querySelector('.sh-line')?.textContent === 'La luna sale sobre las colinas', null, { timeout: 5000 }).catch(() => {});
    check('Translate captions shows them in Spanish', (await first.locator('.sh-line').innerText()) === 'La luna sale sobre las colinas');
    await first.getByRole('button', { name: 'Translated · Show original' }).click();
    await wait(300);
    check('and back to the original', (await first.locator('.sh-line').innerText()) === 'The moon is rising over the hills');
    await first.locator('.sh-frame').dblclick();
    await wait(600);
    check('double-click likes the Short', (await first.locator('.sh-actions span').first().innerText()) === '342' && (await first.getByRole('button', { name: 'Unlike' }).count()) === 1);
    const top = () => page.locator('.sh-list').evaluate((el) => el.scrollTop);
    await page.getByRole('button', { name: 'Next Short' }).click();
    await wait(1200);
    const second = await page.locator('.sh-item[data-index="1"]').evaluate((el) => el.offsetTop);
    check('the down button moves to the next Short', Math.abs((await top()) - second) < 4, (await top()) + ' vs ' + second);
    await page.getByRole('button', { name: 'Previous Short' }).click();
    await wait(1200);
    check('the up button goes back', (await top()) < 4);
    await page.locator('body').click({ position: { x: 1200, y: 300 } });
    await page.keyboard.press('ArrowDown');
    await wait(1200);
    check('↓ moves to the next Short', Math.abs((await top()) - second) < 4);
    await page.keyboard.press('ArrowUp');
    await wait(1200);
    check('↑ goes back', (await top()) < 4);

    /* ---------- watching a live ---------- */
    await goto('/live/' + DEMO_LIVE);
    await page.waitForSelector('.lv-line');
    await wait(600);
    check('the live shows who, its title and LIVE', (await page.locator('.lv-head').innerText()).includes('samuel_boateng') && (await page.locator('.lv-head').innerText()).includes('Vespers on the hill') && (await page.locator('.lv-pill').count()) === 1);
    check('comments stored on the server are shown', (await page.locator('.lv-line').count()) === 3 && (await page.locator('.lv-line').last().innerText()).includes('Amen'));
    check('a live with a fundraiser has Donate', (await page.getByRole('button', { name: 'Donate' }).count()) === 1);
    await page.getByLabel('Comment', { exact: true }).fill('Praying with you');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('.lv-line')].some((l) => l.textContent.includes('Praying with you')), null, { timeout: 5000 }).catch(() => {});
    check('my comment posts and shows under my name', (await page.locator('.lv-line').last().innerText()).replace(/\s+/g, ' ').startsWith('you Praying with you'));
    check('I can remove my own comment', (await page.locator('.lv-line').last().getByRole('button', { name: 'Remove comment' }).count()) === 1 && (await page.locator('.lv-line').first().getByRole('button', { name: 'Remove comment' }).count()) === 0);
    await shot(page, 'live');
    await page.getByRole('button', { name: 'Donate' }).click();
    await wait(500);
    check('Donate opens the fundraiser', (await page.evaluate(() => location.hash)) === '#/fundraisers/fr_media');

    /* ---------- going live ---------- */
    await goto('/live/new');
    await page.waitForFunction(() => document.querySelector('.lv-host video')?.srcObject?.getVideoTracks().length === 1, null, { timeout: 10000 }).catch(() => {});
    check('the camera preview opens', await page.evaluate(() => document.querySelector('.lv-host video')?.srcObject?.getVideoTracks().length === 1));
    check('and the microphone', await page.evaluate(() => document.querySelector('.lv-host video')?.srcObject?.getAudioTracks().length === 1) && (await page.getByRole('meter', { name: 'Microphone level' }).count()) === 1);
    check('Followers by default', (await page.locator('.lv-audience-pill').innerText()) === 'Share with Followers');
    await page.locator('.lv-audience-pill').click();
    await page.getByRole('radio', { name: 'Practice' }).click();
    await wait(200);
    check('Practice: only you', (await page.locator('.lv-audience-pill').innerText()) === 'Practice · only you');
    await page.getByRole('button', { name: 'Fundraiser', exact: true }).click();
    await page.getByRole('radio', { name: 'Minibus for youth camp' }).click();
    await wait(200);
    check('a fundraiser of mine can go with the live', (await page.locator('.lv-chip').innerText()).includes('Minibus for youth camp'));
    await page.getByLabel('Live title').fill('Testing from the Mac');
    await shot(page, 'golive-setup');
    await page.getByRole('button', { name: 'Go live' }).click();
    await page.waitForSelector('.lv-host.is-live', { timeout: 10000 }).catch(() => {});
    check('Go live starts the broadcast', (await page.locator('.lv-host.is-live .lv-pill').count()) === 1 && /[0-9a-f-]{36}/.test((await page.locator('.lv-stage').getAttribute('data-live-id')) || ''));
    check('it says only I can see a practice', (await page.locator('.lv-audience').innerText()).includes('only you'));
    check('with my title and nobody watching yet', (await page.locator('.lv-head').innerText()).includes('Testing from the Mac') && (await page.locator('.lv-count').innerText()).trim() === '0');
    await page.getByLabel('Comment', { exact: true }).fill('Testing, testing');
    await page.keyboard.press('Enter');
    await wait(800);
    check('I can comment on my own live', (await page.locator('.lv-line').last().innerText()).includes('Testing, testing'));
    await page.getByRole('button', { name: 'Mute', exact: true }).click();
    await page.getByRole('button', { name: 'Turn camera off' }).click();
    await wait(200);
    check('the microphone and camera switch off', await page.evaluate(() => { const s = document.querySelector('.lv-host video').srcObject; return !s.getAudioTracks()[0].enabled && !s.getVideoTracks()[0].enabled; }) && (await page.locator('.lv-camoff').count()) === 1);
    await page.getByRole('button', { name: 'Turn camera on' }).click();
    await page.getByRole('button', { name: 'Unmute' }).click();
    await shot(page, 'golive-live');
    await page.getByRole('button', { name: 'End', exact: true }).click();
    await page.waitForSelector('.confirm');
    check('End asks first', (await page.locator('.confirm').innerText()).includes('End your live?'));
    await page.locator('.confirm').getByRole('button', { name: 'End live' }).click();
    await wait(900);
    check('ending leaves the screen and turns the camera off', (await page.locator('.lv-host').count()) === 0 && (await page.evaluate(() => location.hash)) !== '#/live/new');

    // Schedule a live, see it in the list, cancel it
    await goto('/live/new');
    await page.waitForSelector('.lv-side.left');
    await page.locator('.lv-side.left').getByRole('button', { name: 'Schedule a live' }).click();
    await page.waitForSelector('.lv-schedule .lv-sched-row');
    const sched = page.locator('.lv-schedule');
    check('Schedule a live lists my upcoming lives', (await sched.locator('.lv-sched-row').count()) === 1 && (await sched.innerText()).includes('Youth Bible study') && (await sched.innerText()).includes('Tomorrow 7:00 pm'));
    await sched.getByRole('button', { name: 'Schedule a live' }).click();
    await sched.getByLabel('Live title').fill('Choir rehearsal live');
    await sched.getByLabel('Day').selectOption({ index: 2 });
    await sched.getByLabel('Time').selectOption({ index: 3 });
    await sched.getByRole('button', { name: 'Schedule', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.lv-schedule .lv-sched-row').length === 2, null, { timeout: 5000 }).catch(() => {});
    check('a new live is scheduled', (await sched.locator('.lv-sched-row').count()) === 2 && (await page.locator('.toast', { hasText: 'Scheduled for' }).count()) >= 1);
    await shot(page, 'schedule');
    await sched.locator('.lv-sched-row', { hasText: 'Choir rehearsal live' }).getByRole('button', { name: 'Cancel' }).click();
    await page.locator('.confirm').getByRole('button', { name: 'Cancel live' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.lv-schedule .lv-sched-row').length === 1, null, { timeout: 5000 }).catch(() => {});
    check('and cancelled', (await sched.locator('.lv-sched-row').count()) === 1 && !(await sched.innerText()).includes('Choir rehearsal live'));
    await page.keyboard.press('Escape');
    await page.locator('.lv-setup-top').getByRole('button', { name: 'Close' }).click();
    await wait(500);
    await page.context().close();

    /* ---------- a real broadcast between two windows ---------- */
    const host = await open(null);
    const viewer = await open('u_grace');
    await host.exposeFunction('__relayOut', (m) => viewer.evaluate((x) => window.__relayIn && window.__relayIn(x), m).catch(() => {}));
    await viewer.exposeFunction('__relayOut', (m) => host.evaluate((x) => window.__relayIn && window.__relayIn(x), m).catch(() => {}));
    await viewer.goto(BASE);
    await viewer.waitForSelector('.rail');
    await host.goto(BASE + '#/live/new');
    await host.waitForFunction(() => document.querySelector('.lv-host video')?.srcObject, null, { timeout: 10000 });
    await host.getByLabel('Live title').fill('Sabbath greetings');
    await host.getByRole('button', { name: 'Go live' }).click();
    await host.waitForSelector('.lv-host.is-live', { timeout: 10000 });
    const liveId = await host.locator('.lv-stage').getAttribute('data-live-id');
    // The live's row reaches the other window as it would through the database.
    await viewer.evaluate((id) => window.__relayIn({ kind: 'row', table: 'community_lives', row: { id, user_id: 'demo_me', title: 'Sabbath greetings', started_at: new Date().toISOString(), created_at: new Date().toISOString(), ended_at: null, viewers: 0, audience: 'followers', fundraiser_id: null } }), liveId);
    await viewer.evaluate((id) => (location.hash = '/live/' + id), liveId);
    const playing = await viewer
      .waitForFunction(() => { const v = document.querySelector('.lv-video'); return v && v.srcObject && v.videoWidth > 0; }, null, { timeout: 25000 })
      .then(() => true, () => false);
    check("the viewer's window plays the broadcaster's camera", playing);
    check('the broadcaster sees one person watching', (await host.locator('.lv-count').innerText()).trim() === '1');
    await viewer.getByRole('button', { name: 'Send a heart' }).click();
    await host.waitForSelector('.lv-hearts span', { timeout: 5000 }).catch(() => {});
    check("the viewer's heart floats up on the broadcaster's screen", (await host.locator('.lv-hearts span').count()) >= 1);
    if (SHOTS) {
      await host.screenshot({ path: `${SHOTS}/stories-broadcast-host.png` });
      await viewer.screenshot({ path: `${SHOTS}/stories-broadcast-viewer.png` });
    }
    await host.getByRole('button', { name: 'End', exact: true }).click();
    await host.locator('.confirm').getByRole('button', { name: 'End live' }).click();
    await viewer.waitForSelector('.lv-over', { timeout: 8000 }).catch(() => {});
    check('ending the live tells the viewer', (await viewer.locator('.lv-over h2').innerText().catch(() => '')) === 'The live has ended');

    check('no script errors', errors.length === 0, errors.join(' | '));
  } catch (e) {
    console.log('TEST CRASHED: ' + e.message.split('\n').slice(0, 6).join('\n'));
    failed++;
  }
  await browser.close();
  console.log(failed ? `${failed} CHECK(S) FAILED` : 'ALL STORIES CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})();
