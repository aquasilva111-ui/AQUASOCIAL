import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {View} from 'react-native'
import {type AppBskyActorDefs, type AppBskyFeedDefs, AtUri} from '@atproto/api'
import {useIsFocused, useNavigation} from '@react-navigation/native'
import {useMediaQuery} from 'react-responsive'

import {getPostMedia, getPostTopics} from '#/lib/media/experiences'
import {recordView} from '#/lib/media/views'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {shareUrl} from '#/lib/sharing'
import {makeRecordUri, toShareUrl} from '#/lib/strings/url-helpers'
import {channelPath} from '#/lib/view-channel/model'
import {
  type Chapter,
  formatTime,
  parseChapters,
  parseStartParam,
  splitTitle,
} from '#/lib/view-watch/chapters'
import {
  formatCompactPt,
  formatSubscriberLabel,
  formatViewLabel,
  knownViewCount,
} from '#/lib/views/format'
import {isWeb} from '#/platform/detection'
import {
  POST_TOMBSTONE,
  type Shadow,
  usePostShadow,
} from '#/state/cache/post-shadow'
import {useProfileShadow} from '#/state/cache/profile-shadow'
import {useBookmarkMutation} from '#/state/queries/bookmarks/useBookmarkMutation'
import {usePostLikeMutationQueue, usePostQuery} from '#/state/queries/post'
import {
  useProfileFollowMutationQueue,
  useProfileQuery,
} from '#/state/queries/profile'
import {channelBlobUrl, useViewChannelQuery} from '#/state/queries/view-channel'
import {useSession} from '#/state/session'
import {
  openMiniPlayer,
  peekMiniPlayerTime,
  pickNext,
  removeFromQueue,
  takeOverFromMiniPlayer,
  useViewPlayback,
} from '#/state/view-playback'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {ViewsChrome} from '#/screens/Media/ViewsChrome'
import {SaveMenu, useRecordWatch} from '#/screens/ViewLibrary/SaveMenu'
import {atoms as a, useBreakpoints, useTheme, web} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {ArrowShareRight_Stroke2_Corner2_Rounded as ShareIcon} from '#/components/icons/ArrowShareRight'
import {Bookmark as SaveIcon} from '#/components/icons/Bookmark'
import {DotGrid_Stroke2_Corner0_Rounded as MoreIcon} from '#/components/icons/DotGrid'
import {Heart2_Stroke2_Corner0_Rounded as HeartIcon} from '#/components/icons/Heart2'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import * as Menu from '#/components/Menu'
import {
  ReportDialog,
  useReportDialogControl,
} from '#/components/moderation/ReportDialog'
import {Text} from '#/components/Typography'
import {ViewPlayer} from '#/components/view-watch/ViewPlayer'
import {type ViewPlayerHandle} from '#/components/view-watch/ViewPlayer.types'
import {Comments} from './Comments'
import {toVideoRef, UpNextPanel, useRecommendations} from './UpNext'

export function ViewWatchScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'VideoWatch'>) {
  const {name, rkey, t} = route.params
  const uri = makeRecordUri(name, 'app.bsky.feed.post', rkey)
  useEffect(() => {
    recordView(uri)
  }, [uri])
  return (
    <Layout.Screen testID="viewWatchScreen" hideCenterBorders={isWeb}>
      {isWeb ? (
        <ViewsChrome defaultCollapsed>
          <Watch uri={uri} startAt={parseStartParam(t)} />
        </ViewsChrome>
      ) : (
        <>
          <Layout.Header.Outer>
            <Layout.Header.BackButton />
            <Layout.Header.Content>
              <Layout.Header.TitleText>Aqua Views</Layout.Header.TitleText>
            </Layout.Header.Content>
            <Layout.Header.Slot />
          </Layout.Header.Outer>
          <Layout.Content>
            <Watch uri={uri} startAt={parseStartParam(t)} />
          </Layout.Content>
        </>
      )}
    </Layout.Screen>
  )
}

function watchPath(post: AppBskyFeedDefs.PostView) {
  return `/views/watch/${post.author.did}/${new AtUri(post.uri).rkey}`
}

