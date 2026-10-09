import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

// Where the browser sends people back into the app after Google sign-in.
const redirectTo = makeRedirectUri({ scheme: 'community', path: 'auth-callback' });

async function sessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);
  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) throw new Error('Sign-in did not finish. Try again.');
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
}

/** Opens Google in a browser sheet. True once signed in, false if cancelled. */
export async function signInWithGoogle(): Promise<boolean> {
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
  if (error) throw error;
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return false;
  await sessionFromUrl(res.url);
  return true;
}

/** The native Apple sign-in sheet. True once signed in, false if cancelled. */
export async function signInWithApple(): Promise<boolean> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return false;
    throw e;
  }
  if (!credential.identityToken) throw new Error('Apple did not return a sign-in token. Try again.');
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
  if (error) throw error;
  // Apple only shares the name the very first time, so keep it for onboarding.
  const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
  if (name && !data.user?.user_metadata?.full_name) await supabase.auth.updateUser({ data: { full_name: name } });
  return true;
}
