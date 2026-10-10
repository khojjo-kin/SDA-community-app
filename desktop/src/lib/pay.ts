// Paying on the desktop: the payments function starts a payment (an ad, a donation, a creator
// subscription, Plus) and hands back a client secret; this confirms it with Stripe's own card form
// (Stripe.js, loaded from Stripe), the web counterpart of the iPhone's payment sheet. The demo build
// shows a sample form and no money moves.
import { fetchPaymentsConfig } from 'shared/api';
import type { PaymentsConfig } from 'shared/types';

declare const __DEMO__: boolean;

export type PayRequest = {
  /** What is being paid for, as a heading: "Promote your post for 3 days". */
  title: string;
  /** A line under the heading: renewal terms, who receives a donation. */
  detail?: string;
  amountPence: number;
  currency: string;
  /** From the payments function. */
  clientSecret: string;
  /** 'setup' saves a card for later (a free trial); 'payment' takes the money now. */
  intent?: 'payment' | 'setup';
  /** The button: "Pay £3.00", "Start free week". */
  action?: string;
};

type Pending = PayRequest & { resolve: (ok: boolean) => void };

let pending: Pending | null = null;
const listeners = new Set<() => void>();

/** Opens the payment dialog. Resolves true once Stripe confirms, false if it is closed. */
export function confirmPay(req: PayRequest): Promise<boolean> {
  return new Promise((resolve) => {
    pending?.resolve(false);
    pending = { ...req, resolve };
    listeners.forEach((l) => l());
  });
}

export function currentPay(): Pending | null {
  return pending;
}

export function finishPay(ok: boolean) {
  const p = pending;
  pending = null;
  listeners.forEach((l) => l());
  p?.resolve(ok);
}

export function onPayChange(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** "£4.99" from pence and a currency code. */
export function money(pence: number, currency = 'GBP'): string {
  const symbol = ({ GBP: '£', USD: '$', EUR: '€' } as Record<string, string>)[currency.toUpperCase()];
  const n = (Math.abs(pence) / 100).toFixed(2);
  return `${pence < 0 ? '−' : ''}${symbol ?? currency.toUpperCase() + ' '}${n}`;
}

/* ---------- Stripe.js ---------- */

declare global {
  interface Window {
    Stripe?: any;
  }
}

let config: Promise<PaymentsConfig> | null = null;
let stripeLoad: Promise<any> | null = null;

/** The payments function's settings (publishable key, prices, whether payments are switched on). */
export function paymentsConfig(fresh = false): Promise<PaymentsConfig> {
  if (!config || fresh) {
    const c = fetchPaymentsConfig();
    c.catch(() => {
      if (config === c) config = null;
    });
    config = c;
  }
  return config;
}

/** Stripe, started with the app's publishable key. */
export async function stripe(): Promise<any> {
  if (__DEMO__) return null;
  const c = await paymentsConfig();
  if (!c.ready || !c.publishable_key) throw new Error('Payments are not switched on yet.');
  if (!stripeLoad) {
    stripeLoad = new Promise((resolve, reject) => {
      if (window.Stripe) return resolve(window.Stripe(c.publishable_key));
      const s = document.createElement('script');
      s.src = 'https://js.stripe.com/v3/';
      s.async = true;
      s.onload = () => resolve(window.Stripe(c.publishable_key));
      s.onerror = () => {
        stripeLoad = null;
        reject(new Error('Could not reach Stripe. Check your internet connection.'));
      };
      document.head.appendChild(s);
    });
  }
  return stripeLoad;
}
