import Constants from 'expo-constants';
import { initStripe, isPlatformPaySupported } from '@stripe/stripe-react-native';
import { fetchPaymentsConfig } from './api';
import type { PaymentsConfig } from './types';

/**
 * Stripe in the app. The publishable key comes from the payments function, so switching payments on
 * (or from test to live keys) needs no new build. Apple Pay additionally needs the merchant id built
 * into the app (app.json → expo.extra.applePayMerchantId, and the same id in the Stripe plugin), so
 * it only appears once both are set and match the server's.
 */
let ready: Promise<PaymentsConfig> | null = null;
let initialisedWith = '';

/** The merchant id this build was made with ('' when Apple Pay is not built in). */
export const BUILT_MERCHANT_ID: string = (Constants.expoConfig?.extra as { applePayMerchantId?: string } | undefined)?.applePayMerchantId ?? '';

/** Fetches the config once and starts Stripe with it. Call again with `fresh` to re-read the status. */
export async function ensureStripe(fresh = false): Promise<PaymentsConfig> {
  if (!ready || fresh) {
    const loading = fetchPaymentsConfig().then(async (config) => {
      if (config.ready && config.publishable_key && initialisedWith !== config.publishable_key) {
        await initStripe({
          publishableKey: config.publishable_key,
          merchantIdentifier: BUILT_MERCHANT_ID || undefined,
          urlScheme: 'community',
        });
        initialisedWith = config.publishable_key;
      }
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

/** Another account is now in use: the config carries its billing status, so it is asked for again. Stripe stays started. */
export function forgetPayments() {
  ready = null;
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

/** "£4.99" from pence and a currency code. */
export function money(pence: number, currency = 'GBP'): string {
  const symbol = ({ GBP: '£', USD: '$', EUR: '€' } as Record<string, string>)[currency.toUpperCase()];
  const n = (Math.abs(pence) / 100).toFixed(2);
  return `${pence < 0 ? '−' : ''}${symbol ?? currency.toUpperCase() + ' '}${n}`;
}

const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', diners: 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay', Visa: 'Visa', MasterCard: 'Mastercard', AmericanExpress: 'American Express' };
export const brandName = (brand: string) => BRANDS[brand] ?? (brand ? brand[0].toUpperCase() + brand.slice(1) : 'Card');
