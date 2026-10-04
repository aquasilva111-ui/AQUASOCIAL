import {useEffect, useMemo, useRef, useState} from 'react'
import {
  Animated,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native'
import {Image} from 'expo-image'
import {
  type AppBskyFeedDefs,
  AtUri,
  moderatePost,
  RichText as RichTextAPI,
} from '@atproto/api'
import {useNavigation} from '@react-navigation/native'

import {DISCOVER_FEED_URI} from '#/lib/constants'
import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {getPostMedia} from '#/lib/media/experiences'
import {makeProfileLink} from '#/lib/routes/links'
import {type NavigationProp} from '#/lib/routes/types'
import {shareUrl} from '#/lib/sharing'
import {cleanError} from '#/lib/strings/errors'
import {getPostTextAndFacets} from '#/lib/strings/long-post'
import {toShareUrl} from '#/lib/strings/url-helpers'
import {recordViewEvent} from '#/lib/views/events'
import {formatCount} from '#/lib/visionboard/format'
import {
  getRelatedVisionboardItems,
  type VisionboardItem,
} from '#/lib/visionboard/model'
import {
  POST_TOMBSTONE,
  type Shadow,
  usePostShadow,
} from '#/state/cache/post-shadow'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {
  usePostLikeMutationQueue,
  usePostQuery,
  usePostRepostMutationQueue,
} from '#/state/queries/post'
import {usePostFeedQuery} from '#/state/queries/post-feed'
import {useProfileQuery} from '#/state/queries/profile'
import {useRequireAuth, useSession} from '#/state/session'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {ArrowLeft_Stroke2_Corner0_Rounded as ArrowLeftIcon} from '#/components/icons/Arrow'
import {Bookmark as BookmarkIcon} from '#/components/icons/Bookmark'
import {
  Heart2_Filled_Stroke2_Corner0_Rounded as HeartFilledIcon,
  Heart2_Stroke2_Corner0_Rounded as HeartIcon,
} from '#/components/icons/Heart2'
import {Repost_Stroke2_Corner0_Rounded as RepostIcon} from '#/components/icons/Repost'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import * as Hider from '#/components/moderation/Hider'
import {FollowButton} from '#/components/ProfileCard'
import {RichText} from '#/components/RichText'
import * as toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {SaveToBoardButton} from '#/components/visionboard/SaveToBoardButton'
import {Capsule, StatCapsule} from '#/components/visionboard/VisionboardCapsule'
import {VisionboardCard} from '#/components/visionboard/VisionboardCard'
import {
  dealIntoColumns,
  VisionboardMasonry,
} from '#/components/visionboard/VisionboardMasonry'
import {VisionboardTopBar} from '#/components/visionboard/VisionboardTopBar'

const IMAGE_RADIUS = 28
const STRIP_WIDTH = 440
const MAIN_WIDTH = 760
const LIKE_RED = '#E5214F'

const TABS = [
  {value: 'current', label: 'Feed atual'},
  {value: 'discover', label: 'Para você'},
] as const
type Tab = (typeof TABS)[number]['value']

/**
 * Full-page Visionboard detail (web). Renders the real AQUA post: saves are
 * AQUA bookmarks, the creator is the AQUA profile, replies open the thread.
 */
export function VisionboardDetail({uri}: {uri: string}) {
  const navigation = useNavigation<NavigationProp>()
  const [search, setSearch] = useState('')
  const post = usePostQuery(uri)

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack()
    else navigation.navigate('Images')
  }

  return (
    <Layout.Screen testID="visionboard-detail" hideCenterBorders>
      <VisionboardTopBar<Tab>
        tabs={[...TABS]}
        activeTab={'' as Tab}
        onSelectTab={source => navigation.navigate('Images', {source})}
        search={search}
        onChangeSearch={setSearch}
        onSubmitSearch={() =>
          search.trim() && navigation.navigate('Images', {q: search.trim()})
        }
        onClearSearch={() => setSearch('')}
      />
      <View style={[a.w_full, a.px_xl]}>
        <View style={[a.flex_row, {paddingTop: 24, paddingBottom: 20}]}>
          <Button
            label="Voltar ao feed"
            size="small"
            variant="ghost"
            color="secondary"
            onPress={goBack}>
            <ButtonIcon icon={ArrowLeftIcon} />
            <ButtonText style={[a.text_md, a.font_bold]}>
              Voltar ao feed
            </ButtonText>
          </Button>
        </View>
        {post.data ? (
          <DetailBody post={post.data} />
        ) : (
          <Text style={[a.text_md, a.p_xl, a.text_center]}>
            {post.isError
              ? 'Não foi possível abrir esta imagem.'
              : 'Carregando…'}
          </Text>
        )}
      </View>
    </Layout.Screen>
  )
}

