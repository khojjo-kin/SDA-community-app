// Church events, the map's four layers, verse cards and the reading streak (database v23):
// the events list and its three lists, making an event (cover, kind, day and times, place and pin,
// church), changing it, Going / Interested and who's going, calling it off and deleting it; events on a
// church's page and a community's page; the map's Friends · Nearby · Churches · Events (Nearby opt-in
// and adults only); a verse card drawn on a canvas, sent to Create as a post and a story, saved as a
// PNG and sent to people; the streak's seven days, and a chapter read counting towards it.
// Dark and White screenshots of the main screens.
// Usage: node tests/events.test.cjs http://127.0.0.1:8832/ [screenshot folder]
//
// The Bible text (bible-api.com) comes from outside the app, so this test answers it itself with a
// small sample; every other request outside the app is refused (the map's tiles among them: the pins
// and lists must show without them).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8832/';
const SHOTS = process.argv[3] || '';
const PHOTO = path.join(__dirname, '../src/fake/media/05.jpg');
// Near Hillside church, where the sample events are.
const HERE = { latitude: 5.6037, longitude: -0.187, accuracy: 30 };
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || extra === '' ? '' : ' (' + extra + ')'));
  if (!ok) failed++;
};

/** A chapter of numbered sample verses (John 3:16 as it is). */
function bibleChapter(url) {
  const ref = decodeURIComponent(new URL(url).pathname.slice(1)).replace(/\+/g, ' ');
  const m = /^(.*\D)\s*(\d+)$/.exec(ref.trim());
  const book = m ? m[1].trim() : ref;
  const chapter = m ? Number(m[2]) : 1;
  return {
    verses: Array.from({ length: 30 }, (_, i) =>
      ({ verse: i + 1, text: book === 'John' && chapter === 3 && i === 15 ? 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' : `Sample words of ${book} ${chapter}:${i + 1}.` })),
  };
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['geolocation'], geolocation: HERE, acceptDownloads: true });
  // Every request for Create (lib/create.ts) is noted, and a chapter counts towards the streak after a moment.
  await context.addInitScript(() => {
    window.__creates = [];
    window.addEventListener('community:create', (e) => window.__creates.push({ mode: e.detail.mode }));
    window.__bibleReadMs = 1500;
    try {
      localStorage.setItem('community.dismissedAnnouncements', JSON.stringify(['an1']));
    } catch {}
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await context.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith('https://bible-api.com/')) return r.fulfill({ json: bibleChapter(u) });
    return u.startsWith(BASE) || u.startsWith('blob:') || u.startsWith('data:') ? r.continue() : r.abort();
  });
  const wait = (ms = 400) => page.waitForTimeout(ms);
  const goto = async (hash, ms = 700) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await wait(ms);
  };
  const hash = () => page.evaluate(() => location.hash);
  const text = (sel) => page.locator(sel).first().innerText().catch(() => '');
  const T = (table) => page.evaluate((t) => window.__eventsDemo.T(t).map((r) => ({ ...r })), table);
  const toastSays = async (words) => {
    await page.locator('.toast', { hasText: words }).first().waitFor({ timeout: 4000 }).catch(() => {});
    return (await page.locator('.toast', { hasText: words }).count()) > 0;
  };
  const titles = () => page.locator('.ev-list .ev-row-title').allInnerTexts();
  const tab = (name) => page.locator('.ev-tabs').getByRole('tab', { name });
  // The appearance as More → Switch appearance leaves it (the frame test covers the switch itself), set
  // directly so a dialog can stay open for its White screenshot.
  const appearance = async (theme) => {
    await page.evaluate((th) => {
      document.documentElement.dataset.theme = th;
      try {
        localStorage.setItem('community.appearance', th);
      } catch {}
    }, theme);
    await wait(150);
  };
  const shot = async (name) => {
    if (!SHOTS) return;
    await wait(250);
    await page.screenshot({ path: path.join(SHOTS, name + '.png') });
  };
  const both = async (name) => {
    await shot(name + '-dark');
    await appearance('white');
    await shot(name + '-white');
    await appearance('dark');
  };
  /** Answers a confirmation dialog with its action. */
  const confirm = async (action) => {
    await page.locator('.confirm').waitFor({ timeout: 3000 });
    await page.locator('.confirm').getByRole('button', { name: action, exact: true }).click();
  };

  try {
    await page.goto(BASE);
    await page.waitForSelector('.rail');

    /* ---------- the list ---------- */
    await goto('/events');
    await page.waitForSelector('.ev-row');
    check('the Events page opens on Upcoming', (await tab('Upcoming').getAttribute('aria-selected')) === 'true' && (await text('.ev-list-head h1')) === 'Events');
    const heads = (await page.locator('.ev-list .ev-day').allInnerTexts()).map((s) => s.trim().toLowerCase());
    check('with the events near you first, then each day', heads[0] === 'near you' && heads[1] === 'today' && heads[2] === 'tomorrow', heads.join(', '));
    check('the one under way is first near you, and marked as happening now', (await page.locator('.ev-list section').first().locator('.ev-row').first().innerText()).includes('Happening now') && (await page.locator('.ev-list section').first().locator('.ev-row-title').first().innerText()) === 'Morning prayer meeting');
    const byDay = (await page.locator('.ev-list section:not(:first-child) .ev-row-title').allInnerTexts()).map((s) => s.trim());
    check('every upcoming event is listed under its day, soonest first', byDay.join() === 'Morning prayer meeting,Sabbath afternoon Bible study,Youth Vespers,Community Health Expo,Pathfinder hike', byDay.join());
    check('rows show who is going, and my own answer', (await page.locator('.ev-row', { hasText: 'Community Health Expo' }).first().innerText()).includes('Interested') && (await page.locator('.ev-row', { hasText: 'Youth Vespers' }).first().innerText()).includes('2 going · 1 interested'));
    check('with nothing open, the right side offers to create one', (await text('.ev-detail-pane .empty h2')) === 'Choose an event');
    await both('events-list');
    await tab('Going').click();
    await wait(600);
    check('Going lists the events I answered', (await titles()).join() === 'Morning prayer meeting,Community Health Expo', (await titles()).join());
    await tab('Yours').click();
    await wait(600);
    check('Yours lists the ones I made', (await titles()).join() === 'Sabbath afternoon Bible study', (await titles()).join());
    await tab('Upcoming').click();
    await wait(400);

    /* ---------- making one ---------- */
    await page.locator('.ev-list-head').getByRole('button', { name: 'Create event' }).click();
    await page.waitForSelector('.ev-edit');
    check('Create event opens the form beside the list', (await hash()) === '#/events/new' && (await text('.ev-edit-head h1')) === 'New event');
    await page.locator('.ev-edit-head').getByRole('button', { name: 'Share' }).click();
    check('a title is needed', (await text('.ev-field .form-error')) === 'Add a title.');
    await page.getByPlaceholder('Event name').fill('Choir rehearsal');
    await page.locator('.ev-kinds').getByRole('radio', { name: 'Music' }).click();
    // Three days from now, 19:00 to 20:30.
    const label = await page.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    });
    await page.locator('.ev-when-row', { hasText: 'Date' }).locator('.ev-when-value').click();
    await page.waitForSelector('.ev-cal');
    if (!(await page.getByRole('button', { name: label, exact: true }).count())) await page.getByRole('button', { name: 'Next month' }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.getByLabel('Starts').selectOption(String(19 * 60));
    await page.locator('.ev-when-row', { hasText: 'Ends' }).getByRole('button', { name: 'Add' }).click();
    await page.getByLabel('Ends').selectOption(String(20 * 60 + 30));
    await page.getByPlaceholder('Church hall, 12 High St').fill('Hillside church hall');
    await page.getByRole('button', { name: 'Pin on map' }).click();
    await page.waitForSelector('.ev-pin-modal .mx-map-view');
    await wait(500);
    await both('events-pin');
    await page.locator('.ev-pin-modal').getByRole('button', { name: 'Done' }).click();
    check('the pin is placed where this computer is (the map opened there)', (await page.locator('.ev-pin-map').count()) === 1);
    await page.locator('.ev-pick-row', { hasText: 'Church' }).click();
    await page.waitForSelector('.ev-church-modal .ev-church-choice');
    await page.locator('.ev-church-modal').getByPlaceholder('Search churches').fill('river');
    await page.locator('.ev-church-modal .ev-church-choice', { hasText: 'Riverside Adventist Fellowship' }).click();
    check('a church can be chosen', (await page.locator('.ev-pick-row').innerText()).includes('Riverside Adventist Fellowship'));
    await page.getByPlaceholder("What's happening?").fill('Practice for the harvest Sabbath.');
    await page.locator('[data-testid=event-cover]').setInputFiles(PHOTO);
    await page.waitForSelector('.ev-cover-pick.has');
    await both('events-editor');
    await page.locator('.ev-edit-head').getByRole('button', { name: 'Share' }).click();
    await page.waitForFunction(() => /^#\/events\/[0-9a-f-]{20,}$/.test(location.hash), null, { timeout: 6000 }).catch(() => {});
    const made = (await T('community_events')).find((e) => e.title === 'Choir rehearsal');
    check('sharing makes the event', !!made && made.user_id === 'demo_me' && made.kind === 'music' && made.church_id === 'ch2' && made.lat !== null && made.cover_url !== '' && !!made.ends_at, JSON.stringify(made ?? {}));
    if (made) {
      const start = new Date(made.starts_at);
      const end = new Date(made.ends_at);
      check('at the day and times chosen', start.getHours() === 19 && start.getMinutes() === 0 && end.getHours() === 20 && end.getMinutes() === 30 && Math.round((start - Date.now()) / 86400e3) >= 2);
    }
    check('and opens its page', (await hash()) === '#/events/' + made?.id && (await text('.ev-head h1')) === 'Choir rehearsal' && (await text('.ev-kind')).toLowerCase() === 'music');
    check('it appears in the list', (await titles()).includes('Choir rehearsal'));
    check('the page shows when, where and whose', (await text('.ev-facts')).includes('19:00 – 20:30') && (await text('.ev-facts')).includes('Hillside church hall') && (await text('.ev-facts')).includes('Riverside Adventist Fellowship') && (await text('.ev-organiser')).includes('you'));

    /* ---------- changing it ---------- */
    await page.locator('.ev-head').getByRole('button', { name: 'More options' }).click();
    await page.locator('.choices').getByRole('button', { name: 'Edit' }).click();
    await page.waitForSelector('.ev-edit');
    check('Edit opens the form with what is there', (await hash()) === `#/events/${made?.id}/edit` && (await page.getByPlaceholder('Event name').inputValue()) === 'Choir rehearsal' && (await text('.ev-edit-head h1')) === 'Edit event');
    await page.getByPlaceholder('Event name').fill('Choir rehearsal and supper');
    await page.locator('.ev-edit-head').getByRole('button', { name: 'Save' }).click();
    await page.waitForSelector('.ev-page');
    check('Save changes it', (await toastSays('Saved')) && (await text('.ev-head h1')) === 'Choir rehearsal and supper' && (await T('community_events')).find((e) => e.id === made?.id)?.title === 'Choir rehearsal and supper');
    check('and the list follows', (await titles()).includes('Choir rehearsal and supper'));

    /* ---------- Going, Interested, and who's going ---------- */
    await page.locator('.ev-row', { hasText: 'Youth Vespers' }).first().click();
    await page.waitForSelector('.ev-answers');
    await both('events-page');
    const going = page.locator('.ev-answers').getByRole('button', { name: 'Going' });
    const interested = page.locator('.ev-answers').getByRole('button', { name: 'Interested' });
    await going.click();
    await wait(500);
    const mine = async () => (await T('community_event_rsvps')).find((r) => r.event_id === 'ev3' && r.user_id === 'demo_me')?.status ?? null;
    check('Going answers the event', (await going.getAttribute('aria-pressed')) === 'true' && (await mine()) === 'going' && (await text('.ev-who')).includes('3 going · 1 interested'));
    await interested.click();
    await wait(500);
    check('Interested changes the answer', (await interested.getAttribute('aria-pressed')) === 'true' && (await mine()) === 'interested' && (await text('.ev-who')).includes('2 going · 2 interested'));
    await interested.click();
    await wait(500);
    check('the same again takes it back', (await mine()) === null && (await text('.ev-who')).includes('2 going · 1 interested'));
    await page.locator('.ev-who').click();
    await page.waitForSelector('.ev-people .ev-person');
    check("who's going lists them", (await page.locator('.ev-people .ev-person b').allInnerTexts()).map((s) => s.trim()).sort().join() === 'grace_mensah,joseph_k');
    await page.locator('.ev-people').getByRole('tab', { name: '1 interested' }).click();
    check('and who is interested', (await page.locator('.ev-people .ev-person b').allInnerTexts()).map((s) => s.trim()).join() === 'samuel_boateng');
    await page.keyboard.press('Escape');
    check("only the organiser (or an admin) gets the ⋯ menu: an app admin sees it on someone else's", (await page.locator('.ev-head').getByRole('button', { name: 'More options' }).count()) === 1);

    /* ---------- calling off and deleting ---------- */
    await goto('/events/' + made?.id);
    await page.waitForSelector('.ev-head');
    await page.locator('.ev-head').getByRole('button', { name: 'More options' }).click();
    await page.locator('.choices').getByRole('button', { name: 'Call off' }).click();
    await confirm('Call off');
    await wait(500);
    check('calling it off marks it, and it leaves Upcoming', (await text('.ev-state.big')) === 'Called off' && !!(await T('community_events')).find((e) => e.id === made?.id)?.cancelled_at && !(await titles()).includes('Choir rehearsal and supper') && (await page.locator('.ev-answers .ev-answer').count()) === 1);
    await page.locator('.ev-head').getByRole('button', { name: 'More options' }).click();
    await page.locator('.choices').getByRole('button', { name: 'Delete' }).click();
    await confirm('Delete');
    await page.waitForFunction(() => location.hash === '#/events', null, { timeout: 4000 }).catch(() => {});
    check('Delete removes it', (await toastSays('Event deleted')) && (await hash()) === '#/events' && !(await T('community_events')).some((e) => e.id === made?.id));

    /* ---------- on a church's page and a community's ---------- */
    await goto('/churches/ch1', 900);
    await page.waitForSelector('.ev-section .ev-tile');
    const tiles = (await page.locator('.ev-section .ev-tile-title').allInnerTexts()).map((s) => s.trim());
    check("a church's page shows its next events", tiles.join() === 'Morning prayer meeting,Youth Vespers,Pathfinder hike', tiles.join());
    await page.locator('.ev-section').getByRole('link', { name: 'See all' }).click();
    await page.waitForSelector('.ev-narrow');
    await wait(500);
    check('See all opens the list narrowed to the church', (await hash()) === '#/events?church=ch1' && (await text('.ev-narrow')).includes('Hillside Seventh-day Adventist Church') && (await page.locator('.ev-list section:not(:first-child) .ev-row').count()) === 3);
    await page.locator('.ev-narrow').getByRole('button', { name: 'Show all events' }).click();
    await wait(600);
    check('and back to every event', (await hash()) === '#/events' && (await page.locator('.ev-narrow').count()) === 0);
    await goto('/churches/ch1', 900);
    await page.locator('.ev-section').getByRole('button', { name: 'Add an event' }).click();
    await page.waitForSelector('.ev-edit');
    await wait(500);
    check('Add an event starts one at that church', (await hash()) === '#/events/new?church=ch1' && (await page.locator('.ev-pick-row').innerText()).includes('Hillside Seventh-day Adventist Church'));
    await goto('/groups/g1', 900);
    await page.waitForSelector('.ev-section .ev-tile');
    check("a community's page shows its events", (await page.locator('.ev-section .ev-tile-title').allInnerTexts()).join() === 'Pathfinder hike');
    await page.locator('.cm-ghead').getByRole('button', { name: 'Event' }).click();
    await page.waitForSelector('.ev-edit');
    await wait(600);
    check('Event starts one in the community', (await hash()) === '#/events/new?group=g1' && (await page.getByLabel('Community', { exact: true }).inputValue()) === 'g1');
    await goto('/groups/g2', 900);
    check('a page without events shows none', (await page.locator('.ev-section').count()) === 0);

    /* ---------- the map's layers ---------- */
    await goto('/map', 1200);
    await page.waitForSelector('.mx-map-pin');
    check('the map has four layers', (await page.locator('.mx-map-tabs [role=tab]').allInnerTexts()).map((s) => s.trim()).join() === 'Friends,Nearby,Churches,Events');
    check('Friends is first, with the faces as before', (await page.locator('.mx-map-tabs [role=tab]').first().getAttribute('aria-selected')) === 'true' && (await page.locator('.mx-map-pin').count()) === 2);
    await page.locator('.mx-map-tabs').getByRole('tab', { name: 'Events' }).click();
    await page.waitForSelector('.mx-mark.event');
    await wait(700);
    check('Events: the upcoming events with a place, as pins and a list (tiles or not)', (await page.locator('.mx-mark.event').count()) === 4 && (await page.locator('.mx-layer-row').count()) === 4 && (await text('.mx-layer-head b')) === '4 upcoming events' && (await page.locator('.mx-map-pin').count()) === 0);
    check('nearest first, with where you are', (await text('.mx-layer-head span')) === 'Nearest first' && (await page.locator('.mx-here').count()) === 1 && (await page.locator('.mx-layer-row b').first().innerText()) === 'Morning prayer meeting');
    check('the address says which layer', (await hash()) === '#/map?layer=events');
    await page.locator('.mx-layer-row', { hasText: 'Community Health Expo' }).click();
    await page.waitForSelector('.mx-pick-card');
    check('choosing one shows its card', (await text('.mx-pick-card')).includes('Community Health Expo') && (await page.locator('.mx-pick-card').getByRole('link', { name: 'Directions' }).count()) === 1);
    await both('map-events');
    await page.locator('.mx-pick-card').getByRole('link', { name: 'View event' }).click();
    await page.waitForSelector('.ev-page');
    check('View event opens it', (await hash()) === '#/events/ev4');
    await goto('/map?layer=churches', 1200);
    await page.waitForSelector('.mx-mark.church');
    check('Churches: the listed churches with a pin', (await page.locator('.mx-mark.church').count()) === 3 && (await text('.mx-layer-head b')) === '3 churches' && (await page.locator('.mx-map-tabs').getByRole('tab', { name: 'Churches' }).getAttribute('aria-selected')) === 'true');
    await page.locator('.mx-mark.church').first().click();
    check('a church pin shows its card', (await page.locator('.mx-pick-card').getByRole('link', { name: 'View church' }).count()) === 1);
    // Nearby
    await page.locator('.mx-map-tabs').getByRole('tab', { name: 'Nearby' }).click();
    await page.waitForSelector('.mx-near-row');
    await wait(500);
    const sw = page.getByRole('switch', { name: 'Show me in Nearby' });
    check('Nearby starts off, says what others see, and shows nobody', !(await sw.isChecked()) && (await text('.mx-near-privacy')).includes('roughly where you are') && (await page.locator('.mx-mark.person').count()) === 0);
    await page.locator('.mx-near-row').click();
    await page.waitForSelector('.mx-mark.person');
    await wait(400);
    const near = (await T('community_nearby')).find((n) => n.user_id === 'demo_me');
    check('turning it on keeps only a rough place', !!near && near.lat === 5.6 && near.lng === -0.19, JSON.stringify(near ?? {}));
    check('and shows adults nearby (not anyone over a day old, nor far away)', (await toastSays("You're in Nearby")) && (await page.locator('.mx-mark.person').count()) === 2 && (await text('.mx-layer-head b')) === '2 people nearby' && (await page.locator('.mx-layer-row', { hasText: 'About 1 km away' }).count()) === 2);
    const spots = await page.locator('.mx-mark.person').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [Math.round(r.x), Math.round(r.y)]));
    check('two people at one rough place are set apart', spots.length === 2 && Math.hypot(spots[0][0] - spots[1][0], spots[0][1] - spots[1][1]) > 40, JSON.stringify(spots));
    await page.locator('.mx-layer-row', { hasText: 'Samuel Boateng' }).click();
    check('a person shows View profile and Message', (await page.locator('.mx-pick-card').getByRole('link', { name: 'View profile' }).count()) === 1 && (await page.locator('.mx-pick-card').getByRole('button', { name: 'Message' }).count()) === 1);
    await both('map-nearby');
    await page.locator('.mx-near-row').click();
    await page.waitForSelector('.mx-mark.person', { state: 'detached' });
    check('turning it off takes you (and them) off the map', (await toastSays('Nearby is off')) && !(await T('community_nearby')).some((n) => n.user_id === 'demo_me'));
    // Adults only: with a birthday under 18, the server says no.
    await page.evaluate(() => {
      const d = window.__eventsDemo.T('community_private_details').find((x) => x.user_id === 'demo_me');
      d.birth_date = `${new Date().getFullYear() - 16}-01-01`;
    });
    await page.locator('.mx-near-row').click();
    await page.waitForSelector('.mx-near-note');
    check('Nearby is for adults only', (await text('.mx-near-note')) === 'Nearby is for members 18 and over.' && !(await sw.isChecked()) && !(await T('community_nearby')).some((n) => n.user_id === 'demo_me'));
    await page.evaluate(() => {
      window.__eventsDemo.T('community_private_details').find((x) => x.user_id === 'demo_me').birth_date = '1994-05-14';
    });

    /* ---------- the reading streak ---------- */
    await goto('/bible', 900);
    await page.waitForSelector('.ev-streak .ev-streak-day');
    check('the streak shows beside the verse of the day', (await page.locator('.ev-home-top .ch-votd').count()) === 1 && (await text('.ev-streak-text b')) === '3-day streak' && (await text('.ev-streak-text')).includes('Best 7'));
    check('with the last seven days, the ones read ticked', (await page.locator('.ev-streak-day').count()) === 7 && (await page.locator('.ev-streak-day.read').count()) === 4 && (await page.locator('.ev-streak-day.today:not(.read)').count()) === 1);
    await both('bible-streak');
    await goto('/bible/Psalms/23', 400);
    await page.waitForSelector('.ch-verse');
    check('a chapter read counts towards today, once', await toastSays('Day 4 — keep going'));
    const today = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    check('the day is kept for me', (await T('community_reading_days')).some((r) => r.user_id === 'demo_me' && r.day === today));
    await goto('/bible', 900);
    await page.waitForSelector('.ev-streak .ev-streak-day');
    check('and the streak shows it', (await text('.ev-streak-text b')) === '4-day streak' && (await text('.ev-streak-text')).includes('Read today') && (await page.locator('.ev-streak-day.today.read').count()) === 1);

    /* ---------- verse cards ---------- */
    await goto('/bible/John/3', 900);
    await page.waitForSelector('.ch-verse');
    await page.locator('.ch-verse[data-verse="16"]').click();
    await page.locator('.ch-markbar').getByRole('button', { name: 'Card' }).click();
    await page.waitForSelector('.ev-vc canvas');
    await wait(900);
    const pixels = () =>
      page.locator('.ev-vc canvas').evaluate((c) => {
        const ctx = c.getContext('2d');
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        const seen = new Set();
        for (let i = 0; i < d.length; i += 4 * 997) seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
        const corner = ctx.getImageData(4, 4, 1, 1).data;
        return { w: c.width, h: c.height, colours: seen.size, corner: [corner[0], corner[1], corner[2]] };
      });
    let px = await pixels();
    check('the card is drawn on a canvas, square, and not blank', px.w === 1080 && px.h === 1080 && px.colours > 12, JSON.stringify(px));
    check('with the verse and its reference', (await page.locator('.ev-vc canvas').getAttribute('aria-label')).startsWith('John 3:16 · KJV. For God so loved'));
    await both('verse-card');
    await page.locator('.ev-vc').getByRole('button', { name: 'Dawn' }).click();
    await wait(300);
    const dawn = await pixels();
    check('a background changes the picture', dawn.corner[0] > 200 && dawn.corner.join() !== px.corner.join(), dawn.corner.join());
    await page.locator('[data-testid=verse-card-photo]').setInputFiles(PHOTO);
    await page.waitForSelector('.ev-vc-swatch.photo.on');
    await wait(300);
    const photo = await pixels();
    check('a photo of my own can be the background', photo.colours > 40 && photo.corner.join() !== dawn.corner.join(), JSON.stringify(photo));
    await page.locator('.ev-vc').getByRole('button', { name: 'Dawn' }).click();
    await page.locator('.ev-vc').getByRole('tab', { name: 'Layout' }).click();
    await page.locator('.ev-vc').getByRole('button', { name: 'Tall' }).click();
    await wait(300);
    px = await pixels();
    check('Tall makes a story-shaped card', px.w === 1080 && px.h === 1920);
    await page.locator('.ev-vc').getByRole('tab', { name: 'Font' }).click();
    await page.locator('.ev-vc').getByRole('button', { name: /Poppins/ }).click();
    check('a font can be chosen', (await page.locator('.ev-vc').getByRole('button', { name: /Poppins/ }).getAttribute('aria-pressed')) === 'true');
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 6000 }), page.locator('.ev-vc').getByRole('button', { name: 'Save' }).click()]);
    const file = await download.path();
    const head = fs.readFileSync(file).subarray(0, 8).toString('hex');
    check('Save downloads the card as a PNG', download.suggestedFilename() === 'John 3-16 KJV.png' && head === '89504e470d0a1a0a' && fs.statSync(file).size > 5000, download.suggestedFilename());
    await page.locator('.ev-vc').getByRole('button', { name: 'Post' }).click();
    await page.waitForFunction(() => window.__creates.length > 0, null, { timeout: 4000 }).catch(() => {});
    await wait(1200);
    check('Post asks Create for a post', (await page.evaluate(() => window.__creates.map((c) => c.mode).join())) === 'post');
    check('which opens with the card, ready to crop', (await page.locator('.ev-vc').count()) === 0 && (await page.locator('[data-testid=create-files]').count()) === 0 && (await text('.modal-head h2')) === 'Crop');
    await page.keyboard.press('Escape');
    await wait(300);
    if (await page.locator('.confirm').count()) await page.locator('.confirm').getByRole('button', { name: 'Discard' }).click();
    await wait(300);
    // Your story, from the verse of the day this time.
    await goto('/bible', 900);
    await page.locator('.ch-votd').getByRole('button', { name: 'Make a card' }).click();
    await page.waitForSelector('.ev-vc canvas');
    await wait(600);
    await page.locator('.ev-vc').getByRole('button', { name: 'Your story' }).click();
    await page.waitForFunction(() => window.__creates.length > 1, null, { timeout: 4000 }).catch(() => {});
    await wait(1500);
    check('Your story asks Create for a story, which opens with the card', (await page.evaluate(() => window.__creates.map((c) => c.mode).join())) === 'post,story' && (await page.locator('[data-testid=story-files]').count()) === 0 && (await text('.stc-title')) === 'Your story');
    await page.locator('.stc-x').click();
    await wait(300);
    if (await page.locator('.confirm').count()) await page.locator('.confirm').getByRole('button', { name: /Discard/ }).click();
    await wait(300);
    // Share: to people, as a photo.
    await goto('/bible/John/3', 900);
    await page.waitForSelector('.ch-verse');
    await page.locator('.ch-verse[data-verse="16"]').click();
    await page.locator('.ch-markbar').getByRole('button', { name: 'Card' }).click();
    await page.waitForSelector('.ev-vc canvas');
    await wait(500);
    await page.locator('.ev-vc').getByRole('button', { name: 'Share' }).click();
    await page.waitForSelector('.share .ev-send-picture');
    await page.waitForSelector('.share .row');
    await page.getByLabel('Send to grace_mensah').check();
    await page.locator('.share').getByRole('button', { name: 'Send' }).click();
    check('Share sends the card to people as a photo', (await toastSays('Sent')) && (await page.evaluate(() => window.__eventsDemo.T('community_messages').some((m) => m.sender_id === 'demo_me' && m.thread_id === 't1' && m.media_url))));

    check('no script errors', errors.length === 0, errors.join(' | '));
  } catch (e) {
    console.log('TEST CRASHED: ' + e.message.split('\n').slice(0, 4).join(' '));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'events-crash.png') }).catch(() => {});
    failed++;
  }
  await browser.close();
  console.log(failed ? `${failed} CHECK(S) FAILED` : 'ALL EVENTS CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})();
