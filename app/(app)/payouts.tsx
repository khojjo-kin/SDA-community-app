import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { hasEnded, ProgressBar, progressOf } from '../../src/components/FundraiserCard';
import { Icon, type IconName } from '../../src/components/Icon';
import { Button, ErrorNote, Loading, Screen, ScreenHeader, SectionLabel, Sheet, useToast } from '../../src/components/ui';
import { fetchPayouts, fetchUserFundraisers, openPayoutsDashboard, startPayoutsOnboarding } from '../../src/lib/api';
import { ensureStripe, money } from '../../src/lib/payments';
import { t } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Fundraiser, PayoutStatus } from '../../src/lib/types';
import * as WebBrowser from 'expo-web-browser';

/** Where Stripe's form sends the member back to: this screen. */
const RETURN_URL = 'community://payouts';

/** Where a payout account for donations can be set up. Stripe fixes an account's country when it is made. */
const COUNTRIES: { code: string; name: string }[] = [
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IE', name: 'Ireland' },
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'PT', name: 'Portugal' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' },
  { code: 'PL', name: 'Poland' },
];

/** The phone's own region ("en-GB" gives GB) when payouts can be set up there, else the United Kingdom. */
function phoneCountry(): string {
  try {
    const parts = Intl.DateTimeFormat().resolvedOptions().locale.split(/[-_]/);
    // The region is the two-letter part after the language ("zh-Hans-CN"); a one-letter part starts extensions ("-u-ca-…").
    for (let i = 1; i < parts.length && parts[i].length > 1; i++) {
      if (/^[a-z]{2}$/i.test(parts[i])) {
        const code = parts[i].toUpperCase();
        return COUNTRIES.some((c) => c.code === code) ? code : 'GB';
      }
    }
  } catch {
    // No locale to go on: the United Kingdom, below.
  }
  return 'GB';
}

type AuthResult = { type: string; url?: string };
type WebBrowserModule = {
  openAuthSessionAsync: (url: string, redirectUrl?: string | null) => Promise<AuthResult>;
  openBrowserAsync: (url: string) => Promise<{ type: string }>;
};

/** The in-app browser (the same one sign-in with Apple and Google uses). */
function inAppBrowser(): WebBrowserModule | null {
  return WebBrowser as unknown as WebBrowserModule;
}

/** The four states a payout account can be in, in plain words. */
function describe(s: PayoutStatus): { title: string; icon: IconName; color: string; ready: boolean } {
  if (!s.has_account) return { title: 'Not set up', icon: 'card', color: C.fg2, ready: false };
  if (!s.charges_enabled) return { title: 'Details needed', icon: 'info', color: C.warn, ready: false };
  if (!s.payouts_enabled) return { title: 'Ready to receive donations', icon: 'check', color: C.accent2, ready: true };
  return { title: 'Payouts enabled', icon: 'check', color: C.accent2, ready: true };
}

/**
 * Payouts for fundraisers. Each member who runs one has their own Stripe account: gifts go straight
 * there and on to their bank, never through the app's own account. Also the target of the
 * community://payouts link Stripe returns to (with ?again=1 when its link expired).
 */
