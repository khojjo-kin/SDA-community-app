// Posts: the feed card (Instagram's 2026 layout), polls, prompts, the AI label, tagged people, posts
// for subscribers, sensitive posts, Sponsored posts, the "…" menu (hide like count, commenting,
// edit, promote with the demo payment, report with the copyright reason), the grid tiles, and
// the composer (a post with a tag, a poll, a prompt and the AI label; a Short from a video).
// Usage: node tests/posts.test.cjs http://127.0.0.1:8802/ [screenshot dir]
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:8802/';
const SHOTS = process.argv[3] || '';
const MEDIA = path.join(__dirname, '../src/fake/media');
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || extra === '' ? '' : ' (' + extra + ')'));
  if (!ok) failed++;
};

/**
 * The sample Shorts are H.264, which the Chromium that comes with Playwright can't open (Chrome, Safari
 * and the Mac app can). For the Short upload the test turns one into a WebM with ffmpeg, when it is there.
 */
function sampleVideo() {
  const out = path.join(os.tmpdir(), 'community-posts-test-short.webm');
  try {
    if (!fs.existsSync(out)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(MEDIA, 'reel1.mp4'), '-t', '3', '-c:v', 'libvpx-vp9', '-b:v', '300k', '-an', out]);
    return out;
  } catch {
    return '';
  }
}

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
  const wait = (ms = 400) => page.waitForTimeout(ms);
  const goto = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await wait(700);
  };
  const card = (id) => page.locator(`.feed-post[data-post="${id}"]`);
  const shot = async (name) => {
    if (!SHOTS) return;
    await wait(250); // let dialogs finish fading in
    await page.screenshot({ path: path.join(SHOTS, name + '.png') });
  };
  const theme = (t) => page.evaluate((x) => (document.documentElement.dataset.theme = x), t);
  const menuItems = async () => (await page.locator('.pp-menu > button').allInnerTexts()).map((t) => t.trim());

  try {
    await page.goto(BASE);
    await page.waitForSelector('.feed-post');
    await wait(600);

    /* ---------- the card ---------- */
    const first = page.locator('.feed-post').first();
    check('actions run heart, comment, repost, share, then save', (await first.locator('.pp-actions button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).join() === 'Unlike,Comment,Repost,Share,Save');
    check('the comment count sits beside the comment button', (await first.locator('.pp-actions [aria-label="Comment"] .pp-count').innerText()) === '2');
    check('the header shows the time as "2 h"', /^\d+ h$/.test(await first.locator('.pp-time').innerText()));
    check('the author has a story ring', (await first.locator('.pp-head .ring').count()) === 1);
    check('likes line under the actions', /^\d+ likes$/.test(await first.locator('.likes').innerText()));
    check('a post in a community says where', (await card('pp_prompt').locator('.pp-sub').innerText()).includes('in Youth Ministry'));
    await first.locator('.pp-head .ring').click();
    await page.waitForSelector('.story-stage');
    check("the story ring opens the author's story", (await page.locator('.story-stage').count()) === 1);
    await page.keyboard.press('Escape');
    await wait();
    await shot('posts-01-feed-dark');

    /* ---------- poll ---------- */
    const poll = card('pp_poll');
    await poll.scrollIntoViewIfNeeded();
    check('a poll shows its question and options without results before voting', (await poll.locator('.pp-poll-q').innerText()).includes("Pick this week's closing hymn") && (await poll.locator('.pp-poll-opt').count()) === 3 && (await poll.locator('.pp-poll-pct').count()) === 0);
    await poll.getByRole('radio', { name: /Blessed Assurance/ }).click();
    await wait(500);
    const pcts = await poll.locator('.pp-poll-pct').allInnerTexts();
    check('voting shows percentages for every option', pcts.join() === '41%,28%,31%', pcts.join());
    check('my choice is marked', (await poll.getByRole('radio', { name: /Blessed Assurance/ }).getAttribute('aria-checked')) === 'true' && (await poll.locator('.pp-poll-opt.on .pp-poll-check').count()) === 1);
    check('the total is shown', (await poll.locator('.pp-poll-foot').innerText()).startsWith('29 votes'));
    await shot('posts-02-poll-dark');
    await poll.getByRole('radio', { name: /Blessed Assurance/ }).click();
    await wait(500);
    check('clicking my choice again takes the vote back', (await poll.locator('.pp-poll-pct').count()) === 0 && (await poll.locator('.pp-poll-opt.on').count()) === 0);
    await poll.getByRole('radio', { name: /It Is Well/ }).click();
    await wait(500);
    check('voting again counts the new choice', (await poll.locator('.pp-poll-pct').allInnerTexts()).join() === '41%,24%,34%');

    /* ---------- prompt ---------- */
    const prompt = card('pp_prompt');
    await prompt.scrollIntoViewIfNeeded();
    const banner = await prompt.locator('.pp-prompt').innerText();
    check('a prompt shows as a highlighted banner', banner.includes('PROMPT') || banner.includes('Prompt'));
    check('the banner carries the question', banner.includes('Which Bible verse got you through this week?'));
    await prompt.getByRole('button', { name: 'Answer' }).click();
    check('Answer puts the cursor in the comment box', (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Add a comment' && (await prompt.getByLabel('Add a comment').getAttribute('placeholder')) === 'Write your answer…');
    await prompt.getByLabel('Add a comment').fill('Philippians 4:13');
    await prompt.getByRole('button', { name: 'Post', exact: true }).click();
    await wait(500);
    check('the answer is posted as a comment', (await prompt.getByText('Philippians 4:13').count()) === 1);

    /* ---------- AI info, hidden likes, commenting off ---------- */
    const ai = card('pp_ai');
    await ai.scrollIntoViewIfNeeded();
    await ai.getByRole('button', { name: 'AI info' }).click();
    await page.waitForSelector('.pp-ai-pop');
    check('AI info explains the label', (await page.locator('.pp-ai-pop').innerText()).includes('Made or changed with AI'));
    await shot('posts-03-ai-info-dark');
    await page.keyboard.press('Escape');
    await wait(200);
    check('AI info closes', (await page.locator('.pp-ai-pop').count()) === 0);
    check('a hidden like count is not shown to others', (await ai.locator('.likes').innerText()) === 'Liked by others');
    check('commenting off: no comment box and no comment button', (await ai.locator('.pp-comments-off').innerText()) === 'Commenting is turned off' && (await ai.getByLabel('Add a comment').count()) === 0 && (await ai.locator('[aria-label="Comment"]').count()) === 0);

    /* ---------- tagged people ---------- */
    const tags = card('pp_tags');
    await tags.scrollIntoViewIfNeeded();
    await tags.getByRole('button', { name: 'See who is tagged' }).click();
    await page.waitForSelector('.pp-tagged .pp-row-btn');
    const tagged = await page.locator('.pp-tagged .pp-row-btn').allInnerTexts();
    check('the tag button lists the people tagged', tagged.length === 3 && ['you', 'grace_mensah', 'esther_adjei'].every((u) => tagged.some((t) => t.includes(u))), tagged.join(' / '));
    await shot('posts-04-tagged-dark');
    await page.locator('.pp-tagged .pp-row-btn', { hasText: 'esther_adjei' }).click();
    await wait(700);
    check('a tagged person opens their profile', (await page.evaluate(() => location.hash)) === '#/u/esther_adjei');
    await goto('/');
    await page.waitForSelector('.feed-post');

    /* ---------- for subscribers ---------- */
    const subs = card('pp_subs');
    await subs.scrollIntoViewIfNeeded();
    await subs.locator('.pp-locked').waitFor();
    check('a post for subscribers is locked for someone who does not subscribe', (await subs.locator('.pp-locked').innerText()).includes('For subscribers') && (await subs.locator('.carousel').count()) === 0);
    check('its caption and comments stay hidden', (await subs.getByText('Rehearsal notes').count()) === 0 && (await subs.getByLabel('Add a comment').count()) === 0);
    check('the header has the For subscribers label', (await subs.locator('.pp-head .pp-badge').innerText()).includes('For subscribers'));
    await shot('posts-05-subscribers-dark');
    await subs.getByRole('button', { name: 'Subscribe' }).click();
    await wait(700);
    check("Subscribe goes to the creator's profile", (await page.evaluate(() => location.hash)) === '#/u/grace_mensah');
    await goto('/');
    await page.waitForSelector('.feed-post');

    /* ---------- sensitive ---------- */
    const sens = card('pp_sensitive');
    await sens.scrollIntoViewIfNeeded();
    check('a sensitive post is covered', (await sens.locator('.pp-veil').innerText()).includes('Sensitive content') && (await sens.locator('.pp-veil').getByRole('button', { name: 'See post' }).count()) === 1);
    check('its photo is blurred', (await sens.locator('.carousel').evaluate((el) => getComputedStyle(el).filter)).includes('blur'));
    await shot('posts-06-sensitive-dark');
    await sens.getByRole('button', { name: 'See post' }).click();
    await wait(300);
    check('See post uncovers it', (await sens.locator('.pp-veil').count()) === 0 && (await sens.locator('.carousel').evaluate((el) => getComputedStyle(el).filter)) === 'none');

    /* ---------- Sponsored ---------- */
    check('a paid ad says Sponsored under the name', (await card('pp_boost').locator('.pp-sponsored').innerText()) === 'Sponsored');
    await page.getByRole('tab', { name: 'For you' }).click();
    await page.waitForSelector('.feed-post');
    await wait(600);
    check('Sponsored posts lead For you', (await page.locator('.feed-post').first().locator('.pp-sponsored').count()) === 1);
    await page.getByRole('tab', { name: 'Following' }).click();
    await wait(600);

    /* ---------- report, with the copyright reason ---------- */
    const ruth = card('pp_tags');
    await ruth.scrollIntoViewIfNeeded();
    await ruth.getByRole('button', { name: 'More options' }).click();
    const others = await menuItems();
    check("someone else's post: Report, Unfollow, Save, Block, Go to post, Copy link, About this account", ['Report', 'Unfollow', 'Save', 'Block ruth_asante', 'Go to post', 'Copy link', 'About this account', 'Cancel'].every((x) => others.includes(x)), others.join());
    await page.locator('.pp-menu').getByRole('button', { name: 'Report' }).click();
    await page.waitForSelector('.pp-report');
    check("the report reasons are the iPhone's, copyright included", (await page.locator('.pp-report-row').allInnerTexts()).map((t) => t.trim()).join() === 'Spam,Nudity or sexual content,Harassment or hate,Copyright or trademark,Something else');
    await shot('posts-07-report-dark');
    await page.locator('.pp-report-row', { hasText: 'Copyright or trademark' }).click();
    await page.waitForSelector('.confirm');
    check('a copyright report explains how to send a formal notice', (await page.locator('.confirm').innerText()).includes('formal notice'));
    await page.locator('.confirm').getByRole('button', { name: 'Read the Copyright policy' }).click();
    await wait(700);
    check('and offers the Copyright policy', (await page.evaluate(() => location.hash)) === '#/legal/copyright');
    await goto('/admin/reports');
    // (The demo's stand-in table doesn't fill in status 'open' as the real one does, so look under All.)
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.waitForSelector('.report:has-text("Copyright or trademark")', { timeout: 5000 }).catch(() => {});
    check('the report reaches the admins with its reason', (await page.locator('.report', { hasText: 'Copyright or trademark' }).count()) === 1);

    /* ---------- my post: the menu ---------- */
    await goto('/p/p7');
    await page.waitForSelector('.post-page .pp-head');
    await page.locator('.post-page').getByRole('button', { name: 'More options' }).click();
    const mine = await menuItems();
    check('my post: Delete, Edit, Promote, Hide like count, Turn off commenting, Mark as sensitive, Copy link, About this account', ['Delete', 'Edit', 'Promote', 'Hide like count', 'Turn off commenting', 'Mark as sensitive', 'Copy link', 'About this account'].every((x) => mine.includes(x)), mine.join());
    await shot('posts-08-menu-dark');
    await page.locator('.pp-menu').getByRole('button', { name: 'Hide like count' }).click();
    await wait(500);
    check('Hide like count: only I see the number now', (await page.locator('.post-page .likes').innerText()).includes('Only you can see the count'));
    await page.locator('.post-page').getByRole('button', { name: 'More options' }).click();
    check('the menu now offers Show like count', (await menuItems()).includes('Show like count'));
    await page.locator('.pp-menu').getByRole('button', { name: 'Turn off commenting' }).click();
    await wait(500);
    check('Turn off commenting: the author is told and can still comment', (await page.locator('.post-page .pp-note').innerText()).includes('Commenting is turned off') && (await page.locator('.post-page').getByLabel('Add a comment').count()) === 1);
    await page.locator('.post-page').getByRole('button', { name: 'More options' }).click();
    check('the menu now offers Turn on commenting', (await menuItems()).includes('Turn on commenting'));
    await page.locator('.pp-menu').getByRole('button', { name: 'Edit' }).click();
    await page.waitForSelector('.pp-edit');
    await page.getByLabel('Edit caption').fill('Still water at first light.');
    await page.getByLabel('Alt text for photo 1').fill('A calm lake under a pale sky');
    await page.locator('.pp-edit').getByRole('button', { name: 'Done' }).click();
    await wait(600);
    check('Edit changes the caption', (await page.locator('.post-page').getByText('Still water at first light.').count()) === 1);
    check('and the alt text of the photo', (await page.locator('.post-page .slide img').first().getAttribute('alt')) === 'A calm lake under a pale sky');
    await page.locator('.post-page').getByRole('button', { name: 'More options' }).click();
    await page.locator('.pp-menu').getByRole('button', { name: 'Copy link' }).click();
    await wait(400);
    check('Copy link confirms', (await page.locator('.toast', { hasText: 'Link copied' }).count()) === 1);
    await page.locator('.post-page').getByRole('button', { name: 'More options' }).click();
    await page.locator('.pp-menu').getByRole('button', { name: 'Mark as sensitive' }).click();
    await wait(500);
    check('Mark as sensitive labels my post for me (and does not cover it for me)', (await page.locator('.post-page .pp-head').innerText()).includes('Marked sensitive') && (await page.locator('.post-page .pp-veil').count()) === 0);

    /* ---------- promote with the demo payment ---------- */
    await page.locator('.post-page').getByRole('button', { name: 'More options' }).click();
    await page.locator('.pp-menu').getByRole('button', { name: 'Promote' }).click();
    await page.waitForSelector('.pp-promote');
    await page.locator('.pp-days').getByRole('radio', { name: '3 days' }).click();
    check('3 days at £1.00 a day comes to £3.00', (await page.locator('.pp-total-sum').innerText()) === '£3.00');
    await shot('posts-09-promote-dark');
    await page.locator('.pp-promote').getByRole('button', { name: 'Pay £3.00' }).click();
    await page.waitForSelector('.pay-sheet');
    check('the payment dialog asks for the right amount', (await page.locator('.pay-sheet .pay-amount').innerText()) === '£3.00');
    await page.locator('.pay-sheet .btn.big').click();
    await page.waitForSelector('.post-page .pp-sponsored', { timeout: 6000 }).catch(() => {});
    check('after paying, the post is Sponsored', (await page.locator('.post-page .pp-sponsored').count()) === 1);
    check('and the promotion is confirmed', (await page.locator('.toast', { hasText: 'Your post is being promoted' }).count()) === 1);

    // The changes are saved: the post opened again from my profile shows them.
    await goto('/u/you');
    await page.waitForSelector('.grid .tile');
    await page.locator('.grid .tile[data-post="p7"]').click();
    await page.waitForSelector('.post-dialog .pp-head');
    await wait(300);
    check('saved: the hidden like count, commenting off and the new caption', (await page.locator('.post-dialog .likes').innerText()).includes('Only you') && (await page.locator('.post-dialog .pp-note').count()) === 1 && (await page.locator('.post-dialog').getByText('Still water at first light.').count()) === 1);
    await page.keyboard.press('Escape');
    await wait(300);

    /* ---------- tiles ---------- */
    await goto('/explore');
    await page.waitForSelector('.mosaic .tile');
    const subsTile = page.locator('.tile[data-post="pp_subs"]');
    check('a tile for subscribers has a lock and is covered', (await subsTile.locator('.pp-tile-lock').count()) === 1 && (await subsTile.locator('.pp-tile-cover').innerText()).includes('For subscribers'));
    check('a sensitive tile is covered', (await page.locator('.tile[data-post="pp_sensitive"] .pp-tile-cover').innerText()).includes('Sensitive content'));
    check('a Short has the Shorts badge', (await page.locator('.tile[data-post="r1"] .tile-badge').count()) === 1);
    check('several photos have the carousel badge', (await page.locator('.tile[data-post="p2"] .tile-badge').count()) === 1);
    await page.locator('.tile[data-post="pp_ai"]').hover();
    check('hover counts leave out a hidden like count', (await page.locator('.tile[data-post="pp_ai"] .tile-hover span').count()) === 0);
    await page.locator('.tile[data-post="p2"]').hover();
    check('hover counts show likes and comments otherwise', (await page.locator('.tile[data-post="p2"] .tile-hover span').count()) === 2);

    /* ---------- the composer: a post with a tag, a poll, a prompt and the AI label ---------- */
    await goto('/');
    await page.waitForSelector('.feed-post');
    await page.locator('.rail').getByRole('button', { name: 'Create' }).click();
    await page.locator('.create-pop').getByRole('menuitem', { name: /^Post/ }).click();
    await page.waitForSelector('.pp-dropzone');
    check('Create new post: title, drag here, Select from computer', (await page.locator('.create-head h2').innerText()) === 'Create new post' && (await page.locator('.pp-dropzone h3').innerText()) === 'Drag photos and videos here' && (await page.getByRole('button', { name: 'Select from computer' }).count()) === 1);
    check('the file picker takes several files', (await page.locator('[data-testid=create-files]').getAttribute('multiple')) !== null);
    await shot('posts-10-create-dark');
    await page.setInputFiles('[data-testid=create-files]', [path.join(MEDIA, '09.jpg')]);
    await page.waitForSelector('.crop-bar');
    await page.locator('.create-head').getByRole('button', { name: 'Next' }).click();
    await page.waitForSelector('.filter-cell');
    await page.locator('.create-head').getByRole('button', { name: 'Next' }).click();
    await page.waitForSelector('.pp-details');
    await page.getByLabel('Caption').fill('Picnic after church? ');
    await page.locator('.pp-details').getByRole('button', { name: 'Emoji' }).click();
    await page.locator('.pp-emoji-grid button').first().click();
    check('the emoji button adds to the caption', (await page.getByLabel('Caption').inputValue()).startsWith('Picnic after church? 😂'));
    await page.keyboard.press('Escape');
    check('Escape closes the emoji box, not the composer', (await page.locator('.pp-emoji-pop').count()) === 0 && (await page.locator('.confirm').count()) === 0 && (await page.locator('.pp-details').count()) === 1);
    await page.getByRole('button', { name: 'Tag people' }).click();
    await page.getByLabel('Search people to tag').fill('grace');
    await page.locator('.pp-tag-row', { hasText: 'grace_mensah' }).click();
    check('a tagged person is added', (await page.locator('.pp-person-chip', { hasText: 'grace_mensah' }).count()) === 1);
    await page.getByLabel('Location').fill('Riverside park');
    await page.getByRole('button', { name: 'Poll', exact: true }).click();
    await page.getByLabel('Poll question').fill('Which day suits you?');
    await page.getByLabel('Option 1', { exact: true }).fill('Sunday');
    await page.getByLabel('Option 2', { exact: true }).fill('Monday');
    await page.locator('.pp-add-option').click();
    await page.getByLabel('Option 3', { exact: true }).fill('Either');
    await page.getByRole('button', { name: 'Prompt', exact: true }).click();
    await page.getByLabel('Prompt', { exact: true }).fill('What should we bring?');
    await page.getByRole('switch', { name: 'AI label' }).click();
    check('the AI label switch turns on', (await page.getByRole('switch', { name: 'AI label' }).getAttribute('aria-checked')) === 'true');
    await page.getByRole('button', { name: 'Accessibility' }).click();
    await page.getByLabel('Alt text for photo 1').fill('A green field after rain');
    await page.getByRole('button', { name: 'Advanced settings' }).click();
    const advanced = await page.locator('.pp-sec.open .pp-switch-row').allInnerTexts();
    check('advanced settings: hide likes, commenting, profile only (Plus), sensitive', ['Hide like count', 'Turn off commenting', 'Only post to profile', 'Mark as sensitive'].every((x) => advanced.some((a) => a.includes(x))), advanced.join(' / '));
    // The demo's own account offers a creator subscription (£2.99), so it may choose who sees a post.
    check('a creator with a subscription can choose the audience, Everyone by default', (await page.locator('.pp-audience').count()) === 1);
    await shot('posts-11-composer-dark');
    await page.locator('.create-head').getByRole('button', { name: 'Share' }).click();
    await page.waitForSelector('.profile-head', { timeout: 15000 });
    await page.waitForSelector('.grid .tile');
    await wait(500);
    check('the new post is on my profile', (await page.locator('.grid .tile').count()) === 3, await page.locator('.grid .tile').count());
    await page.locator('.grid .tile').first().click();
    await page.waitForSelector('.post-dialog .pp-poll');
    await wait(300);
    const view = page.locator('.post-dialog');
    check('it has its poll (the author sees the results)', (await view.locator('.pp-poll-q').innerText()).includes('Which day suits you?') && (await view.locator('.pp-poll-pct').count()) === 3);
    check('its prompt', (await view.locator('.pp-prompt').innerText()).includes('What should we bring?'));
    check('the AI label', (await view.getByRole('button', { name: 'AI info' }).count()) === 1);
    check('the place', (await view.getByText('Riverside park').count()) === 1);
    check('and the alt text', (await view.locator('.slide img').first().getAttribute('alt')) === 'A green field after rain');
    await shot('posts-12-view-dark');
    await view.getByRole('button', { name: 'See who is tagged' }).click();
    await page.waitForSelector('.pp-tagged .pp-row-btn');
    check('the tagged person', (await page.locator('.pp-tagged .pp-row-btn').innerText()).includes('grace_mensah'));
    await page.keyboard.press('Escape');
    await wait(200);
    check('Escape closes the tagged list and leaves the post open', (await page.locator('.pp-tagged').count()) === 0 && (await page.locator('.post-dialog .pp-head').count()) === 1);
    await view.getByRole('button', { name: 'More options' }).click();
    await page.waitForSelector('.pp-menu');
    await page.keyboard.press('Escape');
    await wait(200);
    check('Escape closes the menu and leaves the post open', (await page.locator('.pp-menu').count()) === 0 && (await page.locator('.post-dialog .pp-head').count()) === 1);
    await page.keyboard.press('Escape');
    await goto('/');
    await page.waitForSelector('.feed-post');
    await wait(500);
    const newest = page.locator('.feed-post').first();
    check('and it leads my home feed with its poll', (await newest.innerText()).includes('Picnic after church?') && (await newest.locator('.pp-poll').count()) === 1);

    /* ---------- a photo dragged in, kept to my profile (Plus) ---------- */
    await page.locator('.rail').getByRole('button', { name: 'Create' }).click();
    await page.locator('.create-pop').getByRole('menuitem', { name: /^Post/ }).click();
    await page.waitForSelector('.pp-dropzone');
    await page.evaluate(async () => {
      const blob = await (await fetch(document.querySelector('.slide img').src)).blob();
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'dragged.jpg', { type: 'image/jpeg' }));
      const zone = document.querySelector('.pp-dropzone');
      zone.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForSelector('.crop-bar', { timeout: 5000 }).catch(() => {});
    check('a photo dragged onto the dialog is picked up', (await page.locator('.crop-bar').count()) === 1);
    await page.locator('.create-head').getByRole('button', { name: 'Next' }).click();
    await page.locator('.create-head').getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('Caption').fill('Only for my profile');
    await page.getByRole('button', { name: 'Advanced settings' }).click();
    await page.getByRole('switch', { name: 'Only post to profile' }).click();
    await page.locator('.create-head').getByRole('button', { name: 'Share' }).click();
    await page.waitForSelector('.profile-head', { timeout: 15000 });
    await page.waitForSelector('.grid .tile');
    await wait(500);
    await page.locator('.grid .tile').first().click();
    await page.waitForSelector('.post-dialog .pp-head');
    check('a post kept to my profile tells me so', (await page.locator('.post-dialog .pp-head').innerText()).includes('Only on your profile') && (await page.locator('.post-dialog').getByText('Only for my profile').count()) === 1);
    await page.keyboard.press('Escape');
    await goto('/');
    await page.waitForSelector('.feed-post');
    await wait(500);
    check('and it stays off the home feed', (await page.locator('.feed-post', { hasText: 'Only for my profile' }).count()) === 0);

    /* ---------- Create → Short ---------- */
    const video = sampleVideo();
    if (!video) console.log('SKIP a Short from a video (ffmpeg is needed to make a WebM this Chromium can open)');
    else {
      await page.locator('.rail').getByRole('button', { name: 'Create' }).click();
      await page.locator('.create-pop').getByRole('menuitem', { name: /^Short/ }).click();
      await page.waitForSelector('.pp-dropzone');
      await page.setInputFiles('[data-testid=create-files]', [video]);
      await page.waitForSelector('.pp-details');
      check('a single video becomes a Short', (await page.locator('.create-head h2').innerText()) === 'New Short' && (await page.locator('.pp-short-tag').count()) === 1);
      await page.getByLabel('Caption').fill('My first Short from the Mac');
      await page.locator('.create-head').getByRole('button', { name: 'Share' }).click();
      await page.waitForFunction(() => location.hash === '#/u/you/shorts', null, { timeout: 15000 });
      await page.waitForSelector('.grid .tile');
      await wait(400);
      check('it is shared as a Short', (await page.locator('.grid .tile').count()) === 1 && (await page.locator('.grid .tile').first().getAttribute('aria-label')).startsWith('Short by you'));
      await goto('/shorts');
      await page.waitForSelector('.reel');
      await wait(400);
      check('and shows in Shorts', (await page.locator('.reel').count()) === 3, await page.locator('.reel').count());
    }

    /* ---------- White ---------- */
    await goto('/');
    await page.waitForSelector('.feed-post');
    await theme('white');
    await wait(300);
    check('White: the card has a light background', (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(255, 255, 255)');
    check('White: the poll box is light', (await card('pp_poll').locator('.pp-poll').evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(240, 242, 244)');
    await shot('posts-13-feed-white');
    await card('pp_poll').scrollIntoViewIfNeeded();
    await shot('posts-14-poll-white');
    await card('pp_sensitive').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -260));
    await wait(300);
    await shot('posts-15-subs-sensitive-white');
    await goto('/p/pp_prompt');
    await page.waitForSelector('.post-page .pp-prompt');
    await shot('posts-16-view-white');
    await page.locator('.rail').getByRole('button', { name: 'Create' }).click();
    await page.locator('.create-pop').getByRole('menuitem', { name: /^Post/ }).click();
    await page.setInputFiles('[data-testid=create-files]', [path.join(MEDIA, '05.jpg')]);
    await page.waitForSelector('.crop-bar');
    await page.locator('.create-head').getByRole('button', { name: 'Next' }).click();
    await page.locator('.create-head').getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Poll', exact: true }).click();
    await page.getByRole('button', { name: 'Advanced settings' }).click();
    await shot('posts-17-composer-white');
    await theme('dark');

    /* ---------- a creator with a subscription can post for subscribers only ---------- */
    // Grace offers a subscription; the demo switches accounts by starting again as her.
    await page.evaluate(() => {
      sessionStorage.setItem('community.demoAs', 'u_grace');
      location.hash = '#/';
    });
    await page.reload();
    await page.waitForSelector('.feed-post');
    await page.locator('.rail').getByRole('button', { name: 'Create' }).click();
    await page.locator('.create-pop').getByRole('menuitem', { name: /^Post/ }).click();
    await page.setInputFiles('[data-testid=create-files]', [path.join(MEDIA, '08.jpg')]);
    await page.waitForSelector('.crop-bar');
    await page.locator('.create-head').getByRole('button', { name: 'Next' }).click();
    await page.locator('.create-head').getByRole('button', { name: 'Next' }).click();
    check('the audience choice is offered to a creator with a subscription', (await page.locator('.pp-audience').count()) === 1);
    await page.getByLabel('Caption').fill('Choir notes for my subscribers');
    await page.locator('.pp-audience').getByRole('radio', { name: /Subscribers only/ }).click();
    await page.locator('.create-head').getByRole('button', { name: 'Share' }).click();
    await page.waitForSelector('.profile-head', { timeout: 15000 });
    await page.waitForSelector('.grid .tile');
    await wait(500);
    const newTile = page.locator('.grid .tile').first();
    check('the new post has the lock on its tile', (await newTile.locator('.pp-tile-lock').count()) === 1 && (await newTile.locator('.pp-tile-cover').count()) === 0);
    await newTile.click();
    await page.waitForSelector('.post-dialog .pp-head');
    check('and says For subscribers, uncovered for its author', (await page.locator('.post-dialog .pp-head').innerText()).includes('For subscribers') && (await page.locator('.post-dialog .carousel').count()) === 1);
    await page.keyboard.press('Escape');

    check('no script errors', errors.length === 0, errors.join(' | '));
  } catch (e) {
    console.log('TEST CRASHED: ' + e.message.split('\n').slice(0, 6).join('\n'));
    failed++;
  }
  await browser.close();
  console.log(failed ? `${failed} CHECK(S) FAILED` : 'ALL POSTS CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})();