function useRelatedItems(post: AppBskyFeedDefs.PostView) {
  const feed = usePostFeedQuery(`feedgen|${DISCOVER_FEED_URI}`)
  return useMemo(
    () =>
      getRelatedVisionboardItems(
        post,
        feed.data?.pages.flatMap(page =>
          page.slices.flatMap(slice => slice.items),
        ) ?? [],
      )
        .filter(item => item.uri !== post.uri)
        .slice(0, 24),
    [post, feed.data],
  )
}

function DetailBody({post: raw}: {post: AppBskyFeedDefs.PostView}) {
  const post = usePostShadow(raw)
  const moderationOpts = useModerationOpts()
  const {width} = useWindowDimensions()
  const items = useRelatedItems(raw)
  const {currentAccount} = useSession()

  // One unique view per session and viewer, sent to the app's view-event
  // pipeline. The UI shows no view number until a server counts them: the
  // only counter today is a per-device placeholder.
  useEffect(() => {
    recordViewEvent({
      contentUri: raw.uri,
      contentType: 'image',
      eventType: 'unique_view',
      surface: 'visionboard',
      viewerDid: currentAccount?.did,
    })
  }, [raw.uri, currentAccount?.did])

  if (post === POST_TOMBSTONE) {
    return (
      <Text style={[a.text_md, a.p_xl, a.text_center]}>
        Esta publicação foi apagada.
      </Text>
    )
  }
  if (!moderationOpts) return null
  const showStrip = width >= MAIN_WIDTH + STRIP_WIDTH + 120 && items.length > 0
  return (
    <>
      <View style={[a.flex_row, a.justify_center, a.align_start, {gap: 20}]}>
        <View style={[a.flex_1, {maxWidth: MAIN_WIDTH, minWidth: 0}]}>
          <DetailMain
            post={post}
            moderation={moderatePost(raw, moderationOpts)}
          />
        </View>
        {showStrip && <RecommendationStrip items={items} />}
      </View>
      {!showStrip && !!items.length && (
        <VisionboardMasonry
          variant="board"
          items={items}
          header={
            <Text
              style={[
                a.text_xl,
                a.font_semi_bold,
                a.text_center,
                {paddingTop: 48, paddingBottom: 20},
              ]}>
              Mais como este
            </Text>
          }
        />
      )}
      {!items.length && <View style={{height: 80}} />}
    </>
  )
}

