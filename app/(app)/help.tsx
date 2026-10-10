import React, { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon } from '../../src/components/Icon';
import { Divider, Row, Screen, ScreenHeader, SectionLabel, useToast } from '../../src/components/ui';
import { mySupportTickets, PLUS_PRICE_PENCE } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { agoLong, C, errText } from '../../src/lib/theme';
import type { SupportTicket } from '../../src/lib/types';

/** Where email goes. Admins answer inside the app, so this is the slow road. */
const SUPPORT_EMAIL = 'support@community.church';

const PRICE = '£' + (PLUS_PRICE_PENCE / 100).toFixed(2);

const QA: { q: string; a: string }[] = [
  {
    q: 'How do I set up my account, or add another one?',
    a: 'Sign in with your email, your phone number, or Apple or Google. Your username and photo are set under Settings, then Account. You can add a second account from the same place and switch between them without logging out.',
  },
  {
    q: 'What does a private account do?',
    a: 'Only the people who follow you see your posts and stories. Anyone else who taps Follow sends you a request, which you accept or decline from Notifications. Turn it on or off under Account. Your messages and your profile picture work the same either way.',
  },
  {
    q: 'What is Community Plus and how do I get it?',
    a: `Plus is ${PRICE} a month, arranged through your local church so your contribution stays with your church. It gives you the verified tick, Erha without limits, app fonts, chat wallpapers, profile viewers, read receipts off, boosted posts and sharing on Pod. Ask for it under Settings, then Community Plus: an admin activates it once your church confirms.`,
  },
  {
    q: 'What is Erha?',
    a: "Erha is the church assistant built into the app. Ask it about a Bible passage, a hymn, this week's lesson or anything about church life. Everyone gets 15 messages a day; Plus members have no limit.",
  },
  {
    q: 'What is Pod?',
    a: "Pod is where the community's songs and podcasts live. Anyone can listen, save to their library and attach a song to a post. Plus members can share their own songs and episodes.",
  },
  {
    q: 'How do calls and going live work?',
    a: 'Open a chat and tap the phone or camera icon to call that person over the internet; they can accept or decline. To go live, choose Live when you tap +. Your followers are told, and the broadcast shows at the top of Home while it runs. Ending it removes it.',
  },
  {
    q: 'How do I delete my account, and what are the 30 days?',
    a: 'Under Settings, then Account, choose Delete account. Your profile, posts and messages are hidden straight away. For 30 days you can sign back in and restore everything exactly as it was. After 30 days it is all deleted for good and cannot be brought back.',
  },
  {
    q: 'How do I report something?',
    a: 'Tap the three dots on a post, comment or profile and choose Report, then say what is wrong. An admin looks at every report. You can also block an account from its profile: they will not see you and you will not see them.',
  },
];

const STATUS: Record<SupportTicket['status'], { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: C.close, bg: 'rgba(61,139,255,0.14)' },
  answered: { label: 'Answered', color: C.accent2, bg: 'rgba(31,191,90,0.14)' },
  closed: { label: 'Closed', color: C.fg2, bg: C.surface2 },
};

function Question({ q, a, open, onPress, first }: { q: string; a: string; open: boolean; onPress: () => void; first: boolean }) {
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: C.line }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={q} accessibilityState={{ expanded: open }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent' })}>
        <Text style={{ flex: 1, color: C.fg, fontSize: 16, fontWeight: open ? '700' : '500', lineHeight: 21 }}>{q}</Text>
        <Icon name={open ? 'down' : 'right'} size={16} color={C.fg2} weight={2} />
      </Pressable>
      {open ? <Text style={{ color: C.fg2, fontSize: 15, lineHeight: 21, paddingHorizontal: 16, paddingBottom: 16 }}>{a}</Text> : null}
    </View>
  );
}

/** Answers to the usual questions, a way to reach the admins, and the tickets you have sent them. */
export default function Help() {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(-1);
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      mySupportTickets(me).then(setTickets).catch(() => setTickets([]));
    }, [me]),
  );

  function email() {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch((e) => toast(errText(e)));
  }

  return (
    <Screen>
      <ScreenHeader title="Help and support" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <SectionLabel>Common questions</SectionLabel>
        <View style={{ marginHorizontal: 16, borderRadius: 16, backgroundColor: C.surface, overflow: 'hidden' }}>
          {QA.map((item, i) => (
            <Question key={item.q} q={item.q} a={item.a} open={open === i} first={i === 0} onPress={() => setOpen(open === i ? -1 : i)} />
          ))}
        </View>

        <SectionLabel>Contact us</SectionLabel>
        <Row icon="lifebuoy" title="Message support" sub="An admin replies here, in the app" onPress={() => router.push('/support-ticket')} />
        <Row icon="mail" title="Email" sub={SUPPORT_EMAIL} onPress={email} />
        <Text style={{ color: C.fg3, fontSize: 13, lineHeight: 18, paddingHorizontal: 16, paddingTop: 8 }}>Admins answer in the app, so a message from here reaches them fastest.</Text>
        <Divider />

        <SectionLabel>Your tickets</SectionLabel>
        {!tickets || !tickets.length ? (
          <Text style={{ color: C.fg2, paddingHorizontal: 16, lineHeight: 20 }}>{tickets === null ? 'Loading your tickets.' : 'Nothing sent yet. When you message support, your ticket and the reply appear here.'}</Text>
        ) : (
          tickets.map((t) => {
            const s = STATUS[t.status];
            return (
              <View key={t.id} style={{ marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 16, backgroundColor: C.surface, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text numberOfLines={2} style={{ flex: 1, color: C.fg, fontWeight: '700', lineHeight: 20 }}>{t.subject || 'No subject'}</Text>
                  <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: s.bg, justifyContent: 'center' }} accessibilityLabel={`Status: ${s.label}`}>
                    <Text style={{ color: s.color, fontSize: 12, fontWeight: '700' }}>{s.label}</Text>
                  </View>
                </View>
                <Text style={{ color: C.fg2, fontSize: 14.5, lineHeight: 20 }}>{t.body}</Text>
                <Text style={{ color: C.fg3, fontSize: 12.5 }}>Sent {agoLong(t.created_at)}</Text>
                {t.reply ? (
                  <View style={{ padding: 12, borderRadius: 12, backgroundColor: C.bg2, gap: 4 }}>
                    <Text style={{ color: C.accent2, fontSize: 12.5, fontWeight: '700' }}>Reply from the admins</Text>
                    <Text style={{ color: C.fg, lineHeight: 20 }}>{t.reply}</Text>
                  </View>
                ) : t.status === 'open' ? (
                  <Text style={{ color: C.fg3, fontSize: 13 }}>Waiting for an admin.</Text>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}
