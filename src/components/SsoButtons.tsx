import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSSO } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { SvgXml } from 'react-native-svg';
import { C, errText } from '../lib/theme';

// Finishes a sign-in that came back to the app through its link, if one did.
WebBrowser.maybeCompleteAuthSession();

const APPLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff"><path d="M16.37 12.74c.02 2.6 2.28 3.47 2.3 3.48-.02.06-.36 1.24-1.19 2.45-.72 1.05-1.46 2.1-2.63 2.12-1.15.02-1.52-.68-2.84-.68-1.31 0-1.72.66-2.81.7-1.13.04-1.99-1.14-2.71-2.18-1.48-2.14-2.61-6.05-1.09-8.69.75-1.31 2.1-2.14 3.56-2.16 1.11-.02 2.16.75 2.84.75.68 0 1.95-.93 3.29-.79.56.02 2.13.23 3.14 1.7-.08.05-1.87 1.09-1.86 3.3zM14.2 5.6c.6-.73 1.01-1.75.9-2.76-.87.03-1.92.58-2.54 1.3-.56.64-1.05 1.68-.92 2.67.97.07 1.96-.49 2.56-1.21z"/></svg>`;
const GOOGLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.46a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.56-5.17 3.56-8.66z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.29 14.3A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.57.38-2.3V6.6H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l4.01-3.1z"/><path fill="#EA4335" d="M12 4.76c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.95 1.2 15.24 0 12 0A12 12 0 0 0 1.28 6.6l4.01 3.1C6.23 6.87 8.88 4.76 12 4.76z"/></svg>`;

type Strategy = 'oauth_apple' | 'oauth_google';

/**
 * "Continue with Apple" and "Continue with Google". Both go through Clerk, which opens the
 * provider in a browser sheet and comes back to the app. A new person gets an account on the way.
 */
export function SsoButtons({ onError }: { onError: (message: string) => void }) {
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const [busy, setBusy] = useState<Strategy | null>(null);

  // Lets the browser sheet open faster on Android; a no-op on iOS.
  useEffect(() => {
    WebBrowser.warmUpAsync().catch(() => {});
    return () => {
      WebBrowser.coolDownAsync().catch(() => {});
    };
  }, []);

  async function go(strategy: Strategy) {
    if (busy) return;
    setBusy(strategy);
    try {
      const { createdSessionId, setActive, signUp } = await startSSOFlow({ strategy, redirectUrl: AuthSession.makeRedirectUri({ scheme: 'community' }) });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        // Adding a second account keeps these pages reachable while signed in, so go home by hand.
        router.replace('/');
        return;
      }
      const missing = (signUp as any)?.missingFields as string[] | undefined;
      if (missing?.length) onError(`Sign-up also needs: ${missing.join(', ')}. Ask the app owner to turn those requirements off in Clerk.`);
      else onError('That sign-in did not finish. Try again, or use your email.');
    } catch (e) {
      const text = errText(e);
      // Closing the sheet is not a problem worth a message.
      if (!/cancel|dismiss/i.test(text)) onError(text);
    } finally {
      setBusy(null);
    }
  }

  const button = (strategy: Strategy, label: string, xml: string) => (
    <Pressable
      onPress={() => go(strategy)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: busy === strategy }}
      style={({ pressed }) => ({ height: 48, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: pressed || (busy && busy !== strategy) ? 0.6 : 1 })}>
      {busy === strategy ? <ActivityIndicator color="#fff" /> : <SvgXml xml={xml} width={20} height={20} />}
      <Text style={{ color: C.fg, fontWeight: '600', fontSize: 15.5 }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.14)' }} />
        <Text style={{ color: C.fg2, fontSize: 13 }}>or</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.14)' }} />
      </View>
      {button('oauth_apple', 'Continue with Apple', APPLE)}
      {button('oauth_google', 'Continue with Google', GOOGLE)}
    </View>
  );
}
