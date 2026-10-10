# Community website

The app's public website: a home page, the legal pages, support, account deletion and a 404 page.
Plain HTML and CSS, built by one Node script with no dependencies. There are no web fonts, no
cookies and no third-party requests, and there is no JavaScript at all unless you switch on the
optional analytics.

| Page | Address | Made from |
| --- | --- | --- |
| Home | `/` | `src/pages/home.html` |
| Privacy policy | `/privacy` | `legal/privacy.md` |
| Terms of use | `/terms` | `legal/terms.md` |
| Copyright and DMCA policy | `/copyright` | `legal/copyright.md` |
| Report copyright infringement | `/report-copyright` | `src/pages/report-copyright.html` |
| Child safety standards | `/child-safety` | `legal/child-safety.md` |
| Community guidelines | `/community-guidelines` | `legal/community-guidelines.md` |
| Support | `/support` | `src/pages/support.html` |
| Delete your account | `/delete-account` | `src/pages/delete-account.html` |
| Not found | any other address | `src/pages/404.html` |

These are the addresses to give App Store Connect (privacy policy URL, support URL) and, if you
publish on Android later, Google Play (account deletion URL, child safety standards URL).

## Before launch

1. **Fill in `legal/details.json`.** Every key needs a real value. `website` is the address the
   site will live at, such as `https://communityapp.org`: it is used for canonical links, the
   sitemap and social previews. The build stops if a value is missing or still a placeholder
   such as `[CONTACT EMAIL]`, so nothing half-filled is ever published.
2. **Fill in `website/site.json`.**
   - `app_store_url`: the App Store link, once the app is live. Every "Get Community" button
     points here, and iPhones also show Apple's Smart App Banner.
   - `testflight_url`: the public TestFlight link (TestFlight > External Testing > Public Link
     in App Store Connect). Used while `app_store_url` is empty.
   - With neither, the buttons go to the support page's "How do I get Community?" answer and
     the build prints a warning.
   - `analytics_token`: leave it `""` for no analytics (see below).
3. Deploy, using one of the two options below, and open every page once on your phone.

## Build and preview

```sh
node scripts/build-website.mjs                     # reads legal/ and website/site.json
node scripts/build-website.mjs --legal /some/dir   # legal Markdown and details.json from elsewhere
```

Options: `--legal <dir>`, `--details <file>`, `--site <file>`, `--out <dir>` (default
`website/dist/`, which is not committed). To preview, serve `website/dist` with any static server,
for example `npx serve website/dist`.

The build renders `src/layout.html` with the shared header and footer (`src/partials/`) around
every page, turns the legal Markdown into pages (filling `{{placeholders}}` from details.json),
copies `assets/` and `static/`, and writes `site.webmanifest`, `sitemap.xml`, `robots.txt`,
`_headers` and `_redirects`. Then it checks the result, and **fails** on any problem:

- a link, `#fragment`, image, icon or stylesheet that doesn't exist, a relative link, or a link
  with a trailing slash or `.html` (pages have one address each, like `/privacy`)
- anything that would load from another site, an inline script or style (the CSP forbids them)
- an unfilled `{{placeholder}}`, a legal document that is missing, a link to an unknown `.md`
- a page without a unique title and description, an image without alt text or size

The legal Markdown can use `#`, `##`, `###` headings, paragraphs, `- ` and `1. ` lists (nested by
indenting), `> ` quotes, `---`, `**bold**`, `*italic*`, `` `code` ``, `[links](https://…)`, and
links to each other as `[terms](terms.md)`. Web and email addresses become links by themselves.
The first `#` heading becomes the page title, and a contents list is made from the `##` headings.

## Deploy option 1: GitHub Pages

`.github/workflows/website.yml` builds and publishes the site on every push to `main` that
changes `website/`, `legal/` or the build script, and from the Actions tab (Run workflow).

1. In the repository, open **Settings > Pages** and set **Source** to **GitHub Actions**.
   For a **private** repository this needs a paid GitHub plan (Pro, Team or Enterprise); on the
   free plan Pages only works for public repositories.
2. Run the workflow. The site appears at `https://<user>.github.io/<repo>/` until you add a domain.
   If you use that address, put it in details.json `website` (the build then prefixes every link
   with `/<repo>`).
3. **Custom domain:** Settings > Pages > Custom domain. For `www.example.org` add a DNS `CNAME`
   record pointing to `<user>.github.io`; for the bare `example.org` add `A` records to
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`. When the
   check passes, tick **Enforce HTTPS** (GitHub issues the certificate) and set details.json
   `website` to `https://example.org`.

