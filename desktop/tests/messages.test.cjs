// Messages, the small inbox and notes: the inbox layout, notes (writing one with a song, a place,
// close friends and a colour; a friend's note and replying to it), who is active, streaks,
// view-once photos both ways, screenshot notices, the new-message picker, the small inbox's own
// chat, calls from the chat header, and Erha's daily allowance. Dark and White screenshots.
// Usage: node tests/messages.test.cjs http://127.0.0.1:8806/ [screenshot folder]
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8806/';
const SHOTS = process.argv[3] || '';
const PHOTO = path.join(__dirname, '../src/fake/media/01.jpg');
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || extra === '' ? '' : ' (' + extra + ')'));
  if (!ok) failed++;
};

async function newPage(browser, errors, as) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    return u.startsWith(BASE) || u.startsWith('blob:') || u.startsWith('data:') ? r.continue() : r.abort();
  });
  if (as) await page.addInitScript((id) => (window.__fakeMe = id), as);
  return page;
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await newPage(browser, errors);
  const goto = async (hash, wait = 700) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForTimeout(wait);
  };
  const shot = async (name) => {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') });
  };
  const text = (sel) => page.locator(sel).first().innerText().catch(() => '');
  try {
    await page.goto(BASE + '#/direct');
    await page.waitForSelector('.thread-row');
    await page.waitForSelector('.nt-face >> nth=2');

    /* ---------- the inbox ---------- */
    check('the inbox is headed with your username', (await text('.threads-head h2')) === 'you');
    check('a compose button starts a new message', (await page.locator('.threads-head').getByRole('button', { name: 'New message' }).count()) === 1);
    check('chats are listed under "Messages"', (await text('.threads-sub')) === 'Messages' && (await page.locator('.thread-row').count()) >= 3);
    const empty = await text('.chat-empty');
    check('with no chat open, the right side invites you to send a message', empty.includes('Your messages') && empty.includes('Send a message to start a chat') && empty.includes('Send message'));

    // Notes
    const faces = page.locator('.nt-face');
    check('your note comes first, "Note…" while you have none', (await faces.first().innerText()).includes('Note…') && (await faces.first().innerText()).includes('Your note'));
    check("friends' notes show over their pictures", (await faces.count()) === 3, String(await faces.count()));
    check("Grace's note shows its song", (await page.locator('.nt-face', { hasText: 'Grace' }).locator('.nt-song').innerText()).includes('♪ Morning Hymn'));
    check("Daniel's note shows its place", (await page.locator('.nt-face', { hasText: 'Daniel' }).locator('.nt-place').innerText()).includes('Kumasi Central'));
    check("Daniel's note keeps its colour", (await page.locator('.nt-face', { hasText: 'Daniel' }).locator('.nt-bubble').evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(61, 139, 255)');
    check('an expired note is not shown', (await page.locator('.nt-face', { hasText: 'Ruth' }).count()) === 0);

    // Active, streaks, unread
    const graceRow = page.locator('.thread-row', { hasText: 'Grace' });
    const danielRow = page.locator('.thread-row', { hasText: 'Daniel' });
    check('Grace has the green active dot', (await graceRow.locator('.mx-online').count()) === 1);
    check('Daniel has no dot, and shows when he was last active', (await danielRow.locator('.mx-online').count()) === 0 && (await danielRow.innerText()).includes('Active 5m ago'));
    check('the 5-day streak with Grace shows', (await graceRow.locator('.mx-streak').innerText()).replace(/\s/g, '') === '🔥5');
    check('an unread chat is bold with a blue dot', (await graceRow.getAttribute('class')).includes('unread') && (await graceRow.locator('.mx-dot').evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(61, 139, 255)');
    await shot('messages-inbox-dark');

    /* ---------- writing a note ---------- */
    await faces.first().click();
    await page.waitForSelector('.nt-editor');
    let editor = page.locator('.nt-editor');
    await editor.getByLabel('Your note').fill('x'.repeat(75));
    check('a note stops at 60 characters', (await editor.getByLabel('Your note').inputValue()).length === 60);
    await editor.getByLabel('Your note').fill('Sabbath lunch at ours, all welcome');
    check('the editor counts characters as you type', (await editor.locator('.nt-count').first().innerText()) === '34/60');
    check('it says notes disappear after 24 hours', (await editor.innerText()).includes('Notes disappear after 24 hours'));
    await editor.getByRole('button', { name: /^Music/ }).click();
    await page.waitForSelector('.nt-song-pick');
    await page.getByLabel('Search songs on Pod').fill('evening');
    await page.waitForFunction(() => document.querySelectorAll('.nt-song-pick').length === 1);
    check('songs are searched on Pod', (await text('.nt-song-pick')).includes('Evening Prayer'));
    await page.getByRole('button', { name: /^Preview Evening Prayer/ }).click();
    await page.waitForSelector('.now-playing');
    check('a song can be previewed with the app player', (await text('.now-playing b')).includes('Evening Prayer'));
    await page.getByRole('button', { name: /^Choose Evening Prayer/ }).click();
    editor = page.locator('.nt-editor');
    check('the chosen song shows in the bubble', (await editor.locator('.nt-input-bubble .nt-song').innerText()).includes('Evening Prayer'));
    await editor.getByLabel('Location').fill('Hillside church hall');
    await editor.getByRole('radio', { name: /^Close friends/ }).click();
    await editor.getByRole('radio', { name: 'Purple' }).click();
    check('a colour can be picked, including the theme\'s own', (await editor.getByRole('radio', { name: 'Theme colour' }).count()) === 1 && (await editor.getByRole('radio', { name: 'Purple' }).getAttribute('aria-checked')) === 'true');
    await shot('messages-note-editor-dark');
    await editor.getByRole('button', { name: 'Share' }).click();
    await page.waitForSelector('.nt-editor', { state: 'detached' });
    await page.waitForTimeout(300);
    const mine = page.locator('.nt-face').first();
    check('your note appears first', (await mine.innerText()).includes('Sabbath lunch at ours'));
    check('with its song', (await mine.locator('.nt-song').innerText()).includes('Evening Prayer'));
    check('in the colour you chose', (await mine.locator('.nt-bubble').evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(139, 92, 246)');
    check('the song preview stops when the editor closes', (await page.locator('.now-playing').getByRole('button', { name: 'Play', exact: true }).count()) === 1);
    await mine.click();
    await page.waitForSelector('.nt-editor');
    editor = page.locator('.nt-editor');
    check('reopening keeps close friends and the place', (await editor.getByRole('radio', { name: /^Close friends/ }).getAttribute('aria-checked')) === 'true' && (await editor.getByLabel('Location').inputValue()) === 'Hillside church hall');
    await editor.getByRole('button', { name: 'Delete note' }).click();
    await page.locator('.confirm').getByRole('button', { name: 'Delete' }).click();
    await page.waitForSelector('.nt-editor', { state: 'detached' });
    await page.waitForTimeout(300);
    check('deleting it brings back "Note…"', (await page.locator('.nt-face').first().innerText()).includes('Note…'));

    /* ---------- a friend's note, and replying ---------- */
    await page.locator('.nt-face', { hasText: 'Grace' }).click();
    await page.waitForSelector('.nt-card');
    check("a friend's note opens in a card", (await text('.nt-card')).includes('Choir practice tonight'));
    check('its song plays in the app player', (await text('.now-playing b')).includes('Morning Hymn'));
    await page.locator('.nt-card').getByRole('button', { name: 'Reply to Grace' }).click();
    await page.waitForFunction(() => location.hash === '#/direct/t/t1');
    await page.waitForSelector('.chat-head');
    await page.waitForTimeout(500);
    check('replying opens the chat with the note quoted', (await page.getByLabel(/^Message grace/).inputValue()).startsWith('Replying to your note: ‘Choir practice tonight'));
    await page.getByLabel(/^Message grace/).fill('');

    /* ---------- the chat ---------- */
    check('the header says "Active now"', (await text('.chat-who')).includes('Active now'));
    check('the header shows the streak', (await page.locator('.chat-head .mx-streak').innerText()).includes('5'));
    check('voice and video call buttons are in the header', (await page.locator('.chat-head').getByRole('button', { name: 'Voice call' }).count()) === 1 && (await page.locator('.chat-head').getByRole('button', { name: 'Video call' }).count()) === 1);
    check("Grace's note shows over her picture in the chat", (await page.locator('.chat-intro .nt-anchor').innerText()).includes('Choir practice'));

    // A view-once photo sent to me
    const theirs = page.locator('.msg:not(.mine) .cv-snap');
    check('a view-once photo arrives as "Photo · View once"', (await theirs.innerText()).includes('Photo') && (await theirs.innerText()).includes('View once'));
    check('the photo itself is not drawn in the chat', (await page.locator('.chat-log .msg-photo').count()) === 0);
    await theirs.click();
    await page.waitForSelector('.cv-snapview img');
    await page.waitForFunction(() => document.querySelector('.cv-snapview img')?.naturalWidth > 0);
    check('opening it shows the photo, full window', (await page.locator('.cv-snapview').innerText()).includes('View once'));
    await shot('messages-snap-viewer');
    await page.locator('.cv-snapview').getByRole('button', { name: 'Close' }).click();
    await page.waitForTimeout(400);
    check('afterwards it reads "Opened"', (await theirs.innerText()).includes('Opened'));
    check('and cannot be opened again', await theirs.isDisabled());
    check('my own view-once photo says "Opened" once they have', (await page.locator('.msg.mine .cv-snap').first().innerText()).includes('Opened'));

    // Sending a photo as view once
    await page.locator('.composer input[type=file]').setInputFiles(PHOTO);
    await page.waitForSelector('.cv-pending img');
    check('an attached photo waits with a "View once" switch', (await page.getByRole('switch', { name: 'View once' }).getAttribute('aria-checked')) === 'false');
    await page.getByRole('switch', { name: 'View once' }).click();
    check('the switch turns on', (await page.getByRole('switch', { name: 'View once' }).getAttribute('aria-checked')) === 'true');
    await page.getByRole('button', { name: 'Send as view once' }).click();
    await page.waitForSelector('.cv-pending', { state: 'detached' });
    await page.waitForTimeout(500);
    check('it is sent as view once, reading "Delivered"', (await page.locator('.msg.mine .cv-snap').last().innerText()).includes('Delivered'));
    check('and is not drawn as a photo', (await page.locator('.chat-log .msg-photo').count()) === 0);
    await page.waitForTimeout(2200);
    await shot('messages-chat-dark');

    // Another chat: a screenshot notice, a call, a photo and a voice message
    await goto('/direct/t/t2', 900);
    await page.waitForSelector('.cv-notice');
    check('a screenshot notice is a quiet line in the middle', (await text('.cv-notice')) === 'Daniel took a screenshot of the chat');
    check('call logs, photos and voice messages show', (await page.locator('.bubble.call').count()) === 1 && (await page.locator('.msg-photo').count()) === 1 && (await page.locator('.bubble.voice').count()) === 1);
    check('the header says when Daniel was active', (await text('.chat-who')).includes('Active 5m ago'));
    check('"Seen" shows under your last message once they have read it', (await page.locator('.chat-log .seen').count()) === 1 && (await page.locator('.chat-log > *').last().innerText()) === 'Seen');
    await page.getByRole('button', { name: 'Conversation information' }).click();
    check('information opens the details beside the chat', (await text('.cv-details')).includes('Mute messages') && (await text('.cv-details')).includes('Delete chat'));
    await page.locator('.cv-details').getByRole('switch', { name: 'Mute messages' }).click();
    await page.waitForTimeout(700);
    check('muting shows the muted mark in the list', (await danielRow.locator('.mx-muted').count()) === 1);
    await page.locator('.cv-details').getByRole('switch', { name: 'Mute messages' }).click();
    await page.waitForTimeout(500);

    // Erha keeps working
    await page.locator('.thread-row', { hasText: 'Erha' }).click();
    await page.waitForSelector('.chat-head');
    await page.getByLabel(/^Message erha/).fill('Which hymn is Blessed Assurance?');
    await page.locator('.composer').getByRole('button', { name: 'Send' }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.msg:not(.mine) .bubble')].some((b) => b.textContent.includes('sample answer')), null, { timeout: 6000 }).then(
      () => check('Erha answers in the chat', true),
      () => check('Erha answers in the chat', false),
    );

    /* ---------- new message ---------- */
    await goto('/direct');
    await page.locator('.chat-empty').getByRole('button', { name: 'Send message' }).click();
    await page.waitForSelector('.mx-new .mx-pick');
    check('Send message opens the people picker at /direct/new', (await page.evaluate(() => location.hash)) === '#/direct/new' && (await text('.mx-new')).includes('Suggested'));
    check('recent chats are suggested first', (await page.locator('.mx-pick').first().innerText()).includes('Grace') || (await page.locator('.mx-pick').first().innerText()).includes('Erha'));
    await page.locator('.mx-new').getByLabel('Search people').fill('ruth');
    await page.waitForFunction(() => document.querySelectorAll('.mx-pick').length === 1 && document.querySelector('.mx-pick').textContent.includes('Ruth'));
    await page.locator('.mx-pick').first().click();
    await page.locator('.mx-new').getByRole('button', { name: 'Chat' }).click();
    await page.waitForSelector('.chat-head');
    check('picking someone opens a chat with them', (await page.evaluate(() => location.hash)).startsWith('#/direct/t/') && (await text('.chat-who')).includes('Ruth'));

    /* ---------- the small inbox ---------- */
    await goto('/');
    await page.waitForSelector('.dock-pill');
    check('the floating button shows "Messages" and three faces', (await text('.dock-pill')).includes('Messages') && (await page.locator('.dock-faces .avatar').count()) === 3);
    await page.locator('.dock-pill').click();
    await page.waitForSelector('.dock-row');
    check('the small inbox lists chats with a compose button', (await page.locator('.dock-row').count()) >= 3 && (await page.locator('.dock-panel').getByRole('button', { name: 'New message' }).count()) === 1);
    await page.locator('.dock-row', { hasText: 'Grace' }).click();
    await page.waitForSelector('.dock-panel .composer');
    check('a chat opens inside the small inbox, without leaving the page', (await page.evaluate(() => location.hash)) === '#/' && (await text('.dock-panel .chat-who')).includes('Grace'));
    await page.locator('.dock-panel').getByLabel(/^Message grace/).fill('See you at practice!');
    await page.locator('.dock-panel .composer').getByRole('button', { name: 'Send' }).click();
    await page.waitForSelector('.dock-panel .bubble.mine >> text=See you at practice!');
    check('and sends a message from there', true);
    await page.waitForTimeout(2600);
    check('the reply arrives in the small inbox', (await page.locator('.dock-panel .msg:not(.mine) .bubble').filter({ hasText: 'Amen' }).count()) >= 1);
    await shot('messages-dock-chat-dark');
    await page.locator('.dock-panel').getByRole('button', { name: 'Back to messages' }).click();
    check('back returns to the list', (await page.locator('.dock-panel .dock-row').count()) >= 3);
    await page.locator('.dock-row', { hasText: 'Grace' }).click();
    await page.waitForSelector('.dock-panel .composer');
    await page.locator('.dock-panel').getByRole('button', { name: 'Open the full chat' }).click();
    await page.waitForTimeout(800);
    check('expand opens the full chat', (await page.evaluate(() => location.hash)) === '#/direct/t/t1' && (await page.locator('.dock-pill, .dock-panel').count()) === 0);
    await goto('/');
    await page.locator('.dock-pill').click();
    await page.locator('.dock-panel').getByRole('button', { name: 'New message' }).click();
    await page.waitForSelector('.mx-new');
    check("the small inbox's compose button opens the picker", (await page.evaluate(() => location.hash)) === '#/direct/new');
    await page.keyboard.press('Escape');

    /* ---------- White ---------- */
    await page.evaluate(() => localStorage.setItem('community.appearance', 'white'));
    await page.reload();
    await page.waitForSelector('.rail');
    await goto('/direct/t/t1', 1200);
    check('White turns the inbox white', (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(255, 255, 255)');
    check('your bubbles stay green in White', (await page.locator('.bubble.mine').first().evaluate((el) => getComputedStyle(el).backgroundImage)).includes('rgb(31, 191, 90)'));
    check('their bubbles are light grey in White', (await page.locator('.msg:not(.mine) .bubble').first().evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(228, 231, 235)');
    await shot('messages-chat-white');
    await page.locator('.nt-face').first().click();
    await page.waitForSelector('.nt-editor');
    await page.locator('.nt-editor').getByLabel('Your note').fill('Hello from the White theme');
    await page.waitForTimeout(300);
    await shot('messages-note-editor-white');
    await page.keyboard.press('Escape');
    await goto('/');
    await page.locator('.dock-pill').click();
    await page.locator('.dock-row', { hasText: 'Daniel' }).click();
    await page.waitForSelector('.dock-panel .cv-notice');
    await page.waitForTimeout(400);
    await shot('messages-dock-chat-white');
    await page.evaluate(() => localStorage.setItem('community.appearance', 'dark'));

    /* ---------- Erha's daily allowance (Grace, without Plus, has used hers) ---------- */
    const grace = await newPage(browser, errors, 'u_grace');
    await grace.goto(BASE + '#/direct/erha');
    await grace.waitForSelector('.chat-head');
    await grace.getByLabel(/^Message erha/).fill('One more question');
    await grace.locator('.composer').getByRole('button', { name: 'Send' }).click();
    const limited = await grace.waitForSelector('.cv-limit', { timeout: 6000 }).then(() => true, () => false);
    check("past the daily allowance, Erha's limit message shows", limited && (await grace.locator('.cv-limit').innerText()).includes("You have used today's 15 messages"));
    check('Erha says it in the chat too', (await grace.locator('.msg:not(.mine) .bubble').filter({ hasText: "today's 15 messages" }).count()) === 1);
    check('with a way to get Plus', (await grace.locator('.cv-limit').getByRole('link', { name: 'Get Plus' }).count()) === 1);
    await grace.context().close();

    check('no script errors', errors.length === 0, errors.join(' | '));
  } catch (e) {
    console.log('TEST CRASHED: ' + e.message.split('\n').slice(0, 4).join(' '));
    await shot('messages-crash');
    failed++;
  }
  await browser.close();
  console.log(failed ? `${failed} CHECK(S) FAILED` : 'ALL MESSAGES CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})();