function DetailMain({
  post,
  moderation,
}: {
  post: Shadow<AppBskyFeedDefs.PostView>
  moderation: ReturnType<typeof moderatePost>
}) {
  const t = useTheme()
  const requireAuth = useRequireAuth()
  const [index, setIndex] = useState(0)
  const repostDialog = Dialog.useDialogControl()
  const [queueLike, queueUnlike] = usePostLikeMutationQueue(
    post,
    undefined,
    undefined,
    'PostThreadItem',
  )
  const postMedia = getPostMedia(post)
  const images = postMedia.type === 'images' ? postMedia.view.images : []
  const image = images[Math.min(index, images.length - 1)]
  const record = post.record as {text: string}
  const richText = useMemo(
    () => new RichTextAPI(getPostTextAndFacets(post.record as any)),
    [post.record],
  )
  const modui = useMemo(() => {
    const content = moderation.ui('contentView')
    const media = moderation.ui('contentMedia')
    content.blurs = [...content.blurs, ...media.blurs]
    content.alerts = [...content.alerts, ...media.alerts]
    content.filters = [...content.filters, ...media.filters]
    return content
  }, [moderation])
  const aspectRatio =
    image?.aspectRatio && image.aspectRatio.height > 0
      ? image.aspectRatio.width / image.aspectRatio.height
      : 1
  const threadHref = makeProfileLink(
    post.author,
    'post',
    new AtUri(post.uri).rkey,
  )
  const isShort = richText.graphemeLength <= 140
  const liked = !!post.viewer?.like
  const likeCount = post.likeCount ?? 0
  const repostCount = (post.repostCount ?? 0) + (post.quoteCount ?? 0)

  const toggleLike = (want: boolean) =>
    requireAuth(async () => {
      try {
        if (want) await queueLike()
        else await queueUnlike()
      } catch (e: any) {
        if (e?.name !== 'AbortError') toast.show(cleanError(e), {type: 'error'})
      }
    })

  // Double tap / double click on the image likes it; it never un-likes.
  const burst = useRef(new Animated.Value(0)).current
  const lastTap = useRef(0)
  const onImagePress = () => {
    const now = Date.now()
    if (now - lastTap.current < 320) {
      lastTap.current = 0
      burst.setValue(0)
      Animated.sequence([
        Animated.spring(burst, {toValue: 1, useNativeDriver: true}),
        Animated.delay(350),
        Animated.timing(burst, {
          toValue: 2,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start()
      if (!liked) toggleLike(true)
    } else {
      lastTap.current = now
    }
  }
  const heartScale = burst.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0.4, 1.1, 1.2],
  })
  const heartOpacity = burst.interpolate({
    inputRange: [0, 0.2, 1, 2],
    outputRange: [0, 1, 1, 0],
  })

  return (
    <View style={[{gap: 18, paddingTop: 12}]}>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel="Toque duas vezes para curtir"
        accessibilityHint=""
        onPress={onImagePress}
        style={[
          a.w_full,
          a.overflow_hidden,
          t.atoms.bg_contrast_25,
          {borderRadius: IMAGE_RADIUS},
          web({
            boxShadow: '0 18px 50px rgba(0, 0, 0, 0.14)',
            cursor: 'pointer',
          }),
        ]}>
        <Hider.Outer modui={modui}>
          <Hider.Mask>
            <View style={[a.w_full, {aspectRatio}]} />
          </Hider.Mask>
          <Hider.Content>
            {image && (
              <Image
                accessibilityIgnoresInvertColors
                source={{uri: image.fullsize}}
                accessibilityLabel={image.alt || record.text}
                accessibilityHint=""
                contentFit="cover"
                style={[a.w_full, {aspectRatio}, web({maxHeight: '82vh'})]}
              />
            )}
          </Hider.Content>
        </Hider.Outer>
        <Animated.View
          pointerEvents="none"
          style={[
            a.absolute,
            a.align_center,
            a.justify_center,
            {
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: heartOpacity,
              transform: [{scale: heartScale}],
            },
          ]}>
          <HeartFilledIcon width={110} fill="#fff" />
        </Animated.View>
      </Pressable>

      {images.length > 1 && (
        <View style={[a.flex_row, a.gap_xs, a.flex_wrap]}>
          {images.map((img, i) => (
            <Pressable
              key={img.thumb}
              accessibilityRole="button"
              accessibilityLabel={`Imagem ${i + 1}`}
              accessibilityHint=""
              onPress={() => setIndex(i)}
              style={[
                a.overflow_hidden,
                {
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  borderWidth: 2,
                  borderColor: i === index ? '#0057FF' : 'transparent',
                },
              ]}>
              <Image
                accessibilityIgnoresInvertColors
                source={{uri: img.thumb}}
                style={[a.w_full, a.h_full]}
                contentFit="cover"
              />
            </Pressable>
          ))}
        </View>
      )}

      <View style={[a.px_xs]}>
        <RichText
          value={richText}
          style={[
            isShort
              ? {
                  fontSize: 26,
                  lineHeight: 32,
                  fontWeight: '600',
                  letterSpacing: -0.5,
                }
              : [a.text_lg, a.leading_snug],
          ]}
          enableTags
        />
      </View>

      {/* Glass capsules sit straight on the page background */}
      <View style={[a.flex_row, a.flex_wrap, a.align_center, {gap: 10}]}>
        <Capsule
          label={liked ? 'Descurtir' : 'Curtir'}
          icon={liked ? HeartFilledIcon : HeartIcon}
          tint={liked ? LIKE_RED : undefined}
          active={liked}
          onPress={() => toggleLike(!liked)}
          text={likeCount}
        />
        <SaveToBoardButton
          showSavedIn
          target={{
            post,
            imageIndex: Math.min(index, Math.max(images.length - 1, 0)),
            thumbUrl: image?.thumb,
          }}
        />
        <Capsule
          label="Republicar"
          icon={RepostIcon}
          active={!!post.viewer?.repost}
          tint={post.viewer?.repost ? '#16a34a' : undefined}
          onPress={() => requireAuth(() => repostDialog.open())}
          text={post.viewer?.repost ? 'Republicado' : 'Republicar no feed'}
        />
        <Capsule
          label="Compartilhar"
          onPress={() => shareUrl(toShareUrl(threadHref))}
          text="Compartilhar"
        />
        {image && (
          <Link
            to={image.fullsize}
            label="Abrir imagem em tamanho original"
            download="visionboard.jpg">
            <Capsule label="Baixar" text="Baixar" />
          </Link>
        )}
      </View>

      {/* Analytics are the only black capsules. Views are not shown until a
          server counts them (see the note in DetailBody). */}
      <View style={[a.flex_row, a.flex_wrap, a.align_center, {gap: 10}]}>
        <StatCapsule
          icon={BookmarkIcon}
          value={formatCount(post.bookmarkCount ?? 0)}
          label="Saves"
        />
        <StatCapsule
          icon={RepostIcon}
          value={formatCount(repostCount)}
          label="Republicações"
        />
        <StatCapsule
          icon={HeartIcon}
          value={formatCount(likeCount)}
          label="Curtidas"
        />
      </View>

      <Creator author={post.author} />
      <Link
        to={threadHref}
        label="Ver conversa completa"
        style={[a.self_start, a.px_xs]}>
        <Text style={[a.text_md, a.font_semi_bold, {color: '#0b5cff'}]}>
          Ver conversa completa
        </Text>
      </Link>

      <RepostDialog control={repostDialog} post={post} />
    </View>
  )
}

function RepostDialog({
  control,
  post,
}: {
  control: Dialog.DialogControlProps
  post: Shadow<AppBskyFeedDefs.PostView>
}) {
  const {openComposer} = useOpenComposer()
  const [queueRepost, queueUnrepost] = usePostRepostMutationQueue(
    post,
    undefined,
    undefined,
    'PostThreadItem',
  )
  const reposted = !!post.viewer?.repost
  const run = () => {
    control.close(async () => {
      try {
        if (reposted) await queueUnrepost()
        else await queueRepost()
        toast.show(
          reposted ? 'Republicação desfeita' : 'Republicado no seu feed',
          {type: 'success'},
        )
      } catch (e: any) {
        if (e?.name !== 'AbortError') toast.show(cleanError(e), {type: 'error'})
      }
    })
  }
  return (
    <Dialog.Outer control={control} nativeOptions={{preventExpansion: true}}>
      <Dialog.Handle />
      <Dialog.ScrollableInner
        label="Republicar no feed"
        style={web({maxWidth: 420})}>
        <View style={[a.gap_md]}>
          <Text style={[a.text_xl, a.font_semi_bold]}>Republicar no feed</Text>
          <Text style={[a.text_md, a.leading_snug]}>
            O pin aparece no seu feed do AQUA, com o crédito do autor original.
          </Text>
          <Button
            label={reposted ? 'Desfazer republicação' : 'Republicar'}
            size="large"
            variant="solid"
            color="primary"
            onPress={run}
            style={[a.rounded_full]}>
            <ButtonText>
              {reposted ? 'Desfazer republicação' : 'Republicar'}
            </ButtonText>
          </Button>
          <Button
            label="Republicar com comentário"
            size="large"
            variant="outline"
            color="secondary"
            onPress={() =>
              control.close(() => openComposer({quote: post, onPost: () => {}}))
            }
            style={[a.rounded_full]}>
            <ButtonText>Republicar com comentário</ButtonText>
          </Button>
        </View>
      </Dialog.ScrollableInner>
    </Dialog.Outer>
  )
}

/**
 * Recommendations peeking on the right. The column is cut off by a fade on
 * purpose, so people see there is more and drag (or scroll) to reach it.
 */
function RecommendationStrip({items}: {items: VisionboardItem[]}) {
  const {height} = useWindowDimensions()
  const scrollRef = useRef<ScrollView>(null)
  const drag = useRef({active: false, moved: false, y: 0, top: 0})
  const scrollTop = useRef(0)
  const columns = useMemo(() => dealIntoColumns(items, 2), [items])

  const onDown = (e: any) => {
    drag.current = {
      active: true,
      moved: false,
      y: e.clientY ?? 0,
      top: scrollTop.current,
    }
  }
  const onMove = (e: any) => {
    const d = drag.current
    if (!d.active) return
    const dy = (e.clientY ?? 0) - d.y
    if (Math.abs(dy) > 4) d.moved = true
    scrollRef.current?.scrollTo({y: d.top - dy, animated: false})
  }
  const end = () => {
    drag.current.active = false
  }

  return (
    <View
      // @ts-expect-error web only
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={end}
      onMouseLeave={end}
      onClickCapture={(e: any) => {
        if (drag.current.moved) {
          e.preventDefault()
          e.stopPropagation()
          drag.current.moved = false
        }
      }}
      style={[
        {width: STRIP_WIDTH, height: height - 24, marginTop: 12},
        web({
          position: 'sticky',
          top: 12,
          cursor: 'grab',
          userSelect: 'none',
          WebkitMaskImage: 'linear-gradient(#000 78%, transparent)',
          maskImage: 'linear-gradient(#000 78%, transparent)',
        }),
      ]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={e => {
          scrollTop.current = e.nativeEvent.contentOffset.y
        }}
        contentContainerStyle={{paddingBottom: 140}}>
        <View style={[a.flex_row, {gap: 8}]}>
          {columns.map((column, i) => (
            <View key={i} style={[a.flex_1, {minWidth: 0}]}>
              {column.map(item => (
                <VisionboardCard key={item.id} item={item} variant="board" />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

function Creator({author}: {author: AppBskyFeedDefs.PostView['author']}) {
  const t = useTheme()
  const moderationOpts = useModerationOpts()
  const {data: profile} = useProfileQuery({did: author.did})
  const followers = profile?.followersCount
  const name = author.displayName || author.handle
  return (
    <View style={[a.flex_row, a.align_center, a.flex_wrap, {gap: 10}]}>
      <Capsule
        label={`Ver perfil de ${name}`}
        variant="blue"
        to={makeProfileLink(author)}>
        <View style={[a.flex_row, a.align_center, a.gap_sm]}>
          <UserAvatar size={28} avatar={author.avatar} type="user" />
          <Text
            numberOfLines={1}
            style={[
              a.text_md,
              a.font_semi_bold,
              {color: '#fff', maxWidth: 220},
            ]}>
            {name}
          </Text>
        </View>
      </Capsule>
      <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
        {followers === undefined
          ? `@${author.handle}`
          : `${followers.toLocaleString('pt-BR')} ${
              followers === 1 ? 'seguidor' : 'seguidores'
            }`}
      </Text>
      <View style={[a.flex_1]} />
      {profile && moderationOpts && (
        <FollowButton
          profile={profile}
          moderationOpts={moderationOpts}
          logContext="PostThreadItem"
          size="small"
          style={[a.rounded_full]}
        />
      )}
    </View>
  )
}
