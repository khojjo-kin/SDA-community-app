// The admin console's sections from the iPhone console: Sabbath School publishers, feedback, live
// support chats beside the help requests, tick and Plus requests with the ID photo and selfie,
// churches, offensive words, ads and fundraisers, reports, transactions, the waiting counts in the
// navigation and on the dashboard, and a member's record without the admin database update.
// Usage: node tests/admin.test.cjs http://127.0.0.1:8807/ [screenshot dir]
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:8807/';
const SHOTS = process.argv[3] || '';
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
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
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
  const shot = async (name) => SHOTS && page.screenshot({ path: path.join(SHOTS, name + '.png') });
  const theme = (t) => page.evaluate((v) => (document.documentElement.dataset.theme = v), t);
  const toastSays = (text) => page.locator('.toast').filter({ hasText: text }).first().waitFor({ timeout: 4000 }).then(() => true, () => false);
  const confirm = async (action) => {
    await page.locator('.confirm').waitFor();
    await page.locator('.confirm').getByRole('button', { name: action, exact: true }).click();
  };
  // The number beside a section in the console's navigation (0 when there is none).
  const navBadge = async (label) => {
    const b = page.locator('.adm-nav-link', { hasText: label }).locator('.adm-nav-badge');
    return (await b.count()) ? Number(await b.innerText()) : 0;
  };
  const waitBadge = (label, n) =>
    page
      .waitForFunction(
        ([l, v]) => {
          const link = [...document.querySelectorAll('.adm-nav-link')].find((a) => a.textContent.includes(l));
          const b = link?.querySelector('.adm-nav-badge');
          return (b ? Number(b.textContent) : 0) === v;
        },
        [label, n],
        { timeout: 4000 },
      )
      .then(() => true, () => false);

  try {
    await page.goto(BASE);
    await page.waitForSelector('.feed-post');

    /* ---------- the console's navigation and the dashboard ---------- */
    await goto('/admin/dashboard');
    await page.waitForSelector('.admin-nav');
    const navText = await page.locator('.admin-nav').innerText();
    check('the navigation has the iPhone console sections', ['Publishers', 'Feedback and reviews', 'Offensive words', 'Ads and fundraisers', 'Support', 'Tick and Plus requests', 'Churches'].every((x) => navText.includes(x)));
    check('and the app pages admins look after', ['Hymnal', 'Pod', 'Communities and pages'].every((x) => navText.includes(x)));
    await page.waitForSelector('.adm-nav-badge');
    check('waiting publishers are counted in the navigation', (await navBadge('Publishers')) === 3, await navBadge('Publishers'));
    check('so are identity checks and Plus requests', (await navBadge('Tick and Plus requests')) === 3, await navBadge('Tick and Plus requests'));
    await page.waitForSelector('.alert-chip');
    const chips = (await page.locator('.alert-chip').allInnerTexts()).join(' | ');
    check("the dashboard's needs-attention list has publisher requests", /3\s+publisher requests/.test(chips), chips);
    check('and open support chats, identity checks and Plus requests', /open support chats/.test(chips) && /identity checks/.test(chips) && /Plus request/.test(chips), chips);
    await page.locator('.alert-chip', { hasText: 'publisher requests' }).click();
    await wait();
    check('a needs-attention chip opens its section', (await hash()) === '#/admin/publishers');

    /* ---------- Sabbath School publishers ---------- */
    await page.waitForSelector('.adm-pub');
    const pendingCards = () => page.locator('.adm-pub').filter({ has: page.getByRole('button', { name: 'Approve', exact: true }) });
    const approvedCards = () => page.locator('.adm-pub').filter({ has: page.getByRole('button', { name: 'Revoke', exact: true }) });
    const pending0 = await pendingCards().count();
    check('publisher requests are listed with their notes', pending0 === 3 && (await page.locator('.adm-pub').first().innerText()).length > 10, pending0);
    check('a request without a note says so', (await page.locator('.adm-pub', { hasText: 'No note' }).count()) === 1);
    check('approved publishers are listed apart', (await approvedCards().count()) === 1 && (await approvedCards().first().innerText()).includes('Grace Mensah'));
    await shot('admin-publishers-dark');
    const first = await pendingCards().first().locator('.adm-who-text b').innerText();
    await pendingCards().first().getByRole('button', { name: 'Approve', exact: true }).click();
    check('approving a publisher says they can publish', await toastSays('can now publish'));
    check('and moves them to the publishers', (await pendingCards().count()) === pending0 - 1 && (await approvedCards().filter({ hasText: first }).count()) === 1);
    check('the pending count in the navigation goes down', await waitBadge('Publishers', pending0 - 1), await navBadge('Publishers'));
    const second = await pendingCards().first().locator('.adm-who-text b').innerText();
    await pendingCards().first().getByRole('button', { name: 'Decline', exact: true }).click();
    await confirm('Decline');
    check('declining a request asks first, then declines', await toastSays('Request declined'));
    check('the declined request leaves the list', (await page.locator('.adm-pub', { hasText: second }).count()) === 0 && (await pendingCards().count()) === pending0 - 2);
    check('and the count goes down again', await waitBadge('Publishers', pending0 - 2));
    await approvedCards().filter({ hasText: first }).getByRole('button', { name: 'Revoke' }).click();
    await confirm('Revoke');
    check('revoking a publisher says they can no longer publish', await toastSays('can no longer publish'));
    check('and takes them off the list', (await page.locator('.adm-pub', { hasText: first }).count()) === 0);
    await goto('/admin/dashboard');
    await page.waitForSelector('.alert-chip');
    await page.waitForTimeout(600);
    const chips2 = (await page.locator('.alert-chip').allInnerTexts()).join(' | ');
    check("the dashboard's count follows the decisions", /1\s+publisher request\b/.test(chips2), chips2);

    /* ---------- feedback ---------- */
    await goto('/admin/feedback');
    await page.waitForSelector('.adm-fb');
    check('feedback lists ratings, ideas and problems', (await page.locator('.adm-fb').count()) === 6 && (await page.locator('.adm-fb.idea').count()) === 1 && (await page.locator('.adm-fb.problem').count()) === 2);
    check('the average rating is shown', (await page.locator('.adm-average').innerText()).includes('4.0') && (await page.locator('.adm-average').innerText()).includes('3 ratings'));
    check('a review shows its stars', (await page.locator('.adm-fb', { hasText: 'Grace Mensah' }).locator('.adm-kind-pill').innerText()).includes('★5'));
    check('a review without words says so', (await page.locator('.adm-fb', { hasText: 'No words, just the stars.' }).count()) === 1);
    check('where it was sent from is shown', (await page.locator('.adm-fb', { hasText: 'Grace Mensah' }).innerText()).includes('Mac app'));
    await page.getByRole('tab', { name: /Problems/ }).click();
    check('the Problems filter shows only problems', (await page.locator('.adm-fb').count()) === 2 && (await page.locator('.adm-fb.problem').count()) === 2 && (await page.locator('.adm-average').count()) === 0);
    check('a former member cannot be opened', await page.locator('.adm-fb', { hasText: 'A former member' }).locator('.adm-who').isDisabled());
    await page.getByRole('tab', { name: /All/ }).click();
    await page.getByLabel('Search feedback').fill('hymnal');
    check('feedback can be searched', (await page.locator('.adm-fb').count()) === 1);
    await page.locator('.adm-fb .adm-who').first().click();
    await wait();
    check('clicking the member opens them in People', (await hash()) === '#/admin/people/u_grace');

    /* ---------- live support chats ---------- */
    await goto('/admin/support');
    await page.waitForSelector('.adm-chat-row');
    const supportBadge = await navBadge('Support');
    check('the queue lists the open chats', (await page.locator('.adm-chat-row').count()) === 3, await page.locator('.adm-chat-row').count());
    check('each chat says who is looking after it', (await page.locator('.adm-chat-row', { hasText: 'Ruth Asante' }).innerText()).includes('With assistant') && (await page.locator('.adm-chat-row', { hasText: 'Daniel Owusu' }).innerText()).includes('Answered by Grace Mensah'));
    check('a chat the team is answering says so', (await page.locator('.adm-chat-row', { hasText: 'Daniel Owusu' }).innerText()).includes('Team answering'));
    check('until one is chosen, the pane invites a choice', (await page.locator('.adm-chat-none').innerText()).includes('Choose a chat'));
    await page.locator('.adm-chat-row', { hasText: 'Ruth Asante' }).click();
    await page.waitForSelector('.adm-chat-head');
    check('opening a chat gives it its own address', (await hash()) === '#/admin/support/adm_chat1');
    check("the conversation shows the member's and the assistant's messages", (await page.locator('.adm-msg.member').count()) === 2 && (await page.locator('.adm-msg.ai').count()) === 2);
    check('the member is on the left and the assistant on the right', (await page.locator('.adm-msg.member').first().evaluate((el) => getComputedStyle(el).alignSelf)) === 'flex-start' && (await page.locator('.adm-msg.ai').first().evaluate((el) => getComputedStyle(el).alignSelf)) === 'flex-end');
    check('the header says the assistant is answering', (await page.locator('.adm-chat-head').innerText()).includes('The assistant is answering'));
    const reply = "Hi Ruth, I'm adding your church now. It will be in the list within the hour.";
    await page.getByLabel(/^Reply as/).fill(reply);
    check('typing tells the member someone is typing', await page.evaluate(() => (window.__broadcastsSent || []).some((b) => b.channel === 'support:adm_chat1' && b.event === 'typing')));
    await page.getByLabel(/^Reply as/).press('Enter');
    await page.waitForSelector('.adm-msg.agent:not(.sending)');
    check('the reply is sent under your name', (await page.locator('.adm-msg.agent').innerText()).includes(reply) && (await page.locator('.adm-msg.agent .adm-msg-who').innerText()).includes('You'));
    check('the header says you are answering now', (await page.locator('.adm-chat-head').innerText()).includes('You are answering'));
    check('the box is empty for the next message', (await page.getByLabel(/^Reply as/).inputValue()) === '');
    await page.waitForTimeout(600);
    check('the chat now shows as answered by you in the queue', (await page.locator('.adm-chat-row', { hasText: 'Ruth Asante' }).innerText()).includes('Answered by'));
    await shot('admin-support-dark');
    await theme('white');
    await shot('admin-support-white');
    await theme('dark');
    await page.getByRole('button', { name: 'Close chat' }).click();
    await confirm('Close chat');
    check('closing a chat asks first, then closes it', await toastSays('Chat closed'));
    check('the chat shows as closed', (await page.locator('.adm-chat-head .pill').innerText()) === 'Closed');
    await page.waitForFunction(() => ![...document.querySelectorAll('.adm-chat-row')].some((r) => r.textContent.includes('Ruth Asante')), null, { timeout: 4000 }).catch(() => {});
    check('and leaves the open queue', (await page.locator('.adm-chat-row', { hasText: 'Ruth Asante' }).count()) === 0);
    check("the Support count goes down", await waitBadge('Support', supportBadge - 1), `${await navBadge('Support')} from ${supportBadge}`);
    await page.locator('.adm-chat-list').getByRole('button', { name: 'All', exact: true }).click();
    await page.waitForSelector('.adm-chat-row.closed');
    check('All shows closed chats too', (await page.locator('.adm-chat-row.closed').count()) === 2 && (await page.locator('.adm-chat-row', { hasText: 'Ruth Asante' }).innerText()).includes('Closed'));
    await page.locator('.adm-chat-head .adm-chat-member').click();
    await wait();
    check("the member's name opens them in People", (await hash()) === '#/admin/people/u_ruth');
    await goto('/admin/support');
    await page.getByRole('tab', { name: /Help requests/ }).click();
    await page.waitForSelector('.ticket');
    check('help requests sit beside the chats', (await hash()) === '#/admin/support/requests' && (await page.locator('.ticket').count()) >= 1);
    const over = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
    check('no sideways scrolling in Support', over <= 0, over);

    /* ---------- tick and Plus requests ---------- */
    await goto('/admin/requests');
    await page.waitForSelector('.adm-req');
    const samuel = page.locator('.adm-req', { hasText: 'samuel_boateng' });
    await samuel.locator('.adm-photo-box img').nth(1).waitFor({ timeout: 5000 });
    await page.waitForFunction(() => [...document.querySelectorAll('.adm-req .adm-photo-box img')].every((i) => i.complete && i.naturalWidth > 0));
    check('an identity check shows the ID photo and the selfie', (await samuel.locator('.adm-photo-box img').count()) === 2 && (await samuel.locator('figcaption').allInnerTexts()).join() === 'Document,Selfie');
    check('with the name on the document and its kind', (await samuel.innerText()).includes('Samuel Kofi Boateng') && (await samuel.innerText()).includes('Passport'));
    check('and the notability answers with their links', (await samuel.locator('.adm-answers').innerText()).includes('Hillside Media') && (await samuel.locator('.adm-answers a.adm-link').getAttribute('href')) === 'https://hillsidemedia.example.org');
    const esther = page.locator('.adm-req', { hasText: 'esther_adjei' });
    check('a request sent before photos were needed says so', (await esther.innerText()).includes('Sent before photos were needed') && (await esther.locator('.adm-photo-box', { hasText: 'No photo' }).count()) === 2);
    check('and cannot be approved', await esther.getByRole('button', { name: 'Approve: give the tick' }).isDisabled());
    await samuel.locator('.adm-photo-box.ready').first().click();
    await page.waitForSelector('.adm-viewer img');
    check('a photo opens full size', (await page.locator('.adm-viewer p').innerText()) === 'Document' && (await page.locator('.adm-viewer img').evaluate((i) => i.naturalWidth > 0)));
    await shot('admin-requests-photo');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('and closes again', (await page.locator('.adm-viewer').count()) === 0);
    await shot('admin-requests-dark');
    await samuel.getByRole('button', { name: 'Approve: give the tick' }).click();
    check('approving gives the tick', await toastSays('Verified'));
    check('and the request leaves the list', (await page.locator('.adm-req', { hasText: 'samuel_boateng' }).count()) === 0);
    await page.getByRole('tab', { name: /Plus/ }).click();
    await page.waitForSelector('.adm-req.plus');
    check('the Plus tab has its own address and requests', (await hash()) === '#/admin/requests/plus' && (await page.locator('.adm-req.plus').innerText()).includes('Receipt HS-2041'));
    await page.getByRole('button', { name: 'Approve: Plus for a month' }).click();
    check('approving Plus activates it for a month', await toastSays('Plus activated for a month'));
    check('then nothing is left waiting', (await page.locator('.empty', { hasText: 'No Plus requests waiting' }).count()) === 1);
    check('the requests count follows', await waitBadge('Tick and Plus requests', 1), await navBadge('Tick and Plus requests'));

    /* ---------- churches ---------- */
    await goto('/admin/churches');
    await page.waitForSelector('.adm-church');
    const lakeside = page.locator('.adm-church', { hasText: 'Lakeside SDA Company' });
    check('a church waiting shows who suggested it', (await lakeside.locator('.adm-suggested').innerText()).includes('Esther Adjei'));
    await lakeside.getByRole('button', { name: 'Edit' }).click();
    await page.locator('.modal .form-row', { hasText: 'Service times' }).locator('textarea').fill('Sabbath School 9:30 · Divine Service 11:00');
    await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
    check('a church can be edited', await toastSays('Church updated'));
    check('and shows its new details', (await lakeside.innerText()).includes('Sabbath School 9:30'));
    await lakeside.getByRole('button', { name: 'Approve' }).click();
    check('a pending church can be approved', await toastSays('is now listed'));
    await page.waitForSelector('.empty:has-text("No churches waiting")');
    check('and leaves the waiting list', (await page.locator('.adm-church').count()) === 0);
    check('the churches count follows', await waitBadge('Churches', 0));
    await page.getByRole('tab', { name: /Listed/ }).click();
    await page.waitForSelector('.adm-church');
    check('it is now listed', (await page.locator('.adm-church', { hasText: 'Lakeside SDA Company' }).count()) === 1);
    await page.locator('.adm-church', { hasText: 'Riverside Adventist Fellowship' }).getByRole('button', { name: 'Delete' }).click();
    await confirm('Delete');
    check('a church can be deleted', await toastSays('Church deleted'));
    check('and is gone', (await page.locator('.adm-church', { hasText: 'Riverside Adventist Fellowship' }).count()) === 0);

    /* ---------- offensive words ---------- */
    await goto('/admin/words');
    await page.waitForSelector('.adm-words li');
    const words0 = await page.locator('.adm-words li').count();
    await page.getByLabel('Word to add').fill('Gamble');
    await page.getByLabel('Word to add').press('Enter');
    check('a word can be added', await toastSays('Added "gamble"'));
    check('and is listed in lowercase', (await page.locator('.adm-words li').count()) === words0 + 1 && (await page.locator('.adm-words li', { hasText: 'gamble' }).count()) === 1);
    await page.getByLabel('Word to add').fill('two words');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.waitForSelector('.adm-word-error');
    check('a phrase is refused with the reason', (await page.locator('.adm-word-error').innerText()).includes('no spaces'));
    await page.getByLabel('Remove casino').click();
    await page.waitForSelector('.adm-undo');
    check('removing a word offers Undo', (await page.locator('.adm-words li', { hasText: 'casino' }).count()) === 0);
    await page.locator('.adm-undo').getByRole('button', { name: 'Undo' }).click();
    check('Undo puts it back', await toastSays('back on the list'));
    await page.getByLabel('Search the list').fill('gam');
    check('the list can be searched', (await page.locator('.adm-words li').count()) === 1);

    /* ---------- ads and fundraisers ---------- */
    await goto('/admin/ads');
    await page.waitForSelector('.adm-ads-table tbody tr');
    const running = page.locator('.adm-ads-table tbody tr', { hasText: 'Running' });
    check('ads are listed, running ones first', (await page.locator('.adm-ads-table tbody tr').first().innerText()).includes('Running'));
    await running.first().getByRole('button', { name: 'End now' }).click();
    await confirm('End now');
    check('an ad can be ended early', await toastSays('Ad ended'));
    check('and then says so', (await page.locator('.adm-ads-table tbody tr', { hasText: 'Pathfinders fun day' }).innerText()).includes('Ended early'));
    await page.getByRole('tab', { name: 'Fundraisers' }).click();
    await page.waitForSelector('.adm-fund');
    check('fundraisers are listed with what they have raised', (await page.locator('.adm-fund', { hasText: 'New choir robes' }).innerText()).includes('of £1,500.00') || (await page.locator('.adm-fund', { hasText: 'New choir robes' }).innerText()).includes('of £1500.00'));

    /* ---------- reports ---------- */
    await goto('/admin/reports');
    await page.waitForSelector('.report');
    check('a report offers removing the post and suspending the account', (await page.locator('.report').getByRole('button', { name: 'Remove post' }).count()) === 1 && (await page.locator('.report').getByRole('button', { name: 'Suspend account' }).count()) === 1);
    await page.locator('.report').getByRole('button', { name: 'Remove post' }).click();
    await confirm('Remove');
    check('removing the reported post settles the report', await toastSays('Post removed'));

    /* ---------- transactions ---------- */
    await goto('/admin/money');
    await page.getByRole('button', { name: 'Transactions' }).click();
    await page.waitForSelector('.table tbody tr');
    check('the totals come from the server', (await page.locator('.adm-totals').innerText()).includes('Income all time'));
    await page.getByRole('button', { name: 'Record a payment' }).click();
    await page.locator('.modal').getByLabel('Search members').fill('ruth');
    await page.locator('.modal .adm-pick').first().click();
    await page.locator('.modal').getByRole('radio', { name: 'Refund' }).click();
    await page.locator('.modal .form-row', { hasText: 'Amount' }).locator('input').fill('2,50');
    await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
    check('a payment can be logged for a member', await toastSays('Logged'));
    await page.waitForFunction(() => [...document.querySelectorAll('.table tbody tr')].some((r) => r.textContent.includes('ruth_asante') && r.textContent.includes('−£2.50')));
    check('a refund is money out', (await page.locator('.table tbody tr', { hasText: '−£2.50' }).locator('td.adm-out').count()) === 1);

    /* ---------- live activity ---------- */
    await goto('/admin/activity');
    await page.waitForSelector('.adm-day-title');
    check('live activity is shown a day at a time', (await page.locator('.adm-day-title').count()) >= 2);
    const activityText = await page.locator('.settings-body').innerText();
    check('short videos are called Shorts there', activityText.includes('Shorts') && !/\breels?\b/i.test(activityText));

    /* ---------- without the admin database update ---------- */
    await page.evaluate(() => (window.__adminWithoutUpdate = true));
    await goto('/admin/people/u_daniel');
    await page.waitForSelector('.adm-member');
    check("a member's record still opens without the update", (await page.locator('.adm-member-head').innerText()).includes('Daniel Owusu'));
    await page.locator('.adm-toggle', { hasText: 'Verified tick' }).click();
    check('the tick can be given', await toastSays('Verified'));
    await page.getByRole('button', { name: 'Give a month' }).click();
    check('Plus can be given', await toastSays('Plus until'));
    await page.waitForSelector('.adm-member-head .pill.plus');
    await page.locator('.adm-toggle', { hasText: 'Suspended' }).click();
    await confirm('Suspend');
    check('an account can be suspended', await toastSays('Account suspended'));
    await page.locator('.adm-note-field textarea').fill('Asked for help with the youth group');
    await page.getByRole('button', { name: 'Save note' }).click();
    check('an admin note can be saved', await toastSays('Note saved'));
    check('owners can make a member an admin', (await page.locator('.adm-toggle', { hasText: 'Admin' }).count()) === 1);
    await page.evaluate(() => (window.__adminWithoutUpdate = false));

    /* ---------- White ---------- */
    await theme('white');
    await goto('/admin/publishers');
    await page.waitForSelector('.adm-pub');
    await shot('admin-publishers-white');
    await goto('/admin/feedback');
    await page.waitForSelector('.adm-fb');
    const pillColor = await page.locator('.adm-kind-pill.problem').first().evaluate((el) => getComputedStyle(el).color);
    check('feedback labels follow the White appearance', pillColor === 'rgb(237, 41, 57)', pillColor);
    await theme('dark');
  } catch (e) {
    console.log('TEST CRASHED: ' + e.message.split('\n').slice(0, 6).join('\n'));
    failed++;
  }
  check('no script errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failed ? `${failed} CHECK(S) FAILED` : 'ALL ADMIN CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})();
