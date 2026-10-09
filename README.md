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
npm ci
npx expo start
```

Sign-in needs a development build or a TestFlight build; it does not run in Expo Go.

## Build and submit to TestFlight with Xcode

The iOS app is built and uploaded from Xcode (not EAS). On a Mac with Xcode and CocoaPods installed:

```
npm ci
npx expo prebuild --platform ios
npx pod-install
open ios/Community.xcworkspace
```

In Xcode, select the **Community** scheme and an iOS device destination. Under the app target's **Signing & Capabilities**, select the Apple Developer team that owns `com.sdacommunity.app`, and enable automatic signing. Choose **Product → Archive**. In Organizer, select the archive, choose **Distribute App → App Store Connect → Upload**, and complete the upload. Apple processes the build before it appears in TestFlight.

The app's iOS bundle identifier is `com.sdacommunity.app`, matching the existing **SDA Community Gemini** App Store Connect record; its on-device display name remains **Community**. The local `.env` supplies the Expo public Supabase and Clerk values during the Xcode build. Keep `.env` on the developer machine; it is ignored by Git.

The Supabase client sends the signed-in Clerk session token to project `SDA`. Enable **Authentication → Sign In / Providers → Third-party auth → Clerk** in the Supabase dashboard and set the Clerk domain to `glad-tiger-2142.clerk.accounts.dev`.

## Notes

- The app is iPhone-only and dark-only by design.
- Post and profile links use the `community://` scheme and open inside the app.
- For public App Store release, Apple also expects a privacy policy URL and a support contact. The in-app report, block and delete-account features it requires for apps with user content are already built.
