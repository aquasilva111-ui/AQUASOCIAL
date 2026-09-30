import {useMemo, useState} from 'react'
import {TextInput, View} from 'react-native'
import {
  type AppBskyFeedDefs,
  type AppBskyFeedPost,
  RichText as RichTextAPI,
} from '@atproto/api'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {useRequireEmailVerification} from '#/lib/hooks/useRequireEmailVerification'
import {useGetTimeAgo} from '#/lib/hooks/useTimeAgo'
import {makeProfileLink} from '#/lib/routes/links'
import {
  COMMENT_MAX_GRAPHEMES,
  type CommentSort,
  QUICK_EMOJI,
  sortComments,
} from '#/lib/view-watch/comments'
import {POST_TOMBSTONE, usePostShadow} from '#/state/cache/post-shadow'
import {usePostLikeMutationQueue} from '#/state/queries/post'
import {useProfileQuery} from '#/state/queries/profile'
import {
  usePinCommentMutation,
  usePinnedCommentQuery,
  usePostCommentMutation,
  useVideoCommentsQuery,
  type VideoComment,
} from '#/state/queries/view-comments'
import {useSession} from '#/state/session'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {
  ReportDialog,
  useReportDialogControl,
} from '#/components/moderation/ReportDialog'
import {RichText} from '#/components/RichText'
import {Text} from '#/components/Typography'

const PAGE = 20

/**
 * Comments on a View video: the post's direct replies, with the creator's
 * pinned comment on top. Posting here creates a normal reply.
 */
export function Comments({
  video,
  creatorName,
}: {
  video: AppBskyFeedDefs.PostView
  creatorName: string
}) {
  const t = useTheme()
  const {currentAccount} = useSession()
  const [sort, setSort] = useState<CommentSort>('top')
  const [shown, setShown] = useState(PAGE)
  const comments = useVideoCommentsQuery(video.uri)
  const pinned = usePinnedCommentQuery(video, comments.data)
  const isCreator = currentAccount?.did === video.author.did
  const pinnedUri = pinned.data?.post.uri

  const list = useMemo(() => {
    const all = [...(comments.data ?? [])]
    // A valid pin outside the loaded page still shows first.
    if (pinned.data && !all.some(c => c.post.uri === pinnedUri))
      all.push(pinned.data)
    return sortComments(
      all.map(c => ({
        c,
        uri: c.post.uri,
        indexedAt: c.post.indexedAt,
        likeCount: c.post.likeCount,
        replyCount: c.post.replyCount,
      })),
      sort,
      pinnedUri,
    ).map(x => x.c)
  }, [comments.data, pinned.data, pinnedUri, sort])

  return (
    <View style={[a.gap_lg]}>
      <View style={[a.flex_row, a.align_center, a.gap_md, a.flex_wrap]}>
        <Text style={[a.text_lg, a.font_bold]}>
          {video.replyCount ?? 0} comentários
        </Text>
        <View style={[a.flex_row, a.gap_xs]} accessibilityRole="tablist">
          {(
            [
              ['top', 'Principais'],
              ['recent', 'Mais recentes'],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              label={`Ordenar por ${label.toLowerCase()}`}
              size="tiny"
              variant="solid"
              color={sort === key ? 'primary' : 'secondary'}
              accessibilityRole="tab"
              accessibilityState={{selected: sort === key}}
              onPress={() => setSort(key)}>
              <ButtonText>{label}</ButtonText>
            </Button>
          ))}
        </View>
      </View>

      {currentAccount &&
        (video.viewer?.replyDisabled ? (
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            Quem publicou restringiu quem pode comentar neste vídeo.
          </Text>
        ) : (
          <CommentBox video={video} />
        ))}

      {comments.isLoading && (
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          Carregando comentários…
        </Text>
      )}
      {comments.isError && (
        <Button
          label="Tentar carregar os comentários de novo"
          size="small"
          color="secondary"
          onPress={() => comments.refetch()}>
          <ButtonText>Tentar de novo</ButtonText>
        </Button>
      )}
      {!comments.isLoading && !comments.isError && !list.length && (
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          Seja a primeira pessoa a comentar.
        </Text>
      )}

      {list.slice(0, shown).map(c => (
        <CommentItem
          key={c.post.uri}
          comment={c}
          video={video}
          pinned={c.post.uri === pinnedUri}
          creatorName={creatorName}
          canPin={isCreator}
        />
      ))}
      {list.length > shown && (
        <View style={[a.align_start]}>
          <Button
            label="Mostrar mais comentários"
            size="small"
            color="secondary"
            onPress={() => setShown(n => n + PAGE)}>
            <ButtonText>Mostrar mais</ButtonText>
          </Button>
        </View>
      )}
    </View>
  )
}

