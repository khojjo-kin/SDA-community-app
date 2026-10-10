import React from 'react';
import { Text, View } from 'react-native';
import { useAppFont } from '../lib/fonts';
import { useT } from '../lib/i18n';
import { money } from '../lib/payments';
import { C } from '../lib/theme';
import { LinkedSentence, useLegalSheet } from './LegalDocument';

/**
 * The terms of a subscription in one compact line next to the button that starts it: the price and
 * how often (after a free week if there is one), that it renews by itself until cancelled, and a link
 * to the Terms of use.
 *
 * Amounts always come from the payments config (or the creator's price) on the screen, never from here.
 */
export function RenewalTerms({
  kind,
  pricePence,
  currency = 'GBP',
  cadence = 'month',
  trialDays = 0,
  freeUntil = '',
  align = 'center',
}: {
  /** Community Plus, or a subscription to a creator (always monthly, never a free week). */
  kind: 'plus' | 'creator';
  pricePence: number;
  currency?: string;
  cadence?: 'month' | 'year';
  /** A free trial that starts now, in days. */
  trialDays?: number;
  /** A free trial already running, as the day it ends ("17 October"). */
  freeUntil?: string;
  align?: 'center' | 'left';
}) {
  const t = useT();
  const legal = useLegalSheet();
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const price = money(pricePence, currency);
  const yearly = kind === 'plus' && cadence === 'year';
  const free = kind === 'plus' && (trialDays > 0 || !!freeUntil);

  const head = !free
    ? t(yearly ? 'legal.priceYearly' : 'legal.priceMonthly', { price })
    : freeUntil
      ? t(yearly ? 'legal.freeUntilYearly' : 'legal.freeUntilMonthly', { day: freeUntil, price })
      : t(yearly ? 'legal.trialYearly' : 'legal.trialMonthly', { days: trialDays, price });

  return (
    <View>
      <Text style={{ color: C.fg3, fontSize: 12, lineHeight: 16, textAlign: align, fontFamily: font }}>
        <Text style={{ color: C.fg2, fontWeight: '700', fontFamily: fontBold }}>{head}</Text>
        {' · '}
        <LinkedSentence text={t('legal.renewLine')} slots={{ terms: { label: t('legal.termsLink'), onPress: () => legal.open('terms') } }} />
      </Text>
      {legal.element}
    </View>
  );
}
