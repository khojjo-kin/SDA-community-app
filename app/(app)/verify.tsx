import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { Icon, IconName, VerifiedTick } from '../../src/components/Icon';
import { Button, ErrorNote, Field, Loading, Screen, ScreenHeader, useToast } from '../../src/components/ui';
import { myPlusRequests, requestVerification, uploadVerificationPhoto, VERIFICATION_BUCKET } from '../../src/lib/api';
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

/** What is happening while the request goes off: two uploads, then the request itself. */
type Sending = '' | 'document' | 'selfie' | 'request';
const SENDING_TEXT: Record<Exclude<Sending, ''>, string> = {
  document: 'Uploading your document photo… (1 of 3)',
  selfie: 'Uploading your selfie… (2 of 3)',
  request: 'Sending your request… (3 of 3)',
};

/** One line of the introduction: an icon, a short title and a sentence. */
function Point({ icon, title, body, tick }: { icon: IconName; title: string; body: string; tick?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 14 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
        {tick ? <VerifiedTick size={20} /> : <Icon name={icon} size={20} color={C.fg} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.fg, fontWeight: '700', fontSize: 15.5 }}>{title}</Text>
        <Text style={{ color: C.fg2, marginTop: 2, lineHeight: 19 }}>{body}</Text>
      </View>
    </View>
  );
}

