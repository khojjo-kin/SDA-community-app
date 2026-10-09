import * as SplashScreen from 'expo-splash-screen';

/**
 * A deadline for the native launch image.
 *
 * Normally the router takes the launch image down as soon as the first screen is ready, well
 * under a second. If that has not happened after 1.5 seconds — because the first screen could
 * not be drawn, or because the native dismissal did not take — it is taken down from here. This
 * module is the first thing the entry point loads, before any part of the app, so a fault inside
 * the app cannot stop it from running. Both forms of the call are used, since the native side has
 * been seen to ignore one of them on some devices.
 */
function takeDownLaunchImage() {
  try {
    // The synchronous form exists on recent versions; the cast keeps older type definitions happy.
    (SplashScreen as unknown as { hide?: () => void }).hide?.();
  } catch {
    // Fall through to the async form.
  }
  SplashScreen.hideAsync().catch(() => {});
}

setTimeout(takeDownLaunchImage, 1500);
setTimeout(takeDownLaunchImage, 4000);
