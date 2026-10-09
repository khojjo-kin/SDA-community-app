// The app's entry point. It starts Expo Router exactly the way `expo-router/entry` does, with two
// additions that make sure a person is never left looking at a launch image that does not move:
// a deadline after which the launch image is taken down whatever else has happened (loaded first,
// before any part of the app, so nothing in the app can block it), and StartupGuard around the
// root, so a failure before the first screen appears is shown on the phone with its details.
import './src/lib/launch-deadline';
import '@expo/metro-runtime';
import React from 'react';
import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { StartupGuard } from './src/components/StartupGuard';

function Root() {
  return (
    <StartupGuard>
      <App />
    </StartupGuard>
  );
}

renderRootComponent(Root);
