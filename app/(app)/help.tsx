import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { appVersion, askForStoreRating, StarPicker, STORE_LABEL } from '../../src/components/FeedbackPrompt';
import { Icon } from '../../src/components/Icon';
import { LegalRows, useLegalSheet } from '../../src/components/LegalDocument';
import { ThinkingOrb } from '../../src/components/ThinkingOrb';
import { Button, Divider, Row, Screen, ScreenHeader, SectionLabel, Sheet, useToast } from '../../src/components/ui';
import { mySupportTickets, PLUS_PRICE_PENCE, sendFeedback } from '../../src/lib/api';
import { useAppFont } from '../../src/lib/fonts';
import { tap } from '../../src/lib/haptics';
import { type Key, useT } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { agoLong, BUBBLE, C, errText } from '../../src/lib/theme';
import type { Feedback, SupportTicket } from '../../src/lib/types';

const PRICE = '£' + (PLUS_PRICE_PENCE / 100).toFixed(2);

// The questions and answers are keys, shown in the app's language. {price} in the Plus answer is the monthly price.
const QA: { q: Key; a: Key }[] = [
  { q: 'help.qSupport', a: 'help.aSupport' },
  { q: 'help.qAccount', a: 'help.aAccount' },
  { q: 'help.qPrivate', a: 'help.aPrivate' },
  { q: 'help.qApps', a: 'help.aApps' },
  { q: 'help.qPlus', a: 'help.aPlus' },
  { q: 'help.qTick', a: 'help.aTick' },
  { q: 'help.qAds', a: 'help.aAds' },
  { q: 'help.qErha', a: 'help.aErha' },
  { q: 'help.qPod', a: 'help.aPod' },
  { q: 'help.qCalls', a: 'help.aCalls' },
  { q: 'help.qDelete', a: 'help.aDelete' },
  { q: 'help.qReport', a: 'help.aReport' },
];

/** What each feedback sheet says, as keys looked up when it is drawn. */
const SHEETS: Record<Feedback['kind'], { title: Key; placeholder: Key; thanks: Key }> = {
  review: { title: 'help.rateTitle', placeholder: 'help.ratePlaceholder', thanks: 'help.rateThanks' },
  idea: { title: 'help.suggestIdea', placeholder: 'help.ideaPlaceholder', thanks: 'help.ideaThanks' },
  problem: { title: 'help.reportProblem', placeholder: 'help.problemPlaceholder', thanks: 'help.problemThanks' },
};

/** A function, not a table, so the colours are read from the theme in use when it is drawn. `label` is a key. */
function statusLook(status: SupportTicket['status']): { label: Key; color: string; bg: string } {
  if (status === 'open') return { label: 'help.statusOpen', color: C.close, bg: C.close + '24' };
  if (status === 'answered') return { label: 'help.statusAnswered', color: C.accent2, bg: C.accentSoft };
  return { label: 'help.statusClosed', color: C.fg2, bg: C.surface2 };
}

function Question({ q, a, open, onPress, first }: { q: string; a: string; open: boolean; onPress: () => void; first: boolean }) {
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: C.line }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={q} accessibilityState={{ expanded: open }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: pressed ? C.press : 'transparent' })}>
        <Text style={{ flex: 1, color: C.fg, fontSize: 16, fontWeight: open ? '700' : '500', lineHeight: 21, fontFamily: open ? fontBold : font }}>{q}</Text>
        <Icon name={open ? 'down' : 'right'} size={16} color={C.fg2} weight={2} />
      </Pressable>
      {open ? <Text style={{ color: C.fg2, fontSize: 15, lineHeight: 21, paddingHorizontal: 16, paddingBottom: 16, fontFamily: font }}>{a}</Text> : null}
    </View>
  );
}

