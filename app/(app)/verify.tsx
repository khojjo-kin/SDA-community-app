import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardReveal } from '../../src/components/AuthShell';
import { Icon, IconName, VerifiedTick } from '../../src/components/Icon';
import { Button, ErrorNote, Field, Loading, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { myPlusRequests, requestVerification, uploadVerificationPhoto, VERIFICATION_BUCKET } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { useT } from '../../src/lib/i18n';
import { pickFromLibrary, takePhoto, type Picked } from '../../src/lib/pick';
import { useSession } from '../../src/lib/session';
import { supabase } from '../../src/lib/supabase';
import { C, dayLabel, errText } from '../../src/lib/theme';
import type { DocumentType, PlusRequest } from '../../src/lib/types';

const DOCUMENTS: { value: DocumentType; label: string }[] = [
  { value: 'passport', label: 'Passport' },
  { value: 'driving_licence', label: 'Driving licence' },
  { value: 'national_id', label: 'National ID card' },
  { value: 'other', label: 'Other' },
];

const CATEGORIES = ['Church or ministry', 'Pastor or elder', 'Creator', 'Musician or choir', 'News or media', 'Organisation', 'Other'];

/** 'notable': the free application for widely known accounts. 'plus': any authentic member with Plus. */
type Path = 'notable' | 'plus';

/** The pages of the form. Notability is only asked on the notable path. */
type Step = 'how' | 'identity' | 'notability' | 'review';
const STEP_TITLE: Record<Step, string> = {
  how: 'Choose how',
  identity: "Confirm it's you",
  notability: 'Confirm notability',
  review: 'Review and send',
};

const MAX_LINKS = 3;
/** Enough to say who follows the account and why; a word or two can't be judged. */
const MIN_AUDIENCE = 20;

/** What is happening while the request goes off: two uploads, then the request itself. */
type Sending = '' | 'document' | 'selfie' | 'request';
const SENDING_TEXT: Record<Exclude<Sending, ''>, string> = {
  document: 'Uploading your document photo… (1 of 3)',
  selfie: 'Uploading your selfie… (2 of 3)',
  request: 'Sending your request… (3 of 3)',
};

/** A web address, with or without https:// in front ("example.org/news/story" is fine). */
function looksLikeLink(s: string): boolean {
  return /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(s.trim());
}

/** Admins open these, so each one is sent as a full web address. */
function withScheme(s: string): string {
  const t = s.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** A block of the form. A green check shows once it is complete; `onEdit` adds an Edit link (on the review page). */
function Card({ title, sub, done, onEdit, children }: { title: string; sub?: string; done?: boolean; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <View style={{ marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 18, backgroundColor: C.surface, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View accessible accessibilityRole="header" accessibilityLabel={`${title}${done ? ', done' : ''}`} style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700' }}>{title}</Text>
          {sub ? <Text style={{ color: C.fg2, lineHeight: 19 }}>{sub}</Text> : null}
        </View>
        {onEdit ? (
          <Pressable onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${title}`}>
            <Text style={{ color: C.accent2, fontWeight: '700' }}>Edit</Text>
          </Pressable>
        ) : done ? (
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={14} color={C.onAccent} weight={2.6} />
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: on ? C.fg : C.surface2, justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
      <Text style={{ color: on ? C.bg : C.fg, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function Preview({ photo, label, height = 220 }: { photo: Picked; label: string; height?: number }) {
  return <Image source={{ uri: photo.uri }} style={{ width: '100%', height, borderRadius: 12, backgroundColor: C.bg2 }} contentFit="contain" accessibilityLabel={label} />;
}

/** One answer on the review page: a small label over the value. */
function Line({ label, value, lines }: { label: string; value: string; lines?: number }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: C.fg2, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
      <Text numberOfLines={lines} style={{ color: C.fg, lineHeight: 20 }}>{value}</Text>
    </View>
  );
}

/** One of the two ways to get the tick, as a card with its own button. */
function PathCard({ icon, tag, title, points, action, chosen, onPress }: { icon: IconName; tag: string; title: string; points: string[]; action: string; chosen: boolean; onPress: () => void }) {
  return (
    <View style={{ marginHorizontal: 16, marginTop: 12, padding: 18, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1.5, borderColor: chosen ? C.accent : 'transparent', gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={22} color={C.accent2} weight={2.1} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ alignSelf: 'flex-start', height: 22, paddingHorizontal: 9, borderRadius: 11, backgroundColor: C.surface2, justifyContent: 'center' }}>
            <Text style={{ color: C.fg, fontSize: 12, fontWeight: '700' }}>{tag}</Text>
          </View>
          <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 17.5, fontWeight: '800' }}>{title}</Text>
        </View>
      </View>
      <View style={{ gap: 6 }}>
        {points.map((p) => (
          <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={16} color={C.accent2} weight={2.4} />
            <Text style={{ flex: 1, color: C.fg, fontSize: 14.5 }}>{p}</Text>
          </View>
        ))}
      </View>
      <Button label={action} onPress={onPress} />
    </View>
  );
}

/** Where the member is in the form: one bar per page, filled up to this one. */
function Progress({ index, total, title }: { index: number; total: number; title: string }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={`Step ${index + 1} of ${total}: ${title}`} accessibilityValue={{ min: 1, max: total, now: index + 1 }} style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <Text style={{ color: C.fg, fontSize: 15, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: C.fg2, fontSize: 13, fontWeight: '600' }}>
          Step {index + 1} of {total}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= index ? C.accent : C.surface2 }} />
        ))}
      </View>
    </View>
  );
}

/** A whole-screen message in place of the form: verified, under 14, waiting, or just sent. */
function Notice({ icon, tick, title, body, children }: { icon?: IconName; tick?: boolean; title: string; body?: string; children?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 28, paddingTop: 36, gap: 12 }}>
      <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
        {tick ? <VerifiedTick size={54} /> : icon ? <Icon name={icon} size={44} color={C.fg} /> : null}
      </View>
      <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
      {body ? <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 21 }}>{body}</Text> : null}
      {children}
    </View>
  );
}

/**
 * Asking for the blue tick, a page at a time. The tick says an account is who it claims to be, so
 * every request includes an identity check our team approves: a photo of an ID document and a selfie,
 * kept in a private bucket and deleted once the request is decided. There are two ways in: a free
 * application for accounts that are widely known (with questions about that), or, for any authentic
 * member, verification with Community Plus.
 */
export default function Verify() {
  const { me, profile, refresh } = useSession();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const insets = useSafeAreaInsets();
  // The field being typed in stays above the keyboard (the links and the note sit low on their pages).
  const kb = useKeyboardReveal(40);
  const field = { onFocus: kb.onFocus, onBlur: kb.onBlur };
  const [requests, setRequests] = useState<PlusRequest[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState<Step>('how');
  const [path, setPath] = useState<Path | null>(null);
  const [legalName, setLegalName] = useState('');
  const [docType, setDocType] = useState<DocumentType | null>(null);
  const [doc, setDoc] = useState<Picked | null>(null);
  const [selfie, setSelfie] = useState<Picked | null>(null);
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState('');
  const [audience, setAudience] = useState('');
  const [knownAs, setKnownAs] = useState('');
  const [links, setLinks] = useState<string[]>(() => Array.from({ length: MAX_LINKS }, () => ''));
  const [note, setNote] = useState('');
  const [sending, setSending] = useState<Sending>('');
  const [formError, setFormError] = useState('');
  // When the request just sent went off: the screen then shows it waiting, as it will when opened again.
  const [sent, setSent] = useState<Date | null>(null);
  // A ref as well as state: two quick taps arrive before the state has changed.
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  // Set while the member is away paying for Plus, so coming back carries on along the Plus path.
  const awaitingPlus = useRef(false);

  const load = useCallback(() => {
    setLoadError('');
    myPlusRequests(me)
      .then((r) => { if (alive.current) setRequests(r); })
      .catch((e) => { if (alive.current) setLoadError(errText(e)); });
  }, [me]);
  // Whether this screen is in front. The checkout opened from here goes back to it when done (it is not
  // opened again on top), and the form carries on only once it is showing again.
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      load();
      // Back from the payment page: make sure the profile knows about Plus.
      if (awaitingPlus.current) refresh().catch(() => {});
      return () => setFocused(false);
    }, [load, refresh]),
  );

  // Plus has arrived on the profile after paying, and the member is back here: carry on where they left off.
  const hasPlus = !!profile?.plus;
  useEffect(() => {
    if (!awaitingPlus.current || !hasPlus || !focused) return;
    awaitingPlus.current = false;
    setPath('plus');
    setFormError('');
    setStep('identity');
    toast("Welcome to Plus. Now let's confirm it's you.");
  }, [hasPlus, focused, toast]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const steps: Step[] = path === 'plus' ? ['how', 'identity', 'review'] : ['how', 'identity', 'notability', 'review'];
  const index = Math.max(0, steps.indexOf(step));

  function go(next: Step) {
    setFormError('');
    setStep(next);
  }

  /** What still needs doing on a page before moving on, or '' when it is complete. */
  function problem(s: Step): string {
    if (s === 'how') return path ? '' : 'Choose how you would like to be verified.';
    if (s === 'identity') {
      if (legalName.trim().length < 2) return 'Add your full name as it is written on your document.';
      if (!docType) return 'Choose which kind of document it is.';
      if (!doc) return 'Add a photo of your document.';
      if (!selfie) return 'Take a selfie.';
      return '';
    }
    if (s === 'notability') {
      if (path !== 'notable') return '';
      if (!category) return 'Choose the category that fits you best.';
      if (country.trim().length < 2) return 'Add the country or region you are based in.';
      if (audience.trim().length < MIN_AUDIENCE) return 'Tell us a little more about who follows you and why: a sentence or two is enough.';
      const bad = links.find((l) => l.trim() && !looksLikeLink(l));
      if (bad) return `"${bad.trim()}" doesn't look like a web address. Check it, or leave the field empty.`;
      return '';
    }
    // The review page: every page before it again, in order, in case something changed on the way.
    for (const earlier of steps.slice(0, -1)) {
      const p = problem(earlier);
      if (p) return p;
    }
    if (path === 'plus' && !profile?.plus) return 'Community Plus is not active on your account. Get Plus first, or apply as a notable account instead.';
    return '';
  }

  function next() {
    const p = problem(step);
    if (p) {
      tap('warning');
      return setFormError(p);
    }
    go(steps[index + 1] ?? 'review');
  }

  /** One page back. False when there is no page to go back to, so the screen itself can close. */
  function back(): boolean {
    if (sending) return true;
    if (index === 0) return false;
    go(steps[index - 1]);
    return true;
  }

  function chooseNotable() {
    tap('select');
    setPath('notable');
    go('identity');
  }

  function choosePlus() {
    tap('select');
    if (profile?.plus) {
      setPath('plus');
      go('identity');
      return;
    }
    // Pay first; the effect above brings them back into the form once Plus is on the profile.
    awaitingPlus.current = true;
    router.push('/checkout?plan=monthly&then=/verify');
  }

  async function addPhoto(which: 'document' | 'selfie', from: 'camera' | 'library') {
    if (busy.current) return;
    try {
      // The selfie is taken with the front camera there and then; the document can come from either.
      const [asset] = from === 'camera' ? await takePhoto({ front: which === 'selfie' }) : await pickFromLibrary();
      if (!asset || !alive.current) return;
      if (which === 'document') setDoc(asset);
      else setSelfie(asset);
      setFormError('');
    } catch (e) {
      toast(errText(e));
    }
  }

  function setLink(i: number, value: string) {
    setLinks((cur) => cur.map((l, j) => (j === i ? value : l)));
    setFormError('');
  }

  async function submit() {
    if (busy.current) return;
    const gap = problem('review');
    if (gap || !doc || !selfie || !docType || !path) {
      tap('warning');
      return setFormError(gap || 'Something is missing. Go back and check each page.');
    }
    busy.current = true;
    setFormError('');
    const uploaded: string[] = [];
    try {
      setSending('document');
      const document_path = await uploadVerificationPhoto(me, doc.uri, 'document', doc.width);
      uploaded.push(document_path);
      setSending('selfie');
      const selfie_path = await uploadVerificationPhoto(me, selfie.uri, 'selfie', selfie.width);
      uploaded.push(selfie_path);
      setSending('request');
      await requestVerification(me, {
        selfie_path,
        document_path,
        document_type: docType,
        legal_name: legalName,
        note,
        path,
        // The notability answers only go with the notable application.
        ...(path === 'notable'
          ? {
              category,
              country,
              audience,
              known_as: knownAs,
              links: links.filter((l) => l.trim()).map(withScheme),
            }
          : {}),
      });
      if (!alive.current) return;
      tap('success');
      toast(t('verify.sent'));
      setSent(new Date());
      load();
    } catch (e) {
      // Identity photos are only kept while a request waits, so ones no request points at are removed.
      // But an answer lost on the way can hide a request that did arrive: its photos stay for the team.
      if (uploaded.length) {
        myPlusRequests(me)
          .then((mine) => mine.some((r) => uploaded.includes(r.selfie_path) || uploaded.includes(r.document_path)))
          // Can't tell (no connection): then the request almost certainly didn't arrive either.
          .catch(() => false)
          .then((landed) => {
            if (!landed) supabase.storage.from(VERIFICATION_BUCKET).remove(uploaded).catch(() => null);
          });
      }
      const text = errText(e);
      // Said plainly in a message, with the reason over the buttons, where it stays. Our own server's
      // refusals are written for members ("Your request is already being reviewed."), so they are the message.
      tap('warning');
      toast((e as any)?.code === 'P0001' ? text : t('verify.notSent'));
      if (alive.current) {
        setFormError(text);
        // One may be waiting already (sent from another phone, or its answer lost on the way): what the
        // team has decides the page, which then shows it waiting rather than the form.
        load();
      }
    } finally {
      busy.current = false;
      if (alive.current) setSending('');
    }
  }

  const pending = requests?.find((r) => r.kind === 'verify' && r.status === 'pending');
  const formShown = !profile?.verified && profile?.restricted !== true && !sent && requests !== null && !pending;

  // Android's back button steps back through the form before it leaves the screen.
  const backRef = useRef<() => boolean>(() => false);
  backRef.current = formShown ? back : () => false;
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => backRef.current());
      return () => sub.remove();
    }, []),
  );

  const header = <ScreenHeader title="Request verification" />;

  if (profile?.verified) {
    return (
      <Screen>
        {header}
        <Notice tick title="You're verified">
          <Button label="Done" onPress={leave} style={{ alignSelf: 'stretch', marginTop: 10 }} />
        </Notice>
      </Screen>
    );
  }

  if (profile?.restricted === true) {
    return (
      <Screen>
        {header}
        <Notice icon="lock" title="Not available yet" body="The blue tick is for members aged 14 and over." />
      </Screen>
    );
  }

  // Sent and waiting for the team: the same page straight after sending and whenever it is opened again.
  if (sent || (requests !== null && pending)) {
    const when = pending ? new Date(pending.created_at) : sent ?? new Date();
    return (
      <Screen>
        {header}
        <Notice icon="check" title={t('verify.sent')}>
          <View accessible accessibilityLabel={t('verify.pending')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: C.warn + '24' }}>
            <Icon name="clock" size={14} color={C.warn} weight={2.2} />
            <Text style={{ color: C.warn, fontSize: 13.5, fontWeight: '700' }}>{t('verify.pending')}</Text>
          </View>
          <Text style={{ color: C.fg2, textAlign: 'center' }}>{t('verify.sentOn', { date: dayLabel(Number.isNaN(when.getTime()) ? new Date() : when) })}</Text>
          <Button label="Done" kind="ghost" onPress={leave} style={{ alignSelf: 'stretch', marginTop: 10 }} />
        </Notice>
      </Screen>
    );
  }

  if (requests === null) {
    return (
      <Screen>
        {header}
        {loadError ? <ErrorNote message={loadError} onRetry={load} /> : <Loading />}
      </Screen>
    );
  }

  // Newest first, so the first identity check is the latest one.
  const declined = requests.find((r) => r.kind === 'verify')?.status === 'declined';
  const locked = !!sending;

  let body: React.ReactNode;
  if (step === 'how') {
    body = (
      <>
        <View style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 6, paddingHorizontal: 28, gap: 10 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: C.verified + '24', alignItems: 'center', justifyContent: 'center' }}>
            <VerifiedTick size={50} />
          </View>
          <Text style={{ color: C.fg, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>Get the blue tick</Text>
          {declined ? <Text style={{ color: C.like, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>Your last request wasn't approved.</Text> : null}
        </View>

        <PathCard
          icon="star"
          tag="Free"
          title="Apply as a notable account"
          points={['A photo of your ID and a selfie', 'A few questions about who follows you and why']}
          action="Apply"
          chosen={path === 'notable'}
          onPress={chooseNotable}
        />
        <PathCard
          icon="crown"
          tag={profile?.plus ? 'You have Plus' : 'With Community Plus'}
          title="Get verified with Community Plus"
          points={['A photo of your ID and a selfie', 'No questions about your audience']}
          action={profile?.plus ? 'Continue with Plus' : 'Get Plus to continue'}
          chosen={path === 'plus'}
          onPress={choosePlus}
        />
      </>
    );
  } else if (step === 'identity') {
    body = (
      <>
        <Card title="Your name and document" done={legalName.trim().length >= 2 && !!docType}>
          <Field label="Full legal name" value={legalName} onChangeText={(t) => { setLegalName(t); setFormError(''); }} placeholder="As it is written on your document" autoCapitalize="words" autoCorrect={false} autoComplete="name" textContentType="name" maxLength={120} editable={!locked} {...field} />
          <Text style={{ color: C.fg2, fontSize: 12.5 }}>Document type</Text>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DOCUMENTS.map((d) => (
              <Chip key={d.value} label={d.label} on={docType === d.value} onPress={() => { if (!locked) { setDocType(d.value); setFormError(''); } }} />
            ))}
          </View>
        </Card>

        <Card title="Photo of your document" done={!!doc}>
          {doc ? (
            <>
              <Preview photo={doc} label="Your document photo" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button small kind="ghost" label="Retake" disabled={locked} onPress={() => addPhoto('document', 'camera')} style={{ flex: 1 }} />
                <Button small kind="ghost" label="Choose another" disabled={locked} onPress={() => addPhoto('document', 'library')} style={{ flex: 1 }} />
              </View>
            </>
          ) : (
            <View style={{ gap: 8 }}>
              <Button label="Take photo" onPress={() => addPhoto('document', 'camera')} />
              <Button label="Choose from library" kind="ghost" onPress={() => addPhoto('document', 'library')} />
            </View>
          )}
        </Card>

        <Card title="A selfie" done={!!selfie}>
          {selfie ? (
            <>
              <Preview photo={selfie} label="Your selfie" />
              <Button small kind="ghost" label="Retake selfie" disabled={locked} onPress={() => addPhoto('selfie', 'camera')} />
            </>
          ) : (
            <Button label="Take a selfie" onPress={() => addPhoto('selfie', 'camera')} />
          )}
        </Card>
      </>
    );
  } else if (step === 'notability') {
    body = (
      <>
        <Card title="Category" done={!!category}>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CATEGORIES.map((c) => (
              <Chip key={c} label={c} on={category === c} onPress={() => { setCategory(c); setFormError(''); }} />
            ))}
          </View>
        </Card>

        <Card title="Country or region" done={country.trim().length >= 2}>
          <Field value={country} onChangeText={(t) => { setCountry(t); setFormError(''); }} placeholder="For example, Ghana" autoCapitalize="words" autoComplete="country" textContentType="countryName" maxLength={60} accessibilityLabel="Country or region" {...field} />
        </Card>

        <Card title="Audience" sub="Who follows you and why?" done={audience.trim().length >= MIN_AUDIENCE}>
          <Field value={audience} onChangeText={(t) => { setAudience(t); setFormError(''); }} placeholder="For example: churches across West Africa follow our choir for new recordings and concert dates." multiline maxLength={500} accessibilityLabel="Who follows you and why?" style={{ minHeight: 110, textAlignVertical: 'top' }} {...field} />
          <Text style={{ color: C.fg3, fontSize: 12.5, textAlign: 'right' }}>{audience.trim().length}/500</Text>
        </Card>

        <Card title="Also known as (optional)">
          <Field value={knownAs} onChangeText={setKnownAs} placeholder="Other names, in any language" maxLength={200} accessibilityLabel="Also known as" {...field} />
        </Card>

        <Card title="Links (optional)">
          {links.map((l, i) => (
            <Field
              key={i}
              value={l}
              onChangeText={(t) => setLink(i, t)}
              placeholder={i === 0 ? 'https://' : `Another link (${i + 1} of ${MAX_LINKS})`}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="URL"
              maxLength={300}
              accessibilityLabel={`Link ${i + 1}`}
              {...field}
            />
          ))}
        </Card>
      </>
    );
  } else {
    const givenLinks = links.filter((l) => l.trim());
    body = (
      <>
        <Card title="How" onEdit={locked ? undefined : () => go('how')}>
          <Line label="Way to verify" value={path === 'plus' ? 'With Community Plus' : 'Notable account (free)'} />
        </Card>

        <Card title="It's you" onEdit={locked ? undefined : () => go('identity')}>
          <Line label="Full legal name" value={legalName.trim()} />
          <Line label="Document type" value={DOCUMENTS.find((d) => d.value === docType)?.label ?? ''} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: C.fg2, fontSize: 12.5, fontWeight: '600' }}>Document</Text>
              {doc ? <Preview photo={doc} label="Your document photo" height={120} /> : null}
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: C.fg2, fontSize: 12.5, fontWeight: '600' }}>Selfie</Text>
              {selfie ? <Preview photo={selfie} label="Your selfie" height={120} /> : null}
            </View>
          </View>
        </Card>

        {path === 'notable' ? (
          <Card title="Notability" onEdit={locked ? undefined : () => go('notability')}>
            <Line label="Category" value={category} />
            <Line label="Country or region" value={country.trim()} />
            <Line label="Who follows you and why" value={audience.trim()} lines={5} />
            {knownAs.trim() ? <Line label="Also known as" value={knownAs.trim()} /> : null}
            <Line label="Links" value={givenLinks.length ? givenLinks.map(withScheme).join('\n') : 'None'} />
          </Card>
        ) : null}

        <Card title="Anything else? (optional)">
          <Field value={note} onChangeText={setNote} placeholder="For example, if your name has changed" multiline maxLength={500} editable={!locked} accessibilityLabel="Anything our team should know" style={{ minHeight: 80, textAlignVertical: 'top' }} {...field} />
        </Card>

        <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 17, paddingHorizontal: 20, paddingTop: 12 }}>By sending, you agree that our team may look at these photos to check who you are. They are deleted as soon as your request is decided.</Text>
      </>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Request verification" onBack={() => { if (!back()) leave(); }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Progress index={index} total={steps.length} title={STEP_TITLE[step]} />
        {/* A new scroll view for each page, so every page starts at the top. */}
        <ScrollView key={step} ref={kb.ref} onScroll={kb.onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {body}
        </ScrollView>
        {step !== 'how' ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12), gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.bg }}>
            {formError ? <Text accessibilityLiveRegion="polite" style={{ color: C.like, lineHeight: 19 }}>{formError}</Text> : null}
            {sending ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator color={C.fg2} />
                <Text style={{ flex: 1, color: C.fg2 }}>{SENDING_TEXT[sending]}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button kind="ghost" label="Back" disabled={locked} onPress={() => back()} style={{ flex: 1 }} />
              {step === 'review' ? <Button label="Send request" busy={locked} onPress={submit} style={{ flex: 2 }} /> : <Button label="Next" onPress={next} style={{ flex: 2 }} />}
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}
