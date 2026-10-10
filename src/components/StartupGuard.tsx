import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

/**
 * Wraps the whole app at the very root, outside the router.
 *
 * In a release build, Expo Router has no screen for a failure that happens before the first
 * route appears: the launch image simply stays up, and the person can't tell whether the app is
 * slow, broken, or offline. This component makes every such failure visible. It catches anything
 * thrown while the app starts and says so (printing the error itself on screen only in development
 * builds); it shows a waiting screen if the first screen
 * suspends; and if nothing has taken the launch image down after a few seconds, it takes it down
 * itself so that whatever is on screen can be seen.
 *
 * Deliberately depends on nothing but React, React Native and the splash screen module, so a
 * fault anywhere else in the app cannot stop it from reporting that fault. The deadline that
 * takes the launch image down when nothing else has lives in launch-deadline.ts, which the entry
 * point loads before anything else.
 */

const BG = '#0b1014';
const FG = '#f4f6f8';
const FG2 = 'rgba(244,246,248,0.72)';
const FG3 = 'rgba(244,246,248,0.5)';

function show() {
  SplashScreen.hideAsync().catch(() => {});
}

function describe(error: unknown): { title: string; detail: string } {
  if (error instanceof Error) {
    const stack = (error.stack ?? '')
      .split('\n')
      .filter((l) => l.trim() && !l.includes(error.message))
      .slice(0, 14)
      .join('\n');
    return { title: `${error.name}: ${error.message}`, detail: stack };
  }
  try {
    return { title: String(error), detail: JSON.stringify(error, null, 2) ?? '' };
  } catch {
    return { title: 'Unknown error', detail: '' };
  }
}

function Frame({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: BG, paddingTop: 72, paddingHorizontal: 24, paddingBottom: 32 }}>{children}</View>;
}

/** Shown if the first screen suspends, so a never-ending wait is at least a visible one. */
function Waiting() {
  React.useEffect(show, []);
  return (
    <Frame>
      <Text style={{ color: FG, fontSize: 20, fontWeight: '800' }}>Community is starting</Text>
      <Text style={{ color: FG2, marginTop: 10, lineHeight: 21 }}>This is taking longer than usual. If it stays here, close the app and open it again.</Text>
    </Frame>
  );
}

function Failed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  // The error and its stack are for developers: shown in development builds only. A release build
  // says what to do instead (the console still gets the error, from componentDidCatch).
  if (!__DEV__) {
    return (
      <Frame>
        <Text style={{ color: FG, fontSize: 20, fontWeight: '800' }}>Community couldn't start</Text>
        <Text style={{ color: FG2, marginTop: 10, lineHeight: 21 }}>Something went wrong before the first screen could appear. Try again, and if it keeps happening, close Community and open it again.</Text>
        <View style={{ flex: 1 }} />
        <Retry onPress={onRetry} />
      </Frame>
    );
  }
  const { title, detail } = describe(error);
  return (
    <Frame>
      <Text style={{ color: FG, fontSize: 20, fontWeight: '800' }}>Community couldn't start</Text>
      <Text style={{ color: FG2, marginTop: 10, lineHeight: 21 }}>Something went wrong before the first screen could appear. The details below will help fix it.</Text>
      <ScrollView style={{ flex: 1, marginTop: 20, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' }} contentContainerStyle={{ padding: 14 }}>
        <Text selectable style={{ color: FG, fontWeight: '700', lineHeight: 20 }}>{title}</Text>
        {detail ? <Text selectable style={{ color: FG3, fontFamily: 'Menlo', fontSize: 11, lineHeight: 16, marginTop: 10 }}>{detail}</Text> : null}
      </ScrollView>
      <Retry onPress={onRetry} />
    </Frame>
  );
}

function Retry({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ marginTop: 16, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? '#2a3440' : '#1a222c' })}
    >
      <Text style={{ color: FG, fontWeight: '700', fontSize: 16 }}>Try again</Text>
    </Pressable>
  );
}

type State = { error: unknown; attempt: number };

export class StartupGuard extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    show();
    console.error('[startup] the app could not render its first screen', error, info?.componentStack ?? '');
  }

  render() {
    if (this.state.error) {
      return <Failed error={this.state.error} onRetry={() => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))} />;
    }
    return (
      <React.Suspense fallback={<Waiting />}>
        <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>
      </React.Suspense>
    );
  }
}
