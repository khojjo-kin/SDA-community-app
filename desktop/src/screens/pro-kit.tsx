// Pieces shared by the Professional dashboard, Plus, the tick application and fundraisers: menus,
// saved-card helpers, the renewal terms line, progress bars, the pay dialog wrapper, paying with a
// saved card, and opening posts from the dashboard's grids.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { FriendlyError } from 'shared/theme';
import { dateLocale, languageCode, t, tSplit } from '../lib/i18n';
import { confirmPay, money, type PayRequest, stripe } from '../lib/pay';
import { nav } from '../lib/router';
import { Icon, Link, toast, useOutside } from '../ui/kit';
import '../styles/pro.css';

declare const __DEMO__: boolean;

/* ---------- paying ---------- */

/**
 * Opens the app's card payment dialog (src/ui/paysheet.tsx) and resolves true once the payment, or the
 * saved card, is confirmed. The demo's stand-in for Stripe is told too, so a card added there shows up.
 */
export async function pay(req: PayRequest): Promise<boolean> {
  const ok = await confirmPay(req);
  if (ok) (globalThis as any).__demoConfirmed?.(req.clientSecret);
  return ok;
}

/**
 * Confirms a payment (or a card for after a free week) with a card already saved on the member's
 * Stripe customer, as the iPhone's checkout does: no card form; Stripe shows the bank's own check if
 * one is needed. Throws with Stripe's reason when it doesn't go through.
 */
export async function payWithSavedCard(clientSecret: string, cardId: string, intent: 'payment' | 'setup' = 'payment'): Promise<void> {
  if (__DEMO__) {
    // The demo's stand-in for Stripe takes the saved card as it is.
    await new Promise((r) => setTimeout(r, 500));
    (globalThis as any).__demoConfirmed?.(clientSecret);
    return;
  }
  const s = await stripe();
  const res = intent === 'setup' ? await s.confirmCardSetup(clientSecret, { payment_method: cardId }) : await s.confirmCardPayment(clientSecret, { payment_method: cardId });
  if (res?.error) throw new FriendlyError(res.error.message || t('d.pro.paymentFailed'));
}

/** Opens a Stripe page (payout setup, the payout dashboard) in the browser. */
export function openExternal(url: string) {
  if (__DEMO__) {
    toast(t('d.pro.demoStripe'));
    return;
  }
  window.open(url, '_blank', 'noopener');
}

/** Copies text to the clipboard, falling back to the old way where the clipboard API is not allowed. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const done = document.execCommand('copy');
      area.remove();
      return done;
    } catch {
      return false;
    }
  }
}

/* ---------- opening posts from the dashboard ---------- */

/**
 * Opens a post from one of the dashboard's grids or tables, as grids do everywhere (src/lib/grid-open.ts
 * on the iPhone): a Short in the Shorts player, anything else in the post dialog with the rest of the
 * list, so its arrows step through it. The dashboard provides the dialog; elsewhere the post's page opens.
 */
export type OpenPost = (id: string, list?: string[]) => void;
export const OpenPostContext = createContext<OpenPost>((id) => nav('/p/' + id));

export function useOpenPost() {
  const open = useContext(OpenPostContext);
  return (post: { id: string; kind?: string }, list?: string[]) => (post.kind === 'reel' ? nav('/shorts/' + post.id) : open(post.id, list));
}

/* ---------- words and dates ---------- */

// English keeps its own month names ("9 Sep"): the browser's British English says "Sept". Other
// languages write the date the browser's way for that language.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function dayText(iso: string | Date | null | undefined, month: 'long' | 'short'): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const otherYear = d.getFullYear() !== new Date().getFullYear();
  if (languageCode() !== 'en') return d.toLocaleDateString(dateLocale(), { day: 'numeric', month, ...(otherYear ? { year: 'numeric' } : {}) });
  const name = month === 'long' ? MONTHS[d.getMonth()] : MONTHS[d.getMonth()].slice(0, 3);
  return `${d.getDate()} ${name}${otherYear ? ' ' + d.getFullYear() : ''}`;
}

/** "9 November", with the year when it is not this year. */
export function longDay(iso: string | Date | null | undefined): string {
  return dayText(iso, 'long');
}

/** "9 Nov", with the year when it is not this year. */
export function shortDay(iso: string | Date | null | undefined): string {
  return dayText(iso, 'short');
}

/** The words under one-off payments (ads, gifts), as on the iPhone. */
export const oneOff = (amount: string) => t('legal.oneOff', { amount });

