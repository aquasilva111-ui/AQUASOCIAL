import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {TextInput, View} from 'react-native'
import {type AppBskyActorDefs, type AppBskyFeedDefs, AtUri} from '@atproto/api'
import {useIsFocused, useNavigation} from '@react-navigation/native'

import {getPostMedia, getPostTopics} from '#/lib/media/experiences'
import {recordView} from '#/lib/media/views'
import {makeProfileLink} from '#/lib/routes/links'
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
import {atoms as a, useBreakpoints, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import {
  ReportDialog,
  useReportDialogControl,
} from '#/components/moderation/ReportDialog'
import {Text} from '#/components/Typography'
import {ViewPlayer} from '#/components/view-watch/ViewPlayer'
import {type ViewPlayerHandle} from '#/components/view-watch/ViewPlayer.types'
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
        <WebTopBar />
      ) : (
        <Layout.Header.Outer>
          <Layout.Header.BackButton />
          <Layout.Header.Content>
            <Layout.Header.TitleText>Aqua Views</Layout.Header.TitleText>
          </Layout.Header.Content>
          <Layout.Header.Slot />
        </Layout.Header.Outer>
      )}
      <Layout.Content>
        <Watch uri={uri} startAt={parseStartParam(t)} />
      </Layout.Content>
    </Layout.Screen>
  )
}

function WebTopBar() {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const [q, setQ] = useState('')
  const search = () => {
    const query = q.trim()
    if (query) navigation.navigate('Videos', {source: 'search', q: query})
  }
  return (
    <View
      style={[
        a.flex_row,
        a.align_center,
        a.gap_md,
        a.px_lg,
        a.border_b,
        t.atoms.border_contrast_low,
        t.atoms.bg,
        {height: 64},
      ]}>
      <Link to="/videos" label="Aqua Views">
        <Text style={[a.text_lg, a.font_bold]}>Aqua Views</Text>
      </Link>
      <View style={[a.flex_1, a.align_center]}>
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={search}
          returnKeyType="search"
          placeholder="Pesquisar vídeos"
          placeholderTextColor={t.atoms.text_contrast_low.color}
          accessibilityLabel="Pesquisar vídeos"
          accessibilityHint="Busca vídeos no Aqua Views"
          style={[
            a.rounded_full,
            a.px_lg,
            a.text_md,
            a.border,
            t.atoms.text,
            t.atoms.bg_contrast_25,
            t.atoms.border_contrast_low,
            {height: 42, width: '100%', maxWidth: 560},
          ]}
        />
      </View>
    </View>
  )
}

