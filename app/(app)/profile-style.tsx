import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../src/components/Icon';
import { Avatar, Button, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { updateProfile } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { useSession } from '../../src/lib/session';
import { PROFILE_THEMES, profileTheme, ringColors, RING_STYLES, type ProfileTheme } from '../../src/lib/styling';
import { C, errText } from '../../src/lib/theme';

const GUTTER = 16;
const GAP = 12;
const SWATCH = 50;

/** LinearGradient wants at least two colours, typed as such. */
function stops(colors: readonly string[]): readonly [string, string, ...string[]] {
  const list = colors.length >= 2 ? colors : [colors[0] ?? C.bg, colors[0] ?? C.bg];
  return list as unknown as readonly [string, string, ...string[]];
}

/** Where each band colour sits: held over the top part, then faded into the page by the bottom. */
function bandStops(band: readonly string[], hold: number): readonly [number, number, ...number[]] {
  const list = [...band.map((_, i) => (band.length === 1 ? hold : (i / (band.length - 1)) * hold)), 1];
  return list as unknown as readonly [number, number, ...number[]];
}

/**
 * A theme's button colours. The standard theme follows the app's own accent, as Button does. On the
 * White app theme the pale accents would not show, so the deeper `lightAccent` with white text is
 * used, exactly as the profile itself does (ProfileView).
 */
function accentOf(t: ProfileTheme): { bg: string; fg: string } {
  if (!t.id) return { bg: C.accent, fg: C.onAccent };
  return C.statusBar === 'dark' ? { bg: t.lightAccent, fg: '#ffffff' } : { bg: t.accent, fg: t.onAccent };
}

/** The tick on whatever is chosen. */
function Chosen({ style }: { style: ViewStyle }) {
  return (
    <View style={[{ position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: C.accent, borderWidth: 2, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Icon name="check" size={12} color={C.onAccent} weight={3} />
    </View>
  );
}

/** A small highlight circle as it will look on the profile: the chosen gradient, or the plain grey outline for the standard ring. */
function HighlightDot({ ring }: { ring: string }) {
  if (!ring) return <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.fg3, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.surface2 }} /></View>;
  return (
    <LinearGradient colors={stops(ringColors(ring))} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface2 }} />
      </View>
    </LinearGradient>
  );
}

/** The top of your profile with the choices applied, redrawn as you pick. */
function Preview({ name, username, uri, ring, theme }: { name: string; username: string; uri?: string; ring: string; theme: string }) {
  const t = profileTheme(theme);
  const accent = accentOf(t);
  const band = t.band.length ? t.band : null;
  return (
    <View style={{ marginHorizontal: GUTTER, borderRadius: 20, overflow: 'hidden', backgroundColor: C.bg, borderWidth: 1, borderColor: C.line }} accessible accessibilityLabel="Preview of your profile">
      {band ? <LinearGradient colors={stops([...band, C.bg])} locations={bandStops(band, 0.35)} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 170 }} /> : null}
      <View style={{ alignItems: 'center', paddingTop: 22, paddingBottom: 16, paddingHorizontal: 16 }}>
        <Avatar uri={uri} name={name} size={80} ring="new" ringColors={ringColors(ring)} />
        <Text numberOfLines={1} style={{ color: band ? '#ffffff' : C.fg, fontSize: 17, fontWeight: '700', marginTop: 10 }}>{name}</Text>
        <Text numberOfLines={1} style={{ color: band ? 'rgba(255,255,255,0.78)' : C.fg2, fontSize: 13.5, marginTop: 1 }}>{username}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, alignSelf: 'stretch' }}>
          <View style={{ flex: 1, height: 32, borderRadius: 10, backgroundColor: accent.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: accent.fg, fontWeight: '700', fontSize: 13.5 }}>Follow</Text>
          </View>
          <View style={{ flex: 1, height: 32, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.fg, fontWeight: '700', fontSize: 13.5 }}>Message</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 14, marginTop: 16, alignSelf: 'flex-start' }}>
          <HighlightDot ring={ring} />
          <HighlightDot ring={ring} />
          <HighlightDot ring={ring} />
        </View>
      </View>
    </View>
  );
}