/* ---------- saved cards ---------- */

const BRAND_NAMES: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', diners: 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay' };
/** As on the iPhone: "Visa", "Mastercard", "American Express". */
export const brandName = (brand: string) => BRAND_NAMES[(brand || '').toLowerCase()] ?? (brand ? brand[0].toUpperCase() + brand.slice(1) : t('d.pro.card'));

/** "Visa •••• 4242", or "Apple Pay · Visa •••• 4242" for a card saved from Apple Pay. */
export function cardTitle(card: { brand: string; last4: string; wallet?: string | null }): string {
  const wallet = card.wallet === 'apple_pay' ? 'Apple Pay · ' : card.wallet === 'google_pay' ? 'Google Pay · ' : '';
  return `${wallet}${brandName(card.brand)} •••• ${card.last4}`;
}

/** "08/28". */
export function expiryLabel(month: number, year: number): string {
  if (!month || !year) return '';
  return `${String(month).padStart(2, '0')}/${String(year % 100).padStart(2, '0')}`;
}

/** True once the last day of the card's expiry month has passed. */
export function isExpired(month: number, year: number): boolean {
  if (!month || !year) return false;
  const full = year < 100 ? 2000 + year : year;
  const now = new Date();
  return full < now.getFullYear() || (full === now.getFullYear() && month < now.getMonth() + 1);
}

const CHIP_TEXT: Record<string, string> = { visa: 'VISA', mastercard: 'MC', amex: 'AMEX', discover: 'DISC' };

/** A small card in the app's green, for lists of saved cards. */
export function CardChip({ brand }: { brand: string }) {
  const short = CHIP_TEXT[(brand || '').toLowerCase()];
  return <span className={'pro-chipcard' + (brand === 'visa' ? ' visa' : '')}>{short ?? <Icon name="card" size={16} />}</span>;
}

/* ---------- fundraisers ---------- */

/** How far along a fundraiser is, from 0 to 1. */
export function progressOf(f: { raised_pence: number; goal_pence: number }): number {
  return f.goal_pence > 0 ? Math.min(1, Math.max(0, f.raised_pence / f.goal_pence)) : 0;
}

/** True once a fundraiser has been ended by its owner or its end date has passed. */
export function hasEnded(f: { status: string; ends_at: string | null }): boolean {
  return f.status === 'closed' || (!!f.ends_at && new Date(f.ends_at) <= new Date());
}

/**
 * Pence from an amount typed in pounds ("25", "£12.50", "1,250"), as on the iPhone. A comma with at
 * most two digits after it at the end is the decimal mark. Null when it is not an amount.
 */
export function penceFrom(text: string): number | null {
  const m = /^(.*?)(?:([.,])(\d{0,2}))?$/.exec(text.replace(/[£\s]/g, ''));
  if (!m) return null;
  const [, whole, mark, decimals = ''] = m;
  const grouped = mark === ',' ? /^\d{1,3}(\.\d{3})+$/ : /^\d{1,3}(,\d{3})+$/;
  if (!/^\d+$/.test(whole) && !grouped.test(whole)) return null;
  return Number(whole.replace(/[.,]/g, '')) * 100 + Number(decimals.padEnd(2, '0'));
}

/** A thin bar in the accent colour. Any gift shows at least a sliver. */
export function ProgressBar({ value, height = 8 }: { value: number; height?: number }) {
  const pct = value > 0 ? Math.max(2, Math.round(value * 100)) : 0;
  return (
    <div className="pro-progress" style={{ height }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <i style={{ width: pct + '%' }} />
    </div>
  );
}

/** A wrapped gift, for fundraisers (the icon set has none). */
export function GiftIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="8.5" width="17" height="4" rx="1" />
      <path d="M5 12.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7.5M12 8.5V21" />
      <path d="M12 8.5C10.5 5 7 4.3 7 6.3c0 1.6 2.4 2.2 5 2.2ZM12 8.5c1.5-3.5 5-4.2 5-2.2 0 1.6-2.4 2.2-5 2.2Z" />
    </svg>
  );
}

/* ---------- controls ---------- */

/** An on/off switch with the app's look. */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={'pro-switch' + (on ? ' on' : '')} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

export type DropItem<T extends string> = { value: T; label: string; hint?: string };

/**
 * A pill that opens a small menu below it: "All ads ▾". With `multi`, items are checkboxes and the menu
 * stays open; otherwise choosing one closes it.
 */
