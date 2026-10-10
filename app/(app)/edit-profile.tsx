import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useKeyboardReveal } from '../../src/components/AuthShell';
import { Icon, IconName } from '../../src/components/Icon';
import { Avatar, Button, Divider, Field, Radio, RoundButton, Screen, Sheet, Toggle, useToast } from '../../src/components/ui';
import { fetchChurch, updateProfile, uploadImage, withTimeout } from '../../src/lib/api';
import { useAppFont } from '../../src/lib/fonts';
import { tap } from '../../src/lib/haptics';
import { pickFromLibrary } from '../../src/lib/pick';
import { useSession } from '../../src/lib/session';
import { profileTheme, RING_STYLES } from '../../src/lib/styling';
import { C, errText } from '../../src/lib/theme';

const GENDERS = ['Female', 'Male', 'Custom', 'Prefer not to say'] as const;

/** What can be wrong with the form, each shown next to its own field. */
type Problems = { name?: string; username?: string; email?: string };

/**
 * One line of the form: the label on the left, what you type on the right, a hairline underneath, and
 * anything wrong with it just below. `ref` reaches the text box, so the keyboard's Next key moves on.
 */
function Line({ label, value, onChangeText, placeholder, multiline, error, ref, ...rest }: TextInputProps & { label: string; error?: string; ref?: React.Ref<TextInput> }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', paddingLeft: 16 }}>
        <Text style={{ width: 96, color: C.fg, fontSize: 16.5, paddingTop: multiline ? 12 : 0 }}>{label}</Text>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? label}
          placeholderTextColor={C.fg3}
          multiline={multiline}
          keyboardAppearance={C.blurTint}
          selectionColor={C.accent2}
          accessibilityLabel={label}
          {...rest}
          style={{ flex: 1, color: C.fg, fontSize: 16.5, paddingVertical: 12, paddingRight: 16, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: error ? C.like : C.line, textAlignVertical: multiline ? 'top' : 'center' }}
        />
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={{ color: C.like, fontSize: 13.5, lineHeight: 18, paddingLeft: 112, paddingRight: 16, paddingTop: 6, paddingBottom: 4 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** A line that opens something else, showing the current value on the right. */
function Pick({ label, value, sub, onPress, accent, icon, error }: { label: string; value?: string; sub?: string; onPress: () => void; accent?: React.ReactNode; icon?: IconName; error?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 54, backgroundColor: pressed ? C.press : 'transparent' })}>
      {icon ? <View style={{ marginRight: 14 }}><Icon name={icon} size={24} color={C.fg} /></View> : null}
      <View style={{ flex: 1, paddingVertical: sub || error ? 10 : 0 }}>
        <Text style={{ color: C.fg, fontSize: 16.5 }}>{label}</Text>
        {sub ? <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 14.5, marginTop: 2 }}>{sub}</Text> : null}
        {error ? <Text style={{ color: C.like, fontSize: 13.5, marginTop: 2 }}>{error}</Text> : null}
      </View>
      {accent}
      {value ? <Text numberOfLines={1} style={{ color: value === label ? C.fg3 : C.fg2, fontSize: 16, maxWidth: 170, marginRight: 8 }}>{value}</Text> : null}
      <Icon name="right" size={18} color={C.fg2} weight={2} />
    </Pressable>
  );
}

/** A line with a switch on the right. When `onPress` is given the whole line is tappable instead (the switch is then disabled). */
function Switch({ label, sub, value, onChange, disabled, onPress }: { label: string; sub?: string; value: boolean; onChange: (next: boolean) => void; disabled?: boolean; onPress?: () => void }) {
  const body = (
    <>
      <View style={{ flex: 1, paddingVertical: 10, minHeight: 54, justifyContent: 'center' }}>
        <Text style={{ color: C.fg, fontSize: 16.5 }}>{label}</Text>
        {sub ? <Text style={{ color: C.fg2, fontSize: 14.5, marginTop: 2, lineHeight: 19 }}>{sub}</Text> : null}
      </View>
      <View pointerEvents={onPress ? 'none' : 'auto'}>
        <Toggle value={value} onChange={onChange} label={label} disabled={disabled} />
      </View>
    </>
  );
  const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingHorizontal: 16, minHeight: 54 };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [style, { backgroundColor: pressed ? C.press : 'transparent' }]}>
      {body}
    </Pressable>
  );
}