function Watch({uri, startAt}: {uri: string; startAt?: number}) {
  const t = useTheme()
  const post = usePostQuery(uri)
  if (post.isLoading)
    return (
      <Text style={[a.p_xl, t.atoms.text_contrast_medium]}>Carregando…</Text>
    )
  if (!post.data)
    return (
      <View style={[a.p_xl, a.gap_md, a.align_center]}>
        <Text style={[a.text_xl, a.font_bold]}>Vídeo não encontrado</Text>
        <Link to="/views" label="Voltar para o Aqua Views">
          <Text style={[a.text_md, a.font_bold, t.atoms.text_contrast_high]}>
            Voltar para o Aqua Views
          </Text>
        </Link>
      </View>
    )
  return <WatchLoaded post={post.data} startAt={startAt} />
}

function WatchLoaded({
  post: rawPost,
  startAt,
}: {
  post: AppBskyFeedDefs.PostView
  startAt?: number
}) {
  const t = useTheme()
  const {gtTablet} = useBreakpoints()
  const wide = useMediaQuery({minWidth: 1100})
  const phone = useMediaQuery({maxWidth: 599})
  const post = usePostShadow(rawPost)
  const playerRef = useRef<ViewPlayerHandle>(null)
  useRecordWatch(rawPost)
  const [time, setTime] = useState(startAt ?? 0)
  const [duration, setDuration] = useState<number>()
  const [theater, setTheater] = useState(false)
  const author = rawPost.author
  const channel = useViewChannelQuery(author.did)
  const profile = useProfileQuery({did: author.did})
  const navigation = useNavigation<NavigationProp>()
  const isFocused = useIsFocused()
  const recs = useRecommendations(rawPost)
  const {queue, autoplay} = useViewPlayback()
  const next = useMemo(
    () => pickNext(queue, rawPost.uri, recs.all),
    [queue, rawPost.uri, recs.all],
  )

  // Coming back from the miniplayer: resume where it was, already playing.
  const [resumeAt] = useState(() => peekMiniPlayerTime(rawPost.uri))
  const lastTime = useRef(resumeAt ?? startAt ?? 0)
  const playingRef = useRef(false)

  const media = getPostMedia(rawPost)
  const text = (rawPost.record as {text?: string}).text ?? ''
  const {title, description} = useMemo(() => splitTitle(text), [text])
  const chapters = useMemo(
    () => parseChapters(text, duration),
    [text, duration],
  )
  const watermarkUri = channelBlobUrl(
    channel.data?.pdsUrl,
    author.did,
    channel.data?.channel?.watermark,
  )

  // Hands the video to the miniplayer (web) so it keeps playing elsewhere.
  const toMiniPlayer = useCallback(() => {
    if (!isWeb || media.type !== 'video') return
    openMiniPlayer({
      ...toVideoRef(rawPost),
      playlist: media.view.playlist,
      time: lastTime.current,
      watermarkUri,
    })
  }, [rawPost, media, watermarkUri])
  const toMiniRef = useRef(toMiniPlayer)
  toMiniRef.current = toMiniPlayer

  const firstFocus = useRef(true)
  useEffect(() => {
    if (isFocused) {
      // This page owns playback now; any miniplayer closes.
      const resumeFrom = takeOverFromMiniPlayer(rawPost.uri)
      if (!firstFocus.current && resumeFrom !== undefined) {
        playerRef.current?.seek(resumeFrom)
        playerRef.current?.play()
      }
      firstFocus.current = false
    } else if (playerRef.current?.isPlaying()) {
      // Leaving while it plays: continue in the miniplayer.
      playerRef.current.pause()
      toMiniRef.current()
    }
  }, [isFocused, rawPost.uri])
  useEffect(
    () => () => {
      if (playingRef.current) toMiniRef.current()
    },
    [],
  )

  const playNext = useCallback(() => {
    if (!next) return
    playerRef.current?.pause()
    playingRef.current = false
    if (next.fromQueue) removeFromQueue(next.video.uri)
    navigation.push('VideoWatch', {name: next.video.did, rkey: next.video.rkey})
  }, [next, navigation])

  if (post === POST_TOMBSTONE)
    return (
      <Text style={[a.p_xl, t.atoms.text_contrast_medium]}>
        Este vídeo foi apagado.
      </Text>
    )
  if (media.type !== 'video')
    return (
      <Text style={[a.p_xl, t.atoms.text_contrast_medium]}>
        Esta publicação não tem vídeo.
      </Text>
    )

  const player = (
    <ViewPlayer
      ref={playerRef}
      embed={media.view}
      chapters={chapters}
      startAt={resumeAt ?? startAt}
      autoStart={resumeAt !== undefined}
      watermarkUri={watermarkUri}
      theater={theater}
      onToggleTheater={gtTablet ? () => setTheater(v => !v) : undefined}
      onTimeUpdate={sec => {
        lastTime.current = sec
        setTime(sec)
      }}
      onPlayingChange={playing => {
        playingRef.current = playing
      }}
      onDuration={setDuration}
      upNext={
        next
          ? {title: next.video.title, thumbnail: next.video.thumbnail}
          : undefined
      }
      autoplay={autoplay}
      onPlayNext={next ? playNext : undefined}
      onMiniPlayer={
        isWeb
          ? () => {
              playerRef.current?.pause()
              playingRef.current = false
              toMiniPlayer()
              navigation.navigate('Videos')
            }
          : undefined
      }
    />
  )
  const aside = (
    <UpNextPanel
      currentUri={rawPost.uri}
      next={next}
      recs={recs}
      onPlayNext={playNext}
    />
  )
  const details = (
    <Info
      post={post}
      title={title || 'Vídeo sem título'}
      description={description}
      chapters={chapters}
      time={time}
      onSeek={sec => playerRef.current?.seek(sec)}
      channelName={channel.data?.channel?.displayNameOverride}
      profile={profile.data}
      subscribersKnown={profile.isSuccess}
    />
  )
  const comments = (
    <Comments
      video={post}
      creatorName={
        channel.data?.channel?.displayNameOverride ||
        post.author.displayName ||
        post.author.handle
      }
    />
  )
  const column = (
    <View style={[a.flex_1, a.gap_md, {minWidth: 0}]}>
      <View style={phone ? undefined : [a.px_lg, a.pt_md]}>{player}</View>
      <View style={[a.px_md, a.gap_md, phone && a.px_md]}>
        {details}
        {!wide && aside}
        {comments}
      </View>
    </View>
  )

  if (!wide) return <View style={[a.gap_lg, a.pb_2xl]}>{column}</View>
  return (
    <View style={[a.gap_xl, a.pb_2xl]}>
      {theater && (
        <View style={[a.px_lg, {maxHeight: 'calc(100vh - 180px)' as any}]}>
          {player}
        </View>
      )}
      <View
        style={[
          a.flex_row,
          a.gap_xl,
          a.px_lg,
          a.align_start,
          a.pt_md,
          web({maxWidth: 1720, marginInline: 'auto', width: '100%'}),
        ]}>
        <View style={[a.flex_1, a.gap_md, {minWidth: 0}]}>
          {!theater && player}
          {details}
          {comments}
        </View>
        <View style={{width: 400, minWidth: 0}}>{aside}</View>
      </View>
    </View>
  )
}