/** A numbered stage of the form. The number turns into a green check once the stage is complete. */
function Stage({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <View style={{ marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 18, backgroundColor: C.surface, gap: 12 }}>
      <View accessible accessibilityRole="header" accessibilityLabel={`Step ${n}: ${title}${done ? ', done' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: done ? C.accent : C.surface2, alignItems: 'center', justifyContent: 'center' }}>
          {done ? <Icon name="check" size={16} color={C.onAccent} weight={2.6} /> : <Text style={{ color: C.fg, fontWeight: '700' }}>{n}</Text>}
        </View>
        <Text style={{ flex: 1, color: C.fg, fontSize: 17, fontWeight: '700' }}>{title}</Text>
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

function Preview({ photo, label }: { photo: Picked; label: string }) {
  return <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 220, borderRadius: 12, backgroundColor: C.bg2 }} contentFit="contain" accessibilityLabel={label} />;
}

/** A whole-screen message in place of the form: verified, under 14, waiting, or just sent. */
function Notice({ icon, tick, title, body, children }: { icon?: IconName; tick?: boolean; title: string; body: string; children?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 28, paddingTop: 36, gap: 12 }}>
      <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
        {tick ? <VerifiedTick size={54} /> : icon ? <Icon name={icon} size={44} color={C.fg} /> : null}
      </View>
      <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 21 }}>{body}</Text>
      {children}
    </View>
  );
}

/**
 * Asking for the blue tick. The tick says an account is who it claims to be, so it comes only from
 * an identity check an admin approves: a photo of an ID document and a selfie, kept in a private
 * bucket and deleted once the request is decided. It cannot be bought; Plus does not include it.
 */
export default function Verify() {
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [requests, setRequests] = useState<PlusRequest[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [legalName, setLegalName] = useState('');
  const [docType, setDocType] = useState<DocumentType | null>(null);
  const [doc, setDoc] = useState<Picked | null>(null);
  const [selfie, setSelfie] = useState<Picked | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState<Sending>('');
  const [formError, setFormError] = useState('');
  const [sent, setSent] = useState(false);
  // A ref as well as state: two quick taps arrive before the state has changed.
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(() => {
    setLoadError('');
    myPlusRequests(me)
      .then((r) => { if (alive.current) setRequests(r); })
      .catch((e) => { if (alive.current) setLoadError(errText(e)); });
  }, [me]);
  useFocusEffect(load);

  const done = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const nameOk = legalName.trim().length >= 2;

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

  function missing(): string {
    if (!nameOk) return 'Add your full name as it is written on your document.';
    if (!docType) return 'Choose which kind of document it is.';
    if (!doc) return 'Add a photo of your document.';
    if (!selfie) return 'Take a selfie.';
    return '';
  }

  async function submit() {
    if (busy.current) return;
    const gap = missing();
    if (gap || !doc || !selfie || !docType) return setFormError(gap);
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
      await requestVerification(me, { selfie_path, document_path, document_type: docType, legal_name: legalName, note });
      if (!alive.current) return;
      setSent(true);
      load();
    } catch (e) {
      // Nothing reached the admins, so do not leave identity photos behind: they are only kept while a request waits.
      if (uploaded.length) supabase.storage.from(VERIFICATION_BUCKET).remove(uploaded).catch(() => null);
      if (alive.current) setFormError(errText(e));
    } finally {
      busy.current = false;
      if (alive.current) setSending('');
    }
  }

  const header = <ScreenHeader title="Request verification" />;

  if (profile?.verified) {
    return (
      <Screen>
        {header}
        <Notice tick title="You're verified" body="The blue tick shows next to your name on your profile, your posts, your comments and in chats.">
          <Button label="Done" onPress={done} style={{ alignSelf: 'stretch', marginTop: 10 }} />
        </Notice>
      </Screen>
    );
  }

  if (profile?.restricted === true) {
    return (
      <Screen>
        {header}
        <Notice icon="lock" title="Not available yet" body="The blue tick is for members aged 14 and over, because it needs an identity document and a selfie. You can ask for it once you turn 14." />
      </Screen>
    );
  }

  if (sent) {
    return (
      <Screen>
        {header}
        <Notice icon="check" title="Request sent — we'll let you know" body="An admin will compare your selfie with your document. Your photos are deleted as soon as they have decided.">
          <Button label="Done" onPress={done} style={{ alignSelf: 'stretch', marginTop: 10 }} />
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

  const pending = requests.find((r) => r.kind === 'verify' && r.status === 'pending');
  if (pending) {
    return (
      <Screen>
        {header}
        <Notice icon="clock" title="Your request is being reviewed" body={`Sent on ${dayLabel(new Date(pending.created_at))}. An admin will compare your selfie with your document, and we'll let you know when they have decided.`}>
          <Button label="Done" kind="ghost" onPress={done} style={{ alignSelf: 'stretch', marginTop: 10 }} />
        </Notice>
      </Screen>
    );
  }

  // Newest first, so the first identity check is the latest one.
  const declined = requests.find((r) => r.kind === 'verify')?.status === 'declined';
  const step1 = nameOk && !!docType;

  return (
    <Screen>
      {header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 18, paddingHorizontal: 28, gap: 10 }}>
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: C.verified + '24', alignItems: 'center', justifyContent: 'center' }}>
              <VerifiedTick size={50} />
            </View>
            <Text style={{ color: C.fg, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>Get the blue tick</Text>
            <Text style={{ color: C.fg2, textAlign: 'center', lineHeight: 20 }}>Show people that this account really is you.</Text>
          </View>

          <View style={{ marginHorizontal: 16, padding: 16, borderRadius: 18, backgroundColor: C.surface, gap: 16 }}>
            <Point icon="verified" tick title="What the tick means" body="This account is who it says it is. It is not a reward or a rank." />
            <Point icon="idcard" title="What you need" body="A photo of an identity document with your name and photo on it, and a selfie taken now." />
            <Point icon="lock" title="Your photos stay private" body="Only the admins can see them, and they are deleted as soon as your request is decided." />
            <Point icon="crown" title="Free, and never for sale" body="The tick cannot be bought. Community Plus does not include it; everyone verifies the same way." />
          </View>

          {declined ? (
            <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 14, backgroundColor: C.like + '1f' }}>
              <Icon name="info" size={20} color={C.like} />
              <Text style={{ flex: 1, color: C.fg, lineHeight: 19 }}>Your last request was not approved. Try again with clear, well-lit photos, and the name exactly as it is on your document.</Text>
            </View>
          ) : null}

          <Stage n={1} title="Your name and document" done={step1}>
            <Field label="Full legal name" value={legalName} onChangeText={setLegalName} placeholder="As it is written on your document" autoCapitalize="words" autoCorrect={false} autoComplete="name" textContentType="name" maxLength={120} editable={!sending} />
            <Text style={{ color: C.fg2, fontSize: 12.5 }}>Document</Text>
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DOCUMENTS.map((d) => (
                <Chip key={d.value} label={d.label} on={docType === d.value} onPress={() => { if (!sending) { setDocType(d.value); setFormError(''); } }} />
              ))}
            </View>
          </Stage>

          <Stage n={2} title="Photo of your document" done={!!doc}>
            <Text style={{ color: C.fg2, lineHeight: 19 }}>Lay it flat in good light, with no glare. Your photo, your name and all four corners should be easy to read.</Text>
            {doc ? (
              <>
                <Preview photo={doc} label="Your document photo" />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button small kind="ghost" label="Retake" disabled={!!sending} onPress={() => addPhoto('document', 'camera')} style={{ flex: 1 }} />
                  <Button small kind="ghost" label="Choose another" disabled={!!sending} onPress={() => addPhoto('document', 'library')} style={{ flex: 1 }} />
                </View>
              </>
            ) : (
              <View style={{ gap: 8 }}>
                <Button label="Take photo" onPress={() => addPhoto('document', 'camera')} />
                <Button label="Choose from library" kind="ghost" onPress={() => addPhoto('document', 'library')} />
              </View>
            )}
          </Stage>

          <Stage n={3} title="A selfie" done={!!selfie}>
            <Text style={{ color: C.fg2, lineHeight: 19 }}>Face the camera in good light so your face is clearly visible. No hat or sunglasses.</Text>
            {selfie ? (
              <>
                <Preview photo={selfie} label="Your selfie" />
                <Button small kind="ghost" label="Retake selfie" disabled={!!sending} onPress={() => addPhoto('selfie', 'camera')} />
              </>
            ) : (
              <Button label="Take a selfie" onPress={() => addPhoto('selfie', 'camera')} />
            )}
          </Stage>

          <Stage n={4} title="Send for review" done={false}>
            <Field label="Anything the admins should know? (optional)" value={note} onChangeText={setNote} placeholder="For example, if your name has changed" multiline maxLength={500} editable={!sending} style={{ minHeight: 80, textAlignVertical: 'top' }} />
            <Text style={{ color: C.fg3, fontSize: 12.5, lineHeight: 17 }}>By sending, you agree that the admins may look at these photos to check who you are. They are deleted as soon as your request is decided.</Text>
            {formError ? <Text style={{ color: C.like, lineHeight: 19 }}>{formError}</Text> : null}
            {sending ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator color={C.fg2} />
                <Text style={{ flex: 1, color: C.fg2 }}>{SENDING_TEXT[sending]}</Text>
              </View>
            ) : null}
            <Button label="Send request" busy={!!sending} onPress={submit} />
          </Stage>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
