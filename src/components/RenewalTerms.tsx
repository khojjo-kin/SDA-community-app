import React from 'react';
import { Text, View } from 'react-native';
import { useAppFont } from '../lib/fonts';
import { useT } from '../lib/i18n';
import { money } from '../lib/payments';
import { C } from '../lib/theme';
import { LinkedSentence, useLegalSheet } from './LegalDocument';

/**
 * The terms of a subscription, said plainly next to the button that starts it: the price and how
 * often, the price after a free week if there is one, that it renews by itself until cancelled, where
 * to cancel and what happens then, and a link to the Terms of use. Two short lines, so it reads at a
 * glance rather than as small print.
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
  const renew =
    kind === 'creator'
      ? t('legal.creatorRenew')
      : free
        ? t(yearly ? 'legal.plusRenewTrialYearly' : 'legal.plusRenewTrialMonthly')
        : t(yearly ? 'legal.plusRenewYearly' : 'legal.plusRenewMonthly');

  const textAlign = align;
  return (
    <View style={{ gap: 3 }}>
      <Text style={{ color: C.fg, fontSize: 13.5, fontWeight: '700', lineHeight: 18, textAlign, fontFamily: fontBold }}>{head}</Text>
      <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 17, textAlign, fontFamily: font }}>
        {renew}{' '}
        <LinkedSentence text={t('legal.agreeSubscribe')} slots={{ terms: { label: t('legal.terms'), onPress: () => legal.open('terms') } }} />
      </Text>
      {legal.element}
    </View>
  );
}