export function Dropdown<T extends string>({ label, icon, items, value, onChange, multi, chosen, onToggle, align = 'left', className, menuLabel, active, tip }: {
  label: string;
  icon?: React.ReactNode;
  items: DropItem<T>[];
  value?: T;
  onChange?: (v: T) => void;
  multi?: boolean;
  chosen?: T[];
  onToggle?: (v: T) => void;
  align?: 'left' | 'right';
  className?: string;
  menuLabel?: string;
  /** Drawn as the selected tab. */
  active?: boolean;
  /** A hint that shows under the pill on hover while the menu is closed. */
  tip?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useOutside(box, () => setOpen(false), open);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open]);
  return (
    <div className={'pro-drop ' + (className ?? '')} ref={box}>
      <button type="button" className={'pro-pill' + (open ? ' open' : '') + (active ? ' on' : '')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}
        <span>{label}</span>
        {icon ? null : <Icon name="down" size={16} stroke={2} />}
      </button>
      {tip && !open ? (
        <span className="pro-tip" role="tooltip">
          {tip}
        </span>
      ) : null}
      {open ? (
        <div className={'pro-menu ' + align} role="menu" aria-label={menuLabel ?? label}>
          {items.map((it) =>
            multi ? (
              <button key={it.value} type="button" role="menuitemcheckbox" aria-checked={!!chosen?.includes(it.value)} onClick={() => onToggle?.(it.value)}>
                <span className={'pro-check' + (chosen?.includes(it.value) ? ' on' : '')}>{chosen?.includes(it.value) ? <Icon name="check" size={13} stroke={3} /> : null}</span>
                <span className="grow">{it.label}</span>
              </button>
            ) : (
              <button
                key={it.value}
                type="button"
                role="menuitemradio"
                aria-checked={value === it.value}
                onClick={() => {
                  setOpen(false);
                  onChange?.(it.value);
                }}
              >
                <span className="grow">
                  {it.label}
                  {it.hint ? <em>{it.hint}</em> : null}
                </span>
                {value === it.value ? <Icon name="check" size={16} stroke={2.4} /> : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- subscriptions ---------- */

/**
 * The terms of a subscription in one line beside the button that starts it, as on the iPhone: the
 * price and how often (after a free week if there is one), that it renews by itself, and the Terms.
 */
export function RenewalTerms({ pricePence, currency, cadence, trialDays = 0, freeUntil = '' }: { pricePence: number; currency: string; cadence: 'month' | 'year'; trialDays?: number; freeUntil?: string }) {
  const head = priceTerms(pricePence, currency, cadence, trialDays, freeUntil);
  const [before, after] = tSplit('legal.renewLine', 'terms');
  return (
    <p className="pro-terms">
      <b>{head}</b> · {before}
      <Link to="/legal/terms" className="pro-terms-link">
        {t('legal.termsLink')}
      </Link>
      {after}
    </p>
  );
}

/** "£4.99 a month", "Free for 7 days, then £49.99 a year" or "Free until 17 October, then £4.99 a month", as on the iPhone. */
function priceTerms(pricePence: number, currency: string, cadence: 'month' | 'year', trialDays = 0, freeUntil = ''): string {
  const price = money(pricePence, currency);
  const year = cadence === 'year';
  if (freeUntil) return t(year ? 'legal.freeUntilYearly' : 'legal.freeUntilMonthly', { day: freeUntil, price });
  if (trialDays > 0) return t(year ? 'legal.trialYearly' : 'legal.trialMonthly', { days: trialDays, price });
  return t(year ? 'legal.priceYearly' : 'legal.priceMonthly', { price });
}

/** Words for the renewal terms, for the pay dialog's line under its heading. */
export function renewalText(pricePence: number, currency: string, cadence: 'month' | 'year', trialDays = 0): string {
  return t('d.pro.renewalText', { cost: priceTerms(pricePence, currency, cadence, trialDays) });
}

/** A labelled section heading with an optional link or button on the right. */
export function SectionHead({ title, children, sub }: { title: React.ReactNode; children?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="pro-section-head">
      <div>
        <h2>{title}</h2>
        {sub ? <p className="muted-text">{sub}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** A quiet notice box: info in the text colours, or a warning in the like colour. */
export function Notice({ kind = 'info', children, icon }: { kind?: 'info' | 'warn' | 'ok'; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className={'pro-notice ' + kind} role={kind === 'warn' ? 'alert' : undefined}>
      {icon ?? <Icon name={kind === 'ok' ? 'check' : 'info'} size={18} />}
      <div className="grow">{children}</div>
    </div>
  );
}