function CommentBox({video}: {video: AppBskyFeedDefs.PostView}) {
  const t = useTheme()
  const {currentAccount} = useSession()
  const me = useProfileQuery({did: currentAccount?.did})
  const [text, setText] = useState('')
  const [error, setError] = useState<string>()
  const post = usePostCommentMutation(video)
  const {openComposer} = useOpenComposer()
  const requireEmailVerification = useRequireEmailVerification()
  const graphemes = useMemo(
    () => new RichTextAPI({text}).graphemeLength,
    [text],
  )
  const tooLong = graphemes > COMMENT_MAX_GRAPHEMES

  const replyTo = {
    uri: video.uri,
    cid: video.cid,
    text: (video.record as AppBskyFeedPost.Record).text ?? '',
    author: video.author,
    embed: video.embed,
  }
  const submit = requireEmailVerification(
    async () => {
      setError(undefined)
      try {
        await post.mutateAsync(text)
        setText('')
      } catch {
        setError('Não foi possível publicar o comentário. Tente de novo.')
      }
    },
    {
      instructions: [
        <Text key="verify">
          Para comentar, confirme primeiro o seu e-mail.
        </Text>,
      ],
    },
  )

  return (
    <View style={[a.flex_row, a.gap_md, a.align_start]}>
      <UserAvatar type="user" size={38} avatar={me.data?.avatar} />
      <View style={[a.flex_1, a.gap_sm]}>
        <TextInput
          value={text}
          onChangeText={v => {
            setText(v)
            setError(undefined)
          }}
          placeholder="Adicione um comentário"
          placeholderTextColor={t.atoms.text_contrast_low.color}
          multiline
          accessibilityLabel="Adicionar comentário"
          accessibilityHint="Escreva e toque em Comentar"
          style={[
            a.border,
            a.rounded_md,
            a.px_md,
            a.py_sm,
            a.text_md,
            t.atoms.text,
            t.atoms.border_contrast_low,
            {minHeight: 44},
          ]}
        />
        <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_xs]}>
          {QUICK_EMOJI.map(e => (
            <Button
              key={e}
              label={`Inserir ${e}`}
              size="tiny"
              variant="ghost"
              color="secondary"
              onPress={() => setText(v => `${v}${e}`)}>
              <ButtonText>{e}</ButtonText>
            </Button>
          ))}
          <Button
            label="Abrir o editor completo com GIFs, imagens e todos os emojis"
            size="tiny"
            color="secondary"
            onPress={() => openComposer({replyTo, text})}>
            <ButtonText>GIF e mais</ButtonText>
          </Button>
          <View style={[a.flex_1]} />
          <Text
            style={[
              a.text_xs,
              tooLong ? {color: '#D92D20'} : t.atoms.text_contrast_medium,
            ]}>
            {graphemes}/{COMMENT_MAX_GRAPHEMES}
          </Text>
          <Button
            label="Publicar comentário"
            size="small"
            color="primary"
            disabled={!text.trim() || tooLong || post.isPending}
            onPress={submit}>
            <ButtonText>
              {post.isPending ? 'Publicando…' : 'Comentar'}
            </ButtonText>
          </Button>
        </View>
        {error && <Text style={[a.text_sm, {color: '#D92D20'}]}>{error}</Text>}
      </View>
    </View>
  )
}

