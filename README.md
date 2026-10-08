# Community

A photo and video sharing app for iPhone: feed, stories, reels, direct messages, search, profiles and notifications.

- **App:** Expo (React Native) with Expo Router, in `app/` and `src/`
- **Sign-in:** Clerk (email and password, with email codes)
- **Data and media:** Supabase (Postgres with row-level security, Storage, Realtime), project `SDA`
- **Builds:** EAS Build, submitted to TestFlight

## What works

| Area | Details |
| --- | --- |
| Accounts | Sign up, email verification, log in, password reset, profile setup, edit profile, log out, delete account |
| Feed | Posts from people you follow, pull to refresh, endless scroll, double-tap to like, like, comment, repost, save, share, report, block |
| Posts | Up to 10 photos in a swipeable carousel, or one video (a reel) up to 60 seconds, with a caption |
| Stories | Add a photo story, 24-hour expiry, tap and hold controls, seen counts, reply by message, delete |
| Reels | Full-screen vertical video feed, tap to pause, double-tap to like, Friends tab |
| Messages | One-to-one chats with text, photos, hearts and shared posts, unread badges, live updates |
| Search | Find people by name or username, explore grid of recent posts, saved posts and likes |
| Profile | Posts, reels and reposts tabs, followers and following lists, follow and message buttons |
| Activity | Likes, comments, reposts and new followers, with follow back |

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

The schema lives in the Supabase project `SDA` under tables named `community_*`. Changes are in `supabase/migrations/`. Every table has row-level security keyed on the Clerk user id (`auth.jwt()->>'sub'`). Media is stored in the public `community-media` bucket, in a folder per user.

## Run it on your computer

```
npm install
npx expo start
```

Sign-in needs a development build or a TestFlight build; it does not run in Expo Go.

## First TestFlight build

Do this once from a computer, signed in to your Expo account:

```
npm install
npx eas-cli login
npx eas-cli init          # links the folder to an Expo project named "community"
npx eas-cli build --platform ios --profile production --auto-submit
```

EAS asks to sign in to your Apple Developer account, then creates the bundle identifier `com.khojokin.community`, the signing certificate, the provisioning profile and the App Store Connect app record. When the build finishes it is uploaded to TestFlight, and Apple emails you once it has been processed (usually 10 to 30 minutes).

After `eas init`, commit the `extra.eas.projectId` it adds to `app.json`.

## Later builds from GitHub

Once the first build has gone through, add a repository secret named `EXPO_TOKEN` and run the **TestFlight** workflow from the Actions tab, or push a tag such as `v1.0.1`.

## Notes

- The app is iPhone-only and dark-only by design.
- Post and profile links use the `community://` scheme and open inside the app.
- For public App Store release, Apple also expects a privacy policy URL and a support contact. The in-app report, block and delete-account features it requires for apps with user content are already built.
