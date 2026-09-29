import {useMemo, useState} from 'react'
import {Pressable, View} from 'react-native'
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
import {getRelatedVisionboardItems} from '#/lib/visionboard/model'
import {
  POST_TOMBSTONE,
  type Shadow,
  usePostShadow,
} from '#/state/cache/post-shadow'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {useBookmarkMutation} from '#/state/queries/bookmarks/useBookmarkMutation'
import {usePostQuery} from '#/state/queries/post'
import {usePostFeedQuery} from '#/state/queries/post-feed'
import {useProfileQuery} from '#/state/queries/profile'
import {useRequireAuth} from '#/state/session'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useBreakpoints, useTheme, web} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {ArrowLeft_Stroke2_Corner0_Rounded as ArrowLeftIcon} from '#/components/icons/Arrow'
import {ArrowOutOfBox_Stroke2_Corner0_Rounded as ShareIcon} from '#/components/icons/ArrowOutOfBox'
import {Download_Stroke2_Corner0_Rounded as DownloadIcon} from '#/components/icons/Download'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import * as Hider from '#/components/moderation/Hider'
import {PostControls} from '#/components/PostControls'
import {FollowButton} from '#/components/ProfileCard'
import {RichText} from '#/components/RichText'
import * as toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {VisionboardMasonry} from '#/components/visionboard/VisionboardMasonry'
import {VisionboardTopBar} from '#/components/visionboard/VisionboardTopBar'

const SAVE_GRADIENT = 'linear-gradient(135deg, #0048ff 0%, #2b8cff 100%)'
const CARD_RADIUS = 32

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
      <View
        style={[
          a.w_full,
          a.px_xl,
          web({maxWidth: 1480, marginLeft: 'auto', marginRight: 'auto'}),
        ]}>
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

function DetailBody({post: raw}: {post: AppBskyFeedDefs.PostView}) {
  const post = usePostShadow(raw)
  const moderationOpts = useModerationOpts()
  if (post === POST_TOMBSTONE) {
    return (
      <Text style={[a.text_md, a.p_xl, a.text_center]}>
        Esta publicação foi apagada.
      </Text>
    )
  }
  if (!moderationOpts) return null
  return (
    <>
      <DetailCard post={post} moderation={moderatePost(raw, moderationOpts)} />
      <MoreToExplore post={raw} />
    </>
  )
}

