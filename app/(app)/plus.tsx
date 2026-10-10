import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon, IconName, VerifiedTick } from '../../src/components/Icon';
import { Button, Row, Screen, ScreenHeader, SectionLabel, Sheet, Toggle, useToast } from '../../src/components/ui';
import { myPlusRequests, PLUS_PRICE_PENCE, requestPlus, updateProfile } from '../../src/lib/api';
import { fontById } from '../../src/lib/fonts';
import { usePrefs } from '../../src/lib/prefs';
import { useSession } from '../../src/lib/session';
import { C, dayLabel, errText } from '../../src/lib/theme';
import type { PlusRequest } from '../../src/lib/types';

/** What Plus gives. The daily Erha allowance for everyone else lives in the Erha function. */
const PLUS_FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'verified', title: 'The verified tick', body: 'Next to your name on your profile, your posts, your comments and in chats.' },
  { icon: 'sparkle', title: 'Erha without limits', body: 'Ask Erha as much as you like. Everyone else gets 15 messages a day.' },
  { icon: 'font', title: 'App fonts', body: 'Set the whole app in Nunito, Lora or Poppins.' },
  { icon: 'wallpaper', title: 'Chat wallpapers', body: 'A look of your own behind every conversation.' },
  { icon: 'sliders', title: 'Advanced photo editing', body: 'Fine control over light, colour and detail before you post.' },
  { icon: 'eye', title: 'See who viewed your profile', body: 'The people who looked at your profile this week, by name.' },
  { icon: 'lock', title: 'Read receipts off', body: 'Read messages in your own time without anyone seeing "Seen".' },
  { icon: 'boost', title: 'Boost a post', body: 'Put a post at the top of For you for everyone to see.' },
  { icon: 'headphones', title: 'Share on Pod', body: 'Upload your songs and podcast episodes for the community to play.' },
  { icon: 'people', title: 'A direct line to the admins', body: 'Your reports and requests go to the front of the queue.' },
  { icon: 'bulb', title: 'New features first', body: 'Try what is coming to Community before everyone else.' },
];

const PRICE = '£' + (PLUS_PRICE_PENCE / 100).toFixed(2);

