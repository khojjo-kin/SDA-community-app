// Messages, the small inbox and notes: the inbox layout, notes (writing one with a song, a place,
// close friends and a colour; a friend's note and replying to it), who is active, streaks,
// view-once photos both ways, screenshot notices, the new-message picker, the small inbox's own
// chat, calls from the chat header, and Erha's daily allowance. Voice messages (click to record,
// hold to record, discard, too short, no microphone access; saved as a file an iPhone plays), chat
// wallpapers (Plus, and the upsell without it), photo piles, forwarding, the photo viewer, reading
// quietly, and the friends' map (pins, list, zoom and drag, sharing and who sees it, stopping).
// Dark and White screenshots.
// Usage: node tests/messages.test.cjs http://127.0.0.1:8802/ [screenshot folder]
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8802/';
const SHOTS = process.argv[3] || '';
const PHOTO = path.join(__dirname, '../src/fake/media/01.jpg');
const PHOTO2 = path.join(__dirname, '../src/fake/media/02.jpg');
const PHOTO3 = path.join(__dirname, '../src/fake/media/04.jpg');
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || extra === '' ? '' : ' (' + extra + ')'));
  if (!ok) failed++;
};

/** A window of its own (as someone else with `as`), with `opts` for the browser context (location access). */
async function newPage(browser, errors, as, opts = {}) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    return u.startsWith(BASE) || u.startsWith('blob:') || u.startsWith('data:') ? r.continue() : r.abort();
  });
  if (as) await page.addInitScript((id) => (window.__fakeMe = id), as);
  // Every file the page makes (recordings among them), so the test can see what was uploaded.
  await page.addInitScript(() => {
    const make = URL.createObjectURL.bind(URL);
    window.__blobs = [];
    URL.createObjectURL = (b) => {
      const url = make(b);
      if (b instanceof Blob) window.__blobs.push({ url, blob: b, type: b.type });
      return url;
    };
  });
  return page;
}

