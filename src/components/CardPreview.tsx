import React from 'react';
import { Platform, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CardField, type CardFieldInput } from '@stripe/stripe-react-native';
import { t } from '../lib/i18n';
import { brandName } from '../lib/payments';
import { C } from '../lib/theme';
import { Icon } from './Icon';
import { Button, Empty } from './ui';

/**
 * The card-payment pieces shared by checkout and payment methods: a live picture of the card being
 * typed, a small card chip for lists, and the app-styled card field. None of them ever sees a full
 * card number: Stripe's field keeps it and only tells us the brand, the last four and the expiry.
 */

type BrandKey = 'visa' | 'mastercard' | 'amex' | 'discover' | 'other' | 'none';

/** One key per brand, from either the SDK's spelling ("MasterCard") or Stripe's ("mastercard"). */
function brandKey(brand?: string | null): BrandKey {
  const b = (brand ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!b || b === 'unknown' || b === 'card') return 'none';
  if (b === 'visa') return 'visa';
  if (b === 'mastercard') return 'mastercard';
  if (b === 'amex' || b === 'americanexpress') return 'amex';
  if (b === 'discover') return 'discover';
  return 'other';
}

/** The app's green running into teal, turned a little towards each brand's own colour. */
const PALETTES: Record<BrandKey, readonly [string, string, string]> = {
  none: ['#0e3b2b', '#11563f', '#0f4f52'],
  visa: ['#0d3a33', '#0f5550', '#14466c'],
  mastercard: ['#1b3d22', '#2a5630', '#57591f'],
  amex: ['#0c3940', '#0f5560', '#1a5378'],
  discover: ['#173b24', '#285634', '#62471d'],
  other: ['#103d30', '#13584a', '#145257'],
};

const SHORT: Record<BrandKey, string> = { visa: 'VISA', mastercard: 'MC', amex: 'AMEX', discover: 'DISC', other: '', none: '' };

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "08/28", or '' while the expiry is not known. Takes two- or four-digit years. */
export function expiryLabel(month?: number | null, year?: number | null): string {
  if (!month || month < 1 || month > 12 || !year) return '';
  return `${pad2(month)}/${pad2(year % 100)}`;
}

/** True once the last day of the card's expiry month has passed. */
export function isExpired(month: number, year: number): boolean {
  if (!month || !year) return false;
  const full = year < 100 ? 2000 + year : year;
  const now = new Date();
  return full < now.getFullYear() || (full === now.getFullYear() && month < now.getMonth() + 1);
}

/** "Visa •••• 4242", or "Apple Pay · Visa •••• 4242" for a card saved from Apple Pay. */
export function cardTitle(card: { brand: string; last4: string; wallet?: string | null }): string {
  const wallet = card.wallet === 'apple_pay' ? 'Apple Pay · ' : card.wallet === 'google_pay' ? 'Google Pay · ' : '';
  return `${wallet}${brandName(card.brand)} •••• ${card.last4}`;
}

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined });

/** A picture of the card, updated as the member types. Decorative copy of what the field holds. */
export function CardPreview({ brand, last4, expMonth, expYear, name, style }: { brand?: string | null; last4?: string | null; expMonth?: number | null; expYear?: number | null; name?: string | null; style?: ViewStyle }) {
  const key = brandKey(brand);
  const expiry = expiryLabel(expMonth, expYear);
  const known = key !== 'none';
  const label = `${known ? brandName(brand ?? '') : 'Card'}${last4 ? ` ending ${last4}` : ''}${expiry ? `, expires ${expiry}` : ''}`;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={[{ width: '100%', maxWidth: 360, alignSelf: 'center', aspectRatio: 1.586, borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)' }, style]}>
      <LinearGradient colors={PALETTES[key]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* A soft sheen across the top and a glow in the corner, so the card does not look flat. */}
      <LinearGradient colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.7 }} style={StyleSheet.absoluteFill} />
      <View style={{ position: 'absolute', width: 260, height: 260, borderRadius: 130, right: -110, top: -130, backgroundColor: 'rgba(79,224,138,0.10)' }} />

      <View style={{ flex: 1, padding: 20, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <LinearGradient colors={['#e4d39c', '#b39d5f']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 42, height: 31, borderRadius: 7, justifyContent: 'space-evenly', paddingVertical: 4 }}>
            <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(60,45,10,0.35)' }} />
            <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(60,45,10,0.35)' }} />
          </LinearGradient>
          {known ? (
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', fontStyle: key === 'visa' ? 'italic' : 'normal', letterSpacing: 0.4 }}>{brandName(brand ?? '')}</Text>
          ) : (
            <Icon name="card" size={26} color="rgba(255,255,255,0.7)" />
          )}
        </View>

        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: last4 ? '#fff' : 'rgba(255,255,255,0.55)', fontSize: 20, letterSpacing: 1.5, fontFamily: MONO, fontVariant: ['tabular-nums'] }}>
          {`•••• •••• •••• ${last4 || '••••'}`}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>CARDHOLDER</Text>
            <Text numberOfLines={1} style={{ color: '#fff', fontSize: 14.5, fontWeight: '600', letterSpacing: 0.6, marginTop: 2 }}>{(name || 'Your name').toUpperCase()}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>EXPIRES</Text>
            <Text style={{ color: expiry ? '#fff' : 'rgba(255,255,255,0.55)', fontSize: 14.5, fontWeight: '600', fontFamily: MONO, marginTop: 2 }}>{expiry || 'MM/YY'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** A small card in the brand's colours, for lists of saved cards. */
export function CardChip({ brand }: { brand?: string | null }) {
  const key = brandKey(brand);
  const short = SHORT[key] || (key === 'other' ? (brand ?? '').slice(0, 4).toUpperCase() : '');
  return (
    <LinearGradient colors={PALETTES[key]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 46, height: 31, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)' }}>
      {short ? <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800', fontStyle: key === 'visa' ? 'italic' : 'normal', letterSpacing: 0.3 }}>{short}</Text> : <Icon name="card" size={18} color="rgba(255,255,255,0.8)" />}
    </LinearGradient>
  );
}

/** Stripe's card field, dressed in the app's colours. UK cards ask for a postcode, so it stays on. */
export function CardInput({ onChange, disabled }: { onChange: (card: CardFieldInput.Details) => void; disabled?: boolean }) {
  return (
    <CardField
      postalCodeEnabled
      disabled={disabled}
      onCardChange={onChange}
      placeholders={{ number: '1234 1234 1234 1234', expiration: 'MM/YY', cvc: 'CVC', postalCode: 'Postcode' }}
      cardStyle={{ backgroundColor: C.surface, textColor: C.fg, placeholderColor: C.fg3, textErrorColor: C.like, borderRadius: 12, fontSize: 16, cursorColor: C.accent2, borderColor: C.line, borderWidth: 1 }}
      style={{ width: '100%', height: 52 }}
      accessibilityLabel="Card number, expiry date, security code and postcode"
    />
  );
}

/** Shown while the Stripe keys are not on the server yet. */
export function PaymentsOff({ onBack }: { onBack: () => void }) {
  return <Empty icon="card" title={t('pay.unavailable')} action={<Button label={t('common.back')} onPress={onBack} style={{ marginTop: 10, alignSelf: 'stretch' }} />} />;
}
