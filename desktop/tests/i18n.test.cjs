// The app in other languages: every language shows the main pages with no raw keys and no script
// errors; French, Arabic, Twi and Japanese are walked through every main page; the words follow a
// change of language at once; and the dictionaries are complete (every English key in every language).
// Usage: node tests/i18n.test.cjs http://127.0.0.1:8790/
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8790/';
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || extra === '' ? '' : ' (' + extra + ')'));
  if (!ok) failed++;
};

const LANGS = ['tw', 'ee', 'fr', 'es', 'pt', 'de', 'it', 'sw', 'yo', 'ha', 'ig', 'ar', 'hi', 'zh', 'ko', 'ja', 'ru', 'tl', 'id'];
const WALK = ['fr', 'ar', 'tw', 'ja'];
const PAGES = ['/', '/explore', '/shorts', '/direct', '/u/you', '/accounts/edit', '/accounts/language', '/dashboard', '/plus', '/bible', '/lessons', '/pod', '/churches', '/groups', '/activity', '/map'];
// A raw key on screen: "d.area.word" or an iPhone key like "settings.title".
const RAW = /\bd\.[a-z-]+\.[A-Za-z]|\b(common|settings|profile|feed|plus|create|createFlow|inbox|tabs)\.[a-z][A-Za-z]+\b/;

(async () => {
  const browser = await chromium.launch();
  const open = async (lang) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript((l) => {
      try {
        localStorage.setItem('community.prefs', JSON.stringify({ language: l }));
        localStorage.setItem('community.dismissedAnnouncements', JSON.stringify(['an1']));
      } catch {}
    }, lang);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (r) => {
      const u = r.request().url();
      return u.startsWith(BASE) || u.startsWith('blob:') || u.startsWith('data:') ? r.continue() : r.abort();
    });
    await page.goto(BASE);
    await page.waitForSelector('.feed-post');
    return { context, page, errors };
  };
  const visible = (page) => page.evaluate(() => document.body.innerText);
  const railLabels = (page) => page.locator('.rail .nav-item').evaluateAll((els) => els.map((e) => e.textContent.trim()).filter(Boolean));

  try {
    // English first: the rail's words, to compare with.
    const en = await open('en');
    const english = await railLabels(en.page);
    check('English has the rail labels', english.includes('Home') && english.some((l) => l.endsWith('Messages')), english.join(','));
    check('the page says it is in English', (await en.page.evaluate(() => document.documentElement.lang)) === 'en');

    // Switching language in Settings changes the words at once, without a reload.
    await en.page.evaluate(() => (location.hash = '#/accounts/language'));
    await en.page.waitForTimeout(800);
    await en.page.locator('label', { hasText: 'Français' }).first().click();
    await en.page.waitForTimeout(900);
    const switched = await railLabels(en.page);
    check('choosing French changes the app at once', switched.includes('Accueil'), switched.join(','));
    check('and the page language', (await en.page.evaluate(() => document.documentElement.lang)) === 'fr');
    await en.page.locator('label', { hasText: 'English' }).first().click();
    await en.page.waitForTimeout(900);
    check('and back to English', (await railLabels(en.page)).includes('Home'));
    check('English logs no script errors', !en.errors.length, en.errors.join(' | '));
    await en.context.close();

    // Every language: Home is translated and clean.
    for (const lang of LANGS) {
      const { context, page, errors } = await open(lang);
      const labels = await railLabels(page);
      const text = await visible(page);
      const raw = text.match(RAW);
      const changed = labels.filter((l, i) => l !== english[i]).length;
      check(`${lang}: Home shows no raw keys`, !raw, raw?.[0]);
      check(`${lang}: the rail is translated`, changed >= 3, labels.join(','));
      check(`${lang}: the page says its language`, (await page.evaluate(() => document.documentElement.lang)) === lang);
      check(`${lang}: no script errors`, !errors.length, errors.join(' | '));
      await context.close();
    }

    // A walk through every main page in four languages.
    for (const lang of WALK) {
      const { context, page, errors } = await open(lang);
      const bad = [];
      for (const p of PAGES) {
        await page.evaluate((h) => (location.hash = h), p);
        await page.waitForTimeout(900);
        const m = (await visible(page)).match(RAW);
        if (m) bad.push(p + ': ' + m[0]);
      }
      check(`${lang}: every main page shows no raw keys`, !bad.length, bad.join(' | '));
      check(`${lang}: and no script errors`, !errors.length, errors.join(' | '));
      await context.close();
    }

    // The dictionaries themselves: every English desktop key in every language, with the same gaps.
    const { context, page } = await open('en');
    const report = await page.evaluate(() => window.__desktopWords && window.__desktopWords());
    if (report) {
      check('every desktop key is in every language', !report.missing.length, report.missing.slice(0, 8).join(', '));
      check('every translation keeps the {gaps}', !report.gaps.length, report.gaps.slice(0, 8).join(', '));
      console.log(`     ${report.keys} desktop keys × ${report.languages} languages`);
    } else check('the demo exposes the dictionaries for checking', false);
    await context.close();
  } catch (e) {
    console.log('TEST CRASHED: ' + e.message);
    failed++;
  }
  await browser.close();
  console.log(failed ? `${failed} I18N CHECK(S) FAILED` : 'ALL I18N CHECKS PASSED');
  process.exit(failed ? 1 : 0);
})();
