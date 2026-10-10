// Churches, and Communities and pages: the church list (A to Z, or nearest first once the member
// clicks Near me), adding a church as a member (it waits for an admin), approving, rejecting, editing,
// making it my church, leaving and deleting it; creating a community and a page, editing, "Create
// post" into it, deleting it, the members page (approve or decline requests, make an admin, remove
// someone), the private-community rules, and posts as a grid or a feed. Screenshots in Dark and White.
// Usage: node tests/community.test.cjs http://127.0.0.1:8806/ [screenshot dir]
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:8806/';
const SHOTS = process.argv[3] || '';
const COVER = path.join(__dirname, '../src/fake/media/03.jpg');
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || extra === '' ? '' : ' (' + extra + ')'));
  if (!ok) failed++;
};

(async () => {
  const browser = await chromium.launch();
  // A position near the sample churches; the browser only hands it over once permission is granted.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, geolocation: { latitude: 5.6, longitude: -0.19 } });
  // Count every request for the computer's position, to show it is only asked for from a click.
  await ctx.addInitScript(() => {
    const geo = navigator.geolocation;
    const ask = geo.getCurrentPosition.bind(geo);
    window.__geoAsked = 0;
    geo.getCurrentPosition = (...a) => {
      window.__geoAsked++;
      return ask(...a);
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    return u.startsWith(BASE) || u.startsWith('blob:') || u.startsWith('data:') ? r.continue() : r.abort();
  });
  const wait = (ms = 500) => page.waitForTimeout(ms);
  const goto = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await wait(700);
  };
  const hash = () => page.evaluate(() => location.hash);
  const rows = (table) => page.evaluate((t) => JSON.parse(JSON.stringify(window.__communityDemo.T(t))), table);
  const toast = (text) => page.locator('.toast').filter({ hasText: text }).first().waitFor({ timeout: 4000 }).then(() => true, () => false);
  const confirm = async (action) => {
    await page.locator('.confirm').waitFor();
    await page.locator('.confirm').getByRole('button', { name: action, exact: true }).click();
    await wait(600);
  };
  const choose = async (scope, label) => {
    await scope.getByRole('button', { name: 'More options' }).click();
    await page.locator('.choices').getByRole('button', { name: label, exact: true }).click();
    await wait(400);
  };
  // The demo signs you in as an app admin. Turn that off (or back on) to see the app as a member.
  const setAdmin = async (on) => {
    await page.evaluate((on) => {
      const d = window.__communityDemo;
      d.db.community_admins = d.T('community_admins').filter((a) => a.user_id !== 'demo_me');
      if (on) d.T('community_admins').push({ user_id: 'demo_me', role: 'owner', created_at: new Date().toISOString() });
      d.announce('profile');
    }, on);
    await wait(900);
  };
  const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
  const names = () => page.locator('.cm-church-row .cm-row-name b').allInnerTexts();
  const row = (name) => page.locator('.cm-church-row', { hasText: name });

  try {
    await page.goto(BASE);
    await page.waitForSelector('.feed-post');

    /* ---------------- Churches: the list ---------------- */
    await goto('/churches');
    await page.waitForSelector('.cm-church-row');
    const az = await names();
    check('churches are listed A to Z', az.join() === [...az].sort((a, b) => a.localeCompare(b)).join() && az.length === 5, az.join());
    check('admins see a church waiting for review, marked Pending review', (await row('Lakeside SDA Company').locator('.cm-status.pending').innerText()) === 'Pending review');
    check('a church of mine that an admin turned down is marked Not approved', (await row('Old Town Prayer House').locator('.cm-status.rejected').innerText()) === 'Not approved');
    check('location is not asked for until Near me is clicked', (await page.evaluate(() => window.__geoAsked)) === 0);

    // Near me: refused first, then allowed.
    await page.getByRole('button', { name: /Near me/ }).click();
    await page.locator('.cm-note').waitFor({ timeout: 4000 });
    check('when location is refused the list says so and stays A to Z', (await page.locator('.cm-note').innerText()).includes('Location is off') && (await names()).join() === az.join() && (await page.locator('.cm-km').count()) === 0);
    await ctx.grantPermissions(['geolocation'], { origin: new URL(BASE).origin });
    await page.locator('.cm-note').getByRole('button', { name: 'Try again' }).click();
    await page.waitForSelector('.cm-km', { timeout: 4000 });
    const near = await names();
    check('Near me sorts the nearest church first, unpinned ones last', near[0] === 'Hillside Seventh-day Adventist Church' && near[1] === 'Lakeside SDA Company' && near[near.length - 1] === 'Old Town Prayer House', near.join());
    check('each pinned church shows how far away it is', /^\d+\.\d km$/.test(await row('Hillside Seventh-day').locator('.cm-km').innerText()) && (await page.locator('.cm-km').count()) === 4);
    check('the list is headed Nearest first', (await page.locator('.split-list .list-h').first().innerText()).toLowerCase() === 'nearest first');
    await page.getByRole('button', { name: 'A to Z' }).click();
    check('A to Z sorts by name again', (await names()).join() === az.join());

    // A member adds a church: it waits for an admin.
    await setAdmin(false);
    check('members do not see churches others suggested that are waiting for review', (await row('Lakeside SDA Company').count()) === 0 && (await row('Old Town Prayer House').count()) === 1);
    await page.getByRole('button', { name: 'Add a church' }).click();
    await page.waitForSelector('.cm-pane');
    check('Add a church opens the form beside the list', (await hash()) === '#/churches/new');
    check('a member is told an admin checks each new church', (await page.locator('.cm-pane-intro').innerText()).includes('An admin checks each new church'));
    await page.getByRole('button', { name: 'Add church' }).click();
    check('a church needs a name', (await page.locator('.cm-pane .form-error').first().innerText()) === "Add the church's name.");
    await page.getByLabel('Church name').fill('Ebenezer SDA Church');
    await page.getByLabel('Address').fill('7 Palm Street');
    await page.getByLabel('City').fill('Sample Bay');
    await page.getByLabel('Country').fill('Demo');
    await page.getByLabel('Service times').fill('Sabbath School 9:30 · Divine Service 11:00');
    await page.getByLabel('Website').fill('not a website');
    await page.getByRole('button', { name: 'Add church' }).click();
    check('a website that does not look right is refused', (await page.locator('.cm-pane .form-error').first().innerText()) === 'That website address does not look right.');
    await page.getByLabel('Website').fill('ebenezer.example.org');
    await page.getByRole('button', { name: 'Pin where I am' }).click();
    await page.getByText('Pinned where you are now').waitFor({ timeout: 4000 });
    check('the church can be pinned where the member is', true);
    await page.getByRole('button', { name: 'Add church' }).click();
    await page.locator('.confirm').waitFor();
    check("the member is thanked and told it waits for an admin", (await page.locator('.confirm h3').innerText()) === 'Thanks!' && (await page.locator('.confirm p').innerText()).includes('An admin will check this church'));
    await confirm('Cancel');
    await wait(400);
    const added = (await rows('community_churches')).find((c) => c.name === 'Ebenezer SDA Church');
    check('it is saved as pending, with its pin and website', added && added.status === 'pending' && added.created_by === 'demo_me' && Math.abs(added.lat - 5.6) < 0.01 && added.website === 'https://ebenezer.example.org', JSON.stringify(added));
    check('its page opens, waiting for an admin', added && (await hash()) === '#/churches/' + added.id && (await page.locator('.cm-banner.pending b').innerText()) === 'Waiting for an admin to approve this church');
    check('a member cannot approve it', (await page.locator('.cm-banner').getByRole('button', { name: 'Approve' }).count()) === 0 && (await page.locator('.cm-church').getByRole('button', { name: 'More options' }).count()) === 0);
    check('the list shows it to the member as Pending review', (await row('Ebenezer SDA Church').locator('.cm-status.pending').count()) === 1);

    // An admin approves it.
    await setAdmin(true);
    check('an admin sees Approve and Reject, and who suggested it', (await page.locator('.cm-banner').getByRole('button', { name: 'Approve' }).count()) === 1 && (await page.locator('.cm-banner').getByRole('button', { name: 'Reject' }).count()) === 1 && (await page.locator('.cm-banner-text').innerText()).includes('Suggested by you'));
    await page.locator('.cm-banner').getByRole('button', { name: 'Approve' }).click();
    check('approving says so', await toast('Church approved'));
    await wait(500);
    const approved = (await rows('community_churches')).find((c) => c.id === added.id);
    check('it is approved, and by whom', approved.status === 'approved' && approved.reviewed_by === 'demo_me' && (await page.locator('.cm-banner').count()) === 0 && (await row('Ebenezer SDA Church').locator('.cm-status').count()) === 0);

    // An admin corrects it.
    await choose(page.locator('.cm-church'), 'Edit church');
    const edit = page.locator('.cm-modal');
    check('Edit church opens with its details', (await edit.getByLabel('Church name').inputValue()) === 'Ebenezer SDA Church' && (await edit.getByLabel('Website').inputValue()) === 'https://ebenezer.example.org');
    await edit.getByLabel('Church name').fill('Ebenezer Seventh-day Adventist Church');
    await edit.getByLabel('Service times').fill('Divine Service 10:00');
    await edit.getByRole('button', { name: 'Save' }).click();
    check('saving says so', await toast('Church updated'));
    await wait(500);
    check('the page shows the corrected details', (await page.locator('.cm-church h1').innerText()) === 'Ebenezer Seventh-day Adventist Church' && (await page.locator('.cm-about').innerText()).includes('Divine Service 10:00'));
    check('the corrections are saved', (await rows('community_churches')).some((c) => c.id === added.id && c.name === 'Ebenezer Seventh-day Adventist Church' && c.service_times === 'Divine Service 10:00' && c.lat !== null));

    // Make it my church, leave it, and make it mine again.
    await page.getByRole('button', { name: 'This is my church' }).click();
    check('making it my church asks first', (await page.locator('.confirm h3').innerText()) === 'Make Ebenezer Seventh-day Adventist Church your church?');
    await confirm('This is my church');
    check('it says this is my church now', await toast('This is your church now'));
    await wait(600);
    check('the page says Your church and offers to leave', (await page.locator('.cm-church .cm-mine-text').innerText()) === 'Your church' && (await page.getByRole('button', { name: 'Leave this church' }).count()) === 1);
    check('I am in its members list', (await page.locator('.cm-church .cm-person').filter({ hasText: 'Demo Account' }).count()) === 1 && (await page.locator('.cm-church .cm-h').nth(1).innerText()) === 'Members · 1');
    check('my profile has the church', (await rows('community_profiles')).find((p) => p.id === 'demo_me').church_id === added.id);
    check('the list shows it first, as My church', (await page.locator('.split-list .list-h').first().innerText()).toLowerCase() === 'my church' && (await page.locator('.cm-church-row').first().innerText()).includes('Your church'));
    await page.getByRole('button', { name: 'Leave this church' }).click();
    await confirm('Leave');
    check('leaving says so', await toast('You have left this church'));
    await wait(500);
    check('and it comes off my profile', (await rows('community_profiles')).find((p) => p.id === 'demo_me').church_id === null && (await page.getByRole('button', { name: 'This is my church' }).count()) === 1);
    await page.getByRole('button', { name: 'This is my church' }).click();
    await confirm('This is my church');
    await wait(600);

    if (SHOTS) {
      await goto('/churches/ch1');
      await shot('community-01-church-dark');
      await goto('/churches/' + added.id);
    }

    // An admin deletes it: it comes off my profile too.
    await choose(page.locator('.cm-church'), 'Delete church');
    check('deleting asks first', (await page.locator('.confirm h3').innerText()) === 'Delete this church?');
    await confirm('Delete');
    check('deleting says so', await toast('Church deleted'));
    await wait(500);
    check('the church is gone from the list and the database', (await hash()) === '#/churches' && (await row('Ebenezer').count()) === 0 && !(await rows('community_churches')).some((c) => c.id === added.id));
    check('and from my profile', (await rows('community_profiles')).find((p) => p.id === 'demo_me').church_id === null);

    // An admin turns a suggested church down, then approves it after all.
    await goto('/churches/ch3');
    await page.locator('.cm-banner').getByRole('button', { name: 'Reject' }).click();
    check('turning a church down asks first', (await page.locator('.confirm h3').innerText()) === 'Turn this church down?');
    await confirm('Reject');
    check('rejecting says so', await toast('Church not approved'));
    await wait(400);
    check('it is marked not approved, and can be approved after all', (await page.locator('.cm-banner.rejected b').innerText()) === 'An admin did not approve this church' && (await page.getByRole('button', { name: 'Approve after all' }).count()) === 1 && (await page.getByRole('button', { name: 'This is my church' }).count()) === 0);
    check("it leaves the list for everyone but the member who suggested it", (await row('Lakeside SDA Company').count()) === 0 && (await rows('community_churches')).find((c) => c.id === 'ch3').status === 'rejected');
    await page.getByRole('button', { name: 'Approve after all' }).click();
    check('and approved after all', await toast('Church approved'));
    await wait(400);
    check('it lists for everyone again', (await row('Lakeside SDA Company').count()) === 1 && (await row('Lakeside SDA Company').locator('.cm-status').count()) === 0);

    /* ---------------- Communities and pages: the list ---------------- */
    await goto('/groups');
    await page.waitForSelector('.cm-card');
    const yours = page.locator('.cm-grid-cards').nth(0);
    const discover = page.locator('.cm-grid-cards').nth(1);
    check('Yours lists the ones I am in', (await yours.locator('.cm-card-name b').allInnerTexts()).sort().join() === 'Sabbath Prayer Circle,Youth Ministry');
    check('one I own shows that people are waiting to join', (await yours.locator('.cm-card', { hasText: 'Sabbath Prayer Circle' }).innerText()).includes('2 waiting'));
    check('Discover offers Follow on a page and Request to join on a private community', (await discover.locator('.cm-card', { hasText: 'Hillside Choir' }).getByRole('button').innerText()) === 'Follow' && (await discover.locator('.cm-card', { hasText: "Women's Ministries" }).getByRole('button').innerText()) === 'Request to join');
    await page.getByLabel('Search communities and pages').fill('choir');
    await wait(800);
    check('search finds by name, in both lists', (await discover.locator('.cm-card').count()) === 1 && (await yours.locator('.cm-card').count()) === 0 && (await page.locator('.cm-none').innerText()) === 'None of yours match.');
    await page.getByLabel('Search communities and pages').fill('');
    await wait(800);
    await page.locator('.cm-chips').getByRole('button', { name: 'Pages', exact: true }).click();
    check('Discover can show pages only', (await discover.locator('.cm-card-name b').allInnerTexts()).join() === 'Hillside Choir');
    await page.locator('.cm-chips').getByRole('button', { name: 'All', exact: true }).click();
    await discover.locator('.cm-card', { hasText: "Women's Ministries" }).getByRole('button', { name: 'Request to join' }).click();
    check('asking to join from the list says so', await toast('Request sent'));
    await wait(500);
    check('the card says Requested and the request is saved', (await discover.locator('.cm-card', { hasText: "Women's Ministries" }).getByRole('button').innerText()) === 'Requested' && (await rows('community_group_members')).some((m) => m.group_id === 'g4' && m.user_id === 'demo_me' && m.status === 'pending'));

    // The private-community rules, seen as a member (app admins see everything).
    await setAdmin(false);
    await goto('/groups/g4');
    await page.waitForSelector('.cm-ghead');
    check('a private community hides its posts until you are in', (await page.locator('.private-note h2').innerText()) === 'This community is private' && (await page.locator('.private-note p').innerText()) === 'Your request is waiting for an admin.' && (await page.locator('.cm-tabs').count()) === 0);
    check('people not in it cannot post or manage it', (await page.getByRole('button', { name: 'Create post' }).count()) === 0 && (await page.locator('.cm-ghead').getByRole('button', { name: 'More options' }).count()) === 0);
    await page.getByRole('button', { name: 'Requested', exact: true }).click();
    check('withdrawing a request asks first', (await page.locator('.confirm h3').innerText()) === 'Cancel your request?');
    await confirm('Cancel request');
    await wait(400);
    check('the request is withdrawn', (await page.getByRole('button', { name: 'Request to join' }).count()) === 1 && (await page.locator('.private-note p').innerText()) === 'Ask to join to see what members share.' && !(await rows('community_group_members')).some((m) => m.group_id === 'g4' && m.user_id === 'demo_me'));
    await page.getByRole('button', { name: 'Request to join' }).click();
    check('asking to join from its page says an admin will let you in', await toast('Request sent. An admin will let you in.'));
    await wait(500);
    check('the page then says Requested', (await page.getByRole('button', { name: 'Requested', exact: true }).count()) === 1 && (await rows('community_group_members')).some((m) => m.group_id === 'g4' && m.user_id === 'demo_me' && m.status === 'pending'));
    await setAdmin(true);
    check('an app admin sees a private community and can manage it', (await page.locator('.private-note').count()) === 0 && (await page.locator('.cm-ghead').getByRole('button', { name: 'More options' }).count()) === 1);

    /* ---------------- Create, edit, post into and delete a community ---------------- */
    await goto('/groups');
    await page.locator('.cm-head').getByRole('button', { name: 'Create', exact: true }).click();
    await wait();
    check('Create opens the form', (await hash()) === '#/groups/new' && (await page.locator('.cm-form').count()) === 0);
    await page.getByRole('radio', { name: /^Community/ }).click();
    check('choosing Community shows its form', (await page.locator('.page-title').innerText()) === 'New community' && (await page.getByRole('radiogroup', { name: 'Who can join' }).count()) === 1);
    await page.setInputFiles('input[aria-label="Cover photo"]', COVER);
    await page.locator('.cm-cover-pick.has').waitFor({ timeout: 4000 });
    await page.getByLabel('Name', { exact: true }).fill('Young Adults Bible Study');
    check('the handle is made from the name', (await page.getByLabel('Handle').inputValue()) === 'young_adults_bible_study');
    await page.getByLabel('Description').fill('Tuesday evenings, all young adults welcome.');
    await page.getByRole('radio', { name: /^Private/ }).click();
    await page.locator('select.cm-select').selectOption('ch1');
    if (SHOTS) await shot('community-02-new-community-dark');
    await page.getByLabel('Handle').fill('youth');
    await page.getByRole('button', { name: 'Create community' }).click();
    await page.locator('.cm-form .form-error').waitFor({ timeout: 4000 });
    check('a taken handle is refused', (await page.locator('.cm-form .form-error').innerText()) === 'That @handle is taken. Try another.');
    await page.getByLabel('Handle').fill('Young Adults');
    check('handles are lowercase without spaces', (await page.getByLabel('Handle').inputValue()) === 'youngadults');
    await page.getByRole('button', { name: 'Create community' }).click();
    await page.waitForSelector('.cm-ghead', { timeout: 6000 });
    const made = (await rows('community_groups')).find((x) => x.handle === 'youngadults');
    check('the community is saved as private, with its church and cover', made && made.kind === 'community' && made.privacy === 'private' && made.church_id === 'ch1' && !!made.cover_url && made.created_by === 'demo_me', JSON.stringify(made));
    check('its creator is its owner', (await rows('community_group_members')).some((m) => m.group_id === made.id && m.user_id === 'demo_me' && m.role === 'owner' && m.status === 'member'));
    check('its page opens', (await hash()) === '#/groups/' + made.id && (await page.locator('.cm-ghead h1').innerText()) === 'Young Adults Bible Study' && (await page.locator('.cm-handle').innerText()) === '@youngadults');
    check('it says what it is, and where', (await page.locator('.cm-meta').innerText()).includes('Community · Private · 1 member · 0 posts') && (await page.locator('.cm-church-link').innerText()).includes('Hillside Seventh-day Adventist Church'));
    check('the owner can post and manage it', (await page.locator('.cm-owner').innerText()).includes('Owner') && (await page.getByRole('button', { name: 'Create post' }).count()) === 1 && (await page.locator('.cm-ghead').getByRole('button', { name: 'More options' }).count()) === 1);
    check('an empty community invites the first post', (await page.locator('.empty h2').innerText()) === 'No posts yet' && (await page.locator('.empty p').innerText()) === 'Be the first to post here.');

    await choose(page.locator('.cm-ghead'), 'Edit community');
    const gedit = page.locator('.cm-modal');
    check('Edit community opens with its details', (await gedit.getByLabel('Name', { exact: true }).inputValue()) === 'Young Adults Bible Study' && (await gedit.getByRole('switch', { name: 'Private' }).isChecked()));
    await gedit.getByLabel('Name', { exact: true }).fill('Young Adults Fellowship');
    await gedit.locator('.cm-switch-row').click();
    await gedit.getByRole('button', { name: 'Save' }).click();
    check('saving says so', await toast('Saved'));
    await wait(500);
    check('the page shows the changes', (await page.locator('.cm-ghead h1').innerText()) === 'Young Adults Fellowship' && (await page.locator('.cm-meta').innerText()).includes('Community · Public'));
    check('the changes are saved', (await rows('community_groups')).some((x) => x.id === made.id && x.name === 'Young Adults Fellowship' && x.privacy === 'public'));

    await page.evaluate(() => {
      window.__creates = [];
      window.addEventListener('community:create', (e) => window.__creates.push(e.detail));
    });
    await page.getByRole('button', { name: 'Create post' }).click();
    await wait(400);
    const asked = await page.evaluate(() => window.__creates);
    check('Create post asks Create for a post in this community', asked.length === 1 && asked[0].mode === 'post' && asked[0].groupId === made.id, JSON.stringify(asked));
    check('and the Create dialog opens', (await page.locator('.create-dialog').count()) === 1);
    await page.keyboard.press('Escape');
    await wait(400);
    if (await page.locator('.confirm').count()) await page.locator('.confirm button').first().click();

    await choose(page.locator('.cm-ghead'), 'Delete community');
    check('deleting asks first', (await page.locator('.confirm h3').innerText()) === 'Delete Young Adults Fellowship?');
    await confirm('Delete');
    check('deleting says so', await toast('Deleted'));
    await wait(600);
    check('it is gone, with its members', (await hash()) === '#/groups' && !(await rows('community_groups')).some((x) => x.id === made.id) && !(await rows('community_group_members')).some((m) => m.group_id === made.id));
    check('and gone from Yours', (await page.locator('.cm-grid-cards').nth(0).locator('.cm-card', { hasText: 'Young Adults' }).count()) === 0);

    /* ---------------- Create a page ---------------- */
    await goto('/groups/new');
    await page.getByRole('radio', { name: /^Page/ }).click();
    check('a page has no choice of who can join', (await page.locator('.page-title').innerText()) === 'New page' && (await page.getByRole('radiogroup', { name: 'Who can join' }).count()) === 0);
    await page.getByLabel('Name', { exact: true }).fill('Hillside Health Ministries');
    await page.getByRole('button', { name: 'Create page' }).click();
    await page.waitForSelector('.cm-ghead', { timeout: 6000 });
    const pg = (await rows('community_groups')).find((x) => x.handle === 'hillside_health_ministries');
    check('the page is saved as a public page', pg && pg.kind === 'page' && pg.privacy === 'public');
    check('a page counts followers, and its owner posts', (await page.locator('.cm-meta').innerText()).includes('Page · Public · 1 follower') && (await page.getByRole('button', { name: 'Followers' }).count()) === 1 && (await page.getByRole('button', { name: 'Create post' }).count()) === 1);

    /* ---------------- Members: requests, roles, removing ---------------- */
    await goto('/groups/g3');
    await page.waitForSelector('.cm-ghead');
    check('the Members button shows how many are waiting', (await page.locator('.cm-badge').innerText()) === '2');
    check('posts show as a grid', (await page.locator('.cm-post-grid .tile').count()) === 3);
    await page.locator('.cm-post-grid .tile').first().click();
    await page.waitForSelector('.post-dialog', { timeout: 4000 });
    check('a post opens in the post dialog', (await page.locator('.post-dialog').count()) === 1);
    await page.keyboard.press('Escape');
    await wait(400);
    await page.getByRole('tab', { name: 'Feed' }).click();
    await wait(600);
    check('or as a feed', (await page.locator('.cm-post-feed .feed-post').count()) === 3 && (await page.getByRole('tab', { name: 'Feed' }).getAttribute('aria-selected')) === 'true');
    check('the choice is remembered', (await page.evaluate(() => localStorage.getItem('community.groupView'))) === 'feed');
    await page.getByRole('tab', { name: 'Grid' }).click();
    if (SHOTS) await shot('community-03-group-dark');

    await page.getByRole('button', { name: /^Members/ }).click();
    await page.waitForSelector('.cm-members');
    check('the members page opens', (await hash()) === '#/groups/g3/members' && (await page.locator('.cm-members .cm-h').allInnerTexts()).join() === 'Requests · 2,Members · 4');
    if (SHOTS) await shot('community-04-members-dark');
    const requests = page.locator('section[aria-label="Requests"]');
    await requests.locator('.cm-person', { hasText: 'samuel_boateng' }).getByRole('button', { name: 'Approve' }).click();
    check('approving a request lets them in', await toast('samuel_boateng is in'));
    await wait(500);
    check('they move to the members', (await page.locator('section[aria-label="Members"] .cm-person', { hasText: 'samuel_boateng' }).count()) === 1 && (await rows('community_group_members')).some((m) => m.group_id === 'g3' && m.user_id === 'u_samuel' && m.status === 'member'));
    await requests.locator('.cm-person', { hasText: 'esther_adjei' }).getByRole('button', { name: 'Decline' }).click();
    check('declining a request says so', await toast('Request declined'));
    await wait(500);
    check('the request is gone', (await page.locator('section[aria-label="Requests"]').count()) === 0 && !(await rows('community_group_members')).some((m) => m.group_id === 'g3' && m.user_id === 'u_esther'));
    await page.getByRole('button', { name: 'Options for ruth_asante' }).click();
    await page.locator('.choices').getByRole('button', { name: 'Make admin' }).click();
    check('making someone an admin says so', await toast('ruth_asante is now an admin'));
    await wait(500);
    check('they are marked Admin', (await page.locator('.cm-person', { hasText: 'ruth_asante' }).locator('.cm-tag').innerText()) === 'Admin' && (await rows('community_group_members')).some((m) => m.group_id === 'g3' && m.user_id === 'u_ruth' && m.role === 'admin'));
    await page.getByRole('button', { name: 'Options for joseph_k' }).click();
    await page.locator('.choices').getByRole('button', { name: 'Remove from community' }).click();
    check('removing someone asks first', (await page.locator('.confirm h3').innerText()) === 'Remove joseph_k?');
    await confirm('Remove');
    check('removing says so', await toast('Removed joseph_k'));
    await wait(400);
    check('they are gone', (await page.locator('.cm-person', { hasText: 'joseph_k' }).count()) === 0 && !(await rows('community_group_members')).some((m) => m.group_id === 'g3' && m.user_id === 'u_joseph'));
    check('the owner (me) has no menu', (await page.locator('.cm-person', { hasText: 'Demo Account' }).getByRole('button', { name: /^Options/ }).count()) === 0 && (await page.locator('.cm-person', { hasText: 'Demo Account' }).locator('.cm-tag').innerText()).includes('Owner'));
    await page.locator('.cm-back').click();
    await page.waitForSelector('.cm-ghead');
    check('back on the community, nobody is waiting', (await page.locator('.cm-badge').count()) === 0 && (await page.locator('.cm-meta').innerText()).includes('4 members'));

    check('no script errors', errors.length === 0, errors.join(' | '));

    /* ---------------- Screenshots in White (the sample data starts over) ---------------- */
    if (SHOTS) {
      await page.evaluate(() => localStorage.setItem('community.appearance', 'white'));
      await page.reload();
      await page.waitForSelector('.rail');
      check('the app turns White', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'white');
      await goto('/churches/ch1');
      await shot('community-01-church-white');
      await goto('/groups/new');
      await page.getByRole('radio', { name: /^Community/ }).click();
      await page.getByLabel('Name', { exact: true }).fill('Young Adults Bible Study');
      await shot('community-02-new-community-white');
      await goto('/groups/g3');
      await page.waitForSelector('.cm-post-grid .tile');
      await shot('community-03-group-white');
      await goto('/groups/g3/members');
      await page.waitForSelector('.cm-members');
      await shot('community-04-members-white');
      await page.evaluate(() => localStorage.setItem('community.appearance', 'dark'));
      check('no script errors in White', errors.length === 0, errors.join(' | '));
    }
  } catch (e) {
    console.log('TEST CRASHED: ' + e.message);
    failed++;
  }
  await browser.close();
  console.log(failed ? `${failed} CHECK(S) FAILED` : 'ALL COMMUNITY CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})();