function Info({
  post,
  title,
  description,
  chapters,
  time,
  onSeek,
  channelName,
  profile,
  subscribersKnown,
}: {
  post: Shadow<AppBskyFeedDefs.PostView>
  title: string
  description: string
  chapters: Chapter[]
  time: number
  onSeek: (sec: number) => void
  channelName?: string
  profile?: AppBskyActorDefs.ProfileViewDetailed
  subscribersKnown: boolean
}) {
  const t = useTheme()
  const {currentAccount} = useSession()
  const [open, setOpen] = useState(false)
  const topics = getPostTopics(post)
  const date = new Date(post.indexedAt).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const views = formatViewLabel(knownViewCount(post))
  const summary = [views, date, ...topics.map(topic => `#${topic}`)]
    .filter(Boolean)
    .join(' · ')
  return (
    <View style={[a.gap_md]}>
      <Text style={[a.text_xl, a.font_bold, a.leading_snug]}>{title}</Text>

      <View
        style={[
          a.flex_row,
          a.align_center,
          a.gap_md,
          web({flexWrap: 'wrap', rowGap: 12}),
        ]}>
        <ChannelRow
          author={post.author}
          profile={profile}
          channelName={channelName}
          subscribersKnown={subscribersKnown}
          isSelf={currentAccount?.did === post.author.did}
        />
        <Actions post={post} time={time} />
      </View>

      <Button
        label={open ? 'Mostrar menos' : 'Mostrar mais da descrição'}
        onPress={() => setOpen(value => !value)}
        accessibilityState={{expanded: open}}>
        {({hovered}) => (
          <View
            style={[
              a.p_md,
              a.rounded_md,
              a.gap_xs,
              a.w_full,
              t.atoms.bg_contrast_25,
              hovered && t.atoms.bg_contrast_50,
            ]}>
            {!!summary && (
              <Text style={[a.text_sm, a.font_bold]}>{summary}</Text>
            )}
            {!!description && (
              <Text
                numberOfLines={open ? undefined : 2}
                style={[a.text_md, a.leading_snug]}>
                {description}
              </Text>
            )}
            <Text style={[a.text_sm, a.font_bold]}>
              {open ? 'Mostrar menos' : '…mais'}
            </Text>
          </View>
        )}
      </Button>
      {open && chapters.length > 0 && (
        <View style={[a.gap_sm]}>
          <Text style={[a.text_md, a.font_bold]}>Capítulos</Text>
          <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
            {chapters.map((c, i) => {
              const active =
                time >= c.startSec &&
                (i === chapters.length - 1 || time < chapters[i + 1].startSec)
              return (
                <Button
                  key={c.startSec}
                  label={`Ir para ${formatTime(c.startSec)}: ${c.title}`}
                  size="small"
                  variant="solid"
                  color={active ? 'primary' : 'secondary'}
                  disabled={!isWeb}
                  onPress={() => onSeek(c.startSec)}>
                  <ButtonText>
                    {formatTime(c.startSec)} · {c.title}
                  </ButtonText>
                </Button>
              )
            })}
          </View>
        </View>
      )}
    </View>
  )
}

