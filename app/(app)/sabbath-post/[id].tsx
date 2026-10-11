import React, { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Icon, VerifiedTick } from '../../../src/components/Icon';
import { kindLabel, openOnce, PostTags, sabbathPostsChanged } from '../../../src/components/sabbath/publishers';
import { Skeleton, SkeletonFrame } from '../../../src/components/Skeleton';
import { afterSheet } from '../../../src/components/StoryChrome';
import { Avatar, Empty, ErrorNote, RoundButton, Screen, ScreenHeader, Sheet, SheetRow, useToast } from '../../../src/components/ui';
import { deleteSabbathPost, fetchSabbathPost, updateSabbathPost } from '../../../src/lib/api';
import { useAppFont } from '../../../src/lib/fonts';
import { useT } from '../../../src/lib/i18n';
import { useSession } from '../../../src/lib/session';
import { agoLong, C, errText } from '../../../src/lib/theme';
import type { SabbathPost } from '../../../src/lib/types';

/** The post's shape while it is on its way: its labels, title, author and a few lines. */
function PostSkeleton() {
  const { width } = useWindowDimensions();
  const w = width - 40;
  return (
    <SkeletonFrame style={{ paddingHorizontal: 20, paddingTop: 6, gap: 12 }}>
      <Skeleton width={74} height={22} radius={11} x={20} />
      <Skeleton width={Math.round(w * 0.85)} height={26} radius={8} x={20} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Skeleton width={38} height={38} radius={19} x={20} />
        <Skeleton width={120} height={12} x={68} />
      </View>
      {[0.96, 0.92, 0.98, 0.6].map((f, i) => (
        <Skeleton key={i} width={Math.round(w * f)} height={14} x={20} />
      ))}
    </SkeletonFrame>
  );
}

/** One post from a Sabbath School publisher, in full. Its author and the admins can edit or delete it; admins pin it. */
export default function SabbathPostScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id ?? '');
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const font = useAppFont('bold');
  const { profile } = useSession();
  const admin = !!profile?.admin_role;
  const [post, setPost] = useState<SabbathPost | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);

  const load = useCallback(() => {
    setError('');
    fetchSabbathPost(id)
      .then(setPost)
      .catch((e) => setError(errText(e)));
  }, [id]);
  useFocusEffect(load);

  const canEdit = !!post && (post.mine || admin);

  async function pin(p: SabbathPost) {
    setMenu(false);
    try {
      await updateSabbathPost(p.id, { pinned: !p.pinned });
      sabbathPostsChanged();
      setPost({ ...p, pinned: !p.pinned });
      toast(p.pinned ? t('ssPub.unpinned') : t('ssPub.pinnedToast'));
    } catch (e) {
      toast(errText(e));
    }
  }

  /** Closes the menu, then does `fn` once it has slid away: iOS drops an alert or share sheet shown while it is closing. */
  const afterMenu = (fn: () => void) => {
    setMenu(false);
    afterSheet().then(fn);
  };

  const share = (p: SabbathPost) => Share.share({ message: `${p.title}${p.link ? `\n${p.link}` : ''}` }).catch(() => {});

  function remove(p: SabbathPost) {
    Alert.alert(t('ssPub.deleteQuestion'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSabbathPost(p.id);
            sabbathPostsChanged();
            toast(t('ssPub.deleted'));
            if (router.canGoBack()) router.back();
            else router.replace('/sabbath-school' as any);
          } catch (e) {
            toast(errText(e));
          }
        },
      },
    ]);
  }

  const openLink = (url: string) => Linking.openURL(url).catch(() => toast(t('ssPub.couldNotOpen')));

  let body: React.ReactNode;
  if (post === undefined) body = error ? <ErrorNote message={error} onRetry={load} /> : <PostSkeleton />;
  else if (post === null) body = <Empty icon="lesson" title={t('ssPub.notFound')} />;
  else {
    const name = post.full_name || post.username;
    const paragraphs = post.body.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    const host = post.link.replace(/^https:\/\//i, '').split(/[/?#]/)[0];
    body = (
      <ScrollView contentContainerStyle={{ paddingBottom: 56 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 6, gap: 12 }}>
          <PostTags post={post} />
          <Text accessibilityRole="header" style={{ color: C.fg, fontSize: 26, fontWeight: '800', lineHeight: 32, letterSpacing: -0.3, fontFamily: font }}>
            {post.title}
          </Text>
          <Pressable onPress={() => openOnce(() => router.push(`/user/${post.author_id}` as any))} accessibilityRole="button" accessibilityLabel={name} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.7 : 1 })}>
            <Avatar uri={post.avatar_url} name={name} size={38} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text numberOfLines={1} style={{ color: C.fg, fontSize: 15.5, fontWeight: '700', flexShrink: 1 }}>{name}</Text>
                {post.verified ? <VerifiedTick size={15} /> : null}
              </View>
              <Text style={{ color: C.fg2, fontSize: 13 }}>{agoLong(post.created_at)}</Text>
            </View>
          </Pressable>
        </View>

        {(post.media ?? []).filter((m) => m.type === 'image').map((m, i) => (
          <Image key={`${m.url}${i}`} source={{ uri: m.url }} contentFit="cover" transition={150} cachePolicy="memory-disk" accessibilityIgnoresInvertColors style={{ marginHorizontal: 16, marginTop: 16, borderRadius: 16, aspectRatio: m.w && m.h ? Math.min(2, Math.max(0.6, m.w / m.h)) : 4 / 3, backgroundColor: C.surface }} />
        ))}

        <View style={{ paddingHorizontal: 20, paddingTop: 18, gap: 14 }}>
          {paragraphs.map((para, i) => (
            <Text key={i} selectable style={{ color: C.fg, fontSize: 16.5, lineHeight: 26 }}>
              {para}
            </Text>
          ))}
          {post.link ? (
            <Pressable onPress={() => openLink(post.link)} accessibilityRole="link" accessibilityLabel={`${t('ssPub.openLink')}, ${host}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
              <Icon name="link" size={20} color={C.accent2} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.accent2, fontSize: 15.5, fontWeight: '700' }}>{t('ssPub.openLink')}</Text>
                <Text numberOfLines={1} style={{ color: C.fg2, fontSize: 13 }}>{host}</Text>
              </View>
              <Icon name="up" size={18} color={C.fg2} weight={2} />
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={post ? t(kindLabel(post.kind)) : ''}
        right={
          post ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {canEdit ? null : <RoundButton name="share" label={t('common.share')} onPress={() => share(post)} />}
              {canEdit ? <RoundButton name="more" label={t('ssPub.options')} onPress={() => setMenu(true)} /> : null}
            </View>
          ) : undefined
        }
      />
      {body}

      {post ? (
        <Sheet visible={menu} onClose={() => setMenu(false)}>
          <SheetRow first icon="compose" label={t('ssPub.edit')} onPress={() => { setMenu(false); openOnce(() => router.push({ pathname: '/sabbath-post-edit', params: { id: post.id } } as any)); }} />
          {admin ? <SheetRow icon="bookmark" label={post.pinned ? t('ssPub.unpin') : t('ssPub.pin')} onPress={() => pin(post)} /> : null}
          <SheetRow icon="share" label={t('common.share')} onPress={() => afterMenu(() => share(post))} />
          <SheetRow icon="trash" label={t('common.delete')} danger onPress={() => afterMenu(() => remove(post))} />
        </Sheet>
      ) : null}
    </Screen>
  );
}
