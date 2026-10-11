// Message requests, mute, restrict and "Liked by" (database v24): the Requests folder and its count
// (left out of the unread badges), a request's chat with Block / Delete / Accept and not marked read,
// accepting into the inbox, deleting (and a new message bringing it back), Delete all, blocking from
// a request; muting someone's posts (gone from Home, back after Unmute in Settings) and stories (off
// the tray), Mute from a post's menu; restricting (the restricted comment only the owner sees, marked,
// checked as the owner and as two other demo accounts), unrestricting; "Liked by" on the feed and in
// the post dialog; Settings → Restricted accounts and Muted accounts with undo. Dark and White
// screenshots of the Requests view, a request's chat, the Mute dialog and a post with Liked by.
// Usage: node tests/social.test.cjs http://127.0.0.1:8831/ [screenshot folder]
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8831/';
const SHOTS = process.argv[3] || '';
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || extra === '' ? '' : ' (' + extra + ')'));
  if (!ok) failed++;
};

/** A window of its own, signed in as `as` (another sample account) when given. */
async function newPage(browser, errors, as) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (r) => {
    const u = r.request().url();
    return u.startsWith(BASE) || u.startsWith('blob:') || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.addInitScript((who) => {
    try {
      // The announcement over the page would cover the screenshots.
      localStorage.setItem('community.dismissedAnnouncements', JSON.stringify(['an1']));
      if (who) sessionStorage.setItem('community.demoAs', who);
    } catch {}
  }, as || '');
  return page;
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await newPage(browser, errors);
  const wait = (ms = 400) => page.waitForTimeout(ms);
  const goto = async (hash, ms = 700) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await wait(ms);
  };
  const shot = async (name) => {
    if (!SHOTS) return;
    await wait(300);
    await page.screenshot({ path: path.join(SHOTS, name + '.png') });
  };
  // A toast saying exactly these words ("Restricted …" must not match "Unrestricted …").
  const toast = (words) => page.locator('.toast', { hasText: new RegExp('^' + words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first().waitFor({ timeout: 3000 }).then(() => true, () => false);
  const rows = (table) => page.evaluate((t) => window.__socialDemo.T(t).map((r) => ({ ...r })), table);
  const card = (id) => page.locator(`.feed-post[data-post="${id}"]`);
  const feedIds = () => page.locator('.feed-post').evaluateAll((els) => els.map((e) => e.getAttribute('data-post')));
  const trayNames = () => page.locator('.tray-item:not(.is-live):not(.is-me) .tray-name').allInnerTexts();
  const moreOptions = () => page.locator('.prof-gear').click();

  try {
    await page.goto(BASE);
    await page.waitForSelector('.feed-post');
    await wait(700);

    /* ---------- Liked by ---------- */
    const p2 = card('p2');
    check('a post someone you follow liked says "Liked by … and others"', (await p2.locator('.sc-likedby-text').innerText()) === 'Liked by grace_mensah and others');
    check('with their small picture', (await p2.locator('.sc-likedby .avatar').count()) === 1);
    check('"others" shows the count on hover', (await p2.locator('.sc-likedby-text b').getAttribute('title')) === '96 likes');
    check('the newest like from someone you follow is the one named', (await card('p3').locator('.sc-likedby-text').innerText()) === 'Liked by ruth_asante and others');
    check('a post without one keeps its count', /^\d+ likes$/.test(await card('p1').locator('.likes').innerText()));
    await p2.scrollIntoViewIfNeeded();
    await shot('social-liked-by-dark');
    await card('p3').getByRole('button', { name: 'Comment', exact: true }).click();
    await page.waitForSelector('.post-dialog .post-dialog-foot');
    await wait(300);
    check('the post dialog says it too', (await page.locator('.post-dialog .sc-likedby-text').innerText()) === 'Liked by ruth_asante and others');
    await page.keyboard.press('Escape');
    await wait(300);

    /* ---------- the unread badges leave requests out ---------- */
    check('the rail badge counts only chats, not requests', (await page.locator('.rail .nav-badge').innerText()) === '1');
    check('so does the floating Messages button', (await page.locator('.dock-pill .nav-badge').innerText()) === '1');
    await page.locator('.dock-pill').click();
    await page.waitForSelector('.dock-row');
    check('the small inbox lists no requests', !(await page.locator('.dock-list').innerText()).match(/Samuel|Esther/));
    check('but leads to them, with how many', (await page.locator('.sc-dock-req').innerText()).trim() === 'Requests (2)');
    await page.locator('.sc-dock-req').click();
    await wait(700);
    check('which opens the Requests column', (await page.evaluate(() => location.hash)) === '#/direct/requests');

    /* ---------- the inbox and the Requests column ---------- */
    await goto('/direct');
    await page.waitForSelector('.thread-row');
    check('the chats leave requests out', !(await page.locator('.threads-list').innerText()).match(/Samuel|Esther/) && (await page.locator('.thread-row').count()) >= 3);
    check('"Requests (2)" sits beside "Messages"', (await page.locator('.sc-req-link').innerText()) === 'Requests (2)' && (await page.locator('.threads-sub').innerText()) === 'Messages');
    await page.locator('.sc-req-link').click();
    await page.waitForSelector('.sc-req-head');
    const reqRows = page.locator('.thread-row');
    check('the Requests column lists both, newest first', (await reqRows.count()) === 2 && (await reqRows.first().innerText()).includes('Samuel') && (await reqRows.nth(1).innerText()).includes('Esther'));
    check('under a "Message requests" heading', (await page.locator('.sc-req-head h2').innerText()) === 'Message requests');
    await shot('social-requests-dark');

    // A request's chat
    await reqRows.first().click();
    await page.waitForSelector('.sc-request');
    await wait(500);
    check('a request opens beside the column', (await page.evaluate(() => location.hash)) === '#/direct/requests/t/t_req_samuel');
    check('Block, Delete and Accept take the message box’s place', (await page.locator('.sc-request-btns button').allInnerTexts()).join() === 'Block,Delete,Accept' && (await page.locator('.chat-pane .composer').count()) === 0);
    check('it asks whether to accept', (await page.locator('.sc-request-q').innerText()) === 'Accept message request from samuel_boateng?');
    check('no calls from a request', (await page.locator('.chat-head').getByRole('button', { name: 'Voice call' }).count()) === 0);
    check('reading it doesn’t mark it read', !(await rows('community_thread_reads')).some((r) => r.thread_id === 't_req_samuel' && r.user_id === 'demo_me'));
    await shot('social-request-chat-dark');

    // Accept moves it into the inbox
    await page.locator('.thread-row', { hasText: 'Esther' }).click();
    await page.waitForSelector('.sc-request');
    await page.locator('.sc-request-btns').getByRole('button', { name: 'Accept' }).click();
    check('accepting says so', await toast('Request accepted'));
    await wait(700);
    check('and moves the chat into the inbox', (await page.evaluate(() => location.hash)) === '#/direct/t/t_req_esther' && (await page.locator('.thread-row', { hasText: 'Esther' }).count()) === 1);
    check('where you can write back', (await page.locator('.chat-pane .composer').count()) === 1 && (await page.locator('.sc-request').count()) === 0);
    check('one request left', (await page.locator('.sc-req-link').innerText()) === 'Requests (1)');
    check('the accepted chat is saved and now marked read', (await rows('community_thread_settings')).some((s) => s.thread_id === 't_req_esther' && s.user_id === 'demo_me' && s.accepted_at) && (await rows('community_thread_reads')).some((r) => r.thread_id === 't_req_esther' && r.user_id === 'demo_me'));

    /* ---------- restrict: the restricted comment ---------- */
    await goto('/p/p11', 900);
    await page.waitForSelector('.post-page .comment >> text=Where was this?');
    const held = page.locator('.post-page .comment.sc-held');
    check("a restricted person's comment shows to you, the owner", (await held.count()) === 1 && (await held.innerText()).includes('Where was this?'));
    check('greyed, with a small "Restricted" label', (await held.locator('.sc-restricted-tag').innerText()) === 'Restricted' && Number(await held.locator('.avatar-btn').evaluate((el) => getComputedStyle(el).opacity)) < 0.6 && (await held.locator('.comment-body').evaluate((el) => getComputedStyle(el).color)) !== (await page.locator('.post-page .comment:not(.sc-held) .comment-body').first().evaluate((el) => getComputedStyle(el).color)));
    check('and Delete', (await held.getByRole('button', { name: 'Delete' }).count()) === 1);
    await shot('social-restricted-comment-dark');

    // As someone else, and as the person restricted (each window starts the demo afresh)
    const grace = await newPage(browser, errors, 'u_grace');
    await grace.goto(BASE + '#/p/p11');
    await grace.waitForSelector('.post-page .post-dialog-foot');
    await grace.waitForTimeout(900);
    check('nobody else receives it', !(await grace.locator('.post-page').innerText()).includes('Where was this?'));
    await grace.context().close();
    const samuel = await newPage(browser, errors, 'u_samuel');
    await samuel.goto(BASE + '#/p/p11');
    await samuel.waitForSelector('.post-page .comment >> text=Where was this?');
    await samuel.waitForTimeout(300);
    check('its writer sees it as usual, unmarked (they aren’t told)', (await samuel.locator('.post-page').innerText()).includes('Where was this?') && (await samuel.locator('.sc-held, .sc-restricted-tag').count()) === 0);
    await samuel.context().close();

    // Unrestrict and restrict again from the profile's … menu
    await goto('/u/samuel_boateng', 900);
    await page.waitForSelector('.prof-gear');
    await moreOptions();
    check('the … menu offers Unrestrict for someone restricted, and Mute', (await page.locator('.choices button').allInnerTexts()).map((x) => x.trim()).filter((x) => ['Unrestrict', 'Mute'].includes(x)).length === 2);
    await page.locator('.choices').getByRole('button', { name: 'Unrestrict' }).click();
    check('Unrestrict works straight away', await toast('Unrestricted samuel_boateng'));
    check('and is saved', !(await rows('community_restricts')).some((r) => r.restricted_id === 'u_samuel'));
    await goto('/direct', 800);
    check('his message is no longer a request (you follow him)', (await page.locator('.thread-row', { hasText: 'Samuel' }).count()) === 1 && (await page.locator('.sc-req-link').innerText()) === 'Requests');
    await goto('/p/p11', 900);
    await page.waitForSelector('.post-page .comment >> text=Where was this?');
    check('his comment is no longer marked', (await page.locator('.post-page .comment.sc-held').count()) === 0);
    await goto('/u/samuel_boateng', 900);
    await moreOptions();
    await page.locator('.choices').getByRole('button', { name: 'Restrict' }).click();
    await page.waitForSelector('.confirm');
    check('Restrict asks first', (await page.locator('.confirm').innerText()).includes('Restrict samuel_boateng?'));
    await page.locator('.confirm').getByRole('button', { name: 'Restrict' }).click();
    check('restricting confirms', await toast('Restricted samuel_boateng'));
    // A new comment of his after that is held back.
    await page.evaluate(() => window.__socialDemo.insertRow('community_comments', { post_id: 'p7', user_id: 'u_samuel', text: 'Lovely light on the water.' }));
    await goto('/p/p7', 900);
    await page.waitForSelector('.post-page .comment >> text=Lovely light');
    check('his new comments are restricted', (await page.locator('.post-page .comment.sc-held', { hasText: 'Lovely light' }).count()) === 1);
    await goto('/direct', 800);
    check('and his message is a request again', (await page.locator('.sc-req-link').innerText()) === 'Requests (1)' && (await page.locator('.thread-row', { hasText: 'Samuel' }).count()) === 0);

    /* ---------- mute posts ---------- */
    await goto('/', 900);
    await page.getByRole('tab', { name: 'Following' }).click();
    await wait(700);
    check("Ruth's posts are on Home to begin with", (await feedIds()).includes('pp_tags'));
    await goto('/u/ruth_asante', 900);
    await moreOptions();
    await page.locator('.choices').getByRole('button', { name: 'Mute' }).click();
    await page.waitForSelector('.sc-mute .sc-mute-row');
    check('Mute opens with a switch for posts and one for stories, both off', (await page.locator('.sc-mute h2').innerText()) === 'Mute ruth_asante' && !(await page.getByRole('switch', { name: 'Posts' }).isChecked()) && !(await page.getByRole('switch', { name: 'Stories' }).isChecked()));
    await page.locator('.sc-mute-row', { hasText: 'Posts' }).click();
    await wait(500);
    check('muting posts is saved', (await rows('community_mutes')).some((m) => m.muted_id === 'u_ruth' && m.posts && !m.stories));
    await shot('social-mute-dark');
    await page.keyboard.press('Escape');
    await wait(400);
    check('her profile still shows her posts', (await page.locator('.prof-grid .tile').count()) >= 2);
    await goto('/', 900);
    await page.getByRole('tab', { name: 'Following' }).click();
    await wait(700);
    const ids = await feedIds();
    check('her posts are gone from Home', ids.length >= 5 && !ids.includes('pp_tags') && !ids.includes('p4'), ids.join());
    check('her stories are not muted', (await trayNames()).includes('ruth_asante'));

    // Mute from a post's … menu
    await card('p3').getByRole('button', { name: 'More options' }).click();
    await page.locator('.pp-menu').getByRole('button', { name: 'Mute', exact: true }).click();
    await page.waitForSelector('.sc-mute .sc-mute-row');
    check("a post's … menu offers Mute for its author", (await page.locator('.sc-mute h2').innerText()) === 'Mute daniel_owusu');
    await page.keyboard.press('Escape');
    await wait(300);

    /* ---------- mute stories ---------- */
    check("Joseph's story is in the tray", (await trayNames()).includes('joseph_k'));
    await goto('/u/joseph_k', 900);
    await page.locator('.prof-actions').getByRole('button', { name: /^Following/ }).click();
    await page.locator('.prof-fmenu').getByRole('button', { name: 'Mute' }).click();
    await page.waitForSelector('.sc-mute .sc-mute-row');
    await page.locator('.sc-mute-row', { hasText: 'Stories' }).click();
    await wait(500);
    check('the Following menu opens Mute too, and stories can be muted', await page.getByRole('switch', { name: 'Stories' }).isChecked());
    await page.keyboard.press('Escape');
    await goto('/', 900);
    check('his story leaves the tray', !(await trayNames()).includes('joseph_k'), (await trayNames()).join());
    check('his posts stay', (await feedIds()).includes('p6') || (await feedIds()).includes('pp_sensitive'));
    await goto('/u/joseph_k', 900);
    await moreOptions();
    await page.locator('.choices').getByRole('button', { name: 'Mute' }).click();
    await page.waitForSelector('.sc-mute .sc-mute-row');
    check('the dialog remembers what is muted', await page.getByRole('switch', { name: 'Stories' }).isChecked());
    await page.locator('.sc-mute-row', { hasText: 'Stories' }).click();
    await wait(500);
    check('both off unmutes', !(await rows('community_mutes')).some((m) => m.muted_id === 'u_joseph'));
    await page.keyboard.press('Escape');
    await goto('/', 900);
    check('and his story comes back', (await trayNames()).includes('joseph_k'));

    /* ---------- Settings: Muted accounts ---------- */
    await goto('/accounts/muted', 900);
    await page.waitForSelector('.st-muted .st-person');
    const muted = await page.locator('.st-muted .st-person').allInnerTexts();
    check('Muted accounts lists who and what', muted.length === 2 && muted[0].includes('ruth_asante') && muted[0].includes('Posts') && muted[1].includes('esther_adjei'), muted.join(' | '));
    check('it sits under What you see', (await page.locator('.st-nav-item.on').innerText()).includes('Muted accounts'));
    await page.locator('.st-muted .st-person', { hasText: 'ruth_asante' }).getByRole('button', { name: 'Unmute' }).click();
    check('Unmute confirms', await toast('Unmuted ruth_asante'));
    await wait(400);
    check('and takes her off the list', (await page.locator('.st-muted .st-person').count()) === 1 && !(await rows('community_mutes')).some((m) => m.muted_id === 'u_ruth'));
    await goto('/', 900);
    await page.getByRole('tab', { name: 'Following' }).click();
    await wait(700);
    check('her posts are back on Home', (await feedIds()).includes('pp_tags'));

    /* ---------- deleting a request, a new message, Delete all, Block ---------- */
    await goto('/direct/requests', 800);
    await page.locator('.thread-row', { hasText: 'Samuel' }).click();
    await page.waitForSelector('.sc-request');
    await page.locator('.sc-request-btns').getByRole('button', { name: 'Delete' }).click();
    await page.waitForSelector('.confirm');
    check('Delete asks first', (await page.locator('.confirm').innerText()).includes('Delete this request?'));
    await page.locator('.confirm').getByRole('button', { name: 'Delete' }).click();
    check('deleting says so', await toast('Request deleted'));
    await wait(600);
    check('and empties the column', (await page.evaluate(() => location.hash)) === '#/direct/requests' && (await page.locator('.sc-req-none').innerText()) === 'No message requests' && (await page.locator('.thread-row').count()) === 0);
    await page.evaluate(() => window.__socialDemo.insertRow('community_messages', { thread_id: 't_req_samuel', sender_id: 'u_samuel', text: 'Sorry to ask again, the media desk needs one more person.', media_url: '', audio_url: '', audio_seconds: 0, post_id: null, call_url: '', call_kind: '', view_once: false, opened_at: null, system: '' }));
    await page.waitForSelector('.thread-row', { timeout: 4000 }).catch(() => {});
    check('a new message from him brings it back as a request', (await page.locator('.thread-row').count()) === 1 && (await page.locator('.thread-row').innerText()).includes('Sorry to ask again') && !(await page.locator('.thread-row').innerText()).includes('media desk this Sabbath'));
    await page.getByRole('button', { name: 'Delete all' }).click();
    await page.locator('.confirm').getByRole('button', { name: 'Delete all' }).click();
    check('Delete all clears the column', await toast('Requests deleted'));
    await wait(500);
    check('none left', (await page.locator('.thread-row').count()) === 0);
    await page.evaluate(() => window.__socialDemo.insertRow('community_messages', { thread_id: 't_req_samuel', sender_id: 'u_samuel', text: 'Are you there?', media_url: '', audio_url: '', audio_seconds: 0, post_id: null, call_url: '', call_kind: '', view_once: false, opened_at: null, system: '' }));
    await page.waitForSelector('.thread-row', { timeout: 4000 });
    await page.locator('.thread-row').first().click();
    await page.waitForSelector('.sc-request');
    await page.locator('.sc-request-btns').getByRole('button', { name: 'Block' }).click();
    await page.waitForSelector('.confirm');
    await page.locator('.confirm').getByRole('button', { name: 'Block' }).click();
    check('Block from a request blocks them', await toast('Blocked samuel_boateng'));
    await wait(600);
    check('the block is saved and the request is gone', (await rows('community_blocks')).some((b) => b.blocker_id === 'demo_me' && b.blocked_id === 'u_samuel') && (await page.locator('.thread-row').count()) === 0 && (await page.evaluate(() => location.hash)) === '#/direct/requests');

    /* ---------- Settings: Restricted accounts ---------- */
    await goto('/accounts/restricted', 900);
    await page.waitForSelector('.st-restricted .st-person');
    check('Restricted accounts lists them', (await page.locator('.st-restricted').innerText()).includes('samuel_boateng'));
    check('it sits under How others can interact with you', (await page.locator('.st-nav-item.on').innerText()).includes('Restricted accounts'));
    await page.locator('.st-restricted').getByRole('button', { name: 'Unrestrict' }).click();
    check('Unrestrict confirms', await toast('Unrestricted samuel_boateng'));
    await wait(400);
    check('and empties the list', (await page.locator('.st-empty-line').innerText()) === "You haven't restricted anyone" && !(await rows('community_restricts')).length);
    await page.getByLabel('Search settings').fill('restrict');
    check('search finds Restricted accounts', (await page.locator('.st-nav-item').allInnerTexts()).some((x) => x.trim() === 'Restricted accounts'));
    await page.getByLabel('Search settings').fill('mute');
    check('and Muted accounts', (await page.locator('.st-nav-item').allInnerTexts()).some((x) => x.trim() === 'Muted accounts'));
    await page.getByLabel('Clear search').click();

    /* ---------- White ---------- */
    const white = await newPage(browser, errors);
    await white.addInitScript(() => localStorage.setItem('community.appearance', 'white'));
    await white.goto(BASE + '#/direct/requests');
    await white.waitForSelector('.sc-req-head');
    await white.waitForSelector('.thread-row');
    check('White turns the Requests column white', (await white.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(255, 255, 255)');
    if (SHOTS) {
      await white.waitForTimeout(300);
      await white.screenshot({ path: path.join(SHOTS, 'social-requests-white.png') });
    }
    await white.locator('.thread-row').first().click();
    await white.waitForSelector('.sc-request');
    check('the request bar reads dark on white', (await white.locator('.sc-accept').evaluate((el) => getComputedStyle(el).color)) === 'rgb(15, 20, 25)');
    if (SHOTS) {
      await white.waitForTimeout(500);
      await white.screenshot({ path: path.join(SHOTS, 'social-request-chat-white.png') });
    }
    await white.evaluate(() => (location.hash = '#/'));
    await white.waitForSelector('.feed-post[data-post="p2"] .sc-likedby');
    await white.locator('.feed-post[data-post="p2"]').scrollIntoViewIfNeeded();
    check('Liked by reads dark on white', (await white.locator('.feed-post[data-post="p2"] .sc-likedby-name').evaluate((el) => getComputedStyle(el).color)) === 'rgb(15, 20, 25)');
    if (SHOTS) {
      await white.waitForTimeout(300);
      await white.screenshot({ path: path.join(SHOTS, 'social-liked-by-white.png') });
    }
    await white.locator('.feed-post[data-post="p2"]').getByRole('button', { name: 'More options' }).click();
    await white.locator('.pp-menu').getByRole('button', { name: 'Mute', exact: true }).click();
    await white.waitForSelector('.sc-mute .sc-mute-row');
    if (SHOTS) {
      await white.waitForTimeout(300);
      await white.screenshot({ path: path.join(SHOTS, 'social-mute-white.png') });
    }
    await white.context().close();

    check('no script errors', errors.length === 0, errors.join(' | '));
  } catch (e) {
    console.log('TEST CRASHED: ' + e.message.split('\n').slice(0, 4).join(' '));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'social-crash.png') }).catch(() => {});
    failed++;
  }
  await browser.close();
  console.log(failed ? `${failed} SOCIAL CHECK(S) FAILED` : 'ALL SOCIAL CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})();
