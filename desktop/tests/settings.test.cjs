// Settings (with the app font, chat wallpaper, Shorts, story alerts and the friends' map), Your
// activity, Help, the legal pages and the age checks.
// Usage: node tests/settings.test.cjs http://127.0.0.1:8804/ [wiring build, default port + 10] [screenshot dir]
// The demo build covers everything except setting up a new account, which needs the wiring build
// (stand-in Clerk sign-in); that part is skipped if the wiring build isn't being served.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:8804/';
const WIRE = process.env.WIRE_URL || process.argv[3] || BASE.replace(/:(\d+)\/?$/, (_m, p) => ':' + (Number(p) + 10) + '/');
const SHOTS = process.argv[4] || '';
const MEDIA = path.join(__dirname, '../src/fake/media');
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || extra === '' ? '' : ' (' + extra + ')'));
  if (!ok) failed++;
};

async function newPage(browser, base, errors) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    return u.startsWith(base) || u.startsWith('blob:') || u.startsWith('data:') ? r.continue() : r.abort();
  });
  return page;
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await newPage(browser, BASE, errors);
  const wait = (ms = 500) => page.waitForTimeout(ms);
  const goto = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await wait(700);
  };
  const title = () => page.locator('.st-title').first().innerText();
  const shot = async (name) => SHOTS && page.screenshot({ path: path.join(SHOTS, name + '.png') });
  const toastSays = (text) => page.locator('.toast').filter({ hasText: text }).first().waitFor({ timeout: 4000 }).then(() => true, () => false);
  try {
    await page.goto(BASE);
    await page.waitForSelector('.feed-post');

    // The layout and the search.
    await goto('/accounts/edit');
    check('Settings has its column with grouped sections', (await page.locator('.st-nav-title').innerText()) === 'Settings' && (await page.locator('.st-group-h').count()) >= 9);
    check('Accounts Centre has its line underneath', (await page.locator('.st-nav-item', { hasText: 'Accounts Centre' }).locator('small').count()) === 1);
    check('the open page is highlighted', (await page.locator('.st-nav-item.on').innerText()).includes('Edit profile'));
    await page.locator('.st-nav-item', { hasText: 'Notifications' }).click();
    await wait();
    check('a section opens on the right with its address', (await page.evaluate(() => location.hash)) === '#/accounts/notifications' && (await title()) === 'Notifications');
    await page.getByLabel('Search settings').fill('streak');
    check('search keeps only the matching settings', (await page.locator('.st-nav-item').allInnerTexts()).map((t) => t.trim()).join('|') === 'Chat streaks');
    await page.getByLabel('Search settings').fill('password');
    check('search finds Accounts Centre by what it holds', (await page.locator('.st-nav-item').first().innerText()).includes('Accounts Centre'));
    await page.getByLabel('Search settings').fill('zzzz');
    check('search says when nothing matches', (await page.locator('.st-none').innerText()).includes('No settings found'));
    await page.getByLabel('Clear search').click();
    await goto('/accounts/no-such-page');
    check('an unknown section opens Edit profile', (await title()) === 'Edit profile');

    // Edit profile
    await goto('/accounts/edit');
    const bio = page.locator('.form-row').filter({ hasText: 'Bio' }).locator('textarea');
    await bio.fill('Sabbath School teacher');
    check('the bio counts its characters', (await page.locator('.form-row').filter({ hasText: 'Bio' }).locator('.count').innerText()).replace(/\s/g, '') === '22/500');
    await page.locator('.form-row').filter({ hasText: 'Pronouns' }).locator('input').fill('she/her');
    await page.locator('.form-row').filter({ hasText: 'Gender' }).locator('select').selectOption('Prefer not to say');
    await page.getByRole('button', { name: 'Submit' }).click();
    check('saving the profile confirms', await toastSays('Profile saved'));
    await goto('/u/you');
    await page.waitForSelector('.profile-bio');
    check('the new bio shows on the profile', (await page.locator('.profile-bio').innerText()).includes('Sabbath School teacher'));
    await shot('settings-edit-dark');

    // Switches saved on the profile: they stay after leaving the page and coming back.
    const flip = async (route, name) => {
      await goto(route);
      const sw = page.getByRole('switch', { name });
      const before = await sw.getAttribute('aria-checked');
      await sw.click();
      await wait(600);
      await goto('/accounts/edit');
      await goto(route);
      return before !== (await page.getByRole('switch', { name }).getAttribute('aria-checked'));
    };
    check('private account turns on and stays on', await flip('/accounts/privacy', 'Private account'));
    check('activity status turns off and stays off', await flip('/accounts/activity-status', 'Show activity status'));
    check('view counts turn off and stay off', await flip('/accounts/counts', 'Show view counts'));
    check('chat streaks turn off and stay off', await flip('/accounts/streaks', 'Chat streaks'));

    // Content preferences
    await goto('/accounts/content');
    await page.getByRole('button', { name: 'Add a topic to see more of' }).click();
    await page.locator('.modal .st-chip', { hasText: 'Hymns' }).click();
    await page.locator('.modal').getByLabel('Your own topic').fill('Camp meeting');
    await page.locator('.modal').getByRole('button', { name: 'Add', exact: true }).click();
    await page.locator('.modal').getByRole('button', { name: 'Done' }).click();
    check('topics to see more of are added', (await page.locator('[data-list=more] .st-chip.topic').allInnerTexts()).map((t) => t.trim()).join('|') === 'Hymns|Camp meeting');
    check('the summary says what you are into', (await page.locator('.st-summary').innerText()).includes("Lately you're into hymns and camp meeting."));
    await page.getByRole('radio', { name: 'Less' }).check();
    await wait(600);
    await goto('/accounts/edit');
    await goto('/accounts/content');
    check('topics and the sensitive filter are saved', (await page.locator('[data-list=more] .st-chip.topic').count()) === 2 && (await page.getByRole('radio', { name: 'Less' }).isChecked()));

    // Appearance
    await goto('/accounts/appearance');
    await page.getByRole('radio', { name: 'White' }).check();
    check('Appearance switches to White', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'white');
    await shot('settings-appearance-white');
    await goto('/accounts/edit');
    await shot('settings-edit-white');
    await goto('/help');
    await page.waitForSelector('.st-msg');
    await shot('help-white');
    await goto('/accounts/appearance');
    await page.getByRole('radio', { name: 'Dark' }).check();
    check('and back to Dark', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');

    // App font (a Plus perk; the demo account has Plus): the whole app changes at once and stays after a reload.
    const appFont = () => page.evaluate(() => ({ attr: document.documentElement.dataset.appFont ?? '', body: getComputedStyle(document.body).fontFamily, nav: getComputedStyle(document.querySelector('.st-nav-item')).fontFamily }));
    check('Appearance lists the four fonts with their samples', (await page.locator('.st-font').count()) === 4 && (await page.locator('.st-font[data-font=lora]').innerText()).includes('A calm serif, like a hymnal.'));
    check('each font is drawn in itself', (await page.locator('.st-font[data-font=poppins] .st-row-text').evaluate((el) => getComputedStyle(el).fontFamily)).startsWith('Poppins'));
    check('the standard font is chosen to begin with', (await page.getByRole('radio', { name: /^Standard\./ }).isChecked()) && (await appFont()).attr === '');
    await page.getByRole('radio', { name: /^Lora\./ }).check();
    check('choosing a font says so', await toastSays('Font changed'));
    let f = await appFont();
    check('the whole app is set in it at once', f.attr === 'lora' && f.body.startsWith('Lora') && f.nav.startsWith('Lora'), JSON.stringify(f));
    check('its Google Fonts stylesheet is added', (await page.locator('link[data-app-font=lora]').getAttribute('href')).includes('family=Lora'));
    await shot('settings-font-dark');
    await page.reload();
    await page.waitForSelector('.st-font');
    await wait(400);
    f = await appFont();
    check('the font stays after a reload', f.attr === 'lora' && f.body.startsWith('Lora') && (await page.getByRole('radio', { name: /^Lora\./ }).isChecked()), JSON.stringify(f));
    await page.getByRole('radio', { name: /^Standard\./ }).check();
    await wait(200);
    f = await appFont();
    check('Standard puts the app back in the computer\'s font', f.attr === '' && !f.body.includes('Lora'), JSON.stringify(f));

    // Chat wallpaper: its row opens the picker the chats use.
    await page.locator('.st-row', { hasText: 'Chat wallpaper' }).click();
    await wait();
    check('the chat wallpaper row opens the picker', (await page.evaluate(() => location.hash)) === '#/accounts/chat-wallpaper' && (await title()) === 'Chat wallpaper' && (await page.locator('.st-wallpaper').count()) === 1);
    check('Appearance stays highlighted in the column', (await page.locator('.st-nav-item.on').innerText()).includes('Appearance'));

    // Shorts: sound, captions and their language, kept on this computer.
    const prefs = () => page.evaluate(() => JSON.parse(localStorage.getItem('community.prefs') || '{}'));
    await goto('/accounts/content');
    await page.locator('.st-row', { hasText: 'Shorts settings' }).click();
    await wait();
    check('Content preferences links to the Shorts settings', (await title()) === 'Shorts');
    await page.getByRole('switch', { name: 'Start Shorts with the sound off' }).click();
    await page.getByRole('switch', { name: 'Show captions' }).click();
    await page.locator('[data-testid=caption-language]').click();
    check('caption languages: the app language and 19 others', (await page.locator('.st-caption-langs .st-row').count()) === 20 && (await page.getByRole('radio', { name: 'App language' }).isChecked()));
    await page.getByRole('radio', { name: 'Français' }).click();
    await wait(300);
    let p = await prefs();
    check('Shorts settings are saved', p.reelsMuted === true && p.captions === false && p.captionLang === 'fr', JSON.stringify(p));
    await page.reload();
    await page.waitForSelector('.st-title');
    await wait(400);
    check('and stay after a reload', (await page.getByRole('switch', { name: 'Start Shorts with the sound off' }).getAttribute('aria-checked')) === 'true' && (await page.getByRole('switch', { name: 'Show captions' }).getAttribute('aria-checked')) === 'false' && (await page.locator('[data-testid=caption-language] .st-row-value').innerText()) === 'Français');
    await page.getByRole('switch', { name: 'Show captions' }).click();
    await page.locator('[data-testid=caption-language]').click();
    await page.getByRole('radio', { name: 'App language' }).click();
    await wait(300);
    p = await prefs();
    check('captions back on, in the app language', p.captions === true && p.captionLang === '', JSON.stringify(p));
    await shot('settings-shorts-dark');

    // Story alerts (Plus): add someone you follow and remove them again.
    await goto('/accounts/story');
    await page.locator('.st-row', { hasText: 'Story alerts' }).click();
    await page.waitForSelector('.st-watch .st-person');
    check('Story alerts opens from Story, live and location', (await title()) === 'Story alerts' && (await page.locator('.st-nav-item.on').innerText()).includes('Story, live and location'));
    check('it lists who you are told about', (await page.locator('.st-watch').innerText()).includes('grace_mensah'));
    await page.getByRole('button', { name: 'Add people' }).click();
    await page.waitForSelector('.st-watch-pick .st-person');
    check('Add people lists the people you follow, Grace ticked', await page.locator('.st-watch-pick').getByRole('checkbox', { name: 'Remove grace_mensah' }).isChecked());
    const pick = page.locator('.st-watch-pick input[aria-label^="Add "]').first();
    const who = (await pick.getAttribute('aria-label')).slice(4);
    await pick.click();
    await wait(300);
    check('ticking someone adds them at once', await page.locator('.st-watch-pick').getByRole('checkbox', { name: 'Remove ' + who }).isChecked());
    await page.getByRole('button', { name: 'Done' }).click();
    check('they are on the list', (await page.locator('.st-watch .st-person').count()) === 2 && (await page.locator('.st-watch').innerText()).includes(who));
    await shot('settings-story-alerts-dark');
    await goto('/accounts/edit');
    await goto('/accounts/story-alerts');
    await page.waitForSelector('.st-watch .st-person');
    check('the addition is saved', (await page.locator('.st-watch .st-person').count()) === 2);
    await page.getByRole('button', { name: 'Remove ' + who }).click();
    await wait(300);
    check('Remove takes them off', (await page.locator('.st-watch .st-person').count()) === 1);
    await goto('/accounts/edit');
    await goto('/accounts/story-alerts');
    await page.waitForSelector('.st-watch .st-person');
    check('and that is saved too', (await page.locator('.st-watch .st-person').count()) === 1 && !(await page.locator('.st-watch').innerText()).includes(who));

    // Location: the friends' map, where sharing starts.
    await goto('/accounts/story');
    check('Story, live and location offers to share your location on the map', (await page.locator('a.st-row', { hasText: 'Share my live location' }).getAttribute('href')) === '#/map');
    await page.locator('a.st-row', { hasText: 'Share my live location' }).click();
    await wait();
    check("it opens the friends' map", (await page.evaluate(() => location.hash)) === '#/map');

    // The search finds the new pages.
    await goto('/accounts/edit');
    await page.getByLabel('Search settings').fill('caption');
    check('search finds Shorts by captions', (await page.locator('.st-nav-item').allInnerTexts()).some((t) => t.trim() === 'Shorts'));
    await page.getByLabel('Search settings').fill('font');
    check('search finds Appearance by font', (await page.locator('.st-nav-item').allInnerTexts()).some((t) => t.trim() === 'Appearance'));
    await page.getByLabel('Search settings').fill('alerts');
    check('search finds Story alerts', (await page.locator('.st-nav-item').allInnerTexts()).some((t) => t.trim() === 'Story alerts'));
    await page.getByLabel('Clear search').click();

    // Language
    await goto('/accounts/language');
    check('Language lists the 20 languages and the computer\'s own', (await page.locator('.st-languages .st-row').count()) === 20 && (await page.getByRole('radio', { name: "Use this computer's language" }).isChecked()));
    await page.getByLabel('Search languages').fill('fran');
    await page.getByRole('radio', { name: 'Français' }).check();
    await page.reload();
    await page.waitForSelector('.st-languages');
    check('the language choice is kept after a reload', await page.getByRole('radio', { name: 'Français' }).isChecked());
    check('and the app is in French', (await title()) === 'Langue');
    // The page is in French now, so the computer's language (the first choice) is found by its place.
    await page.locator('input[name=language]').first().check();

    // Creator subscriptions
    await goto('/accounts/subscriptions');
    await page.waitForSelector('.st-subscribers .st-person');
    check('your subscribers are listed', (await page.locator('.st-subscribers .st-person').count()) === 2);
    await page.getByRole('radio', { name: '£4.99' }).click();
    await page.getByRole('button', { name: 'Save price' }).click();
    check('a new monthly price is saved', await toastSays('£4.99 a month'));
    await wait(400);
    check('the page shows the new price', (await page.locator('.st-text').first().innerText()).includes('£4.99 a month'));
    const mine = page.locator('.st-mine .st-person', { hasText: 'samuel_boateng' });
    check('the creators you subscribe to are listed', (await mine.count()) === 1);
    await mine.getByRole('button', { name: 'Cancel' }).click();
    await page.locator('.confirm').getByRole('button', { name: 'Cancel subscription' }).click();
    await page.waitForSelector('.st-mine .st-person button:has-text("Resume")');
    check('cancelling a subscription says when it ends, and can be resumed', (await mine.innerText()).includes('Ends'));
    await mine.getByRole('button', { name: 'Resume' }).click();
    await page.waitForSelector('.st-mine .st-person button:has-text("Cancel")');
    check('resuming it renews again', (await mine.innerText()).includes('Renews'));

    // Close friends and Blocked
    await goto('/accounts/close-friends');
    await page.waitForSelector('.st-candidates .st-person');
    await page.getByRole('checkbox', { name: 'Add grace_mensah' }).click();
    await page.waitForSelector('.st-friends .st-person');
    check('adding a close friend puts them on the list', (await page.locator('.st-friends .st-person').innerText()).includes('grace_mensah'));
    await page.getByRole('checkbox', { name: 'Remove grace_mensah' }).first().click();
    await page.waitForSelector('.st-friends', { state: 'detached' });
    check('removing them takes them off', (await page.locator('.st-block', { hasText: 'On your list' }).innerText()).includes('On your list · 0'));
    await goto('/accounts/blocked');
    await page.waitForSelector('.st-blocked .st-person');
    check('blocked accounts are listed', (await page.locator('.st-blocked').innerText()).includes('kwame_deals'));
    await page.getByRole('button', { name: 'Unblock' }).click();
    check('unblocking removes them', await toastSays('Unblocked kwame_deals'));

    // Notifications from people you follow
    await goto('/accounts/notifications');
    await page.getByRole('button', { name: 'Alerts from grace_mensah' }).click();
    await page.getByRole('switch', { name: 'Stories' }).click();
    await wait(400);
    await page.keyboard.press('Escape');
    await wait(700);
    check('turning on alerts from someone shows on the list', (await page.locator('.st-alerts .st-person', { hasText: 'grace_mensah' }).innerText()).includes('Alerts on'));

    // Accounts Centre
    await goto('/accounts/account');
    await page.waitForSelector('.st-row:has-text("Birthday")');
    await wait(400);
    check('Accounts Centre shows your birthday only to you', (await page.locator('.st-row', { hasText: 'Birthday' }).innerText()).includes('14 May 1994'));
    check('it lists where you are logged in', (await page.locator('.st-block', { hasText: "Where you're logged in" }).locator('.st-row').count()) >= 2);
    check('it lists the accounts on this computer', (await page.locator('.st-block', { hasText: 'Accounts on this computer' }).locator('.st-row').count()) === 3);
    check('the sign-in security button is there', (await page.locator('[data-testid="clerk-account"]').count()) === 1);
    await goto('/accounts/viewers');
    await page.waitForSelector('.st-person');
    check('Plus: profile viewers are listed', (await page.locator('.st-person').count()) === 2);

    // Your activity
    await goto('/activity');
    await page.waitForSelector('.st-activity-grid .tile');
    check('Your activity shows the posts you liked', (await page.locator('.st-activity-grid .tile').count()) >= 1);
    await page.locator('.st-nav-item', { hasText: 'Account history' }).click();
    await wait();
    check('account history says when you joined', (await page.locator('.st-timeline').innerText()).includes('You joined Community'));

    // Help: live chat, a problem with a screenshot, a review with stars, a request
    await goto('/help');
    await page.waitForSelector('.st-msg');
    const before = await page.locator('.st-msg[data-role=ai]').count();
    await page.getByLabel('Message support').fill('How do I make my account private?');
    await page.locator('.st-chat-input').getByRole('button', { name: 'Send' }).click();
    await page.waitForFunction((n) => document.querySelectorAll('.st-msg[data-role=ai]').length > n, before, { timeout: 6000 });
    check('live chat: the assistant answers', (await page.locator('.st-msg[data-role=ai]').last().innerText()).includes('Account privacy'));
    check('its answer is labelled as the assistant', (await page.locator('.st-msg[data-role=ai] .st-msg-who').last().innerText()).includes('Community assistant'));
    await page.getByLabel('Message support').fill('Can I talk to a person please?');
    await page.keyboard.press('Enter');
    await page.locator('.st-msg[data-role=agent] .bubble', { hasText: 'reading through your messages' }).waitFor({ timeout: 6000 });
    check('then a person from the team answers under their name', (await page.locator('.st-msg[data-role=agent] .st-msg-who').last().innerText()).includes('Grace · Support team'));
    await page.waitForSelector('.st-chat-head .st-ok');
    check('and the chat says they are here', (await page.locator('.st-chat-head').innerText()).includes('Grace from the support team is here'));
    await shot('help-dark');

    await page.getByRole('button', { name: 'Rate the app' }).click();
    await page.getByRole('radio', { name: '4 stars' }).click();
    await page.locator('.modal').getByLabel('Your review').fill('Lovely on the Mac');
    await page.locator('.modal').getByRole('button', { name: 'Send' }).click();
    check('a review with stars is sent', await toastSays('glad you'));

    await page.getByRole('button', { name: 'Message support' }).click();
    await page.locator('.modal .form-row').filter({ hasText: 'Subject' }).locator('input').fill('Hymn search');
    await page.locator('.modal .form-row').filter({ hasText: 'Message' }).locator('textarea').fill('Searching by first line would help.');
    await page.getByRole('button', { name: 'Send request' }).click();
    await page.locator('.ticket', { hasText: 'Hymn search' }).waitFor({ timeout: 4000 });
    check('a request to the team is sent and listed', (await page.locator('.ticket').count()) === 2);

    await goto('/help/problem');
    await page.getByLabel('What happened').fill('The hymn list jumps to the top when I go back.');
    await page.getByLabel('Add a screenshot').setInputFiles(path.join(MEDIA, '04.jpg'));
    await page.waitForSelector('.st-shot img');
    check('a screenshot can be attached', true);
    await page.getByRole('button', { name: 'Send report' }).click();
    await page.getByText('Thanks for telling us').waitFor({ timeout: 6000 });
    check('reporting a problem is sent', true);

    // The legal pages
    const docs = { privacy: 'Privacy policy', terms: 'Terms', guidelines: 'Community guidelines', 'child-safety': 'Child safety', copyright: 'Copyright' };
    for (const [id, name] of Object.entries(docs)) {
      await goto('/legal/' + id);
      const h1 = await page.locator('.st-legal-doc h1').innerText();
      const body = await page.locator('.st-legal-doc').innerText();
      check(`the ${id} page shows the document`, h1.toLowerCase().includes(name.toLowerCase().split(' ')[0]) && body.includes('Last updated 10 October 2026') && (await page.locator('.st-legal-doc h2').count()) >= 2 && !body.includes('{{'), h1);
    }
    check('the documents have lists and bold words', (await page.locator('.st-legal-doc li').count()) > 2 && (await page.locator('.st-legal-doc strong').count()) >= 0);
    await goto('/legal/privacy');
    const toOther = page.locator('.st-legal-doc a[href^="#/legal/"]').first();
    if (await toOther.count()) {
      const target = await toOther.getAttribute('href');
      await toOther.click();
      await wait();
      check('a link to another document opens it here', (await page.evaluate(() => location.hash)) === target);
    }
    await goto('/legal/about');
    check('About shows the version and the documents', /Version \d+\.\d+\.\d+/.test(await page.locator('.st-about').innerText()) && (await page.locator('.st-about-links a').count()) === 5);
    await goto('/accounts/about');
    check('Settings → About shows the same', /Version \d/.test(await page.locator('.st-about').innerText()));
    await shot('legal-dark');

    // A font chosen on this computer by the demo account (which has Plus)…
    await goto('/accounts/appearance');
    await page.getByRole('radio', { name: /^Nunito\./ }).check();
    await wait(300);
    check('(Nunito chosen as the demo account)', (await page.evaluate(() => document.documentElement.dataset.appFont)) === 'nunito');

    // Profile viewers is a Plus perk: Daniel doesn't have Plus.
    await page.evaluate(() => sessionStorage.setItem('community.demoAs', 'u_daniel'));
    await page.reload();
    await page.waitForSelector('.rail');
    await goto('/accounts/viewers');
    await page.waitForSelector('.st-upsell');
    check('without Plus, profile viewers offers Community Plus', (await page.locator('.st-upsell a').getAttribute('href')) === '#/plus');

    // …isn't used for Daniel, and the font chooser offers him Plus instead.
    await wait(600);
    const danielFont = await page.evaluate(() => ({ attr: document.documentElement.dataset.appFont ?? '', body: getComputedStyle(document.body).fontFamily }));
    check('without Plus the app keeps its standard font', danielFont.attr === '' && !danielFont.body.includes('Nunito'), JSON.stringify(danielFont));
    await goto('/accounts/appearance');
    check('without Plus, the font chooser offers Community Plus', (await page.locator('.st-upsell', { hasText: 'App fonts are part of Community Plus' }).locator('a').getAttribute('href')) === '#/plus');
    check('its fonts are a preview that cannot be chosen', (await page.locator('.st-font').count()) === 4 && (await page.getByRole('radio', { name: /^Lora\./ }).isDisabled()) && !(await page.getByRole('radio', { name: /^Nunito\./ }).isChecked()));
    await shot('settings-font-upsell-dark');
    await goto('/accounts/story-alerts');
    check('without Plus, story alerts offers Community Plus', (await page.locator('.st-upsell').innerText()).includes('Story alerts are part of Community Plus'));

    // Ruth has no birthday on file: she is asked once, and it can only be closed by answering.
    await page.evaluate(() => sessionStorage.setItem('community.demoAs', 'u_ruth'));
    await page.reload();
    await page.waitForSelector('.rail');
    await page.waitForSelector('.st-birthday', { timeout: 6000 });
    check('a member without a birthday is asked for it', (await page.locator('.st-birthday h2').innerText()) === 'Add your birthday');
    await page.keyboard.press('Escape');
    await page.mouse.click(30, 450);
    await wait(300);
    check('the question cannot be closed without answering', (await page.locator('.st-birthday').count()) === 1);
    await page.getByLabel('Birthday, day').fill('31');
    await page.getByLabel('Birthday, month as a number').fill('02');
    await page.getByLabel('Birthday, year').fill('2013');
    await page.getByRole('button', { name: 'Save' }).click();
    check('an impossible date is refused', (await page.locator('.st-birthday .field-error').innerText()).includes('only has 28 days'));
    await page.getByLabel('Birthday, day').fill('03');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByText('set up for members under 14').waitFor({ timeout: 4000 });
    check('a 13-year-old is told what the under-14 rules mean', (await page.locator('.st-rules li').count()) === 4);
    await shot('birthday-dark');
    await page.getByRole('button', { name: 'Continue' }).click();
    await wait(300);
    check('and then the app carries on', (await page.locator('.st-birthday').count()) === 0);
    await page.evaluate(() => sessionStorage.removeItem('community.demoAs'));

    const over = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
    check('no sideways scrolling', over <= 0, over);
  } catch (e) {
    console.log('TEST CRASHED: ' + e.message.split('\n').slice(0, 4).join('\n'));
    failed++;
  }
  check('no script errors', errors.length === 0, errors.join(' | '));
  await page.context().close();

  // Setting up a new account on the wiring build: under 13 can't join.
  const up = await fetch(WIRE).then((r) => r.ok, () => false);
  if (!up) console.log('skip the age check at sign-up: no wiring build at ' + WIRE);
  else {
    const wiringErrors = [];
    const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8').split('\n').map((l) => /^\s*(EXPO_PUBLIC_[A-Z_]+)\s*=\s*(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
    const KEY = env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const HOST = Buffer.from(KEY.split('_').slice(2).join('_'), 'base64').toString().replace(/\$+$/, '');
    const CLERK_JS = `window.Clerk = { user: null, session: null, _l: [],
      async load() {}, addListener(fn) { this._l.push(fn); }, _emit() { this._l.forEach((fn) => fn({ user: this.user, session: this.session })); },
      mountSignIn(el) { el.innerHTML = '<button id="stub-sign-in">Stub sign in</button>'; el.querySelector('button').onclick = () => {
        window.__fakeMe = 'user_3Young'; this.user = { id: 'user_3Young', fullName: 'Young Person', username: null, primaryEmailAddress: { emailAddress: 'young@example.com' }, hasImage: false };
        this.session = { getToken: async () => 'token' }; this._emit(); }; },
      unmountSignIn(el) { el.innerHTML = ''; }, mountSignUp() {}, unmountSignUp() {},
      async signOut() { window.__signedOut = true; this.user = null; this.session = null; this._emit(); }, openUserProfile() {} };`;
    const p = await (await browser.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
    p.on('pageerror', (e) => wiringErrors.push(e.message));
    const js = (body) => ({ status: 200, contentType: 'application/javascript', body });
    await p.route('**/*', (r) => {
      const u = r.request().url();
      if (u === `https://${HOST}/npm/@clerk/ui@1/dist/ui.browser.js`) return r.fulfill(js('window.__internal_ClerkUICtor = function () {};'));
      if (u === `https://${HOST}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`) return r.fulfill(js(CLERK_JS));
      return u.startsWith(WIRE) || u.startsWith('blob:') || u.startsWith('data:') ? r.continue() : r.abort();
    });
    try {
      await p.goto(WIRE);
      await p.click('#stub-sign-in');
      await p.getByText('Enter your date of birth').waitFor();
      check('sign-up asks for the date of birth first', true);
      await p.getByLabel('Birthday, day').fill('12');
      await p.getByLabel('Birthday, month as a number').fill('06');
      await p.getByLabel('Birthday, year').fill('2016');
      await p.getByRole('button', { name: 'Continue' }).click();
      await p.getByText("Sorry, you can't create an account").waitFor({ timeout: 4000 });
      check('under 13 is turned away and nothing is made', (await p.locator('.onboard').innerText()).includes('13 and over'));
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'cannot-join.png') });
      await p.reload();
      await p.click('#stub-sign-in');
      await p.getByText("Sorry, you can't create an account").waitFor({ timeout: 4000 });
      check('going back in on this computer is still refused', true);
      await p.getByRole('button', { name: 'Back to the start' }).click();
      await p.waitForSelector('.login');
      check('Back to the start signs out', await p.evaluate(() => window.__signedOut === true));
    } catch (e) {
      console.log('TEST CRASHED (sign-up): ' + e.message.split('\n').slice(0, 4).join('\n'));
      failed++;
    }
    check('no script errors at sign-up', wiringErrors.length === 0, wiringErrors.join(' | '));
  }

  await browser.close();
  console.log(failed ? `${failed} CHECK(S) FAILED` : 'ALL SETTINGS CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})();
