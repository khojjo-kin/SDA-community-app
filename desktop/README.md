# Community for Mac (and the web)

The desktop version of Community, laid out like Instagram on a computer: the left sidebar, a
centred feed with stories and suggestions, the post dialog with comments, Explore, Reels,
Messages, Notifications, Create, profiles and settings. It uses the same accounts and data as the
iPhone app:

- **Sign-in:** the same Clerk application (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in the repository's `.env`)
- **Data:** the same Supabase project, tables, storage bucket and access rules
- **Code:** the iPhone app's data layer is shared, not copied: `src/lib/api.ts`, `store.ts`,
  `types.ts`, `theme.ts` and `supabase.ts` in the repository root are built straight into the
  desktop app. The few phone-only modules they import are swapped for browser versions in
  `desktop/src/shims`.

## What it does

| Area | Details |
| --- | --- |
| Home | Story row, Following and For you feeds with endless scroll, suggestions |
| Posts | Photo carousels and videos, double-click to like, like, comment, repost, share to people, save, report, delete |
| Post view | Instagram's dialog: media on the left, comments on the right, comment likes and replies |
| Stories | Full-screen viewer with progress bars, keyboard arrows, replies, seen-by list, delete; photo and video stories from Create, everyone or close friends |
| Explore and Reels | Mosaic grid; full-height reels with sound toggle |
| Messages | Conversation list and chat side by side, live updates, photos (pick or paste), hearts, shared posts, voice messages, call links, Seen, mute, delete; Erha answers in her chat |
| Notifications | Panel with likes, comments, reposts, follows, follow back, follow requests |
| Search | Panel with recent searches |
| Profile | Picture with story ring, Follow / Following / Requested, Message, close friends, block, report, highlights, Posts / Reels / Saved / Reposts |
| Settings | Edit profile and photo, private account, view counts, story replies, blocked accounts, email and password (Clerk), log out, deactivate |
| Church | Hymnal, Churches, Communities and pages |

Not on desktop yet: in-app voice and video calls (call links open in the browser), recording
voice messages, the story editor's stickers and drawing, live broadcasts, Pod, payments and the
admin console. Those stay on the iPhone.

## Build and run

```
cd desktop
npm install
node build.mjs            # the real app into dist/
npx electron .            # run it as a Mac app
node build.mjs --demo     # sample data, no sign-in, into dist-demo/ (open dist-demo/index.html through any web server)
```

## The Mac app

Every push to the `desktop` branch runs the **Community for Mac** workflow. It tests the app in a
browser, builds `Community.app` for Apple silicon and Intel on GitHub's Mac, and puts
`Community.dmg` on the **Community for Mac** release of this repository.

The app is signed ad hoc (no certificate). The first time it is opened, macOS says it can't check
it: open **System Settings → Privacy & Security** and click **Open Anyway**. To remove that step,
sign it with a Developer ID certificate and notarize it.

Inside the app, the desktop web app is served from `http://localhost:47821`, because Clerk's
sign-in needs a real web address.

## Tests

```
node build.mjs --demo && node build.mjs --wire
(cd dist-demo && python3 -m http.server 8790 &) ; (cd dist-wire && python3 -m http.server 8791 &)
node tests/ui.test.cjs http://127.0.0.1:8790/       # every screen, on sample data
node tests/wiring.test.cjs http://127.0.0.1:8791/   # Clerk sign-in and the Supabase client, with stand-ins
```