GitHub Pages can't set response headers or redirects, so `_headers` and `_redirects` are ignored
there. Every page still carries the Content-Security-Policy in a `<meta>` tag (with
`upgrade-insecure-requests`), but HSTS, `X-Frame-Options`/`frame-ancestors`, `nosniff`,
`Permissions-Policy`, the short addresses such as `/dmca`, and trailing-slash redirects only
work on a host that reads those files.

## Deploy option 2: Cloudflare Pages (free, works with a private repository)

Cloudflare Pages reads `_headers` and `_redirects`, so you get every security header.

1. In the Cloudflare dashboard: **Workers & Pages > Create > Pages > Connect to Git**, and pick
   this repository (Cloudflare asks for access to it on GitHub; private repositories are fine).
2. Production branch `main`, framework preset **None**, build command
   `node scripts/build-website.mjs`, build output directory `website/dist`. Under environment
   variables add `NODE_VERSION` = `22`.
3. **Custom domain:** the project's **Custom domains** tab > Set up a domain. If the domain's DNS
   is on Cloudflare, the record and the HTTPS certificate are created for you; otherwise add the
   `CNAME` it shows at your DNS provider. Turn on **SSL/TLS > Edge Certificates > Always Use
   HTTPS** for the domain, then set details.json `website` to the new address.
4. Disable the GitHub Pages workflow (Actions > Community website > Disable workflow), so pushes
   don't show a failed deployment.

Netlify reads the same two files, if you prefer it (build command and publish directory as above).

The HSTS header is sent for a year with `includeSubDomains`: make sure every subdomain of the
site's domain serves HTTPS before you deploy, or remove `includeSubDomains` in `_headers`.

## Analytics (off by default)

With `analytics_token` empty there is no banner, no script and nothing to consent to. To count
visits, create a site in Cloudflare Web Analytics, put its token in site.json and redeploy. Pages
then show a small banner; only after **Allow** do they load Cloudflare's cookieless beacon. The
choice is stored in the browser's localStorage, and "Analytics choice" in the footer asks again.
The build adds `static.cloudflareinsights.com` (script-src) and `cloudflareinsights.com`
(connect-src) to the CSP only when a token is set.

## Changing things

- Words on the home, support, delete-account, report-copyright and 404 pages: `src/pages/*.html`.
  Titles, descriptions and page intros: `src/pages.json`. Header and footer: `src/partials/`.
- Styles: `assets/css/site.css` (colour tokens at the top, with a dark-mode set).
- Security headers: `_headers` (the build derives the `<meta>` CSP from it). Short addresses:
  `_redirects`.
- Photos, favicons and the 1200×630 social preview are made from the app's own `assets/` by
  `python3 website/tools/make-images.py` (needs Pillow 11+; the output is committed). Photos are
  AVIF, WebP and JPEG at 400, 600 and 800 pixels wide, served with `<picture>` and `srcset`, and
  lazy-loaded except the first one. There is no `favicon.svg`: the logo only exists as a bitmap,
  so an SVG would just wrap a PNG.

## Accessibility

Semantic landmarks, one `h1` per page, a skip link, visible focus rings, `prefers-reduced-motion`
respected (there is no animation beyond a button colour change), dark mode, and layouts that fit
a 320-pixel screen without sideways scrolling. Text colours meet WCAG AA:

| Text | Background | Ratio |
| --- | --- | --- |
| Body `#10201a` | Page `#f7faf7` / band `#e8f1ea` / panel `#ffffff` | 16.06 / 14.64 / 16.89 |
| Secondary `#44574c` | Page / band / panel | 7.36 / 6.71 / 7.74 |
| Links, focus ring `#0f7a3a` | Page / band | 5.17 / 4.71 |
| Button text `#ffffff` | Button `#0f7a3a` (hover `#0b6330`) | 5.43 (7.39) |
| White `#ffffff` | Forest `#0c2118` / consent banner `#163326` | 16.85 / 13.68 |
| Mist `#a6c3b3` | Forest `#0c2118` | 8.89 |
| Button text `#06210f` | Leaf `#2fd47a` (hover `#5be297`) | 8.78 (10.36) |
| Focus ring `#2fd47a` | Forest `#0c2118` | 8.68 |
| Dark mode body `#f3f5f7` | `#0b1014` / band `#10291e` | 17.49 / 14.15 |
| Dark mode secondary `#a6c3b3` | `#0b1014` / band `#10291e` | 10.09 / 8.16 |
| Dark mode links `#4fe08a` | `#0b1014` / band `#10291e` | 11.25 / 9.10 |
