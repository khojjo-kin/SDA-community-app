// The church area: the Bible (verse of the day, highlights and notes, Highlights & notes), Sabbath
// School (lesson progress, the publishers' posts, writing, editing, pinning and deleting a post,
// asking to publish), Pod (adding a track, the full player, shuffle and repeat) and editing a hymn.
// Usage: node tests/church.test.cjs http://127.0.0.1:8805/ [screenshot dir]
//
// The Bible text (bible-api.com) and the lessons (Adventech's Sabbath School service) come from
// outside the app, so this test answers those two services itself with small samples; every other
// request outside the app is refused.
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

/* ---------- the two outside services, answered here ---------- */

// Psalm 23 in the King James Version (public domain); other chapters get numbered sample verses.
const PSALM_23 = [
  'The LORD is my shepherd; I shall not want.',
  'He maketh me to lie down in green pastures: he leadeth me beside the still waters.',
  "He restoreth my soul: he leadeth me in the paths of righteousness for his name's sake.",
  'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.',
  'Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over.',
  'Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.',
];
function bibleChapter(url) {
  const ref = decodeURIComponent(new URL(url).pathname.slice(1)).replace(/\+/g, ' ');
  const m = /^(.*\D)\s*(\d+)$/.exec(ref.trim());
  const book = m ? m[1].trim() : ref;
  const chapter = m ? Number(m[2]) : 1;
  if (book === 'Psalms' && chapter === 23) return { verses: PSALM_23.map((text, i) => ({ verse: i + 1, text })) };
  const count = book === 'Psalms' && chapter === 119 ? 176 : 40;
  return { verses: Array.from({ length: count }, (_, i) => ({ verse: i + 1, text: `Sample words of ${book} ${chapter}:${i + 1}.` })) };
}

// One quarter of four lessons around today: lesson 2 is this week (weeks start on Sabbath).
const pad = (n) => String(n).padStart(2, '0');
const dmy = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const today = new Date();
const thisSabbath = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 1) % 7));
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const LESSONS = [1, 2, 3, 4].map((n) => {
  const start = addDays(thisSabbath, (n - 2) * 7);
  return { id: pad(n), title: ['Rest in Him', 'The Sabbath Was Made for Man', 'A Day of Delight', 'Rest for the Weary'][n - 1], start_date: dmy(start), end_date: dmy(addDays(start, 6)), index: 'en-2026-04-' + pad(n), path: '', full_path: '', cover: '' };
});
const QUARTER = { id: '2026-04', title: 'Rest in Christ', description: 'A quarter about rest.', human_date: 'October · November · December 2026', start_date: LESSONS[0].start_date, end_date: dmy(addDays(thisSabbath, 70)), cover: '', color_primary: '#1f6f50', lang: 'en', index: 'en-2026-04', path: '', full_path: '', quarterly_group: { name: 'Standard Adult', order: 1 } };
function lessonsApi(url) {
  const p = new URL(url).pathname.replace('/api/v2/en/', '');
  if (p === 'quarterlies/index.json') return [QUARTER];
  if (p === 'quarterlies/2026-04/index.json') return { quarterly: QUARTER, lessons: LESSONS };
  let m = /^quarterlies\/2026-04\/lessons\/(\d+)\/index\.json$/.exec(p);
  if (m) {
    const lesson = LESSONS.find((l) => l.id === m[1]);
    const [d, mo, y] = lesson.start_date.split('/').map(Number);
    const days = [1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: pad(i), title: i === 1 ? 'Introduction' : `Study ${i}`, date: dmy(new Date(y, mo - 1, d + i - 1)), index: '', path: '', full_path: '', read_path: '', full_read_path: '' }));
    return { lesson, days };
  }
  m = /^quarterlies\/2026-04\/lessons\/(\d+)\/days\/(\d+)\/read\/index\.json$/.exec(p);
  if (m) {
    const memory = m[2] === '01' ? '<p><strong>Memory Text:</strong> “Remember the sabbath day, to keep it holy” (Exodus 20:8, KJV).</p>' : '';
    return {
      id: m[2], title: m[2] === '01' ? 'Introduction' : `Study ${Number(m[2])}`, date: '', index: '',
      content: `${memory}<p>Read <a class="verse" verse="Exod208">Exodus 20:8</a> and think about the gift of rest.</p><p>${'This is the sample reading for the day. '.repeat(30)}</p>`,
      bible: [{ name: 'KJV', verses: { Exod208: '<h2>Exodus 20:8</h2><p><sup>8</sup>Remember the sabbath day, to keep it holy.</p>' } }],
    };
  }
  return null;
}

