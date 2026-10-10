import React from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppFont } from '../lib/fonts';
import { C } from '../lib/theme';
import { Icon, IconName } from './Icon';
import { Screen, ScreenHeader } from './ui';

/** The admin console's sections, in sidebar order. Each opens its own screen. */
export const ADMIN_SECTIONS: { key: AdminSection; label: string; icon: IconName; href: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'chart', href: '/admin' },
  { key: 'members', label: 'Members', icon: 'people', href: '/admin-members' },
  { key: 'reports', label: 'Reports', icon: 'flag', href: '/admin-reports' },
  { key: 'requests', label: 'Requests', icon: 'verified', href: '/admin-requests' },
  { key: 'ads', label: 'Ads and fundraisers', icon: 'megaphone', href: '/admin-ads' },
  { key: 'words', label: 'Offensive words', icon: 'gavel', href: '/admin-words' },
  { key: 'admins', label: 'Admins', icon: 'shield', href: '/admin-admins' },
  { key: 'transactions', label: 'Transactions', icon: 'receipt', href: '/admin-transactions' },
  { key: 'activity', label: 'Activity', icon: 'pulse', href: '/admin-activity' },
  { key: 'support', label: 'Support chats', icon: 'lifebuoy', href: '/admin-support' },
  { key: 'feedback', label: 'Feedback and reviews', icon: 'star', href: '/admin-feedback' },
  { key: 'pod', label: 'Pod', icon: 'headphones', href: '/pod' },
  { key: 'hymns', label: 'Hymns', icon: 'hymnal', href: '/hymnal' },
  { key: 'churches', label: 'Churches', icon: 'church', href: '/churches' },
  { key: 'groups', label: 'Groups', icon: 'users', href: '/groups' },
];

export type AdminSection = 'overview' | 'members' | 'reports' | 'requests' | 'ads' | 'words' | 'admins' | 'transactions' | 'activity' | 'support' | 'feedback' | 'pod' | 'hymns' | 'churches' | 'groups';

/** From this width up (an iPad on its side, or a Mac window) the console shows its sidebar. */
export const WIDE_WIDTH = 860;

export function useWide(): boolean {
  return useWindowDimensions().width >= WIDE_WIDTH;
}

/** "£12.34", or "12.34 USD" when the money is not in pounds. Negative amounts keep their sign. */
export function money(pence: number, currency = 'GBP'): string {
  const n = (Math.abs(pence) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = pence < 0 ? '-' : '';
  const code = (currency || 'GBP').toUpperCase();
  return code === 'GBP' ? `${sign}£${n}` : `${sign}${n} ${code}`;
}

/**
 * The frame around every admin console screen. On a phone it is the usual screen with a header.
 * On a wide screen it adds a sidebar on the left listing the console's sections, with the screen's
 * own content on the right, so the whole console can be worked from an iPad or a Mac.
 */
export function AdminFrame({ section, title, right, children }: { section: AdminSection; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  const wide = useWide();
  const router = useRouter();
  const font = useAppFont();
  const fontBold = useAppFont('bold');

  if (!wide) {
    return (
      <Screen>
        <ScreenHeader title={title} right={right} />
        {children}
      </Screen>
    );
  }

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: 240, backgroundColor: C.bg2, borderRightWidth: 1, borderRightColor: C.line }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, gap: 2 }}>
            <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 19, fontWeight: '800', fontFamily: fontBold }}>Admin console</Text>
            <Text style={{ color: C.fg3, fontSize: 12.5, fontFamily: font }}>Community</Text>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 12, gap: 2 }} showsVerticalScrollIndicator={false}>
            {ADMIN_SECTIONS.map((s) => {
              const on = s.key === section;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => (on ? undefined : router.navigate(s.href as any))}
                  accessibilityRole="tab"
                  accessibilityLabel={s.label}
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, height: 42, paddingHorizontal: 12, borderRadius: 11, backgroundColor: on ? C.surface : pressed ? C.press : 'transparent' })}>
                  <Icon name={s.icon} size={21} color={on ? C.accent2 : C.fg2} weight={2} />
                  <Text style={{ color: on ? C.fg : C.fg2, fontSize: 15.5, fontWeight: on ? '700' : '500', fontFamily: on ? fontBold : font }}>{s.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Back to the app" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, height: 50, paddingHorizontal: 22, borderTopWidth: 1, borderTopColor: C.line, opacity: pressed ? 0.6 : 1 })}>
            <Icon name="back" size={20} color={C.fg2} weight={2} />
            <Text style={{ color: C.fg2, fontSize: 15, fontFamily: font }}>Back to the app</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flex: 1, width: '100%', maxWidth: 880 }}>
            <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12 }}>
              <Text numberOfLines={1} accessibilityRole="header" style={{ flex: 1, color: C.fg, fontSize: 22, fontWeight: '800', fontFamily: fontBold }}>{title}</Text>
              {right}
            </View>
            {children}
          </View>
        </View>
      </View>
    </Screen>
  );
}
