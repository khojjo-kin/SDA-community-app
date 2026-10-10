import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardOpen } from '../../src/components/AssistiveButton';
import { Icon } from '../../src/components/Icon';
import { MediaPicker, PickMode, PickedItem } from '../../src/components/MediaPicker';
import type { CreateMode } from '../../src/components/ModeSwitcher';
import { DarkStatusBar } from '../../src/components/OnDark';
import { Chip, DetailRow, LocationSheet, PeopleChips, PlaceChips, PollEditor, PromptEditor, SongSheet, SongStrip, SwitchRow, TagSheet, usePlaces, useSongSuggestions } from '../../src/components/PostComposer';
import { isPlainEdit, PhotoEdit, PLAIN_EDIT, PostEditor, useLookExport } from '../../src/components/PostEditor';
import { IconButton, Radio, Sheet, useToast } from '../../src/components/ui';
import { addStory, canPostIn, createPost, fetchMyGroups, uploadImage, uploadVideo } from '../../src/lib/api';
import { useT } from '../../src/lib/i18n';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Group, Media, PodItem, PostPoll, Profile, StoryItem } from '../../src/lib/types';

type Step = 'pick' | 'edit' | 'share';
/** The sheet open over the last step, if any. */
type Panel = null | 'audio' | 'tags' | 'location' | 'audience' | 'more' | 'group';

/**
 * Share a post of up to 10 photos and videos (each video up to 60 seconds), or a short, in three
 * steps on one screen: choose, edit, share. The picker's mode switcher moves between POST and SHORTS
 * here, and hands STORY and LIVE over to their own screens. Deep links arrive as ?mode=post or
 * ?mode=shorts (older links with ?mode=reel open Shorts), and a verse or a hymn line can arrive as a
 * ready-made caption.
 */
