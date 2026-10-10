import Constants from 'expo-constants';
import { initStripe, isPlatformPaySupported } from '@stripe/stripe-react-native';
import { fetchPaymentsConfig } from './api';
import type { BillingStatus, PaymentsConfig } from './types';

/**
 * Stripe in the app. The publishable key comes from the payments function, so switching payments on
 * (or from test to live keys) needs no new build. Apple Pay additionally needs the merchant id built
 * into the app (app.json → expo.extra.applePayMerchantId, and the same id in the Stripe plugin), so
 * it only appears once both are set and match the server's.
 */
let ready: Promise<PaymentsConfig> | null = null;
let initialisedWith = '';
// The last config that arrived for this account, so a screen can draw at once while it asks again.
let last: PaymentsConfig | null = null;
// Bumped when another account is put in use: an answer still on its way belongs to the one before.
let generation = 0;

/** The merchant id this build was made with ('' when Apple Pay is not built in). */
export const BUILT_MERCHANT_ID: string = (Constants.expoConfig?.extra as { applePayMerchantId?: string } | undefined)?.applePayMerchantId ?? '';

/** Fetches the config once and starts Stripe with it. Call again with `fresh` to re-read the status. */
export async function ensureStripe(fresh = false): Promise<PaymentsConfig> {
  if (!ready || fresh) {
    const asked = generation;
    const loading = fetchPaymentsConfig().then(async (config) => {
      if (config.ready && config.publishable_key && initialisedWith !== config.publishable_key) {
        await initStripe({
          publishableKey: config.publishable_key,
          merchantIdentifier: BUILT_MERCHANT_ID || undefined,
          urlScheme: 'community',
        });
        initialisedWith = config.publishable_key;
      }
      if (asked === generation) last = config;
      return config;
    });
    // A failure must not stick: the next call tries again.
    loading.catch(() => {
      if (ready === loading) ready = null;
    });
    ready = loading;
  }
  return ready;
}

/** The config from the last answer (prices and this account's billing), or null before the first. Ask again with ensureStripe(true). */
export function lastPaymentsConfig(): PaymentsConfig | null {
  return last;
}

/** Which account the answers are for now. Read before asking the server for a change, then handed to rememberBilling. */
export function paymentsAccount(): number {
  return generation;
}

/**
 * Billing that has just changed (paid, cancelled, resumed), kept with the config so the next screen starts from it.
 * `asked` is paymentsAccount() from before the change was asked for: an answer that arrives after another account
 * was put in use belongs to the one before, so it is dropped rather than shown as the new account's.
 */
export function rememberBilling(b: BillingStatus, asked: number) {
  if (!last || asked !== generation) return;
  last = { ...last, status: b.status, current_period_end: b.current_period_end, cancel_at_period_end: b.cancel_at_period_end, has_customer: b.has_customer, plan: b.plan, trial_available: b.trial_available, needs_card: b.needs_card };
}

/** Another account is now in use: the config carries its billing status, so it is asked for again. Stripe stays started. */
export function forgetPayments() {
  generation++;
  ready = null;
  last = null;
}

/** True when Apple Pay can be offered: built in, set up on the server, and supported on this phone. */
export async function applePayAvailable(config: PaymentsConfig): Promise<boolean> {
  if (!BUILT_MERCHANT_ID || config.apple_merchant_id !== BUILT_MERCHANT_ID) return false;
  try {
    return await isPlatformPaySupported();
  } catch {
    return false;
  }
}

/** "£4.99" from pence and a currency code. A missing amount or currency shows as nothing in pounds, never "NaN". */
export function money(pence: number, currency: string | null = 'GBP'): string {
  const code = (currency || 'GBP').toUpperCase();
  const amount = Number.isFinite(pence) ? pence : 0;
  const symbol = ({ GBP: '£', USD: '$', EUR: '€' } as Record<string, string>)[code];
  const n = (Math.abs(amount) / 100).toFixed(2);
  return `${amount < 0 ? '−' : ''}${symbol ?? code + ' '}${n}`;
}

const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', diners: 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay', Visa: 'Visa', MasterCard: 'Mastercard', AmericanExpress: 'American Express' };
export const brandName = (brand: string) => BRANDS[brand] ?? (brand ? brand[0].toUpperCase() + brand.slice(1) : 'Card');
