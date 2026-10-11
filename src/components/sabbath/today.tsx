import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppFont } from '../../lib/fonts';
import { tap } from '../../lib/haptics';
import { C, monthName } from '../../lib/theme';
import { Icon, IconName } from '../Icon';
import { alpha, HERO_GRADIENT, Skeleton, WEEKDAY, WeekDots } from './kit';

/** Lora is loaded for everyone at start-up; until it lands the system font stands in. */
const SERIF = 'Lora_400Regular';

/** "Good morning, Kingsford" by the phone's clock, with today's date under it. */
export function Greeting({ name }: { name: string }) {
  const font = useAppFont('bold');
  const now = new Date();
  const h = now.getHours();
  const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 16 }}>
      <Text style={{ color: C.fg, fontSize: 22, fontWeight: '700', lineHeight: 28, fontFamily: font }}>{name ? `Good ${part}, ${name}` : `Good ${part}`}</Text>
      <Text style={{ color: C.fg3, fontSize: 14.5, marginTop: 2 }}>{`${WEEKDAY[now.getDay()]}, ${now.getDate()} ${monthName(now)}`}</Text>
    </View>
  );
}

/** A round see-through button on a picture or a coloured card. */
export function GlassButton({ icon, label, onPress, fill, colour = '#ffffff', size = 44 }: { icon: IconName; label: string; onPress: () => void; fill?: boolean; colour?: string; size?: number }) {
  return (
    <Pressable onPress={() => { tap('light'); onPress(); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.18)' })}>
      <Icon name={icon} size={Math.round(size * 0.5)} color={colour} fill={fill} weight={2} />
    </Pressable>
  );
}

/**
 * The large card at the top: this week's memory text over the lesson's picture (or a deep
 * green-to-teal wash), with save, share and read buttons along the bottom. While the text is on
 * its way, pale lines hold its place; if a quarter has no memory text, the lesson title stands in.
 */
export function MemoryHero({
  image,
  label,
  text,
  reference,
  loading,
  saved,
  onSave,
  onShare,
  onRead,
}: {
  image?: string;
  label: string;
  text: string;
  reference: string;
  loading?: boolean;
  saved: boolean;
  onSave: () => void;
  onShare: () => void;
  onRead: () => void;
}) {
  // Long verses step down in size so the card keeps its shape.
  const size = text.length > 260 ? 18 : text.length > 170 ? 20 : text.length > 100 ? 22 : 25;
  return (
    <View style={{ marginHorizontal: 16, borderRadius: 20, overflow: 'hidden', minHeight: 340, backgroundColor: HERO_GRADIENT[0] }}>
      <LinearGradient colors={HERO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {image ? (
        <>
          <Image source={{ uri: image }} contentFit="cover" transition={200} cachePolicy="memory-disk" style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
          {/* Dark at the bottom where the words sit, so white text reads on any picture. */}
          <LinearGradient colors={['rgba(3,14,11,0.30)', 'rgba(3,14,11,0.55)', 'rgba(3,14,11,0.90)']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
        </>
      ) : null}
      <View style={{ flex: 1, padding: 20, justifyContent: 'space-between', gap: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="sun" size={18} color="rgba(255,255,255,0.9)" weight={2} />
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600' }}>{label}</Text>
        </View>
        <View>
          {loading ? (
            <View style={{ gap: 10 }}>
              <Skeleton light style={{ height: 20, width: '92%' }} />
              <Skeleton light style={{ height: 20, width: '84%' }} />
              <Skeleton light style={{ height: 20, width: '60%' }} />
            </View>
          ) : (
            <Text accessibilityRole="header" style={{ color: '#ffffff', fontSize: size, lineHeight: Math.round(size * 1.38), fontFamily: SERIF, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 8 }}>
              {text}
            </Text>
          )}
          {reference && !loading ? <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 15, fontWeight: '700', marginTop: 12 }}>{reference}</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <GlassButton icon="heart" fill={saved} colour={saved ? '#ff6b7a' : '#ffffff'} label={saved ? "Remove this week's lesson from Saved" : "Save this week's lesson"} onPress={onSave} />
          <GlassButton icon="share" label="Share the memory text" onPress={onShare} />
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => { tap('light'); onRead(); }} accessibilityRole="button" accessibilityLabel="Read today's study" style={({ pressed }) => ({ height: 44, paddingHorizontal: 22, borderRadius: 22, backgroundColor: '#ffffff', flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
            <Icon name="book" size={18} color={HERO_GRADIENT[0]} weight={2.1} />
            <Text style={{ color: HERO_GRADIENT[0], fontSize: 15.5, fontWeight: '700' }}>Read</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * Today's day of study: its name and title, the week so far as seven dots, and one big button.
 * `heading` is "Today's study" in the lesson's own week, or "Up next" outside it. `title` is null
 * while the day's title is on its way.
 */
export function TodayCard({
  heading,
  dayName,
  title,
  states,
  today,
  action,
  onPress,
}: {
  heading: string;
  dayName: string;
  title: string | null;
  states: ('done' | 'opened' | null)[];
  today?: number;
  action: string;
  onPress: () => void;
}) {
  const font = useAppFont('bold');
  const read = states.filter(Boolean).length;
  return (
    <View style={{ marginHorizontal: 16, marginTop: 14, padding: 18, borderRadius: 20, backgroundColor: C.surface, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: alpha(C.accent, 0.16), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="calendar" size={22} color={C.accent2} weight={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.fg2, fontSize: 13.5, fontWeight: '600' }}>{heading}</Text>
          <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 21, fontWeight: '800', fontFamily: font }}>{dayName}</Text>
        </View>
        <Text style={{ color: C.fg3, fontSize: 13.5, fontWeight: '600' }}>{`${read} of 7`}</Text>
      </View>
      {title === null ? <Skeleton style={{ height: 18, width: '70%' }} /> : title ? <Text numberOfLines={3} style={{ color: C.fg, fontSize: 17, fontWeight: '600', lineHeight: 23 }}>{title}</Text> : null}
      <WeekDots states={states} today={today} />
      <Pressable onPress={() => { tap('light'); onPress(); }} accessibilityRole="button" accessibilityLabel={`${action}: ${dayName}${title ? `, ${title}` : ''}`} style={({ pressed }) => ({ height: 52, borderRadius: 26, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
        <Icon name="play" size={16} color={C.onAccent} />
        <Text style={{ color: C.onAccent, fontSize: 16.5, fontWeight: '700', fontFamily: font }}>{action}</Text>
      </Pressable>
    </View>
  );
}