export default function Create() {
  const params = useLocalSearchParams<{ mode?: string; text?: string; group?: string }>();
  const { me, profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const insets = useSafeAreaInsets();
  // With the keyboard up, Share sits on it: no home-indicator gap underneath.
  const keyboard = useKeyboardOpen();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<PickMode>(params.mode === 'shorts' || params.mode === 'reel' ? 'shorts' : 'post');
  const [step, setStep] = useState<Step>('pick');
  const [items, setItems] = useState<PickedItem[]>([]);
  // One edit per photo, in the same order as items.
  const [edits, setEdits] = useState<PhotoEdit[]>([]);
  const [audio, setAudio] = useState<PodItem | null>(null);
  const [caption, setCaption] = useState(typeof params.text === 'string' ? params.text.slice(0, 2200) : '');
  const [location, setLocation] = useState('');
  // Videos: the frame used as the cover. Starts as the first frame; the editor can pick another.
  const [poster, setPoster] = useState('');
  const [posterChosen, setPosterChosen] = useState(false);
  // A mix of photos and videos: a still of each video, by position, so the editor can show it as a page.
  const [frames, setFrames] = useState<Record<number, string>>({});
  const [preparing, setPreparing] = useState(false);
  // Bumped on every new choice, so stills still being made for an older one are dropped.
  const picks = useRef(0);
  // Sensitive posts are never shown to members under 14.
  const [sensitive, setSensitive] = useState(false);
  // Creators who offer subscriptions can keep a post for their subscribers.
  const [subscribersOnly, setSubscribersOnly] = useState(false);
  // What else goes with the post.
  const [poll, setPoll] = useState<PostPoll | null>(null);
  // null: no prompt card.
  const [prompt, setPrompt] = useState<string | null>(null);
  const [tagged, setTagged] = useState<Profile[]>([]);
  const [aiLabel, setAiLabel] = useState(false);
  const [profileOnly, setProfileOnly] = useState(false);
  const [hideLikes, setHideLikes] = useState(false);
  const [commentsOff, setCommentsOff] = useState(false);
  const [toStory, setToStory] = useState(false);
  // A single video chosen under POST is a post unless Share as a short is turned on.
  const [asShort, setAsShort] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const { exportEdited, exporter } = useLookExport();
  const songs = useSongSuggestions();
  const { places, locating, load: loadPlaces } = usePlaces();
  // Where the post goes: your profile, or one of the communities and pages you can post in.
  // A group id can arrive from a group's own Post button.
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string | null>(typeof params.group === 'string' && params.group ? params.group : null);
  useEffect(() => {
    fetchMyGroups(me).then((all) => setGroups(all.filter(canPostIn))).catch(() => setGroups([]));
  }, [me]);
  const group = groups.find((g) => g.id === groupId) ?? null;
  // Only posts on your own profile can be for subscribers: a community or page has its own members.
  const canLimit = !!profile?.sub_price_pence && !groupId;
  const plus = !!profile?.plus;

  // The upload carries on if this screen is closed part-way; it must not then close whatever is open instead.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  // One video on its own: the editor plays it and offers a cover.
  const singleVideo = items.length === 1 && items[0]?.type === 'video';
  // Shared as a short: always from Shorts, and from Post when Share as a short is on.
  const isShort = singleVideo && (mode === 'shorts' || asShort);
  // A story is seen by everyone who sees your stories, so posts kept for a group or subscribers don't go there.
  const storyAllowed = !groupId && !(canLimit && subscribersOnly);

  function onMode(m: CreateMode) {
    if (m === 'post' || m === 'shorts') setMode(m);
    else router.replace(m === 'story' ? '/add-story' : '/go-live');
  }

  async function onPicked(list: PickedItem[]) {
    const mine = ++picks.current;
    setItems(list);
    setEdits(list.map(() => PLAIN_EDIT));
    setPoster('');
    setPosterChosen(false);
    setFrames({});
    setPreparing(false);
    setPage(0);
    setErr('');
    if (list.length === 1 && list[0]?.type === 'video') {
      VideoThumbnails.getThumbnailAsync(list[0].uri, { time: 300, quality: 0.6 })
        .then((still) => { if (alive.current && mine === picks.current) setPoster((p) => p || still.uri); })
        .catch(() => {});
      setStep('edit');
      return;
    }
    if (!list.some((it) => it.type === 'video')) {
      setStep('edit');
      return;
    }
    // The editor draws the pages of a post as pictures, so each video gets a still first.
    setPreparing(true);
    const out: Record<number, string> = {};
    for (let i = 0; i < list.length; i++) {
      if (list[i].type !== 'video') continue;
      try {
        out[i] = (await VideoThumbnails.getThumbnailAsync(list[i].uri, { time: 300, quality: 0.6 })).uri;
      } catch {
        // that page stays dark in the editor; the video itself still uploads
      }
    }
    if (!alive.current || mine !== picks.current) return;
    setFrames(out);
    setPreparing(false);
    toast(t('create.mixedNote'));
    setStep('edit');
  }

  // What the editor is handed: a mixed post shows each video as its still. Edits on those pages are
  // not used, because share() uploads every video untouched.
  const editorItems = useMemo<PickedItem[]>(
    () => (items.length > 1 ? items.map((it, i) => (it.type === 'video' ? { ...it, type: 'image' as const, uri: frames[i] ?? it.uri } : it)) : items),
    [items, frames],
  );

  /** The first photo or video, as a story. */
  function storyOf(m: Media): StoryItem {
    return m.type === 'video' ? { url: m.url, type: 'video', w: m.w, h: m.h, poster: m.poster, duration: items[0]?.duration } : { url: m.url, type: 'image', w: m.w, h: m.h };
  }

  async function share() {
    if (!items.length || busy) return;
    setErr('');
    // A poll needs at least two options with words in them.
    let pollOut: PostPoll | null = null;
    if (poll) {
      const options = poll.options.map((o) => o.trim()).filter(Boolean);
      if (options.length < 2) {
        setErr(t('createFlow.pollNeedsTwo'));
        return;
      }
      pollOut = { question: (poll.question ?? '').trim(), options };
    }
    try {
      const media: Media[] = [];
      for (let i = 0; i < items.length; i++) {
        const a = items[i];
        // Which one this is, when there are several: "2 of 5".
        const which = items.length > 1 ? { n: i + 1, total: items.length } : null;
        if (a.type === 'video') {
          setBusy(t('create.uploadingVideo'));
          const m = await uploadVideo(me, a.uri, a.w, a.h);
          // A cover chosen in the editor replaces the first frame the uploader took.
          if (posterChosen && poster) {
            try {
              setBusy(t('create.uploadingCover'));
              m.poster = (await uploadImage(me, poster, undefined, 1080)).url;
            } catch {
              // the first frame will do
            }
          }
          media.push(m);
          continue;
        }
        // An edited photo is drawn with its filter, adjustments and text baked in, then uploaded like any other.
        const e = edits[i] ?? PLAIN_EDIT;
        let uri = a.uri;
        let w: number | undefined = a.w;
        if (!isPlainEdit(e)) {
          setBusy(which ? t('create.preparingPhotoN', which) : t('create.preparingPhoto'));
          uri = await exportEdited(a.uri, e, a.w, a.h);
          w = undefined;
        }
        setBusy(which ? t('create.uploadingN', which) : t('create.uploading'));
        media.push(await uploadImage(me, uri, w));
      }
      setBusy(t('create.sharingNow'));
      await createPost(me, {
        caption,
        media,
        group_id: groupId,
        audio_id: audio?.id ?? null,
        location,
        sensitive,
        audience: canLimit && subscribersOnly ? 'subscribers' : 'everyone',
        kind: isShort ? 'reel' : 'post',
        tagged_ids: tagged.map((p) => p.id),
        ai_label: aiLabel,
        profile_only: plus && profileOnly && !groupId,
        hide_likes: hideLikes,
        comments_off: commentsOff,
        prompt: (prompt ?? '').trim(),
        poll: pollOut,
      });
      toast(isShort ? t('create.clipLive') : t('create.postLive'));
      if (toStory && storyAllowed && media[0]) {
        try {
          await addStory(me, storyOf(media[0]));
        } catch (e) {
          toast(t('createFlow.storyFailed', { error: errText(e) }));
        }
      }
      if (alive.current) close();
    } catch (e) {
      if (!alive.current) {
        toast(t('create.didNotShare', { error: errText(e) }));
        return;
      }
      setErr(errText(e));
      setBusy('');
    }
  }

  function openLocation() {
    setPanel('location');
    // Asks for location access here, never before: the places near you fill in once it is given.
    if (!places.length) loadPlaces(true);
  }

  const what = singleVideo ? t('create.video') : items.length > 1 ? t(items.some((it) => it.type === 'video') ? 'create.photosAndVideos' : 'create.photos', { count: items.length }) : t('create.photo');
  const locked = !!busy;
  // The preview: portrait for a short, 4:5 for a post.
  const pw = Math.round(isShort ? Math.min(width * 0.42, 190) : Math.min(width * 0.56, 260));
  const ph = Math.round(isShort ? (pw * 16) / 9 : pw * 1.25);
  const closePanel = () => setPanel(null);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* The picker and the editor are dark in every theme; the last step, a form, follows the theme. */}
      {step === 'share' && items.length ? null : <DarkStatusBar />}
      {/* The picker stays underneath so its selection is still there when the editor closes. */}
      <MediaPicker mode={mode} onMode={onMode} onNext={onPicked} onClose={close} />

      {preparing ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }]} accessibilityLiveRegion="polite">
          <Text style={{ color: '#fff', fontWeight: '600' }}>{t('create.gettingReady')}</Text>
        </View>
      ) : null}

      {step === 'edit' && items.length ? (
        <View style={StyleSheet.absoluteFill}>
          <PostEditor items={editorItems} edits={edits} setEdits={setEdits} audio={audio} onAudio={setAudio} caption={caption} onCaption={setCaption} poster={poster} onPoster={(uri) => { setPoster(uri); setPosterChosen(true); }} plus={plus} onClose={() => setStep('pick')} onNext={() => setStep('share')} />
        </View>
      ) : null}

      {step === 'share' && items.length ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, paddingTop: insets.top }]}>
          <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
            <IconButton name="back" label={t('create.backToEditing')} onPress={() => (busy ? undefined : setStep('edit'))} />
            <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, color: C.fg, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>{isShort ? t('create.newClip') : t('create.newPost')}</Text>
            <View style={{ width: 40 }} />
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              {/* The first photo or video, centred; swipe for the others. Tapping it goes back to editing. */}
              <View style={{ alignItems: 'center', marginTop: 6 }}>
                <View style={{ width: pw, height: ph, borderRadius: 18, overflow: 'hidden', backgroundColor: C.surface }}>
                  <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEnabled={items.length > 1} onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / pw))}>
                    {items.map((it, i) => {
                      const uri = singleVideo ? poster : editorItems[i]?.uri;
                      return (
                        <Pressable key={i} onPress={() => (busy ? undefined : setStep('edit'))} accessibilityRole="button" accessibilityLabel={t('create.thumbLabel', { what })} style={{ width: pw, height: ph, alignItems: 'center', justifyContent: 'center' }}>
                          {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} /> : null}
                          {it.type === 'video' ? (
                            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                              <Icon name="play" size={22} color="#fff" />
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  {items.length > 1 ? (
                    <View pointerEvents="none" style={{ position: 'absolute', top: 8, right: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(10,12,14,0.7)' }}>
                      <Text style={{ color: '#fff', fontSize: 11.5, fontWeight: '600' }}>{page + 1}/{items.length}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <TextInput value={caption} onChangeText={setCaption} placeholder={t('createFlow.captionPlaceholder')} placeholderTextColor={C.fg3} multiline maxLength={2200} keyboardAppearance={C.blurTint} editable={!locked} style={{ marginHorizontal: 16, marginTop: 14, minHeight: 64, paddingVertical: 8, color: C.fg, fontSize: 16.5, lineHeight: 22, textAlignVertical: 'top' }} accessibilityLabel={t('create.caption')} />

              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 6 }}>
                <Chip icon="poll" label={t('createFlow.poll')} on={!!poll} onPress={() => (locked ? undefined : setPoll(poll ? null : { question: '', options: ['', ''] }))} />
                <Chip icon="chatdots" label={t('createFlow.prompt')} on={prompt !== null} onPress={() => (locked ? undefined : setPrompt(prompt === null ? '' : null))} />
              </View>
              {poll ? <PollEditor poll={poll} onChange={setPoll} onRemove={() => setPoll(null)} editable={!locked} /> : null}
              {prompt !== null ? <PromptEditor value={prompt} onChange={setPrompt} onRemove={() => setPrompt(null)} editable={!locked} /> : null}

              <View style={{ marginTop: 14 }}>
                <DetailRow icon="music" title={t('createFlow.addAudio')} value={audio ? audio.title : undefined} onPress={() => setPanel('audio')} disabled={locked} />
                <SongStrip songs={songs} selected={audio} onPick={setAudio} disabled={locked} />
                <DetailRow icon="tagged" title={t('createFlow.tagPeople')} value={tagged.length ? String(tagged.length) : undefined} onPress={() => setPanel('tags')} disabled={locked} />
                <PeopleChips people={tagged} onRemove={(p) => setTagged((cur) => cur.filter((x) => x.id !== p.id))} disabled={locked} />
                <DetailRow icon="location" title={t('create.addLocation')} value={location || undefined} onPress={openLocation} disabled={locked} />
                <PlaceChips places={places} value={location} onPick={setLocation} disabled={locked} />
                <SwitchRow icon="sparkle" title={t('createFlow.aiLabel')} value={aiLabel} onChange={setAiLabel} disabled={locked} />

                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginHorizontal: 16, marginVertical: 8 }} />

                {/* Kept to the profile: Plus members switch it on; everyone else is shown where to get it. */}
                {groupId ? null : plus ? (
                  <SwitchRow icon="grid" title={t('createFlow.profileOnly')} value={profileOnly} onChange={setProfileOnly} disabled={locked} />
                ) : (
                  <DetailRow icon="grid" title={t('createFlow.profileOnly')} value={t('createFlow.tryPlus')} valueColor={C.accent2} chevron={false} onPress={() => router.push('/plus')} disabled={locked} />
                )}
                {canLimit ? <DetailRow icon="lock" title={t('createFlow.audience')} value={subscribersOnly ? t('createFlow.subscribers') : t('createFlow.everyone')} onPress={() => setPanel('audience')} disabled={locked} /> : null}
                {groups.length || groupId ? <DetailRow icon={group ? (group.kind === 'page' ? 'crown' : 'users') : 'user'} title={t('create.postTo')} value={group ? group.name : t('create.yourProfile')} onPress={() => setPanel('group')} disabled={locked} /> : null}
                {mode === 'post' && singleVideo ? <SwitchRow icon="reels" title={t('createFlow.shareAsShort')} value={asShort} onChange={setAsShort} disabled={locked} /> : null}
                {storyAllowed ? <SwitchRow icon="story" title={t('createFlow.alsoStory')} value={toStory} onChange={setToStory} disabled={locked} /> : null}
                <DetailRow icon="sliders" title={t('createFlow.moreOptions')} onPress={() => setPanel('more')} disabled={locked} />
              </View>
            </ScrollView>

            {/* Share stays at the bottom, above the keyboard when it is up. */}
            <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: (keyboard ? 0 : insets.bottom) + 10, backgroundColor: C.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line }}>
              {busy ? <Text style={{ color: C.fg2, textAlign: 'center', marginBottom: 8 }} accessibilityLiveRegion="polite">{busy}</Text> : null}
              {err ? <Text style={{ color: C.like, textAlign: 'center', marginBottom: 8, lineHeight: 20 }} accessibilityLiveRegion="polite">{err}</Text> : null}
              <Pressable onPress={share} disabled={locked} accessibilityRole="button" accessibilityLabel={t('common.share')} accessibilityState={{ disabled: locked, busy: locked }} style={({ pressed }) => ({ height: 50, borderRadius: 25, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', opacity: locked ? 0.6 : pressed ? 0.8 : 1 })}>
                <Text style={{ color: C.onAccent, fontWeight: '700', fontSize: 16.5 }}>{busy ? t('create.sharing') : t('common.share')}</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      ) : null}

      <SongSheet visible={panel === 'audio'} onClose={closePanel} selected={audio} onPick={setAudio} />
      <TagSheet visible={panel === 'tags'} onClose={closePanel} me={me} tagged={tagged} onChange={setTagged} />
      <LocationSheet visible={panel === 'location'} onClose={closePanel} value={location} onChange={setLocation} places={places} locating={locating} />

      <Sheet visible={panel === 'audience'} onClose={closePanel} title={t('createFlow.audience')}>
        {[false, true].map((subs) => (
          <Pressable key={String(subs)} onPress={() => { setSubscribersOnly(subs); closePanel(); }} accessibilityRole="radio" accessibilityState={{ checked: subscribersOnly === subs }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, minHeight: 54, backgroundColor: pressed ? C.press : 'transparent' })}>
            <Text style={{ color: C.fg, fontSize: 16.5 }}>{subs ? t('createFlow.subscribers') : t('createFlow.everyone')}</Text>
            <Radio on={subscribersOnly === subs} />
          </Pressable>
        ))}
      </Sheet>

      <Sheet visible={panel === 'more'} onClose={closePanel} title={t('createFlow.moreOptions')}>
        <SwitchRow icon="heart" title={t('createFlow.hideLikes')} value={hideLikes} onChange={setHideLikes} />
        <SwitchRow icon="comment" title={t('createFlow.commentsOff')} value={commentsOff} onChange={setCommentsOff} />
        <SwitchRow icon="shield" title={t('create.sensitive')} value={sensitive} onChange={setSensitive} />
      </Sheet>

      <Sheet visible={panel === 'group'} onClose={closePanel} title={t('create.postTo')}>
        {[{ id: null as string | null, name: t('create.yourProfile'), sub: t('create.everyoneWhoFollows') }, ...groups.map((g) => ({ id: g.id as string | null, name: g.name, sub: g.kind === 'page' ? t('create.page') : g.privacy === 'private' ? t('create.privateCommunity') : t('create.community') }))].map((o) => (
          <Pressable key={o.id ?? 'me'} onPress={() => { setGroupId(o.id); closePanel(); }} accessibilityRole="radio" accessibilityState={{ checked: groupId === o.id }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, minHeight: 54, backgroundColor: pressed ? C.press : 'transparent' })}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.fg, fontSize: 16.5 }} numberOfLines={1}>{o.name}</Text>
              <Text style={{ color: C.fg2, fontSize: 13 }}>{o.sub}</Text>
            </View>
            <Radio on={groupId === o.id} />
          </Pressable>
        ))}
      </Sheet>
      {/* Draws edited photos offscreen at share time. Takes no space. */}
      {exporter}
    </View>
  );
}
