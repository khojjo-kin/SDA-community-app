// The app's entry point. It starts Expo Router exactly the way `expo-router/entry` does, with one
// addition: the root is wrapped in StartupGuard, so a failure before the first screen appears is
// shown on the phone instead of leaving the launch image up with no explanation.
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