/** A short tone as a WAV file: a sound any browser can read the length of. */
function toneWav(seconds = 2, rate = 8000) {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) buf[44 + i] = 128 + Math.round(20 * Math.sin((2 * Math.PI * 440 * i) / rate));
  return buf;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let lessonsOffline = false;
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith('https://bible-api.com/')) return r.fulfill({ json: bibleChapter(u) });
    if (u.startsWith('https://sabbath-school.adventech.io/')) {
      if (lessonsOffline) return r.abort();
      const body = lessonsApi(u);
      return body ? r.fulfill({ json: body }) : r.fulfill({ status: 404, body: 'not found' });
    }
    return u.startsWith(BASE) || u.startsWith('blob:') || u.startsWith('data:') || u.startsWith('about:') ? r.continue() : r.abort();
  });
  const wait = (ms = 400) => page.waitForTimeout(ms);
  const goto = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await wait(600);
  };
  const text = (sel) => page.locator(sel).first().innerText();
  const shot = async (name) => SHOTS && page.screenshot({ path: path.join(SHOTS, name + '.png') });
  const toastSays = async (words) => {
    await page.locator('.toast', { hasText: words }).first().waitFor({ timeout: 4000 }).catch(() => {});
    return (await page.locator('.toast', { hasText: words }).count()) > 0;
  };
  const verse = (n) => page.locator(`.ch-verse[data-verse="${n}"]`);
  const appearance = async (theme) => {
    if ((await page.evaluate(() => document.documentElement.dataset.theme)) === theme) return;
    await page.locator('.rail').getByRole('button', { name: 'More' }).click();
    await page.locator('.more-pop').getByRole('menuitem', { name: 'Switch appearance' }).click();
    await page.locator('.pop-toggle').click();
    await page.mouse.click(720, 12);
    await wait(300);
  };

  try {
    await page.goto(BASE);
    await page.waitForSelector('.rail');

    /* ---------- Bible: verse of the day ---------- */
    await goto('/bible');
    await page.waitForSelector('.ch-votd');
    await page.waitForFunction(() => /Sample words|LORD/.test(document.querySelector('.ch-votd-text')?.textContent ?? ''));
    const votdRef = await text('.ch-votd-ref');
    check('the verse of the day shows at the top of the Bible, with its words and reference', /\d+:\d+/.test(votdRef) && (await text('.ch-votd-text')).startsWith('“'), votdRef);
    await shot('church-bible-home-dark');
    await appearance('white');
    await shot('church-bible-home-white');
    await appearance('dark');
    await page.locator('.ch-votd').getByRole('button', { name: 'Read the chapter' }).click();
    await page.waitForSelector('.ch-verse');
    check('Read the chapter opens it at the verse, marked for a moment', /^#\/bible\/.+\/\d+\?v=\d+$/.test(await page.evaluate(() => location.hash)) && (await page.locator('.ch-verse.flash').count()) === 1);
    await goto('/bible');
    await page.getByRole('button', { name: 'Verse of the day options' }).click();
    await page.getByRole('menuitem', { name: 'Hide verse of the day' }).click();
    check('the verse of the day can be hidden', (await page.locator('.ch-votd').count()) === 0 && (await toastSays("turn it back on in the Bible's menu")));
    await page.getByRole('button', { name: 'Bible options' }).click();
    await page.locator('.ch-pop-row').click();
    await page.waitForSelector('.ch-votd');
    check("and brought back from the Bible's menu", (await page.locator('.ch-votd').count()) === 1);
    await page.mouse.click(720, 12);

    /* ---------- Bible: choosing verses, highlights, notes ---------- */
    await goto('/bible/Psalms/23');
    await page.waitForSelector('.ch-verse');
    check('a chapter shows its verses', (await page.locator('.ch-verse').count()) === 6);
    await verse(1).click();
    await verse(3).click({ modifiers: ['Shift'] });
    check('click and shift-click choose a run of verses', (await page.locator('.ch-verse.on').count()) === 3);
    check('the bar names the verses chosen', (await text('.ch-markbar-ref')) === 'Psalms 23:1–3');
    await page.locator('.ch-markbar').getByRole('button', { name: 'Yellow' }).click();
    await wait(300);
    check('a colour highlights them and the bar goes', (await page.locator('.ch-verse.ch-mark-yellow').count()) === 3 && (await page.locator('.ch-markbar').count()) === 0);
    await verse(5).click();
    await page.locator('.ch-markbar').getByRole('button', { name: 'Green' }).click();
    await wait(300);
    check('a second colour', (await verse(5).getAttribute('class')).includes('ch-mark-green'));
    await verse(2).click();
    await verse(3).click();
    await page.locator('.ch-markbar').getByRole('button', { name: /Note/ }).click();
    check('a note needs one verse', await toastSays('Choose one verse to write a note'));
    await verse(3).click();
    await page.locator('.ch-markbar').getByRole('button', { name: /Note/ }).click();
    await page.waitForSelector('.ch-note-dialog');
    check('the note dialog names the verse and shows its words', (await text('.ch-note-dialog .modal-head h2')) === 'Psalms 23:2' && (await text('.ch-note-verse')).includes('green pastures'));
    await page.getByLabel('Note', { exact: true }).fill('Rest is a gift: he maketh me to lie down.');
    await page.locator('.ch-note-dialog').getByRole('button', { name: 'Save' }).click();
    check('a note is saved', await toastSays('Note saved'));
    check('the verse shows its note mark, and keeps its colour', (await verse(2).locator('.ch-note-mark').count()) === 1 && (await verse(2).getAttribute('class')).includes('ch-mark-yellow'));
    // Copy, with the reference
    await verse(1).click();
    await page.locator('.ch-markbar').getByRole('button', { name: /Copy/ }).click();
    await toastSays('Copied');
    const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    check('Copy puts the verse and its reference on the clipboard', copied === '“The LORD is my shepherd; I shall not want.” — Psalms 23:1 (KJV)', copied);
    await shot('church-bible-highlights-dark');
    await appearance('white');
    await shot('church-bible-highlights-white');
    await verse(4).click();
    await verse(6).click({ modifiers: ['Shift'] });
    await shot('church-bible-bar-white');
    await appearance('dark');
    await shot('church-bible-bar-dark');
    await page.locator('.ch-markbar').getByRole('button', { name: 'Clear selection' }).click();

    /* ---------- Highlights & notes ---------- */
    await goto('/bible/marks');
    await page.waitForSelector('.ch-mark-row');
    const rows = async () => (await page.locator('.ch-mark-row b').allInnerTexts()).map((t) => t.trim());
    let all = await rows();
    check('Highlights & notes lists my marks, newest first', all.length === 6 && all[0] === 'Psalms 23:2' && all.includes('John 3:16') && all.includes('Psalms 46:10'), all.join(', '));
    check('with the words of verses already read on this computer', (await page.locator('.ch-mark-row', { hasText: 'Psalms 23:1' }).locator('.ch-mark-words').innerText()).includes('my shepherd'));
    check('and my notes', (await page.locator('.ch-mark-row', { hasText: 'Psalms 23:2' }).locator('.ch-mark-note').innerText()).includes('Rest is a gift'));
    await page.getByRole('tab', { name: 'Notes' }).click();
    check('the Notes filter', (await rows()).sort().join() === 'John 3:16,Psalms 23:2');
    await page.getByRole('tab', { name: 'Green' }).click();
    check('a colour filter', (await rows()).join() === 'Psalms 23:5');
    await page.getByRole('tab', { name: 'Yellow' }).click();
    check('yellow', (await rows()).length === 4);
    await shot('church-bible-marks-dark');
    await page.getByRole('tab', { name: 'All' }).click();
    await page.getByRole('button', { name: 'Open Psalms 23:2' }).click();
    await page.waitForSelector('.ch-verse.flash');
    check('a mark opens its verse in the chapter', (await page.evaluate(() => location.hash)) === '#/bible/Psalms/23?v=2' && (await page.locator('.ch-verse.flash').getAttribute('data-verse')) === '2');
    // Removing: a colour from the bar, a note from its dialog, a mark from the list.
    await verse(1).click();
    await verse(3).click({ modifiers: ['Shift'] });
    await page.locator('.ch-markbar').getByRole('button', { name: 'No colour' }).click();
    await wait(400);
    check('No colour takes the highlight off', (await page.locator('.ch-verse.ch-mark-yellow').count()) === 0 && (await verse(2).locator('.ch-note-mark').count()) === 1);
    await verse(2).locator('.ch-note-mark').click();
    await page.waitForSelector('.ch-note-dialog');
    await page.locator('.ch-note-dialog').getByRole('button', { name: 'Delete' }).click();
    check('Delete takes the note off', (await toastSays('Note deleted')) && (await verse(2).locator('.ch-note-mark').count()) === 0);
    await goto('/bible/marks');
    await page.waitForSelector('.ch-mark-row');
    all = await rows();
    check('the list follows', all.length === 3 && !all.some((r) => /23:[123]$/.test(r)), all.join(', '));
    await page.locator('.ch-mark-row', { hasText: 'Psalms 23:5' }).hover();
    await page.getByRole('button', { name: 'Remove Psalms 23:5' }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('.ch-mark-row b')].some((b) => b.textContent === 'Psalms 23:5'), null, { timeout: 4000 }).catch(() => {});
    check('a mark can be removed from the list', !(await rows()).includes('Psalms 23:5'));
    await page.getByRole('button', { name: 'Remove John 3:16' }).click();
    await page.locator('.confirm').getByRole('button', { name: 'Remove' }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('.ch-mark-row b')].some((b) => b.textContent === 'John 3:16'), null, { timeout: 4000 }).catch(() => {});
    check('removing one with a note asks first', !(await rows()).includes('John 3:16'));

    /* ---------- sending and posting verses ---------- */
    await goto('/bible/Psalms/23');
    await page.waitForSelector('.ch-verse');
    await verse(6).click();
    await page.locator('.ch-markbar').getByRole('button', { name: /Share/ }).click();
    await page.waitForSelector('.share .row');
    check('Share offers to send the verse to people', (await text('.ch-send-preview')).includes('goodness and mercy'));
    await page.getByLabel('Send to grace_mensah').check();
    await page.locator('.share').getByRole('button', { name: 'Send' }).click();
    check('and sends it', await toastSays('Sent'));
    await goto('/direct/t/t1');
    await page.locator('.bubble', { hasText: 'goodness and mercy' }).first().waitFor({ timeout: 4000 }).catch(() => {});
    check('the verse arrives in the chat', (await page.locator('.bubble', { hasText: 'Psalms 23:6' }).count()) >= 1);
    await goto('/bible/Psalms/23');
    await page.waitForSelector('.ch-verse');
    await verse(1).click();
    await page.locator('.ch-markbar').getByRole('button', { name: /Post/ }).click();
    check('Post opens Create with the verses ready to paste', (await toastSays('Paste them into your caption')) && (await page.locator('[data-testid=create-files]').count()) === 1);
    await page.keyboard.press('Escape');
    await wait(300);
    if (await page.locator('.confirm').count()) await page.locator('.confirm').getByRole('button', { name: /Discard|Cancel/ }).first().click();

    /* ---------- Sabbath School: today, lessons and progress ---------- */
    await goto('/lessons');
    await page.waitForSelector('.ch-hero-text');
    check("today shows this week's memory text", (await text('.ch-hero-text')).includes('Remember the sabbath day') && (await text('.ch-hero-ref')).includes('Exodus 20:8'));
    check("and today's study", (await text('.ch-today-card')).includes('Start') && (await page.locator('.ch-week-day').count()) === 7);
    check('the quarter and its lessons are listed, this week marked', (await page.locator('.ch-lesson-row').count()) === 4 && (await page.locator('.ch-lesson-row', { hasText: 'This week' }).innerText()).includes('The Sabbath Was Made for Man'));
    await page.waitForSelector('.ch-pub-section .ch-post-card');
    const cards = page.locator('.ch-pub-section .ch-post-card');
    check("the publishers' newest posts show on today, pinned first", (await cards.count()) === 4 && (await cards.first().innerText()).includes('PINNED'));
    await shot('church-sabbath-today-dark');
    await page.locator('.ch-hero').getByRole('button', { name: "Save this week's lesson" }).click();
    check('the lesson can be saved', await toastSays('Saved'));
    await page.locator('.ch-hero-read').click();
    await page.waitForSelector('iframe.ch-reading');
    check('Read opens the lesson at the day to study', /^#\/lessons\/2026-04\/02\?day=0\d$/.test(await page.evaluate(() => location.hash)));
    await page.getByRole('tab', { name: /^Sabbath,/ }).click();
    await page.waitForSelector('.ch-memory');
    check('the lesson shows its memory text', (await text('.ch-memory')).includes('Remember the sabbath day'));
    const frame = page.frameLocator('iframe.ch-reading');
    await frame.locator('a.verse').click();
    check('verse links in the reading open the verse', (await frame.locator('.verse-box').innerText()).includes('keep it holy'));
    await page.getByRole('button', { name: 'Mark as done' }).click();
    check('a day can be marked done', (await toastSays('Sabbath marked as done')) && (await page.getByRole('tab', { name: /^Sabbath, .*done$/ }).count()) === 1);
    check('progress shows in the lesson list', (await page.locator('.ch-lesson-row', { hasText: 'The Sabbath Was Made for Man' }).innerText()).includes('of 7 read'));
    await page.getByRole('button', { name: "Save Sabbath's study" }).click();
    await toastSays('Saved');
    await page.getByRole('tab', { name: 'Saved' }).click();
    check('Saved lists the lesson and the day', (await page.locator('.ch-saved-row').count()) === 2);
    await page.getByRole('tab', { name: 'This quarter' }).click();
    await page.locator('.split-detail').evaluate((el) => el.scrollTo({ top: 0 }));
    await shot('church-sabbath-lesson-dark');
    await appearance('white');
    await wait(300);
    check('the reading follows the appearance', (await frame.locator('body').evaluate((b) => getComputedStyle(b).backgroundColor)) === 'rgb(255, 255, 255)');
    await shot('church-sabbath-lesson-white');
    await goto('/lessons');
    await page.waitForSelector('.ch-hero-text');
    await shot('church-sabbath-today-white');
    await appearance('dark');

    /* ---------- Sabbath School: the publishers' feed, writing, editing, pinning, deleting ---------- */
    await goto('/lessons/posts');
    await page.waitForSelector('.ch-post-list .ch-post-card');
    const feed = async () => (await page.locator('.ch-post-list .ch-post-title').allInnerTexts()).map((t) => t.trim());
    check('the feed lists every post, the pinned one first', (await feed()).length === 4 && (await feed())[0] === 'Sabbath School starts at 9:15 this quarter');
    await shot('church-publishers-feed-dark');
    await appearance('white');
    await shot('church-publishers-feed-white');
    await appearance('dark');
    await page.locator('.ch-post-list .ch-post-card', { hasText: 'The lessons on the web' }).click();
    await page.waitForSelector('.ch-post-h1');
    check('a post reads in full, with its link', (await text('.ch-post-h1')) === 'The lessons on the web' && (await text('.ch-link-card')).includes('sabbath-school.adventech.io'));
    await page.getByRole('button', { name: 'Post options' }).click();
    check('an admin gets Edit, Pin, Copy link and Delete', (await page.locator('.choices button').allInnerTexts()).join('|') === 'Edit|Pin to top|Copy link|Delete|Cancel');
    await page.locator('.choices').getByRole('button', { name: 'Cancel' }).click();

    await goto('/lessons/posts');
    await page.getByRole('button', { name: 'Publish' }).click();
    await page.waitForSelector('.ch-editor');
    await page.locator('.ch-editor').getByRole('button', { name: 'Publish' }).click();
    check('a post needs a title', (await text('.ch-editor')).includes('Give it a title of up to 140 characters.'));
    await page.getByRole('radio', { name: 'Announcement' }).click();
    await page.locator('.form-row', { hasText: 'Title' }).locator('input').fill('Potluck after the service');
    await page.locator('.form-row', { hasText: 'Lesson' }).locator('input').fill('Lesson 2 · Oct 11');
    await page.locator('.form-row', { hasText: 'Text' }).locator('textarea').fill('Bring a dish to share.\n\nTables go up in the hall at 12:30.');
    await page.locator('.form-row', { hasText: 'Link' }).locator('input').fill('ftp://example.org');
    await page.locator('.ch-editor').getByRole('button', { name: 'Publish' }).click();
    check('a link must start with https://', (await text('.ch-editor')).includes('Use a link that starts with https://'));
    await page.locator('.form-row', { hasText: 'Link' }).locator('input').fill('example.org/potluck');
    await page.setInputFiles('[data-testid=ss-photos]', [path.join(MEDIA, '08.jpg')]);
    check('a photo can be added', (await page.locator('.ch-photo').count()) === 1);
    await shot('church-sabbath-editor-dark');
    await page.locator('.ch-editor').getByRole('button', { name: 'Publish' }).click();
    check('publishing a post', await toastSays('Published'));
    await page.waitForSelector('.ch-post-h1');
    check('it opens, with its kind, lesson, photo, paragraphs and link', (await text('.ch-post-h1')) === 'Potluck after the service' && (await text('.ch-tags')).includes('ANNOUNCEMENT') && (await text('.ch-tags')).includes('Lesson 2 · Oct 11') && (await page.locator('.ch-post-photo').count()) === 1 && (await page.locator('.ch-post-body p').count()) === 2 && (await page.locator('.ch-link-card').getAttribute('href')) === 'https://example.org/potluck');
    await shot('church-sabbath-post-dark');
    await page.getByRole('button', { name: 'Post options' }).click();
    await page.locator('.choices').getByRole('button', { name: 'Edit' }).click();
    await page.waitForSelector('.ch-editor');
    check('Edit fills in the post', (await page.locator('.form-row', { hasText: 'Title' }).locator('input').inputValue()) === 'Potluck after the service' && (await page.locator('.ch-photo').count()) === 1);
    await page.locator('.form-row', { hasText: 'Title' }).locator('input').fill('Fellowship lunch after the service');
    await page.locator('.ch-editor').getByRole('button', { name: 'Save' }).click();
    check('editing a post', await toastSays('Saved'));
    await page.waitForSelector('.ch-post-h1');
    check('the change shows', (await text('.ch-post-h1')) === 'Fellowship lunch after the service');
    await page.getByRole('button', { name: 'Post options' }).click();
    await page.locator('.choices').getByRole('button', { name: 'Pin to top' }).click();
    check('an admin pins a post', (await toastSays('Pinned to top')) && (await text('.ch-tags')).includes('PINNED'));
    await goto('/lessons/posts');
    await page.waitForSelector('.ch-post-list .ch-post-card');
    check('pinned posts lead the feed', (await feed()).slice(0, 2).join('|') === 'Fellowship lunch after the service|Sabbath School starts at 9:15 this quarter');
    await page.locator('.ch-post-list .ch-post-card').first().click();
    await page.waitForSelector('.ch-post-h1');
    await page.getByRole('button', { name: 'Post options' }).click();
    await page.locator('.choices').getByRole('button', { name: 'Unpin' }).click();
    check('and unpins it', await toastSays('Unpinned'));
    await page.getByRole('button', { name: 'Post options' }).click();
    await page.locator('.choices').getByRole('button', { name: 'Delete' }).click();
    await page.locator('.confirm').getByRole('button', { name: 'Delete' }).click();
    check('deleting a post', await toastSays('Post deleted'));
    await page.waitForSelector('.ch-post-list .ch-post-card');
    check('it leaves the feed', (await feed()).length === 4 && !(await feed()).includes('Fellowship lunch after the service'));

    /* ---------- Pod: adding a track, the full player ---------- */
    await goto('/pod');
    await page.waitForSelector('.pod-row');
    await page.getByRole('button', { name: 'Add to Pod' }).click();
    await page.waitForSelector('.ch-add');
    await page.locator('.ch-add').getByRole('button', { name: 'Add to Pod' }).click();
    check('adding needs an audio file, a title and an artist', (await page.locator('.ch-add .form-error').count()) === 3);
    await page.setInputFiles('[data-testid=pod-audio]', { name: 'choir-practice.wav', mimeType: 'audio/wav', buffer: toneWav(2) });
    check('choosing a file fills in a title from its name', (await page.locator('.ch-add .form-row', { hasText: 'Title' }).locator('input').inputValue()) === 'choir practice' && (await text('.ch-file-name')) === 'choir-practice.wav');
    await page.setInputFiles('[data-testid=pod-cover]', [path.join(MEDIA, '09.jpg')]);
    await page.locator('.ch-add-cover img').waitFor();
    await page.locator('.ch-add .form-row', { hasText: 'Title' }).locator('input').fill('Sabbath Morning Choir');
    await page.locator('.ch-add .form-row', { hasText: 'Artist' }).locator('input').fill('Hillside Youth');
    await shot('church-pod-add-dark');
    await page.locator('.ch-add').getByRole('button', { name: 'Add to Pod' }).click();
    check('adding a song to Pod', await toastSays('Added to Pod'));
    await page.waitForSelector('.ch-np-title h1');
    const added = (await page.evaluate(() => location.hash)).split('/').pop();
    check('it opens in the player, with its length read from the file', (await text('.ch-np-title h1')) === 'Sabbath Morning Choir' && (await text('.ch-np-side')).includes('Added by @you') && (await text('.ch-np-side')).includes('0:02') && (await page.locator('.ch-np-cover img').count()) === 1);
    await page.locator('.ch-np-actions').getByRole('button', { name: 'Play' }).click();
    await page.waitForSelector('.ch-transport');
    check('Play starts it here, the bar stepping aside', (await text('.ch-np-kicker')) === 'PLAYING NOW' && (await page.locator('.now-playing').count()) === 0);
    await goto('/pod');
    await page.waitForSelector('.now-playing');
    check('the bar keeps playing while browsing', (await text('.now-playing b')) === 'Sabbath Morning Choir');
    check('the new song is in the list', (await page.locator('.pod-row', { hasText: 'Sabbath Morning Choir' }).count()) === 1);
    await page.locator('.pod-row', { hasText: 'Evening Prayer' }).locator('.pod-cover').click();
    await wait(300);
    await page.locator('.now-playing').getByRole('button', { name: /^Open the player/ }).click();
    await page.waitForSelector('.ch-transport');
    check('the bar opens the full player', (await text('.ch-np-title h1')) === 'Evening Prayer (sample)' && (await page.locator('.ch-up-row').count()) >= 2);
    await page.getByRole('button', { name: 'Shuffle off' }).click();
    check('shuffle turns on', (await page.getByRole('button', { name: 'Shuffle on' }).getAttribute('aria-pressed')) === 'true');
    await page.getByRole('button', { name: 'Repeat off' }).click();
    check('repeat: all', (await page.getByRole('button', { name: 'Repeat all' }).count()) === 1);
    await page.getByRole('button', { name: 'Repeat all' }).click();
    check('repeat: this track', (await page.getByRole('button', { name: 'Repeat this track' }).locator('.ch-one').count()) === 1);
    await page.getByRole('button', { name: 'Repeat this track' }).click();
    check('repeat: off again', (await page.getByRole('button', { name: 'Repeat off' }).count()) === 1);
    await page.getByRole('button', { name: 'Shuffle on' }).click();
    await shot('church-pod-player-dark');
    const before = await text('.ch-np-title h1');
    await page.getByRole('button', { name: 'Next track' }).click();
    await page.waitForFunction((t) => document.querySelector('.ch-np-title h1')?.textContent !== t, before, { timeout: 4000 }).catch(() => {});
    check('Next plays the next track, and the page follows it', (await text('.ch-np-title h1')) !== before && (await text('.ch-np-kicker')) === 'PLAYING NOW');
    await page.getByRole('button', { name: 'Previous track' }).click();
    await page.waitForFunction((t) => document.querySelector('.ch-np-title h1')?.textContent === t, before, { timeout: 4000 }).catch(() => {});
    check('Previous goes back', (await text('.ch-np-title h1')) === before);
    await page.locator('.ch-extras').getByRole('button', { name: 'Add to library' }).click();
    check('a track can be saved to the library from the player', (await toastSays('Added to your library')) && (await page.locator('.ch-extras').getByRole('button', { name: 'Remove from library' }).count()) === 1);
    await appearance('white');
    await shot('church-pod-player-white');
    await goto('/pod');
    await page.waitForSelector('.pod-row');
    await shot('church-pod-white');
    await appearance('dark');
    await shot('church-pod-dark');
    // Opening a track by its link, copying the link, and deleting what I added.
    await goto('/pod/' + added);
    await page.waitForSelector('.ch-np-title h1');
    check('a track opens by its link', (await text('.ch-np-title h1')) === 'Sabbath Morning Choir');
    await page.getByRole('button', { name: 'More options' }).click();
    await page.locator('.choices').getByRole('button', { name: 'Copy link' }).click();
    await toastSays('Link copied');
    check('Copy link gives the track’s address', (await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')).endsWith('#/pod/' + added));
    await page.getByRole('button', { name: 'More options' }).click();
    await page.locator('.choices').getByRole('button', { name: 'Delete' }).click();
    await page.locator('.confirm').getByRole('button', { name: 'Delete' }).click();
    check('the owner deletes a track', await toastSays('Deleted'));
    await page.waitForSelector('.pod-row');
    check('it leaves Pod', (await page.evaluate(() => location.hash)) === '#/pod' && (await page.locator('.pod-row', { hasText: 'Sabbath Morning Choir' }).count()) === 0);
    await goto('/pod/' + added);
    await page.waitForSelector('.empty');
    check('its link then says so', (await text('.empty h2')) === 'This track is no longer in Pod.');
    if (await page.locator('.now-playing').count()) await page.getByRole('button', { name: 'Close player' }).click();

    /* ---------- Hymnal: an admin edits a hymn ---------- */
    await goto('/hymnal/108');
    await page.waitForSelector('.lyrics');
    await page.getByRole('button', { name: 'Edit hymn' }).click();
    await page.waitForSelector('.ch-hymn-edit');
    check('an admin edits a hymn', (await page.locator('.ch-hymn-edit .form-row', { hasText: 'Title' }).locator('input').inputValue()) === 'Amazing Grace');
    await shot('church-hymn-edit-dark');
    await page.locator('.ch-hymn-edit .form-row', { hasText: 'Lyrics' }).locator('textarea').fill('1\nAmazing grace! how sweet the sound\nThat saved a wretch like me!\n\n2\n’Twas grace that taught my heart to fear,\nAnd grace my fears relieved;');
    await page.locator('.ch-hymn-edit .form-row', { hasText: 'Author' }).locator('input').fill('John Newton (1779)');
    await page.locator('.ch-hymn-edit').getByRole('button', { name: 'Save' }).click();
    check('saving the hymn', await toastSays('Saved'));
    check('the new words show', (await text('.lyrics')).includes('taught my heart to fear') && (await text('.hymn')).includes('John Newton (1779)'));
    await page.getByLabel('Search hymns').fill('');
    await wait(500);
    const hymns = await page.locator('.hymn-row b').allInnerTexts();
    check('only that hymn changed', hymns.join('|') === 'Holy, Holy, Holy|Amazing Grace|Blessed Assurance|It Is Well With My Soul', hymns.join('|'));

    /* ---------- Sabbath School without the lesson service: the publishers' posts still show ---------- */
    lessonsOffline = true;
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('community.ss.')).forEach((k) => localStorage.removeItem(k)));
    await page.reload();
    await page.waitForSelector('.rail');
    await goto('/lessons');
    await page.waitForSelector('.ch-note-card');
    check("without the lesson service, today says the lessons couldn't be loaded", (await text('.ch-note-card')).includes("couldn't be loaded") && (await page.locator('.ch-list-error').count()) === 1);
    await page.waitForSelector('.ch-pub-section .ch-post-card');
    check("and the publishers' posts still show", (await page.locator('.ch-pub-section .ch-post-card').count()) === 4);
    lessonsOffline = false;
    await page.locator('.ch-note-card').getByRole('button', { name: 'Try again' }).click();
    await page.waitForSelector('.ch-hero-text');
    check('Try again loads them when the service is back', (await page.locator('.ch-lesson-row').count()) === 4);

    /* ---------- asking to publish (Daniel, Esther, Joseph) ---------- */
    await page.evaluate(() => sessionStorage.setItem('community.demoAs', 'u_daniel'));
    await page.reload();
    await page.waitForSelector('.rail');
    await goto('/lessons');
    await page.waitForSelector('.ch-pub-section .ch-post-card');
    check('members who are not publishers see the posts but no Publish', (await page.locator('.ch-pub-section').getByRole('button', { name: 'Publish' }).count()) === 0);
    check('and are offered to become one', (await text('.ch-entry')) === 'Become a publisher');
    await page.locator('.ch-entry').click();
    await page.waitForSelector('.ch-ask');
    check('asking needs a note', await page.getByRole('button', { name: 'Send request' }).isDisabled());
    await page.getByLabel('About you').fill('I lead the youth Sabbath School class at Hillside.');
    await page.getByRole('button', { name: 'Send request' }).click();
    check('Daniel asks to publish', await toastSays('Request sent'));
    await page.waitForSelector('.ch-status');
    check('and sees his request pending', (await text('.ch-status h2')) === 'Request pending' && (await text('.ch-status')).includes('youth Sabbath School class'));
    await shot('church-publish-pending-dark');
    await goto('/lessons/posts');
    await page.waitForSelector('.ch-entry');
    check('the feed shows where his request is', (await text('.ch-entry')) === 'Request pending');
    await goto('/lessons/write');
    await page.waitForSelector('.empty');
    check('only approved publishers can write', (await text('.empty h2')) === 'Only approved publishers can post here');
    await goto('/lessons/posts/sp2');
    await page.waitForSelector('.ch-post-h1');
    check("other people's posts have no options for him", (await page.getByRole('button', { name: 'Post options' }).count()) === 0 && (await page.getByRole('button', { name: 'Share' }).count()) === 1);
    await goto('/hymnal/108');
    await page.waitForSelector('.lyrics');
    check('members do not get Edit on hymns', (await page.getByRole('button', { name: 'Edit hymn' }).count()) === 0);
    await goto('/pod');
    await page.waitForSelector('.pod-row');
    check('Add to Pod is for Plus members and admins', (await page.getByRole('button', { name: 'Add to Pod' }).count()) === 0);

    await page.evaluate(() => sessionStorage.setItem('community.demoAs', 'u_esther'));
    await page.reload();
    await page.waitForSelector('.rail');
    await goto('/lessons/publish');
    await page.waitForSelector('.ch-status');
    check('a refused request says so', (await text('.ch-status h2')) === 'Not approved');
    await page.getByRole('button', { name: 'Ask again' }).click();
    check('asking again keeps the note to change', (await page.getByLabel('About you').inputValue()) === 'Adventurers club.');
    await page.getByLabel('About you').fill('Adventurers club leader; I would post the children’s lesson helps.');
    await page.getByRole('button', { name: 'Send request' }).click();
    await toastSays('Request sent');
    await page.waitForSelector('.ch-status');
    check('asking again makes it pending', (await text('.ch-status h2')) === 'Request pending');

    await page.evaluate(() => sessionStorage.setItem('community.demoAs', 'u_joseph'));
    await page.reload();
    await page.waitForSelector('.rail');
    await goto('/lessons/publish');
    await page.waitForSelector('.ch-status');
    check('turned-off publishing says so, without asking again', (await text('.ch-status h2')) === 'Publishing turned off' && (await page.getByRole('button', { name: 'Ask again' }).count()) === 0);
    await page.evaluate(() => sessionStorage.removeItem('community.demoAs'));

    const over = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
    check('no sideways scrolling', over <= 0, over);
  } catch (e) {
    check('the test ran to the end', false, e.message.split('\n')[0]);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'church-failure.png') }).catch(() => {});
  }
  check('no script errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failed ? `${failed} CHURCH CHECK(S) FAILED` : 'ALL CHURCH CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})();
