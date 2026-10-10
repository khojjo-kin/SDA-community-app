import React, { useCallback, useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleProp, Text, TextStyle, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isLegalDocId, LEGAL_DETAILS, LEGAL_DOCUMENTS, LEGAL_ORDER, type LegalBlock, type LegalDocId } from '../legal/documents';
import { useAppFont } from '../lib/fonts';
import { type Key, t, useLanguage, useT } from '../lib/i18n';
import { C } from '../lib/theme';
import { Icon, type IconName } from './Icon';
import { Empty, RoundButton, Row } from './ui';

/*
 * The legal documents in the app: Terms of use, Privacy policy and the rest. They are written once in
 * legal/*.md and turned into src/legal/documents.ts by scripts/build-legal.mjs; this draws them.
 *
 * Two ways in. Buttons and links inside the app open them in a sheet (useLegalSheet), so whatever is
 * underneath keeps its place: a half-filled sign-up form, a payment, a story. The page at
 * app/legal/[doc].tsx shows the same thing as a screen of its own, for links from outside the app
 * (community://legal/privacy); it sits outside the signed-in part of the app, so it opens signed out too.
 *
 * The documents stay in English. In any other language the page says so at the top.
 */

/** What each document is called in lists, in the app's language. */
export const LEGAL_LABELS: Record<LegalDocId, Key> = {
  terms: 'legal.terms',
  privacy: 'legal.privacy',
  copyright: 'legal.copyright',
  'child-safety': 'legal.childSafety',
  'community-guidelines': 'legal.guidelines',
};

const ICONS: Record<LegalDocId, IconName> = {
  terms: 'book',
  privacy: 'lock',
  copyright: 'gavel',
  'child-safety': 'shield',
  'community-guidelines': 'users',
};

/* ---------- links ---------- */

/**
 * True for one of the owner's details that legal/details.json hasn't filled in yet ("[CONTACT EMAIL]",
 * "https://[WEBSITE]"), or an address made from one ("mailto:%5BCONTACT%20EMAIL%5D"). Those are shown
 * as plain words, never as a link that would write to nobody or open a page that doesn't exist.
 */
export function isPlaceholder(value: string): boolean {
  let text = value;
  try {
    text = decodeURIComponent(value);
  } catch {
    // Not encoded: checked as it is.
  }
  text = text.trim().replace(/^(mailto|tel):/i, '');
  return text.startsWith('[') || text.includes('[WEBSITE]');
}

/**
 * Where a link in a document goes: another document (by id), or an address for the phone. Null when
 * there is nowhere to go yet (a detail still to be filled in) or the address isn't one the app opens.
 */
function legalTarget(href: string): { doc: LegalDocId } | { url: string } | null {
  let url = href;
  if (url.startsWith('/')) {
    const id = url.slice(1).split(/[?#]/)[0];
    if (isLegalDocId(id)) return { doc: id };
    url = LEGAL_DETAILS.website.replace(/\/+$/, '') + url;
  }
  if (!/^(https?:|mailto:|tel:)/i.test(url) || isPlaceholder(url)) return null;
  return { url };
}

/**
 * Opens a link from a document. "/privacy" is another document, opened in place; any other address
 * that starts with "/" is a page on the website. Email and web addresses go to the phone. A link
 * made from a detail still to be filled in does nothing.
 */
export function openLegalLink(href: string, openDoc: (id: LegalDocId) => void) {
  const target = legalTarget(href);
  if (!target) return;
  if ('doc' in target) {
    openDoc(target.doc);
    return;
  }
  const url = target.url;
  Linking.openURL(url).catch(() => {
    // No mail app, for example: show the address so it can be copied by hand.
    let shown = url.replace(/^(mailto|tel):/i, '');
    try {
      shown = decodeURI(shown);
    } catch {
      // Shown as it is.
    }
    Alert.alert(t('legal.couldNotOpen'), shown);
  });
}

/* ---------- **bold** and [links](address) inside a line ---------- */

type Piece = { text: string; bold?: boolean; href?: string };

// The same patterns scripts/build-legal.mjs checks the documents against. Link text may hold one
// level of [brackets], as an unfilled placeholder such as "[CONTACT EMAIL]" does.
const LINK = /\[((?:[^[\]]|\[[^[\]]*\])+)\]\(([^()\s]+)\)/g;
const INLINE = /\*\*(.+?)\*\*|\[((?:[^[\]]|\[[^[\]]*\])+)\]\(([^()\s]+)\)/g;

function links(text: string, bold: boolean): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), bold });
    out.push({ text: m[1], bold, href: m[2] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold });
  return out;
}