/** Community Plus: the colour of your story and highlight ring, and the look of your profile page. */
export default function ProfileStyle() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const plus = !!profile?.plus;
  const [ring, setRing] = useState(profile?.ring_color ?? '');
  const [theme, setTheme] = useState(profile?.profile_theme ?? '');
  const [busy, setBusy] = useState(false);
  // A ref as well: a quick second tap on Save arrives before `busy` has drawn.
  const busyRef = useRef(false);

  const changed = ring !== (profile?.ring_color ?? '') || theme !== (profile?.profile_theme ?? '');
  const column = Math.floor((width - GUTTER * 2) / 5);
  const card = Math.floor((width - GUTTER * 2 - GAP) / 2);

  function pick(set: () => void) {
    // Visible to everyone so they can see what Plus offers, but only members can choose.
    if (!plus) return toast('Profile style is part of Community Plus');
    tap('select');
    set();
  }

  async function save() {
    if (!profile || busyRef.current || !changed) return;
    const patch: { ring_color?: string; profile_theme?: string } = {};
    if (ring !== (profile.ring_color ?? '')) patch.ring_color = ring;
    if (theme !== (profile.profile_theme ?? '')) patch.profile_theme = theme;
    busyRef.current = true;
    setBusy(true);
    try {
      // The database refuses this for anyone without Plus, whatever the screen shows. Saving announces
      // the change, so the profile is loaded again everywhere it shows.
      await updateProfile(me, patch);
      tap('success');
      toast('Profile style saved');
      router.back();
    } catch (e) {
      toast(errText(e));
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Profile style" />
      {/* Without the Save bar under it (no Plus), the list keeps clear of the home indicator itself. */}
      <ScrollView contentContainerStyle={{ paddingTop: 6, paddingBottom: (plus ? 0 : insets.bottom) + 28 }}>
        <Preview name={profile?.full_name || profile?.username || 'You'} username={profile?.username ?? ''} uri={profile?.avatar_url} ring={ring} theme={theme} />

        {plus ? null : (
          // A line of words and the button, on the page itself: no card around them.
          <View style={{ marginHorizontal: GUTTER, marginTop: 18, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="crown" size={20} color={C.accent2} />
              <Text style={{ flex: 1, color: C.fg, fontSize: 16, fontWeight: '700' }}>Part of Community Plus</Text>
            </View>
            <Button label="Get Community Plus" onPress={() => router.push('/plus')} />
          </View>
        )}

        <View style={{ opacity: plus ? 1 : 0.45 }}>
          <SectionLabel>Ring colour</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GUTTER, rowGap: 14 }} accessibilityRole="radiogroup">
            {RING_STYLES.map((r) => {
              const on = ring === r.id;
              return (
                <Pressable key={r.id || 'standard'} onPress={() => pick(() => setRing(r.id))} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: !plus }} accessibilityLabel={`${r.label} ring`} style={({ pressed }) => ({ width: column, alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}>
                  <View style={{ width: SWATCH + 10, height: SWATCH + 10, borderRadius: (SWATCH + 10) / 2, borderWidth: 2, borderColor: on ? C.fg : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    <LinearGradient colors={stops(r.colors)} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2 }} />
                    {on ? <Chosen style={{ right: -2, bottom: -2 }} /> : null}
                  </View>
                  <Text numberOfLines={1} style={{ color: on ? C.fg : C.fg2, fontSize: 13, fontWeight: on ? '700' : '400' }}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <SectionLabel>Profile theme</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: GUTTER }} accessibilityRole="radiogroup">
            {PROFILE_THEMES.map((t) => {
              const on = theme === t.id;
              const accent = accentOf(t);
              return (
                <Pressable key={t.id || 'standard'} onPress={() => pick(() => setTheme(t.id))} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: !plus }} accessibilityLabel={`${t.label} theme`} style={({ pressed }) => ({ width: card, opacity: pressed ? 0.75 : 1 })}>
                  <View style={{ height: 104, borderRadius: 16, overflow: 'hidden', backgroundColor: C.bg, borderWidth: on ? 2 : 1, borderColor: on ? C.fg : C.line, padding: 12, justifyContent: 'flex-end' }}>
                    {t.band.length ? <LinearGradient colors={stops([...t.band, C.bg])} locations={bandStops(t.band, 0.3)} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 80 }} /> : null}
                    <View style={{ position: 'absolute', top: 12, left: 12, width: 26, height: 26, borderRadius: 13, backgroundColor: C.surface2, borderWidth: 2, borderColor: C.bg }} />
                    <View style={{ alignSelf: 'flex-start', height: 24, paddingHorizontal: 12, borderRadius: 8, backgroundColor: accent.bg, justifyContent: 'center' }}>
                      <Text style={{ color: accent.fg, fontWeight: '700', fontSize: 12 }}>Follow</Text>
                    </View>
                    {on ? <Chosen style={{ top: 8, right: 8 }} /> : null}
                  </View>
                  <Text numberOfLines={1} style={{ color: on ? C.fg : C.fg2, fontSize: 14, fontWeight: on ? '700' : '400', textAlign: 'center', paddingTop: 7 }}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {plus ? (
        <View style={{ paddingHorizontal: GUTTER, paddingTop: 10, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg }}>
          <Button label="Save" busy={busy} disabled={!changed} onPress={save} />
        </View>
      ) : null}
    </Screen>
  );
}
