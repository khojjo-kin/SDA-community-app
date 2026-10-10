import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '../../src/components/Icon';
import { Button, Divider, Radio, Screen, ScreenHeader, SectionLabel, Sheet, Toggle, useToast } from '../../src/components/ui';
import { updateProfile } from '../../src/lib/api';
import { tap } from '../../src/lib/haptics';
import { type Key, languageName, LANGUAGES, useT } from '../../src/lib/i18n';
import { setPrefs, usePrefs } from '../../src/lib/prefs';
import { useSession } from '../../src/lib/session';
import { C, errText } from '../../src/lib/theme';
import type { Post, Profile } from '../../src/lib/types';

/* ---------- applying the choices to a feed ---------- */

/*
 * Kept here, beside the screen where members make these choices, so what the screen promises and
 * what the feeds do stay together. For you, Explore and Clips import tuneFeed from this file.
 */

/** What a member has said they want from their feeds. */
export type FeedTaste = { more: string[]; less: string[]; lessSensitive: boolean };

export function tasteOf(p: Profile | null | undefined): FeedTaste {
  return { more: p?.interests_more ?? [], less: p?.interests_less ?? [], lessSensitive: p?.sensitive_filter === 'less' };
}

/** A short string that changes only when the choices do, so a feed knows when to load again. */
export function tasteKey(t: FeedTaste): string {
  return JSON.stringify([t.more, t.less, t.lessSensitive]);
}