/** Marks a line as a Community Plus perk. */
function PlusLabel() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: C.surface2, marginRight: 10 }}>
      <Icon name="crown" size={12} color={C.close} weight={2.2} />
      <Text style={{ color: C.close, fontSize: 12, fontWeight: '700' }}>Plus</Text>
    </View>
  );
}

export default function EditProfile() {
  const { me, profile } = useSession();
  const { user } = useUser();
  const router = useRouter();
  const toast = useToast();
  const fontBold = useAppFont('bold');
  const params = useLocalSearchParams<{ church?: string }>();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [pronouns, setPronouns] = useState(profile?.pronouns ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [website, setWebsite] = useState(profile?.website ?? '');
  const [gender, setGender] = useState(profile?.gender ?? '');
  const [email, setEmail] = useState(profile?.contact_email ?? '');
  const [phone, setPhone] = useState(profile?.contact_phone ?? '');
  const [church, setChurch] = useState<{ id: string | null; name: string }>({ id: profile?.church_id ?? null, name: profile?.church_name ?? '' });
  const [isPrivate, setIsPrivate] = useState(!!profile?.is_private);
  // Members under 14 are always private: the switch shows on and can't be moved.
  const restricted = profile?.restricted === true;
  const [readReceipts, setReadReceipts] = useState(profile ? profile.read_receipts !== false : true);
  const [photo, setPhoto] = useState<{ uri: string; width: number } | null>(null);
  const [sheet, setSheet] = useState<'gender' | 'contact' | 'links' | null>(null);
  // Saving goes in steps: the new photo first (shown turning over the picture), then the details.
  const [stage, setStage] = useState<'' | 'photo' | 'saving'>('');
  const busy = stage !== '';
  // A ref as well: two quick taps on Done arrive before `busy` has drawn.
  const busyRef = useRef(false);
  const [problems, setProblems] = useState<Problems>({});
  // Anything else that went wrong, at the top of the form.
  const [err, setErr] = useState('');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  // The line being typed in stays above the keyboard; Next moves down the form.
  const kb = useKeyboardReveal(72);
  const usernameRef = useRef<TextInput>(null);
  const pronounsRef = useRef<TextInput>(null);
  const bioRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);

  // Coming back from the church list with a choice.
  useFocusEffect(
    useCallback(() => {
      const id = typeof params.church === 'string' ? params.church : '';
      if (!id) return;
      if (id === 'none') {
        setChurch({ id: null, name: '' });
        return;
      }
      fetchChurch(id).then((c) => { if (c) setChurch({ id: c.id, name: c.name }); }).catch(() => {});
    }, [params.church]),
  );

  async function choose() {
    if (busyRef.current) return;
    try {
      const [a] = await pickFromLibrary({ square: true });
      if (a) setPhoto({ uri: a.uri, width: a.width });
    } catch (e) {
      setErr(errText(e));
    }
  }

  function toTop() {
    kb.ref.current?.scrollTo({ y: 0, animated: true });
  }

  async function save() {
    if (busyRef.current) return;
    const u = username.trim().toLowerCase();
    const before = profile?.username ?? '';
    const found: Problems = {};
    if (!name.trim()) found.name = 'Add your name.';
    if (!/^[a-z0-9_]{3,30}$/.test(u)) found.username = 'Usernames use 3 to 30 lowercase letters, numbers or underscores.';
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) found.email = 'That contact email does not look right.';
    setErr('');
    setProblems(found);
    if (found.name || found.username || found.email) {
      tap('warning');
      // Name and username are at the top of the form, where their problems now show.
      if (found.name || found.username) toTop();
      return;
    }
    busyRef.current = true;
    setStage(photo ? 'photo' : 'saving');
    try {
      const patch: Parameters<typeof updateProfile>[1] = {
        full_name: name.trim().slice(0, 80),
        username: u,
        bio: bio.trim().slice(0, 500),
        website: website.trim().slice(0, 500),
        pronouns: pronouns.trim().slice(0, 40),
        gender: gender.slice(0, 40),
        contact_email: email.trim().slice(0, 200),
        contact_phone: phone.trim().slice(0, 40),
        church_id: church.id,
        is_private: restricted || isPrivate,
        read_receipts: readReceipts,
      };
      if (photo) {
        patch.avatar_url = (await uploadImage(me, photo.uri, photo.width, 480)).url;
        if (alive.current) setStage('saving');
      }
      // Saving announces the change, so the profile is loaded again everywhere it shows.
      await updateProfile(me, patch);
      // Members can log in with their username, which Clerk checks, so Clerk is told of a new one.
      // The app's username is saved either way: if Clerk won't take it (its rules differ, or someone
      // there has it), logging in simply carries on with email.
      let loginNote = '';
      if (user && user.username !== u) {
        try {
          await withTimeout(user.update({ username: u }), 10000);
        } catch {
          // Only worth a word when they have just chosen the name; otherwise it would nag on every save.
          if (u !== before) loginNote = "Saved. Logging in with this username isn't available, use your email.";
        }
      }
      tap('success');
      toast(loginNote || 'Profile saved');
      if (alive.current) router.back();
    } catch (e) {
      const text = errText(e);
      if (!alive.current) return toast(text);
      // A username someone else has, or one the database won't take, is shown under the username.
      if (/username/i.test(text)) setProblems({ username: text });
      else setErr(text);
      toTop();
      busyRef.current = false;
      setStage('');
    }
  }

  const contact = [email.trim(), phone.trim()].filter(Boolean).length;
  const field = { onFocus: kb.onFocus, onBlur: kb.onBlur };

  return (
    <Screen>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
        {/* Both sides take the same room, so the title stays centred. */}
        <View style={{ minWidth: 64 }}>
          <RoundButton name="back" label="Cancel" onPress={() => router.back()} />
        </View>
        <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, color: C.fg, fontSize: 20.5, fontWeight: '700', textAlign: 'center', fontFamily: fontBold }}>Edit profile</Text>
        <Pressable onPress={save} disabled={busy} hitSlop={8} accessibilityRole="button" accessibilityLabel="Done" accessibilityState={{ busy, disabled: busy }} style={({ pressed }) => ({ minWidth: 64, height: 44, flexShrink: 0, alignItems: 'flex-end', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
          {busy ? <ActivityIndicator color={C.accent2} /> : <Text numberOfLines={1} style={{ color: C.accent2, fontWeight: '700', fontSize: 17 }}>Done</Text>}
        </Pressable>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={kb.ref} onScroll={kb.onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <Pressable onPress={choose} disabled={busy} accessibilityRole="button" accessibilityLabel="Edit picture" accessibilityState={{ busy: stage === 'photo' }} style={({ pressed }) => ({ alignItems: 'center', gap: 14, paddingTop: 10, paddingBottom: 18, opacity: pressed ? 0.75 : 1 })}>
            <View>
              <Avatar uri={photo?.uri ?? profile?.avatar_url} name={name} size={94} />
              {/* The new picture going up: it turns over the photo until it is saved. */}
              {stage === 'photo' ? (
                <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 47, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color="#ffffff" />
                </View>
              ) : null}
            </View>
            <Text style={{ color: C.accent2, fontWeight: '700', fontSize: 16.5 }}>Edit picture or avatar</Text>
          </Pressable>

          {err ? <Text accessibilityLiveRegion="polite" style={{ color: C.like, paddingHorizontal: 16, paddingBottom: 12, textAlign: 'center', lineHeight: 20 }}>{err}</Text> : null}

          <Line
            label="Name"
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (problems.name) setProblems((p) => ({ ...p, name: undefined }));
            }}
            maxLength={80}
            textContentType="name"
            autoComplete="name"
            error={problems.name}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => usernameRef.current?.focus()}
            {...field}
          />
          <Line
            ref={usernameRef}
            label="Username"
            value={username}
            onChangeText={(v) => {
              setUsername(v.toLowerCase());
              if (problems.username) setProblems((p) => ({ ...p, username: undefined }));
            }}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            maxLength={30}
            error={problems.username}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => pronounsRef.current?.focus()}
            {...field}
          />
          <Line ref={pronounsRef} label="Pronouns" value={pronouns} onChangeText={setPronouns} maxLength={40} autoCapitalize="none" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => bioRef.current?.focus()} {...field} />
          <Line ref={bioRef} label="Bio" value={bio} onChangeText={setBio} maxLength={500} multiline {...field} />

          <Pick label="Links" sub={website.trim() || 'Add a website'} onPress={() => setSheet('links')} accent={!website.trim() ? <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: C.accent, justifyContent: 'center', marginRight: 10 }}><Text style={{ color: C.onAccent, fontWeight: '700', fontSize: 13 }}>New</Text></View> : null} />
          <Pick label="Gender" value={gender || 'Gender'} onPress={() => setSheet('gender')} />
          <Pick label="Church" sub={church.name || 'Choose your home church'} onPress={() => router.push({ pathname: '/churches', params: { pick: '1' } } as any)} />

          <Divider />
          <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 20, fontWeight: '700', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8, fontFamily: fontBold }}>Profile information</Text>
          <Pick label="Category" value={profile?.account_type === 'creator' ? profile.category || 'None' : 'Creator accounts'} onPress={() => router.push('/account-type')} />
          <Pick label="Contact options" value={contact ? `${contact} added` : undefined} error={problems.email} onPress={() => setSheet('contact')} />
          <Pick label="Action buttons" value={profile?.faq_enabled ? 'Questions on' : 'None active'} onPress={() => router.push('/faq')} />
          <Pick label="Profile display" value={profile?.show_view_counts ? 'View counts on' : 'View counts off'} onPress={() => router.push('/view-counts')} />
          <Pick
            icon="palette"
            label="Profile style"
            sub={profile?.plus ? `${RING_STYLES.find((r) => r.id === (profile.ring_color ?? ''))?.label ?? 'Green'} ring · ${profileTheme(profile.profile_theme).label} theme` : undefined}
            onPress={() => router.push('/profile-style')}
            accent={<PlusLabel />}
          />
          <Switch
            label="Private account"
            sub={restricted ? 'Accounts of members under 14 stay private.' : undefined}
            value={restricted || isPrivate}
            onChange={setIsPrivate}
            disabled={restricted}
          />
          <Switch
            label="Read receipts"
            value={readReceipts}
            onChange={setReadReceipts}
            disabled={!profile?.plus}
            onPress={profile?.plus ? undefined : () => { toast('Turning off read receipts is part of Community Plus'); router.push('/plus'); }}
          />
          <Pressable onPress={() => router.push('/account')} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 18, opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: C.accent2, fontSize: 17 }}>Personal information settings</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet visible={sheet === 'gender'} onClose={() => setSheet(null)} title="Gender">
        {GENDERS.map((g) => (
          <Pressable key={g} onPress={() => { tap('select'); setGender(g); setSheet(null); }} accessibilityRole="radio" accessibilityState={{ checked: gender === g }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, minHeight: 50, backgroundColor: pressed ? C.press : 'transparent' })}>
            <Text style={{ color: C.fg, fontSize: 17 }}>{g}</Text>
            <Radio on={gender === g} />
          </Pressable>
        ))}
        <Pressable onPress={() => { setGender(''); setSheet(null); }} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 20, minHeight: 50, justifyContent: 'center', backgroundColor: pressed ? C.press : 'transparent' })}>
          <Text style={{ color: C.fg2, fontSize: 16 }}>Clear</Text>
        </Pressable>
      </Sheet>

      <Sheet visible={sheet === 'contact'} onClose={() => setSheet(null)} title="Contact options">
        <View style={{ paddingHorizontal: 20, gap: 12, paddingBottom: 8 }}>
          <Field
            label="Email"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (problems.email) setProblems((p) => ({ ...p, email: undefined }));
            }}
            error={problems.email}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => phoneRef.current?.focus()}
          />
          {/* Field hands everything on to its text box, `ref` included; its type just doesn't list it. */}
          <Field {...({ ref: phoneRef } as {})} label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" textContentType="telephoneNumber" placeholder="+44 …" />
          <Button label="Done" onPress={() => setSheet(null)} />
        </View>
      </Sheet>

      <Sheet visible={sheet === 'links'} onClose={() => setSheet(null)} title="Links">
        <View style={{ paddingHorizontal: 20, gap: 12, paddingBottom: 8 }}>
          <Field label="Website" value={website} onChangeText={setWebsite} autoCapitalize="none" autoCorrect={false} keyboardType="url" textContentType="URL" placeholder="https://" maxLength={500} returnKeyType="done" onSubmitEditing={() => setSheet(null)} />
          <Button label="Done" onPress={() => setSheet(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}
