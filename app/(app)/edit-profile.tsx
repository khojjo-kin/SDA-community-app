import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Icon, IconName } from '../../src/components/Icon';
import { Avatar, Button, Divider, Field, Radio, RoundButton, Screen, Sheet, Toggle, useToast } from '../../src/components/ui';
import { fetchChurch, updateProfile, uploadImage } from '../../src/lib/api';
import { pickFromLibrary } from '../../src/lib/pick';
import { useSession } from '../../src/lib/session';
import { profileTheme, RING_STYLES } from '../../src/lib/styling';
import { C, errText } from '../../src/lib/theme';

const GENDERS = ['Female', 'Male', 'Custom', 'Prefer not to say'] as const;

/** One line of the form: the label on the left, what you type on the right, a hairline underneath. */
function Line({ label, value, onChangeText, placeholder, multiline, ...rest }: TextInputProps & { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', paddingLeft: 16 }}>
      <Text style={{ width: 96, color: C.fg, fontSize: 16.5, paddingTop: multiline ? 12 : 0 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={C.fg3}
        multiline={multiline}
        keyboardAppearance={C.blurTint}
        selectionColor={C.accent2}
        accessibilityLabel={label}
        {...rest}
        style={{ flex: 1, color: C.fg, fontSize: 16.5, paddingVertical: 12, paddingRight: 16, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, textAlignVertical: multiline ? 'top' : 'center' }}
      />
    </View>
  );
}

/** A line that opens something else, showing the current value on the right. */
function Pick({ label, value, sub, onPress, accent, icon }: { label: string; value?: string; sub?: string; onPress: () => void; accent?: React.ReactNode; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 54, backgroundColor: pressed ? C.press : 'transparent' })}>
      {icon ? <View style={{ marginRight: 14 }}><Icon name={icon} size={24} color={C.fg} /></View> : null}
      <View style={{ flex: 1, paddingVertical: sub ? 10 : 0 }}>
        <Text style={{ color: C.fg, fontSize: 16.5 }}>{label}</Text>
        {sub ? <Text style={{ color: C.fg2, fontSize: 14.5, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {accent}
      {value ? <Text numberOfLines={1} style={{ color: value === label ? C.fg3 : C.fg2, fontSize: 16, maxWidth: 170, marginRight: 8 }}>{value}</Text> : null}
      <Icon name="right" size={18} color={C.fg2} weight={2} />
    </Pressable>
  );
}

/** A line with a switch on the right. When `onPress` is given the whole line is tappable instead (the switch is then disabled). */
function Switch({ label, sub, value, onChange, disabled, onPress }: { label: string; sub: string; value: boolean; onChange: (next: boolean) => void; disabled?: boolean; onPress?: () => void }) {
  const body = (
    <>
      <View style={{ flex: 1, paddingVertical: 10 }}>
        <Text style={{ color: C.fg, fontSize: 16.5 }}>{label}</Text>
        <Text style={{ color: C.fg2, fontSize: 14.5, marginTop: 2, lineHeight: 19 }}>{sub}</Text>
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
  const { me, profile, refresh } = useSession();
  const router = useRouter();
  const toast = useToast();
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

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
    try {
      const [a] = await pickFromLibrary({ square: true });
      if (a) setPhoto({ uri: a.uri, width: a.width });
    } catch (e) {
      setErr(errText(e));
    }
  }

  async function save() {
    if (busy) return;
    const u = username.trim().toLowerCase();
    if (!name.trim()) return setErr('Add your name.');
    if (!/^[a-z0-9_]{3,30}$/.test(u)) return setErr('Usernames use 3 to 30 lowercase letters, numbers or underscores.');
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('That contact email does not look right.');
    setBusy(true);
    setErr('');
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
      if (photo) patch.avatar_url = (await uploadImage(me, photo.uri, photo.width, 480)).url;
      await updateProfile(me, patch);
      await refresh();
      toast('Profile saved');
      if (alive.current) router.back();
    } catch (e) {
      if (!alive.current) return toast(errText(e));
      setErr(errText(e));
      setBusy(false);
    }
  }

  const contact = [email.trim(), phone.trim()].filter(Boolean).length;

  return (
    <Screen>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
        <RoundButton name="back" label="Cancel" onPress={() => router.back()} />
        <Text accessibilityRole="header" style={{ flex: 1, color: C.fg, fontSize: 20.5, fontWeight: '700', textAlign: 'center' }}>Edit profile</Text>
        <Pressable onPress={save} disabled={busy} hitSlop={8} accessibilityRole="button" accessibilityLabel="Done" style={{ width: 44, alignItems: 'flex-end' }}>
          <Text style={{ color: C.accent2, fontWeight: '700', fontSize: 17, opacity: busy ? 0.4 : 1 }}>{busy ? '…' : 'Done'}</Text>
        </Pressable>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={choose} accessibilityRole="button" accessibilityLabel="Edit picture" style={{ alignItems: 'center', gap: 14, paddingTop: 10, paddingBottom: 18 }}>
            <Avatar uri={photo?.uri ?? profile?.avatar_url} name={name} size={94} />
            <Text style={{ color: C.accent2, fontWeight: '700', fontSize: 16.5 }}>Edit picture or avatar</Text>
          </Pressable>

          <Line label="Name" value={name} onChangeText={setName} maxLength={80} />
          <Line label="Username" value={username} onChangeText={(t) => setUsername(t.toLowerCase())} autoCapitalize="none" autoCorrect={false} maxLength={30} />
          <Line label="Pronouns" value={pronouns} onChangeText={setPronouns} maxLength={40} autoCapitalize="none" />
          <Line label="Bio" value={bio} onChangeText={setBio} maxLength={500} multiline />

          <Pick label="Links" sub={website.trim() || 'Add a website'} onPress={() => setSheet('links')} accent={!website.trim() ? <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: C.accent, justifyContent: 'center', marginRight: 10 }}><Text style={{ color: C.onAccent, fontWeight: '700', fontSize: 13 }}>New</Text></View> : null} />
          <Pick label="Gender" value={gender || 'Gender'} onPress={() => setSheet('gender')} />
          <Pick label="Church" sub={church.name || 'Choose your home church'} onPress={() => router.push({ pathname: '/churches', params: { pick: '1' } } as any)} />

          {err ? <Text style={{ color: C.like, paddingHorizontal: 16, paddingTop: 10 }}>{err}</Text> : null}

          <Divider />
          <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 20, fontWeight: '700', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 }}>Profile information</Text>
          <Pick label="Category" value={profile?.account_type === 'creator' ? profile.category || 'None' : 'Creator accounts'} onPress={() => router.push('/account-type')} />
          <Pick label="Contact options" value={contact ? `${contact} added` : undefined} onPress={() => setSheet('contact')} />
          <Pick label="Action buttons" value={profile?.faq_enabled ? 'Questions on' : 'None active'} onPress={() => router.push('/faq')} />
          <Pick label="Profile display" value={profile?.show_view_counts ? 'View counts on' : 'View counts off'} onPress={() => router.push('/view-counts')} />
          <Pick
            icon="palette"
            label="Profile style"
            sub={profile?.plus ? `${RING_STYLES.find((r) => r.id === (profile.ring_color ?? ''))?.label ?? 'Green'} ring · ${profileTheme(profile.profile_theme).label} theme` : 'Your ring colour and profile theme'}
            onPress={() => router.push('/profile-style')}
            accent={<PlusLabel />}
          />
          <Switch
            label="Private account"
            sub={restricted ? 'Only people you approve can see your posts and stories. Accounts of members under 14 stay private.' : 'Only people you approve can see your posts and stories'}
            value={restricted || isPrivate}
            onChange={setIsPrivate}
            disabled={restricted}
          />
          <Switch
            label="Read receipts"
            sub="Let people see when you have read their messages"
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
        <Text style={{ color: C.fg2, textAlign: 'center', paddingHorizontal: 24, paddingBottom: 12, lineHeight: 20 }}>This isn't part of your public profile.</Text>
        {GENDERS.map((g) => (
          <Pressable key={g} onPress={() => { setGender(g); setSheet(null); }} accessibilityRole="radio" accessibilityState={{ checked: gender === g }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, minHeight: 50 }}>
            <Text style={{ color: C.fg, fontSize: 17 }}>{g}</Text>
            <Radio on={gender === g} />
          </Pressable>
        ))}
        <Pressable onPress={() => { setGender(''); setSheet(null); }} style={{ paddingHorizontal: 20, minHeight: 50, justifyContent: 'center' }}>
          <Text style={{ color: C.fg2, fontSize: 16 }}>Clear</Text>
        </Pressable>
      </Sheet>

      <Sheet visible={sheet === 'contact'} onClose={() => setSheet(null)} title="Contact options">
        <View style={{ paddingHorizontal: 20, gap: 12, paddingBottom: 8 }}>
          <Text style={{ color: C.fg2, lineHeight: 20 }}>Shown on your profile so people from church can reach you. Leave either empty to keep it private.</Text>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="you@example.com" />
          <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+44 …" />
          <Button label="Done" onPress={() => setSheet(null)} />
        </View>
      </Sheet>

      <Sheet visible={sheet === 'links'} onClose={() => setSheet(null)} title="Links">
        <View style={{ paddingHorizontal: 20, gap: 12, paddingBottom: 8 }}>
          <Field label="Website" value={website} onChangeText={setWebsite} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://" maxLength={500} />
          <Button label="Done" onPress={() => setSheet(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}