function watchPath(post: AppBskyFeedDefs.PostView) {
  return `/videos/watch/${post.author.did}/${new AtUri(post.uri).rkey}`
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
        <Link to="/videos" label="Voltar para o Aqua Views">
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
  const post = usePostShadow(rawPost)
  const playerRef = useRef<ViewPlayerHandle>(null)
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
  const info = (
    <Info
      post={post}
      title={title || 'Vídeo sem título'}
      description={description}
      chapters={chapters}
      time={time}
      onSeek={sec => playerRef.current?.seek(sec)}
      channelName={channel.data?.channel?.displayNameOverride}
      profile={profile.data}
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

  if (!gtTablet)
    return (
      <View style={[a.gap_lg, a.pb_2xl]}>
        {player}
        <View style={[a.px_md, a.gap_lg]}>
          {info}
          {aside}
        </View>
      </View>
    )
  return (
    <View style={[a.gap_xl, a.pb_2xl, a.pt_lg]}>
      {theater && <View style={[{maxHeight: '80vh' as any}]}>{player}</View>}
      <View
        style={[
          a.flex_row,
          a.gap_xl,
          a.px_xl,
          a.align_start,
          web({maxWidth: 1600, marginInline: 'auto', width: '100%'}),
        ]}>
        <View style={[a.flex_1, a.gap_lg, {minWidth: 0}]}>
          {!theater && player}
          {info}
        </View>
        <View style={{width: 400}}>{aside}</View>
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
}: {
  post: Shadow<AppBskyFeedDefs.PostView>
  title: string
  description: string
  chapters: Chapter[]
  time: number
  onSeek: (sec: number) => void
  channelName?: string
  profile?: AppBskyActorDefs.ProfileViewDetailed
}) {
  const t = useTheme()
  const {currentAccount} = useSession()
  const topics = getPostTopics(post)
  const date = new Date(post.indexedAt).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const threadPath = `${makeProfileLink(post.author)}/post/${new AtUri(post.uri).rkey}`
  return (
    <View style={[a.gap_lg]}>
      <Text style={[a.text_2xl, a.font_bold, a.leading_snug]}>{title}</Text>

      <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_md]}>
        <ChannelRow
          author={post.author}
          profile={profile}
          channelName={channelName}
          isSelf={currentAccount?.did === post.author.did}
        />
        <View style={[a.flex_1]} />
        <Actions post={post} time={time} />
      </View>

      <View
        style={[
          a.p_lg,
          a.rounded_lg,
          a.gap_md,
          a.border,
          t.atoms.border_contrast_low,
          t.atoms.bg_contrast_25,
        ]}>
        <View style={[a.flex_row, a.flex_wrap, a.gap_sm, a.align_center]}>
          <Text style={[a.text_sm, a.font_bold]}>
            {post.likeCount ?? 0} curtidas · {date}
          </Text>
          {topics.map(topic => (
            <Link
              key={topic}
              to={`/videos?source=search&q=${encodeURIComponent(`#${topic}`)}`}
              label={`Vídeos com #${topic}`}>
              <Text style={[a.text_sm, a.font_bold, {color: '#002CF0'}]}>
                #{topic}
              </Text>
            </Link>
          ))}
        </View>
        {!!description && (
          <Text style={[a.text_md, a.leading_relaxed]}>{description}</Text>
        )}
        {chapters.length > 0 && (
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

      <Link
        to={threadPath}
        label={`Ver ${post.replyCount ?? 0} comentários`}
        style={[a.p_lg, a.rounded_lg, a.border, t.atoms.border_contrast_low]}>
        <Text style={[a.text_md, a.font_bold]}>
          Comentários · {post.replyCount ?? 0}
        </Text>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          Ver e responder na conversa do post
        </Text>
      </Link>
    </View>
  )
}

function ChannelRow({
  author,
  profile,
  channelName,
  isSelf,
}: {
  author: AppBskyFeedDefs.PostView['author']
  profile?: AppBskyActorDefs.ProfileViewDetailed
  channelName?: string
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
  return (
    <View style={[a.flex_row, a.align_center, a.gap_md]}>
      <Link
        to={channelPath(author.handle)}
        label={`Canal de ${channelName || author.displayName || author.handle}`}
        style={[a.flex_row, a.align_center, a.gap_sm]}>
        <UserAvatar type="user" size={44} avatar={author.avatar} />
        <View>
          <Text style={[a.text_md, a.font_bold]}>
            {channelName || author.displayName || author.handle}
          </Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {profile?.followersCount ?? 0} inscritos
          </Text>
        </View>
      </Link>
      {hasSession && !isSelf && (
        <Button
          label={subscribed ? 'Inscrito' : 'Inscrever-se'}
          size="small"
          variant="solid"
          color={subscribed ? 'secondary' : 'primary'}
          onPress={() => (subscribed ? queueUnfollow() : queueFollow())}>
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
  const {hasSession} = useSession()
  const [queueLike, queueUnlike] = usePostLikeMutationQueue(
    post,
    undefined,
    undefined,
    'Post',
  )
  const bookmark = useBookmarkMutation()
  const reportControl = useReportDialogControl()
  const liked = !!post.viewer?.like
  const saved = !!post.viewer?.bookmarked
  const at = Math.floor(time)
  return (
    <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
      {hasSession && (
        <Button
          label={liked ? 'Descurtir' : 'Curtir'}
          size="small"
          variant="solid"
          color={liked ? 'primary' : 'secondary'}
          onPress={() => (liked ? queueUnlike() : queueLike())}>
          <ButtonText>
            {liked ? 'Curtido' : 'Curtir'} · {post.likeCount ?? 0}
          </ButtonText>
        </Button>
      )}
      <Button
        label={
          at > 0 ? `Compartilhar a partir de ${formatTime(at)}` : 'Compartilhar'
        }
        size="small"
        color="secondary"
        onPress={() =>
          shareUrl(toShareUrl(`${watchPath(post)}${at > 0 ? `?t=${at}` : ''}`))
        }>
        <ButtonText>
          {at > 0 ? `Compartilhar em ${formatTime(at)}` : 'Compartilhar'}
        </ButtonText>
      </Button>
      {hasSession && (
        <Button
          label={saved ? 'Remover dos salvos' : 'Salvar'}
          size="small"
          color="secondary"
          onPress={() =>
            bookmark.mutate(
              saved
                ? {action: 'delete', uri: post.uri}
                : {action: 'create', post},
            )
          }>
          <ButtonText>{saved ? 'Salvo' : 'Salvar'}</ButtonText>
        </Button>
      )}
      {hasSession && (
        <>
          <Button
            label="Denunciar vídeo"
            size="small"
            variant="ghost"
            color="secondary"
            onPress={() => reportControl.open()}>
            <ButtonText>Denunciar</ButtonText>
          </Button>
          <ReportDialog
            control={reportControl}
            subject={{...post, $type: 'app.bsky.feed.defs#postView'}}
          />
        </>
      )}
    </View>
  )
}