function ChannelRow({
  author,
  profile,
  channelName,
  subscribersKnown,
  isSelf,
}: {
  author: AppBskyFeedDefs.PostView['author']
  profile?: AppBskyActorDefs.ProfileViewDetailed
  channelName?: string
  subscribersKnown: boolean
  isSelf: boolean
}) {
  const t = useTheme()
  const {hasSession} = useSession()
  const shadow = useProfileShadow(profile ?? author)
  const [queueFollow, queueUnfollow] = useProfileFollowMutationQueue(
    shadow,
    'ProfileHeader',
  )
  const subscribed = !!shadow.viewer?.following
  const subscribers = subscribersKnown
    ? formatSubscriberLabel(profile?.followersCount)
    : undefined
  return (
    <View
      style={[a.flex_row, a.align_center, a.gap_md, a.flex_1, {minWidth: 0}]}>
      <Link
        to={channelPath(author.handle)}
        label={`Canal de ${channelName || author.displayName || author.handle}`}
        style={[a.flex_row, a.align_center, a.gap_sm, a.flex_1, {minWidth: 0}]}>
        <UserAvatar type="user" size={40} avatar={author.avatar} />
        <View style={{minWidth: 0}}>
          <Text numberOfLines={1} style={[a.text_md, a.font_bold]}>
            {channelName || author.displayName || author.handle}
          </Text>
          {!!subscribers && (
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              {subscribers}
            </Text>
          )}
        </View>
      </Link>
      {hasSession && !isSelf && (
        <Button
          label={subscribed ? 'Inscrito' : 'Inscrever-se'}
          size="small"
          variant="solid"
          color={subscribed ? 'secondary' : 'primary'}
          shape="round"
          onPress={() => (subscribed ? queueUnfollow() : queueFollow())}
          style={{height: 36}}>
          <ButtonText>{subscribed ? 'Inscrito' : 'Inscrever-se'}</ButtonText>
        </Button>
      )}
    </View>
  )
}

