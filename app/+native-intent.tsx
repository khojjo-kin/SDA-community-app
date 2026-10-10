import { handleURLCallback } from '@stripe/stripe-react-native';

/**
 * Links that open the app go through here before the router sees them.
 *
 * A card that needs the bank's check (3-D Secure) can send the member to their bank's app or page,
 * which then returns to the app with community://safepay/…. That link is Stripe's, not a screen: it
 * is handed to Stripe so the payment carries on, and the member stays where they were (the router
 * would otherwise open "This page isn't available").
 */
export async function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): Promise<string> {
  if (/^community:\/\/(safepay|stripe-redirect)/i.test(path)) {
    try {
      await handleURLCallback(path);
    } catch {
      // Nothing more to do: the payment screen says what happened when it hears back.
    }
    // Nowhere to go: '' leaves the screen as it is (or opens Home if the app was started by it).
    return initial ? '/' : '';
  }
  return path;
}