(async () => {
  // Chromium's stand-in microphone (a tone), allowed without asking.
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errors = [];
  const page = await newPage(browser, errors, null, { permissions: ['clipboard-read', 'clipboard-write'] });
  const goto = async (hash, wait = 700) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForTimeout(wait);
  };
  // Screenshots wait a moment for dialogs and fades to finish.
  const snap = async (p, name) => {
    if (!SHOTS) return;
    await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(SHOTS, name + '.png') });
  };
  const shot = (name) => snap(page, name);
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

    /* ---------- voice messages ---------- */
    await goto('/direct/t/t2', 900);
    await page.waitForSelector('.chat-head');
    const myVoices = page.locator('.chat-log .msg.mine .bubble.voice');
    const voicesBefore = await myVoices.count();
    const mic = page.locator('.composer').getByRole('button', { name: 'Record a voice message' });
    check('an empty message box offers the microphone', (await mic.count()) === 1);
    await mic.click();
    await page.waitForSelector('.cv-rec');
    check('recording takes the message box’s place: discard, the time, send', (await page.locator('.composer').count()) === 0 && (await page.locator('.cv-rec').getByRole('button', { name: 'Discard recording' }).count()) === 1 && (await page.locator('.cv-rec').getByRole('button', { name: 'Send voice message' }).count()) === 1);
    const counted = await page.waitForFunction(() => /^0:0[1-9]$/.test(document.querySelector('.cv-rec-time')?.textContent || ''), null, { timeout: 6000 }).then(() => true, () => false);
    check('the time counts up while recording', counted, await text('.cv-rec-time'));
    check('calls are off while recording', await page.locator('.chat-head').getByRole('button', { name: 'Voice call' }).isDisabled());
    check('the bars follow the microphone', (await page.locator('.cv-rec-wave i').evaluateAll((els) => els.filter((e) => parseInt(e.style.height) > 3).length)) > 0);
    await page.waitForTimeout(900);
    await shot('messages-recording-dark');
    await page.locator('.cv-rec').getByRole('button', { name: 'Send voice message' }).click();
    const arrived = await page.waitForFunction((n) => document.querySelectorAll('.chat-log .msg.mine .bubble.voice').length > n, voicesBefore, { timeout: 8000 }).then(() => true, () => false);
    check('the voice message appears in the chat', arrived);
    const length = await myVoices.last().locator('.cv-voice-time').innerText().catch(() => '');
    check('with its length', /^0:0[2-4]$/.test(length), length);
    const saved = await page.evaluate(async () => {
      const db = window.__messagesDemo;
      const m = db.T('community_messages').filter((x) => x.thread_id === 't2' && x.sender_id === 'demo_me' && x.audio_url).pop();
      const b = window.__blobs.filter((x) => x.type.startsWith('audio/')).pop();
      const head = b ? await b.blob.slice(0, 12).text() : '';
      return { seconds: m?.audio_seconds ?? 0, type: b?.type ?? '', head, url: m?.audio_url ?? '', blobUrl: b?.url ?? '' };
    });
    check('it is sent with its length in seconds', saved.seconds >= 2 && saved.seconds <= 4, String(saved.seconds));
    // This Chromium can't record AAC, so the recording is a WAV file (iPhones play WAV); never labelled audio/mp4.
    check('it is uploaded as a WAV file, labelled audio/wav', saved.type === 'audio/wav' && saved.head.startsWith('RIFF') && saved.head.endsWith('WAVE'), JSON.stringify(saved));
    check('the message points at the uploaded recording', !!saved.url && saved.url === saved.blobUrl);
    await myVoices.last().getByRole('button', { name: 'Play voice message' }).click();
    const played = await page.waitForFunction(() => [...document.querySelectorAll('.chat-log .msg.mine .bubble.voice')].pop()?.querySelectorAll('.cv-wave i.on').length > 0, null, { timeout: 6000 }).then(() => true, () => false);
    check('it plays back', played);
    await page.waitForTimeout(3000);

    // Discarding, too short, Escape, holding the button
    await mic.click();
    await page.waitForSelector('.cv-rec');
    await page.waitForTimeout(1200);
    await page.locator('.cv-rec').getByRole('button', { name: 'Discard recording' }).click();
    await page.waitForSelector('.composer');
    await page.waitForTimeout(800);
    check('discard throws the recording away', (await myVoices.count()) === voicesBefore + 1 && (await page.locator('.cv-rec').count()) === 0);
    await mic.click();
    await page.waitForSelector('.cv-rec button[aria-label="Send voice message"]:not([disabled])');
    await page.locator('.cv-rec').getByRole('button', { name: 'Send voice message' }).click();
    await page.waitForSelector('.toast');
    check('a recording under a second is too short', (await page.locator('.toast', { hasText: 'That was too short. Record a little longer.' }).count()) === 1 && (await myVoices.count()) === voicesBefore + 1);
    await mic.click();
    await page.waitForSelector('.cv-rec button[aria-label="Send voice message"]:not([disabled])');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.composer');
    check('Escape discards a recording', (await page.locator('.cv-rec').count()) === 0);
    const box = await mic.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForSelector('.cv-rec');
    await page.waitForTimeout(1500);
    await page.mouse.up();
    const held = await page.waitForFunction((n) => document.querySelectorAll('.chat-log .msg.mine .bubble.voice').length > n, voicesBefore + 1, { timeout: 8000 }).then(() => true, () => false);
    check('holding the microphone records, and letting go sends', held && (await page.locator('.composer').count()) === 1);
    // Daniel's automatic demo reply lands first, so it doesn't come between the photos below.
    await page.waitForTimeout(2400);

    /* ---------- photos: a pile, the viewer, forwarding ---------- */
    const piles = page.locator('.chat-log .msg.mine .cv-pile');
    await page.locator('.composer input[type=file]').setInputFiles([PHOTO, PHOTO2, PHOTO3]);
    await page.waitForSelector('.cv-pending img >> nth=2');
    await page.getByRole('button', { name: 'Send 3 photos' }).click();
    await page.waitForSelector('.cv-pending', { state: 'detached', timeout: 10000 });
    await page.waitForTimeout(600);
    check('photos sent together show as one pile with "+1"', (await piles.count()) === 1 && (await piles.locator('.cv-pile-more').innerText()) === '+1');
    await piles.click();
    await page.waitForSelector('.cv-viewer img');
    check('the viewer steps through them', (await text('.cv-viewer-count')) === '1 of 3');
    await page.locator('.cv-viewer').getByRole('button', { name: 'Next photo' }).click();
    await page.keyboard.press('ArrowRight');
    check('with the buttons and the arrow keys', (await text('.cv-viewer-count')) === '3 of 3' && (await page.locator('.cv-viewer').getByRole('button', { name: 'Next photo' }).count()) === 0);
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.locator('.cv-viewer').getByRole('button', { name: 'Save photo' }).click()]);
    check('a photo can be saved to the computer', !!download && /^community-photo-\d+\.jpg$/.test(download.suggestedFilename()), download ? download.suggestedFilename() : 'no download');
    await shot('messages-photo-viewer');
    await page.locator('.cv-viewer').getByRole('button', { name: 'Forward' }).click();
    await page.waitForSelector('.mx-fwd .mx-pick');
    check('forward shows the photos and people to send them to', (await page.locator('.mx-fwd-photos img').count()) === 3);
    await page.locator('.mx-fwd .mx-pick', { hasText: 'Grace' }).locator('input').check();
    await page.locator('.mx-fwd').getByLabel('Message').fill('From Pathfinders');
    await page.locator('.mx-fwd').getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForSelector('.mx-fwd', { state: 'detached' });
    const fwd = await page.evaluate(() => window.__messagesDemo.T('community_messages').filter((m) => m.thread_id === 't1' && m.sender_id === 'demo_me').slice(-4).map((m) => (m.media_url ? 'photo' : m.text)));
    check('forwarding sends the photos and the words to that chat', fwd.join() === 'photo,photo,photo,From Pathfinders', fwd.join());

    /* ---------- copying a message ---------- */
    const said = page.locator('.chat-log .msg', { hasText: 'Pathfinders meet at 9' });
    await said.hover();
    await page.waitForTimeout(250);
    check('a message offers Copy when pointed at', (await said.locator('.cv-acts').evaluate((el) => getComputedStyle(el).opacity)) === '1');
    await said.getByRole('button', { name: 'Copy message' }).click();
    await page.waitForTimeout(300);
    check('and copies its words', (await page.evaluate(() => navigator.clipboard.readText().catch(() => ''))) === 'Pathfinders meet at 9 on Sunday, bring a torch.');

    /* ---------- a message on more than one line ---------- */
    const box2 = page.getByLabel(/^Message daniel/);
    await box2.click();
    await page.keyboard.type('Bring:');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('a torch and a Bible');
    check('Shift+Enter starts a new line, and the box grows', (await box2.inputValue()) === 'Bring:\na torch and a Bible' && (await box2.evaluate((el) => el.clientHeight)) > 40);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.chat-log .bubble.mine >> text=a torch and a Bible');
    check('Enter sends it, line breaks kept', (await page.locator('.chat-log .bubble.mine').filter({ hasText: 'a torch and a Bible' }).innerText()) === 'Bring:\na torch and a Bible' && (await box2.inputValue()) === '');

    /* ---------- chat wallpapers (Plus) ---------- */
    await goto('/direct/t/t1', 900);
    check('a chat starts without a wallpaper', (await page.locator('.chat-log').evaluate((el) => getComputedStyle(el).backgroundImage)) === 'none');
    await page.getByRole('button', { name: 'Conversation information' }).click();
    await page.locator('.cv-details').getByRole('button', { name: /^Wallpaper/ }).click();
    await page.waitForSelector('.mx-wall-modal');
    check('the chooser shows None and each wallpaper', (await page.locator('.mx-wall-modal [role=radio]').allInnerTexts()).map((t) => t.trim().split('\n').pop()).join() === 'None,Dusk,Olive grove,Galilee,Desert sand,Sharon rose,Royal');
    check('each with a sample chat', (await page.locator('.mx-wall-modal .mx-wall-sample').count()) === 7 && (await page.locator('.mx-wall-modal .mx-wall-preview.walled').count()) === 6);
    check('None is chosen to begin with', (await page.locator('.mx-wall-modal').getByRole('radio', { name: 'None' }).getAttribute('aria-checked')) === 'true');
    await page.locator('.mx-wall-modal').getByRole('radio', { name: 'Galilee' }).click();
    check('choosing one marks it', (await page.locator('.mx-wall-modal').getByRole('radio', { name: 'Galilee' }).getAttribute('aria-checked')) === 'true');
    await shot('messages-wallpaper-picker-dark');
    await page.locator('.mx-wall-modal').getByRole('button', { name: 'Done' }).click();
    await page.waitForSelector('.mx-wall-modal', { state: 'detached' });
    const walled = await page.locator('.chat-log').evaluate((el) => ({ bg: getComputedStyle(el).backgroundImage, id: el.dataset.wallpaper }));
    check('the chat is drawn over the wallpaper', walled.id === 'sea' && walled.bg.startsWith('linear-gradient') && walled.bg.includes('rgb(10, 31, 51)'), JSON.stringify(walled));
    check('the details say which', (await text('.cv-details .cv-detail-value')) === 'Galilee');
    check('times and "Seen" stay light over it', (await page.locator('.chat-log .chat-stamp').first().evaluate((el) => getComputedStyle(el).color)) === 'rgba(243, 245, 247, 0.72)');
    // Reporting asks why, as on the iPhone.
    await page.locator('.cv-details').getByRole('button', { name: 'Report' }).click();
    await page.waitForSelector('.confirm-text');
    check('Report asks why', (await page.locator('.choices button').allInnerTexts()).join() === 'Spam,Harassment or hate,Pretending to be someone else,Something else,Cancel');
    await page.locator('.choices').getByRole('button', { name: 'Spam' }).click();
    await page.waitForSelector('.toast >> text=Thanks. We will review this account.');
    check('and sends the reason', (await page.evaluate(() => window.__messagesDemo.T('community_reports').some((r) => r.target_user_id === 'u_grace' && r.reason === 'Spam'))) === true);
    await page.getByRole('button', { name: 'Conversation information' }).click();
    await page.waitForTimeout(300);
    await shot('messages-wallpaper-dark');
    await goto('/', 600);
    await page.locator('.dock-pill').click();
    await page.locator('.dock-row', { hasText: 'Grace' }).click();
    await page.waitForSelector('.dock-panel .chat-log');
    check('the small inbox’s chat has it too', (await page.locator('.dock-panel .chat-log').getAttribute('data-wallpaper')) === 'sea');

    /* ---------- a voice message from the small inbox ---------- */
    const dockVoices = page.locator('.dock-panel .msg.mine .bubble.voice');
    const dockBefore = await dockVoices.count();
    await page.locator('.dock-panel').getByRole('button', { name: 'Record a voice message' }).click();
    await page.waitForSelector('.dock-panel .cv-rec');
    await page.waitForTimeout(1400);
    await shot('messages-dock-recording-dark');
    await page.locator('.dock-panel .cv-rec').getByRole('button', { name: 'Send voice message' }).click();
    const dockSent = await page.waitForFunction((n) => document.querySelectorAll('.dock-panel .msg.mine .bubble.voice').length > n, dockBefore, { timeout: 8000 }).then(() => true, () => false);
    check('the small inbox records and sends voice messages too', dockSent);
    await page.locator('.dock-panel').getByRole('button', { name: 'Close messages' }).click();

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
    check('the wallpaper stays chosen after a reload', (await page.locator('.chat-log').getAttribute('data-wallpaper')) === 'sea');
    check('over the dark wallpaper, times and the name stay light in White', (await page.locator('.chat-log .chat-stamp').first().evaluate((el) => getComputedStyle(el).color)) === 'rgba(243, 245, 247, 0.72)' && (await page.locator('.chat-intro > b').evaluate((el) => getComputedStyle(el).color)) === 'rgb(243, 245, 247)');
    await shot('messages-wallpaper-white');
    await page.locator('.composer').getByRole('button', { name: 'Record a voice message' }).click();
    await page.waitForSelector('.cv-rec');
    await page.waitForTimeout(1600);
    await shot('messages-recording-white');
    await page.locator('.cv-rec').getByRole('button', { name: 'Discard recording' }).click();
    await page.waitForSelector('.composer');
    await page.getByRole('button', { name: 'Conversation information' }).click();
    await page.locator('.cv-details').getByRole('button', { name: /^Wallpaper/ }).click();
    await page.waitForSelector('.mx-wall-modal');
    await shot('messages-wallpaper-picker-white');
    await page.locator('.mx-wall-modal').getByRole('radio', { name: 'None' }).click();
    await page.locator('.mx-wall-modal').getByRole('button', { name: 'Done' }).click();
    await page.waitForSelector('.mx-wall-modal', { state: 'detached' });
    check('None takes the wallpaper away', (await page.locator('.chat-log').evaluate((el) => getComputedStyle(el).backgroundImage)) === 'none' && (await text('.cv-details .cv-detail-value')) === 'None');
    await page.getByRole('button', { name: 'Conversation information' }).click();
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

    /* ---------- Erha's daily allowance (Daniel, without Plus, has used his) ---------- */
    const grace = await newPage(browser, errors, 'u_daniel');
    await grace.goto(BASE + '#/direct/erha');
    await grace.waitForSelector('.chat-head');
    await grace.getByLabel(/^Message erha/).fill('One more question');
    await grace.locator('.composer').getByRole('button', { name: 'Send' }).click();
    const limited = await grace.waitForSelector('.cv-limit', { timeout: 6000 }).then(() => true, () => false);
    check("past the daily allowance, Erha's limit message shows", limited && (await grace.locator('.cv-limit').innerText()).includes("You have used today's 15 messages"));
    check('Erha says it in the chat too', (await grace.locator('.msg:not(.mine) .bubble').filter({ hasText: "today's 15 messages" }).count()) === 1);
    check('with a way to get Plus', (await grace.locator('.cv-limit').getByRole('link', { name: 'Get Plus' }).count()) === 1);

    /* ---------- wallpapers without Plus (Daniel) ---------- */
    // Even with one saved on this computer, it isn't drawn without Plus.
    await grace.evaluate(() => localStorage.setItem('community.prefs', JSON.stringify({ chatWallpaper: 'sea' })));
    await grace.reload();
    await grace.waitForSelector('.rail');
    await grace.evaluate(() => (location.hash = '#/direct/t/t2'));
    await grace.waitForSelector('.chat-head');
    await grace.waitForTimeout(500);
    check('without Plus, no wallpaper is drawn', (await grace.locator('.chat-log').evaluate((el) => getComputedStyle(el).backgroundImage)) === 'none');
    await grace.getByRole('button', { name: 'Conversation information' }).click();
    check('the details mark wallpapers as a Plus perk', (await grace.locator('.cv-details .cv-detail-value').innerText()) === 'Plus');
    await grace.locator('.cv-details').getByRole('button', { name: /^Wallpaper/ }).click();
    await grace.waitForSelector('.mx-wall-modal');
    check('the chooser leads to Community Plus', (await grace.locator('.mx-wall-upsell').innerText()).includes('A Community Plus perk') && (await grace.locator('.mx-wall-modal [aria-checked=true]').count()) === 0);
    await snap(grace, 'messages-wallpaper-upsell-dark');
    await grace.locator('.mx-wall-modal').getByRole('radio', { name: 'Dusk' }).click();
    await grace.waitForTimeout(500);
    check('choosing one opens Plus instead', (await grace.evaluate(() => location.hash)) === '#/plus' && (await grace.locator('.mx-wall-modal').count()) === 0);
    await grace.context().close();

    /* ---------- no microphone access ---------- */
    const denied = await newPage(browser, errors);
    await denied.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });
    await denied.goto(BASE + '#/direct/t/t1');
    await denied.waitForSelector('.chat-head');
    await denied.locator('.composer').getByRole('button', { name: 'Record a voice message' }).click();
    await denied.waitForSelector('.toast');
    check('without microphone access, it says how to allow it', (await denied.locator('.toast').innerText()).startsWith('Microphone access is off.') && (await denied.locator('.cv-rec').count()) === 0 && (await denied.locator('.composer').count()) === 1);

    /* ---------- reading quietly (Plus) ---------- */
    await denied.evaluate(() => localStorage.setItem('community.prefs', JSON.stringify({ readQuietly: true })));
    await denied.evaluate(() => (location.hash = '#/direct/t/t2'));
    await denied.reload();
    await denied.waitForSelector('.chat-head');
    await denied.waitForTimeout(900);
    const readAt = await denied.evaluate(() => window.__messagesDemo.T('community_thread_reads').find((r) => r.thread_id === 't2' && r.user_id === 'demo_me')?.last_read_at ?? null);
    check('reading quietly says so under the header', (await denied.locator('.cv-quiet').innerText()).includes('Reading quietly'));
    // The sample data last read this chat an hour ago; reading quietly leaves that as it was.
    check('and the chat is not marked read', !!readAt && Date.now() - new Date(readAt).getTime() > 30 * 60e3, String(readAt));
    await denied.evaluate(() => localStorage.setItem('community.prefs', JSON.stringify({ readQuietly: false })));
    await denied.reload();
    await denied.waitForSelector('.chat-head');
    await denied.waitForTimeout(900);
    const readNow = await denied.evaluate(() => window.__messagesDemo.T('community_thread_reads').find((r) => r.thread_id === 't2' && r.user_id === 'demo_me')?.last_read_at ?? null);
    check('reading normally marks it read', !!readNow && Date.now() - new Date(readNow).getTime() < 60e3 && (await denied.locator('.cv-quiet').count()) === 0, String(readNow));
    await denied.context().close();

    /* ---------- the friends' map ---------- */
    const map = await newPage(browser, errors, null, { permissions: ['geolocation'], geolocation: { latitude: 6.6936, longitude: -1.6163, accuracy: 25 } });
    await map.goto(BASE + '#/direct');
    await map.waitForSelector('.thread-row');
    await map.locator('.threads-head').getByRole('button', { name: 'Map' }).click();
    await map.waitForSelector('.mx-map-pin');
    await map.waitForTimeout(400);
    check('the inbox has a Map button that opens the map', (await map.evaluate(() => location.hash)) === '#/map');
    const pinNames = () => map.locator('.mx-map-pin .mx-map-label').allInnerTexts();
    check('friends sharing with you are faces on the map', (await pinNames()).sort().join() === 'Daniel,Grace', (await pinNames()).join());
    const rows = await map.locator('.mx-map-row').allInnerTexts();
    check('and listed beside it, with when they were updated', rows.length === 2 && rows[0].includes('Grace Mensah') && rows[0].includes('Updated 5m ago') && rows[1].includes('Daniel Owusu') && rows[1].includes('Updated 42m ago'), rows.join(' | '));
    check("people not sharing with you aren't shown (not following back, not on their close friends list, over a day old)", !(await map.locator('.mx-map-page').innerText()).match(/Samuel|Joseph|Esther/));
    check('the map is OpenStreetMap, credited', (await map.locator('.mx-map-credit').innerText()) === '© OpenStreetMap contributors' && (await map.locator('.mx-map-tiles img').first().getAttribute('src')).startsWith('https://tile.openstreetmap.org/'));
    check('without the tiles (offline here) the faces still show over a plain grid', (await map.locator('.mx-map-tiles img.in').count()) === 0 && (await map.locator('.mx-map-pin').count()) === 2);
    check('your location starts off', (await map.locator('.mx-map-status').innerText()).includes('Your location is off') && (await map.locator('.mx-map-status').innerText()).includes('2 friends are sharing with you.'));
    const spread = () => map.locator('.mx-map-pin').evaluateAll((els) => {
      const [a, b] = els.map((e) => e.getBoundingClientRect());
      return Math.hypot(a.x - b.x, a.y - b.y);
    });
    const d0 = await spread();
    await map.getByRole('button', { name: 'Zoom in' }).click();
    await map.waitForTimeout(600);
    const d1 = await spread();
    check('zooming in spreads the faces apart', d1 > d0 * 1.8, `${Math.round(d0)} → ${Math.round(d1)}`);
    const view = await map.locator('.mx-map-view').boundingBox();
    await map.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
    await map.mouse.wheel(0, 400);
    await map.waitForTimeout(300);
    const d2 = await spread();
    check('scrolling zooms out', d2 < d1 * 0.6, `${Math.round(d1)} → ${Math.round(d2)}`);
    const grace0 = await map.locator('.mx-map-pin', { hasText: 'Grace' }).boundingBox();
    await map.mouse.move(view.x + 200, view.y + 300);
    await map.mouse.down();
    await map.mouse.move(view.x + 280, view.y + 340, { steps: 4 });
    await map.mouse.move(view.x + 350, view.y + 360, { steps: 4 });
    await map.mouse.up();
    const grace1 = await map.locator('.mx-map-pin', { hasText: 'Grace' }).boundingBox();
    check('dragging moves the map', Math.abs(grace1.x - grace0.x - 150) < 3 && Math.abs(grace1.y - grace0.y - 60) < 3, `${Math.round(grace1.x - grace0.x)},${Math.round(grace1.y - grace0.y)}`);
    await map.getByRole('button', { name: 'Show everyone' }).click();
    await map.waitForTimeout(600);
    check('"Show everyone" frames them all again', Math.abs((await spread()) - d0) < 2);
    await map.locator('.mx-map-pin', { hasText: 'Grace' }).click();
    check("choosing a face shows who, when, and Message", (await map.locator('.mx-map-card').innerText()).includes('Grace Mensah') && (await map.locator('.mx-map-card').innerText()).includes('Updated 5m ago') && (await map.locator('.mx-map-card').getByRole('button', { name: 'Message' }).count()) === 1);
    await map.getByRole('button', { name: 'Show Daniel Owusu on the map' }).click();
    await map.waitForTimeout(500);
    check('choosing someone in the list goes to them', (await map.locator('.mx-map-card').innerText()).includes('Daniel Owusu') && (await map.locator('.mx-map-row.on').innerText()).includes('Daniel'));

    // Sharing your own place
    await map.getByRole('button', { name: 'Share my location' }).click();
    await map.waitForSelector('.mx-map-pin.mine');
    await map.waitForTimeout(400);
    const mineRow = await map.evaluate(() => window.__messagesDemo.T('community_locations').find((l) => l.user_id === 'demo_me'));
    check('sharing sends your place to mutual followers', !!mineRow && Math.abs(mineRow.lat - 6.6936) < 1e-6 && Math.abs(mineRow.lng + 1.6163) < 1e-6 && mineRow.audience === 'mutuals', JSON.stringify(mineRow));
    check('and says so', (await map.locator('.toast').filter({ hasText: 'Sharing your location with mutual followers' }).count()) === 1 && (await map.locator('.mx-map-status').innerText()).includes('Sharing your location') && (await map.locator('.mx-map-status').innerText()).includes('With mutual followers.'));
    check('your own face shows as "You"', (await map.locator('.mx-map-pin.mine .mx-map-label').innerText()) === 'You');
    await map.getByRole('button', { name: 'Location sharing settings' }).click();
    await map.waitForSelector('.mx-map-settings');
    check('the settings show sharing on, updated just now', (await map.locator('.mx-map-settings').getByRole('switch', { name: 'Share my location' }).getAttribute('aria-checked')) === 'true' && (await map.locator('.mx-map-set-text').innerText()).includes('On · updated just now'));
    check('and how long it lasts', (await map.locator('.mx-map-how').innerText()).includes('stays on until you turn it off'));
    await map.locator('.mx-map-settings').getByRole('radio', { name: /^Close friends/ }).click();
    await map.waitForTimeout(500);
    check('who can see it changes straight away', (await map.evaluate(() => window.__messagesDemo.T('community_locations').find((l) => l.user_id === 'demo_me')?.audience)) === 'close_friends' && (await map.locator('.mx-map-settings').getByRole('radio', { name: /^Close friends/ }).getAttribute('aria-checked')) === 'true');
    await snap(map, 'map-settings-dark');
    await map.keyboard.press('Escape');
    await map.locator('.mx-map-pin.mine').click();
    check('your face shows who sees it', (await map.locator('.mx-map-card').innerText()).includes('Sharing with close friends'));
    await map.getByRole('button', { name: 'Show Daniel Owusu on the map' }).click();
    await map.waitForTimeout(500);
    await snap(map, 'map-dark');
    await map.locator('.mx-map-card').getByRole('button', { name: 'Message' }).click();
    await map.waitForFunction(() => location.hash === '#/direct/t/t2');
    check('Message opens the chat with them', true);
    await map.evaluate(() => (location.hash = '#/map'));
    await map.waitForSelector('.mx-map-pin.mine');
    await map.getByRole('button', { name: 'Stop sharing' }).click();
    await map.waitForSelector('.mx-map-pin.mine', { state: 'detached' });
    check('stopping takes your place off the map and the server', (await map.evaluate(() => window.__messagesDemo.T('community_locations').some((l) => l.user_id === 'demo_me'))) === false && (await map.locator('.mx-map-status').innerText()).includes('Your location is off'));
    // White
    await map.evaluate(() => localStorage.setItem('community.appearance', 'white'));
    await map.reload();
    await map.waitForSelector('.mx-map-pin');
    await map.getByRole('button', { name: 'Share my location' }).click();
    await map.waitForSelector('.mx-map-pin.mine');
    await map.locator('.mx-map-pin', { hasText: 'Grace' }).click();
    await map.waitForTimeout(400);
    check('the map follows White', (await map.locator('.mx-map-side').evaluate((el) => getComputedStyle(el.closest('body')).backgroundColor)) === 'rgb(255, 255, 255)');
    await snap(map, 'map-white');
    await map.context().close();

    // Without location access, sharing explains how to allow it.
    await goto('/map', 900);
    await page.getByRole('button', { name: 'Share my location' }).click();
    await page.waitForSelector('.mx-map-problem', { timeout: 8000 }).catch(() => {});
    check('without location access, it says how to allow it', (await text('.mx-map-problem')).startsWith('Location access is off for Community.'), await text('.mx-map-problem'));

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