function CommentItem({
  comment,
  video,
  pinned,
  creatorName,
  canPin,
}: {
  comment: VideoComment
  video: AppBskyFeedDefs.PostView
  pinned: boolean
  creatorName: string
  canPin: boolean
}) {
  const t = useTheme()
  const {hasSession} = useSession()
  const shadow = usePostShadow(comment.post)
  const getTimeAgo = useGetTimeAgo()
  const {openComposer} = useOpenComposer()
  const pin = usePinCommentMutation(video)
  const reportControl = useReportDialogControl()
  const [revealed, setRevealed] = useState(false)
  if (shadow === POST_TOMBSTONE) return null
  const record = shadow.record as AppBskyFeedPost.Record
  const author = shadow.author
  const blurred = comment.moderation.ui('contentView').blur && !revealed
  const isTopLevel = record.reply?.parent?.uri === video.uri

  return (
    <View
      style={[
        a.flex_row,
        a.gap_md,
        pinned && [a.p_md, a.rounded_md, a.border, t.atoms.border_contrast_low],
      ]}>
      <Link to={makeProfileLink(author)} label={`Perfil de ${author.handle}`}>
        <UserAvatar type="user" size={38} avatar={author.avatar} />
      </Link>
      <View style={[a.flex_1, a.gap_xs]}>
        {pinned && (
          <Text style={[a.text_xs, a.font_bold, t.atoms.text_contrast_medium]}>
            Fixado por {creatorName}
          </Text>
        )}
        <Text style={[a.text_sm]}>
          <Text style={[a.text_sm, a.font_bold]}>
            {author.displayName || author.handle}
          </Text>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {' '}
            · {getTimeAgo(shadow.indexedAt, new Date())}
          </Text>
        </Text>
        {blurred ? (
          <View style={[a.flex_row, a.align_center, a.gap_sm]}>
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              Comentário oculto pela moderação.
            </Text>
            <Button
              label="Mostrar comentário"
              size="tiny"
              variant="ghost"
              color="secondary"
              onPress={() => setRevealed(true)}>
              <ButtonText>Mostrar</ButtonText>
            </Button>
          </View>
        ) : (
          <RichText
            value={new RichTextAPI({text: record.text, facets: record.facets})}
            style={[a.text_md, a.leading_snug]}
            authorHandle={author.handle}
            enableTags
          />
        )}
        {!!shadow.embed && !blurred && (
          <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
            Este comentário tem mídia — veja na conversa do post.
          </Text>
        )}
        {hasSession && (
          <View style={[a.flex_row, a.flex_wrap, a.gap_xs]}>
            <LikeButton post={shadow} />
            <Button
              label={`Responder a ${author.handle}`}
              size="tiny"
              variant="ghost"
              color="secondary"
              onPress={() =>
                openComposer({
                  replyTo: {
                    uri: shadow.uri,
                    cid: shadow.cid,
                    text: record.text,
                    author,
                    embed: shadow.embed,
                  },
                })
              }>
              <ButtonText>
                Responder
                {shadow.replyCount ? ` · ${shadow.replyCount}` : ''}
              </ButtonText>
            </Button>
            {canPin && isTopLevel && (
              <Button
                label={pinned ? 'Desafixar comentário' : 'Fixar comentário'}
                size="tiny"
                variant="ghost"
                color="secondary"
                disabled={pin.isPending}
                onPress={() =>
                  pin.mutate(pinned ? null : {uri: shadow.uri, cid: shadow.cid})
                }>
                <ButtonText>{pinned ? 'Desafixar' : 'Fixar'}</ButtonText>
              </Button>
            )}
            <Button
              label="Denunciar comentário"
              size="tiny"
              variant="ghost"
              color="secondary"
              onPress={() => reportControl.open()}>
              <ButtonText>Denunciar</ButtonText>
            </Button>
            <ReportDialog
              control={reportControl}
              subject={{...shadow, $type: 'app.bsky.feed.defs#postView'}}
            />
          </View>
        )}
      </View>
    </View>
  )
}

function LikeButton({
  post,
}: {
  post: Parameters<typeof usePostLikeMutationQueue>[0]
}) {
  const [like, unlike] = usePostLikeMutationQueue(
    post,
    undefined,
    undefined,
    'PostThreadItem',
  )
  const liked = !!post.viewer?.like
  return (
    <Button
      label={liked ? 'Descurtir comentário' : 'Curtir comentário'}
      size="tiny"
      variant={liked ? 'solid' : 'ghost'}
      color={liked ? 'primary' : 'secondary'}
      onPress={() => (liked ? unlike() : like())}>
      <ButtonText>
        {liked ? 'Curtido' : 'Curtir'}
        {post.likeCount ? ` · ${post.likeCount}` : ''}
      </ButtonText>
    </Button>
  )
}