export default function Payouts() {
  const params = useLocalSearchParams<{ again?: string }>();
  const router = useRouter();
  const toast = useToast();
  const { me, profile } = useSession();
  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [paymentsOn, setPaymentsOn] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [fundraisers, setFundraisers] = useState<Fundraiser[] | null>(null);
  const [busy, setBusy] = useState<'setup' | 'dashboard' | null>(null);
  // Stripe's setup links expire after a few minutes: if one did, say so and offer to carry on.
  const [expired, setExpired] = useState(params.again === '1');
  // Chosen before the first setup only: the payout account is made in this country.
  const [country, setCountry] = useState(phoneCountry);
  const [choosing, setChoosing] = useState(false);
  const working = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => { if (params.again === '1') setExpired(true); }, [params.again]);

  const refresh = useCallback(async () => {
    setError('');
    // The status and the list load separately: one failing should not hide the other.
    fetchUserFundraisers(me)
      .then((list) => { if (alive.current) setFundraisers(list); })
      .catch(() => { if (alive.current) setFundraisers((old) => old ?? []); });
    try {
      let c = await ensureStripe();
      // The config is kept from earlier; if payments were off then, they may have been switched on since.
      if (!c.ready) c = await ensureStripe(true);
      if (!alive.current) return;
      setPaymentsOn(c.ready);
      if (!c.ready) return;
      const s = await fetchPayouts();
      if (alive.current) setStatus(s);
    } catch (e) {
      if (alive.current) setError(errText(e));
    }
  }, [me]);
  // On every visit, including the return from Stripe's form by the community://payouts link.
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function setup() {
    if (working.current) return;
    working.current = true;
    setBusy('setup');
    try {
      // The country only matters when the account is first made; carrying on with one keeps its own.
      const url = await startPayoutsOnboarding(status?.has_account ? undefined : country);
      const browser = inAppBrowser();
      if (browser) {
        const result = await browser.openAuthSessionAsync(url, RETURN_URL);
        if (alive.current) setExpired(result.type === 'success' && !!result.url && /[?&]again=1\b/.test(result.url));
      } else {
        await Linking.openURL(url);
      }
      if (alive.current) await refresh();
    } catch (e) {
      if (alive.current) toast(errText(e));
    } finally {
      working.current = false;
      if (alive.current) setBusy(null);
    }
  }

  async function dashboard() {
    if (working.current) return;
    working.current = true;
    setBusy('dashboard');
    try {
      const url = await openPayoutsDashboard();
      const browser = inAppBrowser();
      if (browser) await browser.openBrowserAsync(url);
      else await Linking.openURL(url);
      if (alive.current) await refresh();
    } catch (e) {
      if (alive.current) toast(errText(e));
    } finally {
      working.current = false;
      if (alive.current) setBusy(null);
    }
  }

  const countryName = COUNTRIES.find((c) => c.code === country)?.name ?? country;
  let account: React.ReactNode;
  if (error && !status) account = <ErrorNote message={error} onRetry={refresh} />;
  else if (paymentsOn === false) {
    account = (
      <View style={{ marginHorizontal: 16, padding: 16, borderRadius: 16, backgroundColor: C.surface, flexDirection: 'row', gap: 12 }}>
        <Icon name="card" size={24} color={C.fg2} />
        <Text style={{ flex: 1, color: C.fg, fontSize: 16, fontWeight: '700' }}>{t('pay.unavailable')}</Text>
      </View>
    );
  } else if (!status) account = <Loading />;
  else {
    const d = describe(status);
    const finished = status.charges_enabled && status.payouts_enabled;
    account = (
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        {expired && !finished ? (
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: C.warn + '1f' }}>
            <Icon name="info" size={18} color={C.warn} />
            <Text style={{ flex: 1, color: C.fg, fontSize: 14, lineHeight: 19 }}>That setup link expired. Tap Continue setup to pick up where you left off.</Text>
          </View>
        ) : null}
        <View style={{ padding: 16, borderRadius: 16, backgroundColor: C.surface, flexDirection: 'row', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={d.icon} size={22} color={d.color} weight={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.fg2, fontSize: 12.5, fontWeight: '700' }}>STATUS</Text>
            <Text style={{ color: d.ready ? C.accent2 : C.fg, fontSize: 17, fontWeight: '700', marginTop: 1 }}>{d.title}</Text>
          </View>
        </View>
        {status.has_account ? null : (
          <View style={{ gap: 8 }}>
            <Pressable
              onPress={() => setChoosing(true)}
              disabled={!!busy}
              accessibilityRole="button"
              accessibilityLabel={`Country: ${countryName}`}
              accessibilityHint="Choose where you and your bank are"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: pressed ? C.surface2 : C.surface })}>
              <Icon name="globe" size={22} color={C.fg2} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.fg2, fontSize: 12.5 }}>Where you and your bank are</Text>
                <Text style={{ color: C.fg, fontSize: 16, fontWeight: '600', marginTop: 1 }}>{countryName}</Text>
              </View>
              <Icon name="right" size={16} color={C.fg2} weight={2} />
            </Pressable>
          </View>
        )}
        {!finished ? <Button label={status.has_account ? 'Continue setup' : 'Set up payouts'} busy={busy === 'setup'} disabled={!!busy && busy !== 'setup'} onPress={setup} /> : null}
        {status.has_account && status.details_submitted ? (
          <Button label="Open payout dashboard" kind="ghost" busy={busy === 'dashboard'} disabled={!!busy && busy !== 'dashboard'} onPress={dashboard} />
        ) : null}
      </View>
    );
  }

  const restricted = profile?.restricted === true;
  return (
    <Screen>
      <ScreenHeader title="Payouts" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ height: 6 }} />
        {account}

        <SectionLabel>Your fundraisers</SectionLabel>
        {fundraisers === null ? (
          <Loading />
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {fundraisers.map((f) => {
              const ended = hasEnded(f);
              return (
                <Pressable
                  key={f.id}
                  onPress={() => router.push(`/fundraiser/${f.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${f.title}. ${ended ? 'Ended' : 'Running'}. ${money(f.raised_pence, f.currency)} raised of ${money(f.goal_pence, f.currency)}`}
                  style={({ pressed }) => ({ padding: 14, borderRadius: 14, backgroundColor: pressed ? C.surface2 : C.surface, gap: 8 })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text numberOfLines={1} style={{ flex: 1, color: C.fg, fontSize: 15.5, fontWeight: '700' }}>{f.title}</Text>
                    <Text style={{ color: ended ? C.fg3 : C.accent2, fontSize: 12.5, fontWeight: '700' }}>{ended ? 'Ended' : 'Running'}</Text>
                    <Icon name="right" size={16} color={C.fg2} weight={2} />
                  </View>
                  <ProgressBar value={progressOf(f)} height={4} />
                  <Text style={{ color: C.fg2, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                    <Text style={{ color: C.fg, fontWeight: '600' }}>{money(f.raised_pence, f.currency)}</Text> raised of {money(f.goal_pence, f.currency)}
                  </Text>
                </Pressable>
              );
            })}
            {fundraisers.length === 0 ? (
              <Text style={{ color: C.fg2, lineHeight: 20 }}>
                {restricted ? 'Fundraisers are for members 14 and over.' : "You haven't started a fundraiser."}
              </Text>
            ) : null}
            {restricted ? null : <Button label="Start a fundraiser" kind={fundraisers.length ? 'ghost' : 'primary'} onPress={() => router.push('/fundraiser-new')} style={{ marginTop: 4 }} />}
          </View>
        )}
      </ScrollView>

      <Sheet visible={choosing} onClose={() => setChoosing(false)} title="Country" tall>
        <ScrollView accessibilityRole="radiogroup" contentContainerStyle={{ paddingBottom: 12 }}>
          {COUNTRIES.map((c) => {
            const on = c.code === country;
            return (
              <Pressable
                key={c.code}
                onPress={() => {
                  setCountry(c.code);
                  setChoosing(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={c.name}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 20, backgroundColor: pressed ? C.press : 'transparent' })}>
                <Text style={{ flex: 1, color: C.fg, fontSize: 16, fontWeight: on ? '700' : '400' }}>{c.name}</Text>
                {on ? <Icon name="check" size={18} color={C.accent2} weight={2.4} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </Screen>
  );
}
