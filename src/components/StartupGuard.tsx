import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

/**
 * Wraps the whole app at the very root, outside the router.
 *
 * In a release build, Expo Router has no screen for a failure that happens before the first
 * route appears: the launch image simply stays up, and the person can't tell whether the app is
 * slow, broken, or offline. This component makes every such failure visible. It catches anything
 * thrown while the app starts and prints it; it shows a waiting screen if the first screen
 * suspends; and if nothing has taken the launch image down after a few seconds, it takes it down
 * itself so that whatever is on screen can be seen.
 *
 * Deliberately depends on nothing but React, React Native and the splash screen module, so a
 * fault anywhere else in the app cannot stop it from reporting that fault.
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
  const { title, detail } = describe(error);
  return (
    <Frame>
      <Text style={{ color: FG, fontSize: 20, fontWeight: '800' }}>Community couldn't start</Text>
      <Text style={{ color: FG2, marginTop: 10, lineHeight: 21 }}>Something went wrong before the first screen could appear. The details below will help fix it.</Text>
      <ScrollView style={{ flex: 1, marginTop: 20, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' }} contentContainerStyle={{ padding: 14 }}>
        <Text selectable style={{ color: FG, fontWeight: '700', lineHeight: 20 }}>{title}</Text>
        {detail ? <Text selectable style={{ color: FG3, fontFamily: 'Menlo', fontSize: 11, lineHeight: 16, marginTop: 10 }}>{detail}</Text> : null}
      </ScrollView>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        style={({ pressed }) => ({ marginTop: 16, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? '#2a3440' : '#1a222c' })}
      >
        <Text style={{ color: FG, fontWeight: '700', fontSize: 16 }}>Try again</Text>
      </Pressable>
    </Frame>
  );
}

type State = { error: unknown; attempt: number };

export class StartupGuard extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, attempt: 0 };
  private watchdog: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  componentDidMount() {
    // The router normally takes the launch image down as soon as the first screen is ready. If
    // that has not happened after eight seconds, take it down anyway: a dark screen or a message
    // is something a person can act on; a launch image that never moves is not.
    this.watchdog = setTimeout(show, 8000);
  }

  componentWillUnmount() {
    if (this.watchdog) clearTimeout(this.watchdog);
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