/** Live support first, then quick answers, then a way to tell us how we're doing. */
export default function Help() {
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  // The policies open in a sheet over Help.
  const legal = useLegalSheet();
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  const [open, setOpen] = useState(-1);
  // Tickets from before live chat, still worth reading if the member had any.
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  // Which sheet, kept after it closes so its content doesn't vanish while it slides away.
  const [sheet, setSheet] = useState<Feedback['kind']>('review');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  // A happy review has been sent: the sheet now offers the store.
  const [thanked, setThanked] = useState(false);
  const later = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      mySupportTickets(me).then(setTickets).catch(() => {});
    }, [me]),
  );

  useEffect(
    () => () => {
      if (later.current) clearTimeout(later.current);
    },
    [],
  );

  function openSheet(kind: Feedback['kind']) {
    setStars(0);
    setWords('');
    setThanked(false);
    setSheet(kind);
    setSheetOpen(true);
  }

  const canSend = sheet === 'review' ? stars > 0 : !!words.trim();

  async function send() {
    if (!sheetOpen || busy || !canSend) return;
    const kind = sheet;
    setBusy(true);
    try {
      await sendFeedback(me, { kind, rating: kind === 'review' ? stars : null, text: words, app_version: appVersion(), platform: Platform.OS });
      tap('success');
      if (kind === 'review' && stars >= 4) {
        setThanked(true);
      } else {
        setSheetOpen(false);
        toast(t(SHEETS[kind].thanks));
      }
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  }

  function rateInStore() {
    setSheetOpen(false);
    // Once our sheet has slid away: the phone won't show its own card over another one.
    if (later.current) clearTimeout(later.current);
    later.current = setTimeout(() => {
      later.current = null;
      askForStoreRating(true).then((shown) => {
        if (!shown) toast(t('help.storeUnavailable'));
      });
    }, 600);
  }

  const about = { title: t(SHEETS[sheet].title), placeholder: t(SHEETS[sheet].placeholder) };

  return (
    <Screen>
      <ScreenHeader title={t('help.title')} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 16, gap: 4 }}>
          <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 30, fontWeight: '800', letterSpacing: -0.4, fontFamily: fontBold }}>{t('help.headline')}</Text>
          <Text style={{ color: C.fg2, fontSize: 15.5, lineHeight: 21, fontFamily: font }}>{t('help.intro')}</Text>
        </View>

        <Pressable onPress={() => router.push('/support-chat' as any)} accessibilityRole="button" accessibilityLabel={`${t('help.chat')}. ${t('help.chatSub')}.`} style={({ pressed }) => ({ marginHorizontal: 16, borderRadius: 24, overflow: 'hidden', transform: [{ scale: pressed ? 0.98 : 1 }] })}>
          <LinearGradient colors={[BUBBLE[0], BUBBLE[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <ThinkingOrb size={36} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '800', fontFamily: fontBold }}>{t('help.chat')}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14.5, lineHeight: 20, fontFamily: font }}>{t('help.chatSub')}</Text>
            </View>
            <Icon name="right" size={20} color="#ffffff" weight={2.2} />
          </LinearGradient>
        </Pressable>

        <SectionLabel>{t('help.commonQuestions')}</SectionLabel>
        <View style={{ marginHorizontal: 16, borderRadius: 16, backgroundColor: C.surface, overflow: 'hidden' }}>
          {QA.map((item, i) => (
            <Question key={item.q} q={t(item.q)} a={t(item.a, { price: PRICE })} open={open === i} first={i === 0} onPress={() => setOpen(open === i ? -1 : i)} />
          ))}
        </View>

        <SectionLabel>{t('help.tellUs')}</SectionLabel>
        <Row icon="star" title={t('help.rateApp')} sub={t('help.rateAppSub')} onPress={() => openSheet('review')} />
        <Row icon="bulb" title={t('help.suggestIdea')} sub={t('help.suggestIdeaSub')} onPress={() => openSheet('idea')} />
        <Row icon="flag" title={t('help.reportProblem')} sub={t('help.reportProblemSub')} onPress={() => openSheet('problem')} />

        <SectionLabel>{t('legal.title')}</SectionLabel>
        <LegalRows onOpen={legal.open} />

        {tickets.length ? (
          <>
            <Divider />
            <SectionLabel>{t('help.earlierMessages')}</SectionLabel>
            {tickets.map((tk) => {
              const s = statusLook(tk.status);
              const status = t(s.label);
              return (
                <View key={tk.id} style={{ marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 16, backgroundColor: C.surface, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text numberOfLines={2} style={{ flex: 1, color: C.fg, fontWeight: '700', lineHeight: 20 }}>{tk.subject || t('help.noSubject')}</Text>
                    <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: s.bg, justifyContent: 'center' }} accessibilityLabel={t('help.status', { status })}>
                      <Text style={{ color: s.color, fontSize: 12, fontWeight: '700' }}>{status}</Text>
                    </View>
                  </View>
                  <Text style={{ color: C.fg2, fontSize: 14.5, lineHeight: 20 }}>{tk.body}</Text>
                  <Text style={{ color: C.fg3, fontSize: 12.5 }}>{t('help.sent', { when: agoLong(tk.created_at) })}</Text>
                  {tk.reply ? (
                    <View style={{ padding: 12, borderRadius: 12, backgroundColor: C.bg2, gap: 4 }}>
                      <Text style={{ color: C.accent2, fontSize: 12.5, fontWeight: '700' }}>{t('help.replyFromTeam')}</Text>
                      <Text style={{ color: C.fg, lineHeight: 20 }}>{tk.reply}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
            <Text style={{ color: C.fg3, fontSize: 13, lineHeight: 18, paddingHorizontal: 16, paddingTop: 2 }}>{t('help.anythingNew')}</Text>
          </>
        ) : null}
      </ScrollView>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title={thanked ? t('help.thankYou') : about.title}>
        {thanked ? (
          <View style={{ paddingHorizontal: 20, gap: 14, paddingBottom: 6 }}>
            <Text style={{ color: C.fg2, fontSize: 15.5, lineHeight: 22, textAlign: 'center', marginTop: -8, fontFamily: font }}>
              {t('help.gladBody')}
            </Text>
            <Button label={t(STORE_LABEL)} onPress={rateInStore} />
            <Button label={t('help.maybeLater')} kind="ghost" onPress={() => setSheetOpen(false)} />
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, gap: 16, paddingBottom: 6 }}>
            {sheet === 'review' ? <StarPicker value={stars} onChange={setStars} /> : null}
            <TextInput
              value={words}
              onChangeText={setWords}
              placeholder={about.placeholder}
              placeholderTextColor={C.fg3}
              multiline
              maxLength={2000}
              autoFocus={sheet !== 'review'}
              keyboardAppearance={C.blurTint}
              accessibilityLabel={about.placeholder}
              style={{ minHeight: 110, maxHeight: 200, color: C.fg, fontSize: 16, padding: 12, borderRadius: 14, backgroundColor: C.field, textAlignVertical: 'top', fontFamily: font }}
            />
            {sheet === 'problem' ? <Text style={{ color: C.fg3, fontSize: 13, lineHeight: 18, marginTop: -6, fontFamily: font }}>{t('help.problemNote')}</Text> : null}
            <Button label={t('common.send')} onPress={send} busy={busy} disabled={!canSend} />
          </View>
        )}
      </Sheet>
      {legal.element}
    </Screen>
  );
}