/** Splits a line into plain, bold and linked pieces. */
export function parseInline(text: string): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push(...links(m[1], true));
    else out.push({ text: m[2].replace(/\*\*/g, ''), href: m[3] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** One line of a document, with its bold words and tappable links. */
function Inline({ text, style, onOpenDoc }: { text: string; style: StyleProp<TextStyle>; onOpenDoc: (id: LegalDocId) => void }) {
  const fontBold = useAppFont('bold');
  return (
    <Text style={style}>
      {parseInline(text).map((p, i) =>
        // A link to a detail still to be filled in ("[CONTACT EMAIL]") is drawn as plain words.
        p.href && !isPlaceholder(p.text) && legalTarget(p.href) ? (
          <Text key={i} onPress={() => openLegalLink(p.href!, onOpenDoc)} accessibilityRole="link" style={{ color: C.accent2, fontWeight: '600', fontFamily: p.bold ? fontBold : undefined }}>
            {p.text}
          </Text>
        ) : p.bold ? (
          <Text key={i} style={{ fontWeight: '700', color: C.fg, fontFamily: fontBold }}>
            {p.text}
          </Text>
        ) : (
          p.text
        ),
      )}
    </Text>
  );
}

/**
 * A sentence from the app's own words with links in it, such as "By continuing you agree to our
 * {terms} and {privacy}.": each {slot} becomes the link given for it. A slot without `onPress` is
 * filled in as plain words (an address that can't be opened yet, say).
 */
export function LinkedSentence({ text, slots, style, linkStyle }: { text: string; slots: Record<string, { label: string; onPress?: () => void }>; style?: StyleProp<TextStyle>; linkStyle?: StyleProp<TextStyle> }) {
  const parts = text.split(/(\{\w+\})/);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        const slot = /^\{(\w+)\}$/.exec(part)?.[1];
        const link = slot ? slots[slot] : undefined;
        if (!link) return part;
        if (!link.onPress) return link.label;
        return (
          <Text key={i} onPress={link.onPress} accessibilityRole="link" style={[{ color: C.accent2, fontWeight: '600' }, linkStyle]}>
            {link.label}
          </Text>
        );
      })}
    </Text>
  );
}

/* ---------- the document ---------- */

function Block({ block, onOpenDoc, font, fontBold }: { block: LegalBlock; onOpenDoc: (id: LegalDocId) => void; font?: string; fontBold?: string }) {
  if (block.type === 'ul') {
    return (
      <View style={{ gap: 8, marginBottom: 14 }}>
        {block.items.map((item, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10, paddingLeft: 2 }}>
            <Text style={{ color: C.fg2, fontSize: 15.5, lineHeight: 23 }} importantForAccessibility="no">
              {'•'}
            </Text>
            <Inline text={item} onOpenDoc={onOpenDoc} style={{ flex: 1, color: C.fg2, fontSize: 15.5, lineHeight: 23, fontFamily: font }} />
          </View>
        ))}
      </View>
    );
  }
  if (block.type === 'p') return <Inline text={block.text} onOpenDoc={onOpenDoc} style={{ color: C.fg2, fontSize: 15.5, lineHeight: 23, marginBottom: 14, fontFamily: font }} />;
  const look: Record<'h1' | 'h2' | 'h3', TextStyle> = {
    h1: { fontSize: 28, lineHeight: 34, fontWeight: '800', marginBottom: 6 },
    h2: { fontSize: 20, lineHeight: 26, fontWeight: '700', marginTop: 18, marginBottom: 10 },
    h3: { fontSize: 17, lineHeight: 23, fontWeight: '700', marginTop: 8, marginBottom: 8 },
  };
  return (
    <Text accessibilityRole="header" style={[{ color: C.fg, fontFamily: fontBold }, look[block.type]]}>
      {parseInline(block.text).map((p) => p.text).join('')}
    </Text>
  );
}