export default function Plus() {
  const { me, profile, refresh } = useSession();
  const router = useRouter();
  const toast = useToast();
  const { appFont } = usePrefs();
  const [requests, setRequests] = useState<PlusRequest[]>([]);
  const [asking, setAsking] = useState<'verify' | 'plus' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // Read receipts: shown at once when tapped, then put back if the save fails.
  const [receipts, setReceipts] = useState(profile?.read_receipts ?? true);
  useEffect(() => { setReceipts(profile?.read_receipts ?? true); }, [profile?.read_receipts]);

  const load = useCallback(() => {
    myPlusRequests(me).then(setRequests).catch(() => {});
  }, [me]);
  useFocusEffect(load);

  const pending = (kind: 'verify' | 'plus') => requests.find((r) => r.kind === kind && r.status === 'pending');

  function setReadReceipts(next: boolean) {
    const before = receipts;
    setReceipts(next);
    updateProfile(me, { read_receipts: next }).then(refresh).catch((e) => { setReceipts(before); toast(errText(e)); });
  }

  async function send() {
    if (!asking || busy) return;
    setBusy(true);
    try {
      await requestPlus(me, asking, note);
      toast(asking === 'plus' ? 'Request sent. An admin will activate Plus once your church confirms it.' : 'Request sent. An admin will take a look.');
      setAsking(null);
      setNote('');
      load();
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const until = profile?.plus_until ? dayLabel(new Date(profile.plus_until)) : '';

  return (
    <Screen>
      <ScreenHeader title="Community Plus" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ alignItems: 'center', paddingVertical: 22, gap: 10 }}>
          <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(61,139,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
            <VerifiedTick size={54} />
          </View>
          <Text style={{ color: C.fg, fontSize: 24, fontWeight: '800' }}>Community Plus</Text>
          <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 21, paddingHorizontal: 32 }}>
            {profile?.plus ? `Active until ${until}. Thank you for supporting the community.` : 'Support the community and get the verified tick, Erha without limits and more.'}
          </Text>
        </View>

        <View style={{ marginHorizontal: 16, borderRadius: 18, backgroundColor: C.surface, overflow: 'hidden' }}>
          {PLUS_FEATURES.map((f, i) => (
            <View key={f.title} style={{ flexDirection: 'row', gap: 14, padding: 16, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(31,191,90,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                {f.icon === 'verified' ? <VerifiedTick size={22} /> : <Icon name={f.icon} size={22} color={C.accent2} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.fg, fontWeight: '700', fontSize: 16 }}>{f.title}</Text>
                <Text style={{ color: C.fg2, marginTop: 2, lineHeight: 19 }}>{f.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={{ color: C.fg, fontWeight: '700', textAlign: 'center', paddingTop: 18, fontSize: 15.5 }}>{PRICE} a month, arranged through your church</Text>

        {profile?.plus ? (
          <>
            <SectionLabel>Your Plus settings</SectionLabel>
            <View style={{ marginHorizontal: 16, borderRadius: 18, backgroundColor: C.surface, overflow: 'hidden', paddingVertical: 4 }}>
              <Row icon="font" title="App font" value={fontById(appFont).name} onPress={() => router.push('/plus-font')} />
              <Row icon="wallpaper" title="Chat wallpaper" onPress={() => router.push('/chat-wallpaper' as any)} />
              <Row icon="eye" title="Profile viewers" onPress={() => router.push('/profile-viewers')} />
              <Row icon="lock" title="Read receipts" sub={receipts ? 'People see when you have read their messages' : 'Nobody sees "Seen" on your side'} right={<Toggle value={receipts} onChange={setReadReceipts} label="Read receipts" />} />
            </View>
          </>
        ) : null}

        <View style={{ paddingHorizontal: 16, paddingTop: 22, gap: 10 }}>
          {profile?.plus ? (
            <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 20 }}>Plus renews through your church. Speak to an admin to extend it.</Text>
          ) : pending('plus') ? (
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: C.surface }}>
              <Text style={{ color: C.fg, fontWeight: '700' }}>Your Plus request is with the admins</Text>
              <Text style={{ color: C.fg2, marginTop: 2, lineHeight: 19 }}>Sent {dayLabel(new Date(pending('plus')!.created_at))}. Plus is activated once your church confirms your contribution.</Text>
            </View>
          ) : (
            <Button label="Get Community Plus" onPress={() => setAsking('plus')} />
          )}
          {!profile?.verified && !profile?.plus ? (
            pending('verify') ? (
              <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 20 }}>Your request for the tick is with the admins.</Text>
            ) : (
              <Button label="Request the tick only" kind="ghost" onPress={() => setAsking('verify')} />
            )
          ) : null}
          <Text style={{ color: C.fg3, fontSize: 13, textAlign: 'center', lineHeight: 18, paddingTop: 6 }}>
            Plus is arranged through your local church, so your contribution stays with your church. An admin activates it in the app.
          </Text>
        </View>
      </ScrollView>

      <Sheet visible={asking !== null} onClose={() => setAsking(null)} title={asking === 'plus' ? 'Get Community Plus' : 'Request the verified tick'}>
        <View style={{ paddingHorizontal: 20, gap: 12, paddingBottom: 8 }}>
          <Text style={{ color: C.fg2, lineHeight: 20 }}>
            {asking === 'plus' ? 'Tell the admins which church you belong to and how you have contributed, so they can confirm it with your church.' : 'Tell the admins who you are at church — a role, a ministry, or the pastor who can vouch for you.'}
          </Text>
          <TextInput value={note} onChangeText={setNote} placeholder="A short note for the admins" placeholderTextColor={C.fg3} multiline maxLength={500} keyboardAppearance="dark" accessibilityLabel="Note for the admins" style={{ minHeight: 96, color: C.fg, fontSize: 16, padding: 14, borderRadius: 12, backgroundColor: C.surface, textAlignVertical: 'top' }} />
          <Button label="Send request" onPress={send} busy={busy} />
        </View>
      </Sheet>
    </Screen>
  );
}
