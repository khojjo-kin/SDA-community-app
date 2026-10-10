# Community for Mac (and the web)

The desktop version of Community, laid out like Instagram on a computer: the left sidebar, a
centred feed with stories and suggestions, the post dialog with comments, Explore, Reels,
Messages, Notifications, Create, profiles and settings. It uses the same accounts and data as the
iPhone app:

- **Sign-in:** the same Clerk application (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in the repository's `.env`)
- **Data:** the same Supabase project, tables, storage bucket and access rules
- **Code:** the iPhone app's data layer is shared, not copied: `src/lib/api.ts`, `store.ts`,
  `types.ts`, `theme.ts` and `supabase.ts` in the repository root are built straight into the
  desktop app, along with `calls.tsx` and `rtc.ts`, `bible.ts` and `sabbath-school.ts`. The few
  phone-only modules they import are swapped for browser versions in `desktop/src/shims`.

### Separate from the iPhone app

The two apps never share a layout. The iPhone app keeps its own screens in `app/` and `src/`
and builds from the `community-app` branch with its own TestFlight workflow; the desktop app lives
only in `desktop/`, on the `desktop` branch, with its own workflow. The desktop app has no phone
layout at all: the window can't be made narrower than 1000 points, and small windows keep the
sidebar instead of switching to a bottom bar. The only change outside `desktop/` is one line in the
root `tsconfig.json` that keeps the iPhone type check out of this folder.

## What it does

| Area | Details |
| --- | --- |
| Home | Story row with people who are live, Following, For you and Subscribers feeds with endless scroll, Boosted label, suggestions |
| Posts | Photo carousels and videos, double-click to like, like, comment, repost, share to people, save, report, delete |
| Post view | Instagram's dialog: media on the left, comments on the right, comment likes and replies |
| Create | Pick, crop, the iPhone app's filters and adjustments (brightness, contrast, warmth and more), caption, location, alt text |
| Stories | Full-screen viewer with progress bars, keyboard arrows, replies, seen-by list, delete; photo and video stories from Create, everyone or close friends; archive and highlights |
| Explore and Reels | Mosaic grid; full-height reels with sound toggle |
| Messages | Conversation list and chat side by side, live updates, typing indicator, photos (pick or paste), hearts, shared posts, voice messages, Seen, mute, delete, saved replies, FAQs; Erha answers in her chat |
| Calls | Voice and video calls inside the app, using the iPhone app's protocol, so a Mac can call an iPhone and the other way round; ringing, mute, camera, hang-up, call log in the chat |
| Live | Watch someone's live broadcast, with chat and hearts |
| Notifications | Panel with likes, comments, reposts, follows, follow back, follow requests |
| Search | Panel with recent searches |
| Profile | Picture with story ring, Follow / Following / Requested, Message, close friends, block, report, highlights, Posts / Reels / Saved / Reposts |
| Settings | Edit profile and photo, professional account, saved replies, privacy, close friends, blocked accounts, profile viewers, email and password (Clerk), log out, deactivate |
| Creators | Dashboard with views and followers, Plus, verification requests, Help tickets |
| Church | Bible with translations, Sabbath School lessons, Pod (podcasts with a player that keeps playing while you browse), Hymnal with favourites and text size, Churches, Communities and pages |
| Admin | The admin console for people with an admin role: reports, users, verification and Plus requests, support |

Still iPhone-only: going live yourself, recording voice messages, the story editor's stickers and
drawing, payments, switching accounts, and chat wallpapers and fonts.

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
node tests/calls.test.cjs http://127.0.0.1:8790/    # a real call between two windows, with test cameras
```
