import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardReveal } from '../../src/components/AuthShell';
import { Button, Radio, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { updateProfile } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';

const CATEGORIES = ['Artist', 'Photographer', 'Musician', 'Writer', 'Video creator', 'Software', 'Entrepreneur', 'Education', 'Gaming', 'Fitness', 'Food', 'Fashion', 'Travel', 'Community', 'Personal blog'];
const TYPES: { value: 'personal' | 'creator'; title: string }[] = [
  { value: 'personal', title: 'Personal' },
  { value: 'creator', title: 'Creator' },
];

export default function AccountType() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<'personal' | 'creator'>(profile?.account_type ?? 'personal');
  const [category, setCategory] = useState(profile?.category ?? '');
  const [busy, setBusy] = useState(false);
  // A ref as well: a quick second tap arrives before `busy` has drawn.
  const busyRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  // The category box is at the bottom of the chips: it stays above the keyboard while typed in.
  const kb = useKeyboardReveal(24);

  const changed = type !== (profile?.account_type ?? 'personal') || category.trim() !== (profile?.category ?? '');

  async function save() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await updateProfile(me, { account_type: type, category: type === 'creator' ? category.trim().slice(0, 40) : '' });
      tap('success');
      toast(type === 'creator' ? 'You have a creator account' : 'You have a personal account');
      if (!alive.current) return;
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      toast(errText(e));
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Account type" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={kb.ref} onScroll={kb.onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <View accessibilityRole="radiogroup" style={{ paddingHorizontal: 16, gap: 10, paddingTop: 6 }}>
            {TYPES.map((t) => (
              <Pressable
                key={t.value}
                onPress={() => {
                  if (type === t.value) return;
                  tap('select');
                  setType(t.value);
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: type === t.value }}
                accessibilityLabel={t.title}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1.5, borderColor: type === t.value ? C.accent : 'transparent', opacity: pressed ? 0.8 : 1 })}>
                <Text style={{ flex: 1, color: C.fg, fontSize: 17.5, fontWeight: '700' }}>{t.title}</Text>
                <Radio on={type === t.value} />
              </Pressable>
            ))}
          </View>

          {type === 'creator' ? (
            <>
              <SectionLabel strong>Category</SectionLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
                {CATEGORIES.map((c) => {
                  const on = category.trim().toLowerCase() === c.toLowerCase();
                  return (
                    <Pressable
                      key={c}
                      onPress={() => {
                        tap('select');
                        setCategory(on ? '' : c);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', backgroundColor: on ? C.fg : C.surface2, opacity: pressed ? 0.75 : 1 })}>
                      <Text style={{ color: on ? C.bg : C.fg, fontWeight: '600' }}>{c}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
                <TextInput
                  value={category}
                  onChangeText={setCategory}
                  placeholder="Or type your own"
                  placeholderTextColor={C.fg3}
                  maxLength={40}
                  keyboardAppearance={C.blurTint}
                  selectionColor={C.accent2}
                  returnKeyType="done"
                  onFocus={kb.onFocus}
                  onBlur={kb.onBlur}
                  style={{ height: 46, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.field, color: C.fg, fontSize: 16 }}
                  accessibilityLabel="Category"
                />
              </View>
            </>
          ) : null}
        </ScrollView>
        {/* Clear of the home indicator. */}
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
          <Button label={type === 'creator' ? 'Use a creator account' : 'Use a personal account'} onPress={save} busy={busy} disabled={!changed} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