function DetailCard({
  post,
  moderation,
}: {
  post: Shadow<AppBskyFeedDefs.PostView>
  moderation: ReturnType<typeof moderatePost>
}) {
  const t = useTheme()
  const {gtTablet} = useBreakpoints()
  const {openComposer} = useOpenComposer()
  const [index, setIndex] = useState(0)
  const media = getPostMedia(post)
  const images = media.type === 'images' ? media.view.images : []
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

  return (
    <View
      style={[
        a.w_full,
        a.overflow_hidden,
        a.border,
        t.atoms.border_contrast_low,
        t.atoms.bg,
        {borderRadius: CARD_RADIUS, maxWidth: 1110},
        gtTablet && a.flex_row,
        web({
          marginLeft: 'auto',
          marginRight: 'auto',
          boxShadow: '0 18px 48px rgba(15, 23, 42, 0.08)',
        }),
      ]}>
      {/* Image column */}
      <View
        style={[
          gtTablet ? {width: '42%'} : a.w_full,
          {backgroundColor: '#0b0d12'},
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
                contentFit="contain"
                style={[a.w_full, {aspectRatio}, web({maxHeight: '82vh'})]}
              />
            )}
            {images.length > 1 && (
              <View style={[a.flex_row, a.gap_xs, a.p_sm, a.flex_wrap]}>
                {images.map((img, i) => (
                  <Pressable
                    key={img.thumb}
                    accessibilityRole="button"
                    accessibilityLabel={`Imagem ${i + 1}`}
                    accessibilityHint=""
                    onPress={() => setIndex(i)}
                    style={[
                      a.rounded_sm,
                      a.overflow_hidden,
                      {
                        width: 56,
                        height: 56,
                        borderWidth: 2,
                        borderColor: i === index ? '#2b8cff' : 'transparent',
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
          </Hider.Content>
        </Hider.Outer>
      </View>

      {/* Info column */}
      <View style={[a.flex_1, a.gap_lg, {padding: 32}]}>
        <View style={[a.flex_row, a.align_center, a.gap_sm]}>
          {image && (
            <Link
              to={image.fullsize}
              label="Abrir imagem em tamanho original"
              download="visionboard.jpg"
              size="large"
              shape="round"
              variant="ghost"
              color="secondary"
              style={[t.atoms.bg_contrast_25]}>
              <ButtonIcon icon={DownloadIcon} />
            </Link>
          )}
          <Button
            label="Compartilhar"
            size="large"
            shape="round"
            variant="ghost"
            color="secondary"
            style={[t.atoms.bg_contrast_25]}
            onPress={() => shareUrl(toShareUrl(threadHref))}>
            <ButtonIcon icon={ShareIcon} />
          </Button>
          <View style={a.flex_1} />
          <SaveButton post={post} />
        </View>

        <RichText
          value={richText}
          style={[
            isShort
              ? {fontSize: 28, lineHeight: 34, fontWeight: '800'}
              : [a.text_lg, a.leading_snug],
          ]}
          enableTags
        />

        <PostControls
          post={post}
          record={post.record as any}
          richText={richText}
          logContext="PostThreadItem"
          onPressReply={() =>
            openComposer({
              replyTo: {
                uri: post.uri,
                cid: post.cid,
                text: record.text,
                author: post.author,
              },
            })
          }
        />
        <Link
          to={threadHref}
          label="Ver conversa completa"
          style={[a.self_start]}>
          <Text style={[a.text_md, a.font_semi_bold, {color: '#0b5cff'}]}>
            Ver conversa completa
          </Text>
        </Link>

        <View style={[a.border_t, t.atoms.border_contrast_low]} />
        <Creator author={post.author} />
      </View>
    </View>
  )
}

function Creator({author}: {author: AppBskyFeedDefs.PostView['author']}) {
  const t = useTheme()
  const moderationOpts = useModerationOpts()
  const {data: profile} = useProfileQuery({did: author.did})
  const followers = profile?.followersCount
  return (
    <View style={[a.flex_row, a.align_center, a.gap_md, a.flex_wrap]}>
      <UserAvatar size={52} avatar={author.avatar} type="user" />
      <View style={[a.flex_1, {minWidth: 140}]}>
        <Text style={[a.text_lg, a.font_bold]} numberOfLines={1}>
          {author.displayName || author.handle}
        </Text>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {followers === undefined
            ? `@${author.handle}`
            : `${followers.toLocaleString('pt-BR')} ${
                followers === 1 ? 'seguidor' : 'seguidores'
              }`}
        </Text>
      </View>
      <Link
        to={makeProfileLink(author)}
        label="Ver perfil"
        size="small"
        variant="outline"
        color="secondary"
        style={[a.rounded_full]}>
        <ButtonText>Ver perfil</ButtonText>
      </Link>
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

/** Save = AQUA Saved (bookmarks). */
function SaveButton({post}: {post: Shadow<AppBskyFeedDefs.PostView>}) {
  const {mutateAsync: bookmark, isPending} = useBookmarkMutation()
  const requireAuth = useRequireAuth()
  const saved = !!post.viewer?.bookmarked
  return (
    <Button
      label={saved ? 'Remover dos salvos' : 'Salvar'}
      size="large"
      variant="solid"
      color={saved ? 'secondary' : 'primary'}
      disabled={isPending}
      onPress={() =>
        requireAuth(async () => {
          try {
            if (saved) {
              await bookmark({action: 'delete', uri: post.uri})
              toast.show('Removido dos salvos')
            } else {
              await bookmark({action: 'create', post})
              toast.show('Salvo', {type: 'success'})
            }
          } catch (e) {
            toast.show(cleanError(e), {type: 'error'})
          }
        })
      }
      style={[
        a.rounded_full,
        a.px_xl,
        !saved &&
          web({
            backgroundImage: SAVE_GRADIENT,
            boxShadow: '0 8px 20px rgba(0, 72, 255, 0.3)',
          }),
      ]}>
      <ButtonText style={[a.text_md, a.font_bold]}>
        {saved ? 'Salvo' : 'Salvar'}
      </ButtonText>
    </Button>
  )
}

function MoreToExplore({post}: {post: AppBskyFeedDefs.PostView}) {
  const feed = usePostFeedQuery(`feedgen|${DISCOVER_FEED_URI}`)
  const items = useMemo(
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
  if (!items.length) return <View style={{height: 80}} />
  return (
    <VisionboardMasonry
      variant="board"
      items={items}
      header={
        <Text
          style={[
            {
              fontSize: 26,
              fontWeight: '800',
              paddingTop: 48,
              paddingBottom: 20,
            },
          ]}>
          Mais para explorar
        </Text>
      }
    />
  )
}