/** A whole document, scrolling: the title, when it last changed, then every block. */
export function LegalBody({ id, onOpenDoc }: { id: string; onOpenDoc: (id: LegalDocId) => void }) {
  const t = useT();
  const language = useLanguage();
  const insets = useSafeAreaInsets();
  const font = useAppFont();
  const fontBold = useAppFont('bold');
  if (!isLegalDocId(id)) return <Empty icon="info" title={t('legal.notFound')} />;
  const doc = LEGAL_DOCUMENTS[id];
  const [title, ...rest] = doc.blocks[0]?.type === 'h1' ? doc.blocks : [{ type: 'h1' as const, text: doc.title }, ...doc.blocks];
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: insets.bottom + 40 }}>
      {language !== 'en' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <Icon name="globe" size={15} color={C.fg2} />
          <Text style={{ flexShrink: 1, color: C.fg2, fontSize: 13.5, fontFamily: font }}>{t('legal.englishOnly')}</Text>
        </View>
      ) : null}
      <Block block={title} onOpenDoc={onOpenDoc} font={font} fontBold={fontBold} />
      {doc.updated ? <Text style={{ color: C.fg3, fontSize: 13.5, marginBottom: 18, fontFamily: font }}>{t('legal.updated', { date: doc.updated })}</Text> : null}
      {rest.map((b, i) => (
        <Block key={i} block={b} onOpenDoc={onOpenDoc} font={font} fontBold={fontBold} />
      ))}
    </ScrollView>
  );
}

/* ---------- in a sheet ---------- */

/**
 * The documents in a sheet over the current screen. A link to another document opens it on top,
 * with a back arrow. Render `element` in the screen (inside any sheet the links are in, so it can
 * open over that sheet), and call `open('terms')`. `visible` is true while it shows, for a screen
 * that pauses while something is on top of it (the story viewer).
 */
export function useLegalSheet() {
  const [stack, setStack] = useState<LegalDocId[]>([]);
  const [visible, setVisible] = useState(false);
  const open = useCallback((id: LegalDocId) => {
    setStack([id]);
    setVisible(true);
  }, []);
  // The documents stay in place while the sheet slides away, so it doesn't empty as it goes.
  const close = useCallback(() => setVisible(false), []);
  const push = useCallback((id: LegalDocId) => setStack((s) => [...s, id]), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const element = <LegalSheet visible={visible} stack={stack} onOpenDoc={push} onBack={back} onClose={close} />;
  return { open, close, visible, element };
}

function LegalSheet({ visible, stack, onOpenDoc, onBack, onClose }: { visible: boolean; stack: LegalDocId[]; onOpenDoc: (id: LegalDocId) => void; onBack: () => void; onClose: () => void }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const fontBold = useAppFont('bold');
  const id = stack[stack.length - 1];
  return (
    <Modal visible={visible && !!id} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'} allowSwipeDismissal onRequestClose={onClose}>
      {/* On iPhone the page sheet already sits below the status bar. */}
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'ios' ? 0 : insets.top }}>
        <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}>
          <View style={{ minWidth: 64 }}>{stack.length > 1 ? <RoundButton name="back" label={t('common.back')} onPress={onBack} /> : null}</View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('legal.done')} style={({ pressed }) => ({ minWidth: 64, alignItems: 'flex-end', opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: C.accent2, fontSize: 16.5, fontWeight: '700', fontFamily: fontBold }}>{t('legal.done')}</Text>
          </Pressable>
        </View>
        {id ? <LegalBody key={`${stack.length}:${id}`} id={id} onOpenDoc={onOpenDoc} /> : null}
      </View>
    </Modal>
  );
}

/* ---------- the list in About and Help ---------- */

/** One row per document. */
export function LegalRows({ onOpen }: { onOpen: (id: LegalDocId) => void }) {
  const t = useT();
  return (
    <>
      {LEGAL_ORDER.map((id) => (
        <Row key={id} icon={ICONS[id] ?? 'info'} title={t(LEGAL_LABELS[id] ?? 'legal.title')} onPress={() => onOpen(id)} />
      ))}
    </>
  );
}
