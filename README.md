# Community

A photo and video sharing app for iPhone: feed, stories, reels, direct messages, search, profiles and notifications.

- **App:** Expo (React Native) with Expo Router, in `app/` and `src/`
- **Sign-in:** Clerk (email and password, with email codes)
- **Data and media:** Supabase (Postgres with row-level security, Storage, Realtime), project `SDA`
- **Builds:** Xcode on GitHub's Macs, uploaded to TestFlight

## What works

| Area | Details |
| --- | --- |
| Accounts | Sign up, email verification, log in, password reset, profile setup, edit profile, change password, log out, delete account |
| Feed | Posts from people you follow, pull to refresh, endless scroll, double-tap to like, like, comment, repost, save, share, report, block |
| Posts | Up to 10 photos in a swipeable carousel, or one video (a reel) up to 60 seconds, with a caption |
| Stories | "Add to story" gallery of your own photos and videos, camera, text stories, collages, several at once. Editor with text, emoji stickers, @mentions, drawing and a caption. Share to everyone or to Close Friends, send as a message, add to a highlight. Viewers list, replies, 24-hour expiry, archive |
| Highlights | Keep stories on your profile under a name; rename, remove a story, delete |
| Reels | Full-screen vertical video feed, tap to pause, double-tap to like, sound on or off, view counts, Friends tab |
| Messages | One-to-one chats with text, photos (sent together they stack), voice messages, hearts, quick reactions, shared posts, forwarding, save to Photos, mute, delete for me, unread badges, live updates |
| Search | Find people by name or username, explore grid of recent posts, saved posts and likes |
| Profile | Posts, reels and reposts tabs, highlights, followers and following lists, follow and message buttons |
| Activity | Likes, comments, reposts and new followers, with follow back |
| Settings and activity | Account, saved, archive, your activity, notifications, close friends, blocked, story replies, story and camera, about, with search |
| Creator account | Switch between personal and creator, category label, dashboard (views, followers, content, monthly recap), saved replies, frequently asked questions that answer themselves, view-count visibility |

Left out on purpose, because they need things this app does not have: anything that links to Facebook, Threads or WhatsApp, ads and payments, shops, live video, fundraisers, broadcast channels, a music library, and adding a second account.

## Configuration

`.env` holds three public values that ship inside the app:

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_KEY=            # the publishable key, never the service role key
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=   # pk_test_... or pk_live_... from the Clerk dashboard
```

If one is missing, the app opens on a screen that names it.

## Connect Clerk to Supabase

Sign-in uses the Clerk application **Community** (development instance, domain `glad-tiger-2142.clerk.accounts.dev`). It is already set up for this app: email and password sign-up, email codes, no CAPTCHA (CAPTCHA does not work in native apps), and a `role: authenticated` claim on session tokens so Supabase accepts them.

One step is left, and it can only be done in the Supabase dashboard:

**Supabase dashboard** → project **SDA** → Authentication → Sign In / Providers → **Third-party auth** → Add provider → **Clerk** → enter `glad-tiger-2142.clerk.accounts.dev`.

Until that is done, signing in works but the app shows "Can't reach your account".

Before a public release, create a Clerk production instance, put its `pk_live_` key in `.env`, and add its domain to Supabase the same way.

## Database

The schema lives in the Supabase project `SDA` under tables named `community_*`. `supabase/migrations/` holds all of it, in order: the base tables, then versions 2, 3 and 4. Applied to an empty project, those four files rebuild the database.

Every table has row-level security keyed on the Clerk user id (`auth.jwt()->>'sub'`), and nothing is readable without signing in. The rules the app promises are enforced in the database, not only in the app:

- A chat's messages can be read and written only by its two people.
- Close friends stories are visible only to the author and the people on the author's list, and nobody can find out whose list they are on.
- Blocking works both ways: neither person sees the other's posts, stories, highlights or comments, and neither can follow, like, comment on or message the other.
- Saved posts, saved replies, block lists, who viewed a post, and dashboard numbers are private to their owner.
- Stories stop being readable by others after 24 hours; the author keeps them in the archive.

Media is stored in the public `community-media` bucket, in a folder per user that only that user can upload to, list or delete from. Each file has a long random address. A file is not listed anywhere public, but anyone who is given its address can open it; that includes photos and voice messages sent in chats. Making those truly private would mean a private bucket with signed addresses.

Two things worth doing in the Supabase dashboard before a public release: turn off email sign-ups under Authentication (the app signs people in through Clerk, so Supabase's own sign-up should not be open), and keep the service role key out of the app and this repository.

## Run it on your computer

```
npm install
npx expo start
```

Sign-in needs a development build or a TestFlight build; it does not run in Expo Go.

## TestFlight builds

Every push to the `community-app` branch runs the **Community TestFlight (Xcode)** workflow:

1. A Linux job installs packages, type-checks, and bundles the app. If the app does not bundle, the Mac is never started.
2. A GitHub Mac runs `expo prebuild`, compiles the app once with Xcode, signs it, and uploads it to App Store Connect as the next build of the existing app `Kojo.SDAAPPGEMINI` (team `QRMLKZR9B8`).

Signing uses what is already stored on the `main` branch of this repository: the App Store Connect key, the Apple Distribution certificate with its private key, and the App Store provisioning profile for `Kojo.SDAAPPGEMINI` (certificate and profile are valid until September 2027). If Apple refuses those, the script falls back to a certificate that Xcode manages in the cloud. Keep this repository private: anyone who can read `main` can sign and upload as this team.

Logs from each run are saved to the `community-build-logs` branch; `status.txt` there ends with a `RESULT:` line. Apple emails you when a build has finished processing, usually 10 to 30 minutes after upload.

Pushes that only change this README or `supabase/` do not start a build. GitHub charges Mac minutes at ten times the normal rate on a private repository, so one build uses roughly 250 to 400 of the account's monthly minutes.

If a run shows "The job was not started because your account is locked due to a billing issue", nothing in this repository is wrong: GitHub will not start any job for the account until the billing problem is cleared under GitHub → Settings → Billing and licensing. Then open the failed run in the Actions tab and choose "Re-run all jobs".

To build on your own Mac instead: `npm install`, `npx expo prebuild --platform ios`, open `ios/Community.xcworkspace` in Xcode, then Product → Archive → Distribute App → TestFlight.

## Notes

- The app is iPhone-only and dark-only by design.
- There is no `package-lock.json` yet, because one can only be generated where npm can reach the internet. The Linux job saves the lock file it produces to the logs branch; copying that file into the repository makes later builds repeatable.
- Post and profile links use the `community://` scheme and open inside the app.
- For public App Store release, Apple also expects a privacy policy URL and a support contact. The in-app report, block and delete-account features it requires for apps with user content are already built.
