import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { penceFrom } from '../../src/components/FundraiserCard';
import { Icon } from '../../src/components/Icon';
import { Button, Empty, ErrorNote, Field, Loading, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { createFundraiser, fetchFundraiser, fetchPayouts, updateFundraiser, uploadImage, type FundraiserInput } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { t } from '../../src/lib/i18n';
import { pickFromLibrary } from '../../src/lib/pick';
import { useSession } from '../../src/lib/session';
import { C, dayLabel, errText } from '../../src/lib/theme';
import type { Fundraiser } from '../../src/lib/types';

/** The same limits as the database: a goal of £1 to £1,000,000, a title of 3 to 80 characters. */
const MIN_GOAL = 100;
const MAX_GOAL = 100_000_000;

/** 'keep' leaves an existing end date alone when editing. */
type Ends = 'keep' | 'none' | 7 | 30 | 90;
const END_CHOICES: { value: Ends; label: string }[] = [
  { value: 'none', label: 'No end date' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

type Errors = { title?: string; goal?: string; form?: string };

/** Pounds for the goal field, without a pointless ".00". */
const poundsText = (pence: number) => (pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2));

/**
 * Starting a fundraiser, or editing one with `?id=`. Members under 14 cannot run one. Donations go to
 * the member's own Stripe account, so after starting one without payouts set up, they are sent there.
 */
export default function FundraiserNew() {
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = typeof params.id === 'string' && params.id ? params.id : '';
  const router = useRouter();
  const toast = useToast();
  const { me, profile } = useSession();

  const [existing, setExisting] = useState<Fundraiser | null>(null);
  const [loadError, setLoadError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  // A newly chosen photo (uploaded only on save), or the one already there when editing.
  const [cover, setCover] = useState<{ uri: string; width: number } | null>(null);
  const [coverUrl, setCoverUrl] = useState('');
  const [ends, setEnds] = useState<Ends>('none');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  // Started without payouts: the screen turns into a nudge to set them up.
  const [started, setStarted] = useState<string | null>(null);
  const working = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    if (!editId) return;
    setLoadError('');
    try {
      const f = await fetchFundraiser(editId);
      if (!alive.current) return;
      if (!f) {
        setLoadError('This fundraiser could not be found. It may have been deleted.');
        return;
      }
      setExisting(f);
      setTitle(f.title);
      setDescription(f.description);
      setGoal(poundsText(f.goal_pence));
      setCoverUrl(f.cover_url);
      setEnds(f.ends_at ? 'keep' : 'none');
    } catch (e) {
      if (alive.current) setLoadError(errText(e));
    }
  }, [editId]);
  useEffect(() => { load(); }, [load]);

  async function chooseCover() {
    if (busy) return;
    try {
      const [a] = await pickFromLibrary();
      if (a && alive.current) setCover({ uri: a.uri, width: a.width });
    } catch (e) {
      setErrors({ form: errText(e) });
    }
  }

  function removeCover() {
    setCover(null);
    setCoverUrl('');
  }

  async function save() {
    if (working.current) return;
    const name = title.trim();
    const pence = penceFrom(goal);
    const errs: Errors = {};
    if (name.length < 3 || name.length > 80) errs.title = 'Give it a title of 3 to 80 characters.';
    if (pence === null) errs.goal = 'Type the goal in pounds, like 1000 or 1,000.';
    else if (pence < MIN_GOAL || pence > MAX_GOAL) errs.goal = 'Set a goal between £1 and £1,000,000.';
    setErrors(errs);
    if (errs.title || errs.goal || pence === null) {
      tap('warning');
      return;
    }

    working.current = true;
    setBusy(true);
    try {
      // The photo is uploaded only now, so backing out of the form leaves nothing behind in storage.
      const cover_url = cover ? (await uploadImage(me, cover.uri, cover.width, 1200)).url : coverUrl;
      const ends_at = ends === 'keep' ? undefined : ends === 'none' ? null : new Date(Date.now() + ends * 86400e3).toISOString();
      const input: FundraiserInput = { title: name, description: description.trim(), goal_pence: pence, cover_url };
      if (ends_at !== undefined) input.ends_at = ends_at;

      if (existing) {
        await updateFundraiser(existing.id, input);
        if (!alive.current) return;
        tap('success');
        toast('Fundraiser saved');
        router.back();
        return;
      }

      const id = await createFundraiser(me, input);
      // Donations need a payout account. If it cannot be checked, say so anyway: the payouts screen shows the truth.
      const payouts = await fetchPayouts().catch(() => null);
      if (!alive.current) return;
      tap('success');
      if (payouts?.charges_enabled) {
        toast('Your fundraiser is live');
        router.replace(`/fundraiser/${id}`);
      } else {
        setStarted(id);
      }
    } catch (e) {
      if (alive.current) {
        tap('warning');
        setErrors({ form: errText(e) });
      }
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const heading = editId ? 'Edit fundraiser' : 'New fundraiser';

  // Started, but payouts are not ready: people can see it, but cannot give yet.
  if (started) {
    return (
      <Screen>
        <ScreenHeader title={heading} onBack={() => router.replace(`/fundraiser/${started}`)} />
        <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 36, gap: 10 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
            <Icon name="gift" size={48} color={C.accent2} />
          </View>
          <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>Your fundraiser is live</Text>
          <Text style={{ color: C.fg2, fontSize: 16, textAlign: 'center' }}>{t('fundraiser.notTaking')}</Text>
          <Button label="Set up payouts" onPress={() => router.replace('/payouts')} style={{ alignSelf: 'stretch', marginTop: 16 }} />
          <Button label="View fundraiser" kind="ghost" onPress={() => router.replace(`/fundraiser/${started}`)} style={{ alignSelf: 'stretch' }} />
        </View>
      </Screen>
    );
  }

  let body: React.ReactNode;
  if (profile?.restricted === true) {
    body = (
      <Empty
        icon="gift"
        title="Fundraisers are for members 14 and over"
      />
    );
  } else if (loadError) {
    body = <ErrorNote message={loadError} onRetry={load} />;
  } else if (editId && !existing) {
    body = <Loading />;
  } else if (existing && existing.user_id !== me) {
    body = <Empty icon="gift" title="You can only edit your own fundraisers" />;
  } else {
    const shown = cover?.uri || coverUrl;
    const choices = existing?.ends_at ? [{ value: 'keep' as Ends, label: `Ends ${dayLabel(new Date(existing.ends_at))}` }, ...END_CHOICES] : END_CHOICES;
    body = (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 48, gap: 14 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <Pressable onPress={chooseCover} accessibilityRole="button" accessibilityLabel={shown ? 'Change cover photo' : 'Add a cover photo'} style={({ pressed }) => ({ height: 170, borderRadius: 16, overflow: 'hidden', backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed && !busy ? 0.8 : 1 })}>
            {shown ? <Image source={{ uri: shown }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 10, backgroundColor: shown ? 'rgba(10,12,14,0.7)' : 'transparent' }}>
              <Icon name="image" size={20} color={shown ? '#fff' : C.accent2} />
              <Text style={{ color: shown ? '#fff' : C.accent2, fontWeight: '600', fontSize: 14 }}>{shown ? 'Change cover' : 'Add a cover photo'}</Text>
            </View>
          </Pressable>
          {shown ? (
            <Pressable onPress={busy ? undefined : removeCover} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove cover photo" style={({ pressed }) => ({ alignSelf: 'flex-start', marginTop: -6, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: C.fg2, fontSize: 13.5, fontWeight: '600' }}>Remove photo</Text>
            </Pressable>
          ) : null}

          <Field
            label="Title"
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              // Put right as it is typed: the message goes once the field is changed.
              if (errors.title) setErrors((e) => ({ ...e, title: undefined }));
            }}
            placeholder="e.g. New roof for Ebenezer SDA Church"
            maxLength={80}
            error={errors.title}
            autoFocus={!editId}
            editable={!busy}
          />

          <View style={{ gap: 6 }}>
            <Text style={{ color: C.fg2, fontSize: 12.5 }}>Goal</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: C.surface, paddingLeft: 14, borderWidth: 1, borderColor: errors.goal ? C.like : 'transparent' }}>
              <Text style={{ color: C.fg2, fontSize: 16 }}>£</Text>
              <TextInput
                value={goal}
                editable={!busy}
                onChangeText={(v) => {
                  setGoal(v.replace(/[^0-9.,]/g, ''));
                  if (errors.goal) setErrors((e) => ({ ...e, goal: undefined }));
                }}
                placeholder="1,000"
                placeholderTextColor={C.fg3}
                selectionColor={C.accent2}
                keyboardAppearance={C.blurTint}
                keyboardType="decimal-pad"
                maxLength={12}
                accessibilityLabel="Goal in pounds"
                style={{ flex: 1, color: C.fg, fontSize: 16, paddingLeft: 4, paddingRight: 14, paddingVertical: 13, fontVariant: ['tabular-nums'] }}
              />
            </View>
            {errors.goal ? <Text accessibilityLiveRegion="polite" style={{ color: C.like, fontSize: 13 }}>{errors.goal}</Text> : null}
          </View>

          <Field label="Story" value={description} onChangeText={setDescription} placeholder="What is it for, who will it help, and how will the money be used?" maxLength={2000} multiline editable={!busy} style={{ minHeight: 120, textAlignVertical: 'top' }} />

          <View style={{ gap: 8 }}>
            <Text style={{ color: C.fg2, fontSize: 12.5 }}>End date</Text>
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {choices.map((c) => {
                const on = ends === c.value;
                return (
                  <Pressable
                    key={String(c.value)}
                    onPress={() => {
                      if (on || busy) return;
                      tap('select');
                      setEnds(c.value);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={c.label}
                    style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.accent : pressed ? C.surface2 : C.surface })}>
                    <Text style={{ color: on ? C.onAccent : C.fg, fontWeight: '600', fontSize: 14 }}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {typeof ends === 'number' ? <Text style={{ color: C.fg3, fontSize: 12.5 }}>Ends on {dayLabel(new Date(Date.now() + ends * 86400e3))}</Text> : null}
          </View>

          {errors.form ? <Text accessibilityLiveRegion="polite" style={{ color: C.like, lineHeight: 19 }}>{errors.form}</Text> : null}
          <Button label={existing ? 'Save changes' : 'Start fundraiser'} busy={busy} onPress={save} style={{ marginTop: 6 }} />
          {/* What happens to the money: the terms the organiser starts it on. */}
          <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 17, textAlign: 'center' }}>The whole of every gift goes to you through Stripe; the app takes no fee.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={heading} onBack={busy ? () => undefined : undefined} />
      {body}
    </Screen>
  );
}