// Spaces and punctuation split words; an apostrophe stays inside one ("children's"). A hashtag is a word too.
const SPLIT = /[\s!-&(-\/:-@\[-`{-~¡«»¿‐-―“”…]+/;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(SPLIT)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

// "Hymn" and "hymns" count as the same word, so a member doesn't have to guess which one people write.
const same = (a: string, b: string) => a === b || a === b + 's' || b === a + 's';

/** True when the caption has every word of one of the topics, side by side and in order. */
function mentions(caption: string[], topics: string[][]): boolean {
  return topics.some((t) => {
    for (let i = 0; i + t.length <= caption.length; i++) {
      if (t.every((w, j) => same(caption[i + j], w))) return true;
    }
    return false;
  });
}

/**
 * Applies the member's choices to one loaded page of posts, on the phone. Sensitive posts go when
 * they asked for less of them. With `rank` (For you and Clips), posts about a "less" topic go too, and
 * posts about a "more" topic move to the top of the page. The member's own posts are never left out.
 */
export function tuneFeed(posts: Post[], me: string, taste: FeedTaste, rank: boolean): Post[] {
  const more = rank ? taste.more.map(words).filter((t) => t.length) : [];
  const less = rank ? taste.less.map(words).filter((t) => t.length) : [];
  if (!taste.lessSensitive && !more.length && !less.length) return posts;
  const said = new Map<string, string[]>();
  const wordsOf = (p: Post) => {
    let w = said.get(p.id);
    if (!w) said.set(p.id, (w = words(p.caption ?? '')));
    return w;
  };
  const kept = posts.filter((p) => {
    if (p.user_id === me) return true;
    if (taste.lessSensitive && p.sensitive) return false;
    return !(less.length && mentions(wordsOf(p), less));
  });
  if (!more.length) return kept;
  // Sponsored posts the server put at the top of the page stay there: that place was paid for.
  let lead = 0;
  while (lead < kept.length && kept[lead].boosted) lead++;
  const rest = kept.slice(lead);
  const wanted = rest.filter((p) => mentions(wordsOf(p), more));
  if (!wanted.length || wanted.length === rest.length) return kept;
  return [...kept.slice(0, lead), ...wanted, ...rest.filter((p) => !wanted.includes(p))];
}

/* ---------- the screen ---------- */

/**
 * Church topics to start from. `label` is the English name, which is what is saved on the profile
 * (so a topic stays chosen when the member changes the app's language); `name` and `phrase` are keys
 * for showing it: on its button, and in the middle of a sentence.
 */
const SUGGESTED: { label: string; name: Key; phrase: Key }[] = [
  { label: 'Worship music', name: 'feed.topic.worshipMusic', phrase: 'feed.topicIn.worshipMusic' },
  { label: 'Hymns', name: 'feed.topic.hymns', phrase: 'feed.topicIn.hymns' },
  { label: 'Sermons', name: 'feed.topic.sermons', phrase: 'feed.topicIn.sermons' },
  { label: 'Bible study', name: 'feed.topic.bibleStudy', phrase: 'feed.topicIn.bibleStudy' },
  { label: 'Prayer', name: 'feed.topic.prayer', phrase: 'feed.topicIn.prayer' },
  { label: 'Youth', name: 'feed.topic.youth', phrase: 'feed.topicIn.youth' },
  { label: 'Pathfinders', name: 'feed.topic.pathfinders', phrase: 'feed.topicIn.pathfinders' },
  { label: 'Health', name: 'feed.topic.health', phrase: 'feed.topicIn.health' },
  { label: 'Cooking', name: 'feed.topic.cooking', phrase: 'feed.topicIn.cooking' },
  { label: 'Family', name: 'feed.topic.family', phrase: 'feed.topicIn.family' },
  { label: 'Mission stories', name: 'feed.topic.missionStories', phrase: 'feed.topicIn.missionStories' },
  { label: 'Choir', name: 'feed.topic.choir', phrase: 'feed.topicIn.choir' },
  { label: 'Testimonies', name: 'feed.topic.testimonies', phrase: 'feed.topicIn.testimonies' },
  { label: 'Creation and nature', name: 'feed.topic.creation', phrase: 'feed.topicIn.creation' },
  { label: 'Sabbath School', name: 'feed.topic.sabbathSchool', phrase: 'feed.topicIn.sabbathSchool' },
  { label: "Children's stories", name: 'feed.topic.childrensStories', phrase: 'feed.topicIn.childrensStories' },
];

/**
 * The caption languages on offer, in the app's languages' order. '' follows the app's language.
 * Their names come from i18n's LANGUAGES (languageName), the same list Settings and the Language
 * screen use, so a name can't be missing or different in one place. Italian isn't offered for captions.
 */
const CAPTION_LANGUAGES: string[] = ['', ...LANGUAGES.map((l) => l.code).filter((code) => code !== 'it')];

/** Room for plenty of topics, but not a whole dictionary. */
const MAX_TOPICS = 20;
const MAX_TOPIC_LENGTH = 30;

type Which = 'more' | 'less';

const sameTopic = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

type T = ReturnType<typeof useT>;

/** A topic as it shows on its chip: a suggested one in the app's language, the member's own as they typed it. */
function nameOf(t: T, topic: string): string {
  const s = SUGGESTED.find((x) => sameTopic(x.label, topic));
  return s ? t(s.name) : topic.trim();
}

function phraseOf(t: T, topic: string): string {
  const s = SUGGESTED.find((x) => sameTopic(x.label, topic));
  return s ? t(s.phrase) : topic.trim();
}

/** "hymns", "hymns and youth", "hymns, youth and health", with "and 2 more" past four. */
function listOf(t: T, items: string[]): string {
  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;
  const comma = t('feed.listComma');
  if (extra > 0) return t('feed.listMore', { items: shown.join(comma), count: extra });
  if (shown.length === 1) return shown[0];
  return t('feed.listAnd', { items: shown.slice(0, -1).join(comma), last: shown[shown.length - 1] });
}

function TopicChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const t = useT();
  return (
    <Pressable
      onPress={onRemove}
      accessibilityRole="button"
      accessibilityLabel={t('feed.removeTopic', { topic: label })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingLeft: 14, paddingRight: 10, borderRadius: 18, backgroundColor: C.accentSoft, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: C.accent2, fontWeight: '600', fontSize: 15 }}>{label}</Text>
      <Icon name="close" size={14} color={C.accent2} weight={2.4} />
    </Pressable>
  );
}

function AddChip({ onPress, label }: { onPress: () => void; label: string }) {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.fg3, opacity: pressed ? 0.7 : 1 })}>
      <Icon name="plus" size={15} color={C.fg} weight={2.4} />
      <Text style={{ color: C.fg, fontWeight: '600', fontSize: 15 }}>{t('feed.add')}</Text>
    </Pressable>
  );
}

function TopicSection({ title, sub, addLabel, topics, onRemove, onAdd }: { title: string; sub: string; addLabel: string; topics: string[]; onRemove: (t: string) => void; onAdd: () => void }) {
  const t = useT();
  return (
    <View>
      <SectionLabel strong>{title}</SectionLabel>
      <Text style={{ color: C.fg2, fontSize: 14.5, lineHeight: 20, paddingHorizontal: 16, marginTop: -6, marginBottom: 12 }}>{sub}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
        {topics.map((topic) => (
          <TopicChip key={topic} label={nameOf(t, topic)} onRemove={() => onRemove(topic)} />
        ))}
        {topics.length < MAX_TOPICS ? <AddChip onPress={onAdd} label={addLabel} /> : null}
      </View>
    </View>
  );
}

/** One line with a radio button, for a choice of a few. */
function Choice({ title, sub, on, onPress }: { title: string; sub: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${title}. ${sub}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? C.press : 'transparent' })}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.fg, fontSize: 17.5 }}>{title}</Text>
        <Text style={{ color: C.fg2, fontSize: 14.5, lineHeight: 20, marginTop: 2 }}>{sub}</Text>
      </View>
      <Radio on={on} />
    </Pressable>
  );
}

/** A switch with a title and a sentence under it. */
function Switch({ title, sub, value, onChange }: { title: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 16 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.fg, fontSize: 17.5 }}>{title}</Text>
        <Text style={{ color: C.fg2, fontSize: 14.5, lineHeight: 20, marginTop: 2 }}>{sub}</Text>
      </View>
      <Toggle value={value} onChange={onChange} label={title} />
    </View>
  );
}

/**
 * "Your feed": what a member wants more and less of in For you and Clips, how much sensitive content
 * they see, and how clips play (captions, their language, sound). Topics and the sensitive filter
 * live on the profile; captions and sound are choices kept on this phone (prefs).
 */
export default function ClipsSettings() {
  const { me, profile } = useSession();
  const prefs = usePrefs();
  const toast = useToast();
  const t = useT();
  const [more, setMore] = useState<string[]>(() => profile?.interests_more ?? []);
  const [less, setLess] = useState<string[]>(() => profile?.interests_less ?? []);
  const [filter, setFilter] = useState<'less' | 'standard'>(() => profile?.sensitive_filter ?? 'standard');
  const [adding, setAdding] = useState<Which | null>(null);
  const [custom, setCustom] = useState('');
  const [languages, setLanguages] = useState(false);
  // Saves go one after another, so quick taps reach the database in the order they were made.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // The profile may still be on its way when the screen opens: take its choices once they arrive.
  const seeded = useRef(!!profile);
  useEffect(() => {
    if (seeded.current || !profile) return;
    seeded.current = true;
    setMore(profile.interests_more ?? []);
    setLess(profile.interests_less ?? []);
    setFilter(profile.sensitive_filter ?? 'standard');
  }, [profile]);

  function save(patch: { interests_more?: string[]; interests_less?: string[]; sensitive_filter?: 'less' | 'standard' }, undo: () => void) {
    queue.current = queue.current.then(() =>
      updateProfile(me, patch).catch((e) => {
        if (!alive.current) return;
        undo();
        toast(errText(e));
      }),
    );
  }

  function setTopics(nextMore: string[], nextLess: string[]) {
    const was = { more, less };
    setMore(nextMore);
    setLess(nextLess);
    save({ interests_more: nextMore, interests_less: nextLess }, () => {
      setMore(was.more);
      setLess(was.less);
    });
  }

  /** Adds a topic to one list. A topic can't be wanted and unwanted at once, so it leaves the other list. */
  function add(which: Which, raw: string) {
    const topic = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_TOPIC_LENGTH);
    if (!topic) return;
    const list = which === 'more' ? more : less;
    if (list.some((t) => sameTopic(t, topic))) return;
    if (list.length >= MAX_TOPICS) return toast(t('feed.maxTopics', { count: MAX_TOPICS }));
    tap('select');
    const other = (which === 'more' ? less : more).filter((t) => !sameTopic(t, topic));
    if (which === 'more') setTopics([...more, topic], other);
    else setTopics(other, [...less, topic]);
  }

  function remove(which: Which, topic: string) {
    tap('select');
    if (which === 'more') setTopics(more.filter((t) => t !== topic), less);
    else setTopics(more, less.filter((t) => t !== topic));
  }

  function toggleSuggested(which: Which, label: string) {
    const list = which === 'more' ? more : less;
    const there = list.find((t) => sameTopic(t, label));
    if (there) remove(which, there);
    else add(which, label);
  }

  function chooseFilter(next: 'less' | 'standard') {
    if (next === filter) return;
    tap('select');
    const was = filter;
    setFilter(next);
    save({ sensitive_filter: next }, () => setFilter(was));
  }

  function addCustom() {
    if (!adding || !custom.trim()) return;
    add(adding, custom);
    setCustom('');
  }

  const closeAdding = () => {
    setAdding(null);
    setCustom('');
  };

  const summary = more.length ? t('feed.summary', { topics: listOf(t, more.map((topic) => phraseOf(t, topic))) }) : t('feed.summaryEmpty');
  const captionName = (code: string) => (code ? languageName(code) : t('settings.appLanguage'));
  const captionLanguage = captionName(prefs.captionLang);
  const list = adding === 'more' ? more : less;

  return (
    <Screen>
      <ScreenHeader title={t('settings.yourFeed')} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ marginHorizontal: 16, marginTop: 4, padding: 18, borderRadius: 20, backgroundColor: C.surface, gap: 8 }}>
          <Icon name="sparkle" size={24} color={C.accent2} />
          <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 24, fontWeight: '800', lineHeight: 30 }}>{summary}</Text>
        </View>

        <TopicSection title={t('feed.moreTitle')} sub={t('feed.moreSub')} addLabel={t('feed.addMore')} topics={more} onRemove={(topic) => remove('more', topic)} onAdd={() => setAdding('more')} />
        <TopicSection title={t('feed.lessTitle')} sub={t('feed.lessSub')} addLabel={t('feed.addLess')} topics={less} onRemove={(topic) => remove('less', topic)} onAdd={() => setAdding('less')} />

        <Divider />
        <SectionLabel strong>{t('feed.sensitive')}</SectionLabel>
        <View accessibilityRole="radiogroup">
          <Choice title={t('feed.standard')} sub={t('feed.standardSub')} on={filter === 'standard'} onPress={() => chooseFilter('standard')} />
          <Choice title={t('feed.less')} sub={t('feed.lessSensitiveSub')} on={filter === 'less'} onPress={() => chooseFilter('less')} />
        </View>

        <Divider />
        <SectionLabel strong>{t('clips.captions')}</SectionLabel>
        {/* The switch gives its own haptic tap (Toggle), so these don't add another. */}
        <Switch title={t('feed.showCaptions')} sub={t('feed.showCaptionsSub')} value={prefs.captions} onChange={(v) => setPrefs({ captions: v })} />
        <Pressable onPress={() => setLanguages(true)} accessibilityRole="button" accessibilityLabel={`${t('settings.captionLanguage')}, ${captionLanguage}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 52, backgroundColor: pressed ? C.press : 'transparent' })}>
          <Text style={{ flex: 1, color: C.fg, fontSize: 17.5 }}>{t('settings.captionLanguage')}</Text>
          <Text style={{ color: C.fg2, fontSize: 16.5 }}>{captionLanguage}</Text>
          <Icon name="right" size={18} color={C.fg2} weight={2} />
        </Pressable>

        <Divider />
        <SectionLabel strong>{t('clips.sound')}</SectionLabel>
        <Switch title={t('clips.startMuted')} sub={t('clips.startMutedSub')} value={prefs.reelsMuted} onChange={(v) => setPrefs({ reelsMuted: v })} />
      </ScrollView>

      <Sheet visible={!!adding} onClose={closeAdding} title={t(adding === 'less' ? 'feed.seeLessOf' : 'feed.seeMoreOf')} tall>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SUGGESTED.map((s) => {
              const on = list.some((t) => sameTopic(t, s.label));
              return (
                <Pressable
                  key={s.label}
                  onPress={() => toggleSuggested(adding ?? 'more', s.label)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={t(s.name)}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: on ? C.fg : C.surface, opacity: pressed ? 0.7 : 1 })}>
                  {on ? <Icon name="check" size={15} color={C.bg} weight={2.6} /> : null}
                  <Text style={{ color: on ? C.bg : C.fg, fontWeight: '600', fontSize: 15 }}>{t(s.name)}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ gap: 8 }}>
            <Text style={{ color: C.fg2, fontSize: 13.5, fontWeight: '600' }}>{t('feed.somethingElse')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={custom}
                onChangeText={setCustom}
                placeholder={t('feed.typeTopic')}
                placeholderTextColor={C.fg3}
                maxLength={MAX_TOPIC_LENGTH}
                returnKeyType="done"
                onSubmitEditing={addCustom}
                keyboardAppearance={C.blurTint}
                accessibilityLabel={t('feed.ownTopic')}
                style={{ flex: 1, color: C.fg, fontSize: 16, height: 46, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line }}
              />
              <Button label={t('feed.add')} small disabled={!custom.trim()} onPress={addCustom} style={{ height: 46 }} />
            </View>
          </View>
        </ScrollView>
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <Button label={t('feed.done')} onPress={closeAdding} />
        </View>
      </Sheet>

      <Sheet visible={languages} onClose={() => setLanguages(false)} title={t('settings.captionLanguage')} tall>
        <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
          {CAPTION_LANGUAGES.map((code) => (
            <Pressable
              key={code || 'app'}
              onPress={() => {
                tap('select');
                setPrefs({ captionLang: code });
                setLanguages(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: prefs.captionLang === code }}
              accessibilityLabel={captionName(code)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, minHeight: 50, backgroundColor: pressed ? C.press : 'transparent' })}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.fg, fontSize: 17 }}>{captionName(code)}</Text>
                {code === '' ? <Text style={{ color: C.fg2, fontSize: 13.5, marginTop: 1 }}>{t('feed.appLanguageSub')}</Text> : null}
              </View>
              <Radio on={prefs.captionLang === code} />
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>
    </Screen>
  );
}