function Actions({
  post,
  time,
}: {
  post: Shadow<AppBskyFeedDefs.PostView>
  time: number
}) {
  const t = useTheme()
  const {hasSession} = useSession()
  const [queueLike, queueUnlike] = usePostLikeMutationQueue(
    post,
    undefined,
    undefined,
    'Post',
  )
  const bookmark = useBookmarkMutation()
  const reportControl = useReportDialogControl()
  const saveDialog = Dialog.useDialogControl()
  const [disliked, setDisliked] = useState(false)
  const liked = !!post.viewer?.like
  const saved = !!post.viewer?.bookmarked
  const at = Math.floor(time)
  const likeLabel =
    typeof post.likeCount === 'number' && post.likeCount > 0
      ? formatCompactPt(post.likeCount)
      : undefined
  const pill = [
    a.flex_row,
    a.align_center,
    a.justify_center,
    a.gap_xs,
    a.rounded_full,
    a.px_md,
    t.atoms.bg_contrast_25,
    {height: 36},
  ]
  return (
    <View
      style={[
        a.flex_row,
        a.align_center,
        a.gap_sm,
        web({flexShrink: 0, maxWidth: '100%'}),
      ]}>
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.rounded_full,
          a.overflow_hidden,
          t.atoms.bg_contrast_25,
          {height: 36},
        ]}>
        <Button
          label={liked ? 'Descurtir' : 'Gostei'}
          size="small"
          variant="ghost"
          color={liked ? 'primary' : 'secondary'}
          onPress={() => {
            setDisliked(false)
            if (hasSession) liked ? queueUnlike() : queueLike()
          }}
          style={[{height: 36, borderRadius: 0}]}>
          <ButtonIcon icon={HeartIcon} />
          {!!likeLabel && <ButtonText>{likeLabel}</ButtonText>}
        </Button>
        <View
          style={[{width: 1, alignSelf: 'stretch'}, t.atoms.bg_contrast_100]}
        />
        <Button
          label={disliked ? 'Remover não gostei' : 'Não gostei'}
          size="small"
          variant="ghost"
          color={disliked ? 'primary' : 'secondary'}
          onPress={() => {
            setDisliked(value => !value)
            if (liked && hasSession) queueUnlike()
          }}
          style={[{height: 36, width: 44, borderRadius: 0}]}>
          <View style={{transform: [{rotate: '180deg'}]}}>
            <ButtonIcon icon={HeartIcon} />
          </View>
        </Button>
      </View>
      <Button
        label={
          at > 0 ? `Compartilhar a partir de ${formatTime(at)}` : 'Compartilhar'
        }
        size="small"
        variant="ghost"
        color="secondary"
        onPress={() =>
          shareUrl(toShareUrl(`${watchPath(post)}${at > 0 ? `?t=${at}` : ''}`))
        }
        style={pill}>
        <ButtonIcon icon={ShareIcon} />
        <ButtonText>Compartilhar</ButtonText>
      </Button>
      {hasSession && (
        <Button
          label={saved ? 'Remover dos salvos' : 'Salvar'}
          size="small"
          variant="ghost"
          color="secondary"
          onPress={() =>
            bookmark.mutate(
              saved
                ? {action: 'delete', uri: post.uri}
                : {action: 'create', post},
            )
          }
          style={pill}>
          <ButtonIcon icon={SaveIcon} />
          <ButtonText>{saved ? 'Salvo' : 'Salvar'}</ButtonText>
        </Button>
      )}
      {hasSession && (
        <>
          <Menu.Root>
            <Menu.Trigger label="Mais ações">
              {({props}) => (
                <Button
                  label="Mais ações"
                  size="small"
                  variant="ghost"
                  color="secondary"
                  shape="round"
                  style={[{height: 36, width: 36}]}
                  {...props}>
                  <ButtonIcon icon={MoreIcon} />
                </Button>
              )}
            </Menu.Trigger>
            <Menu.Outer>
              <Menu.Group>
                <Menu.Item label="Salvar em…" onPress={() => saveDialog.open()}>
                  <Menu.ItemText>Salvar em…</Menu.ItemText>
                </Menu.Item>
                <Menu.Item
                  label="Denunciar vídeo"
                  onPress={() => reportControl.open()}>
                  <Menu.ItemText>Denunciar</Menu.ItemText>
                </Menu.Item>
              </Menu.Group>
            </Menu.Outer>
          </Menu.Root>
          <SaveMenu post={post} control={saveDialog} />
        </>
      )}
      <ReportDialog
        control={reportControl}
        subject={{...post, $type: 'app.bsky.feed.defs#postView'}}
      />
    </View>
  )
}
