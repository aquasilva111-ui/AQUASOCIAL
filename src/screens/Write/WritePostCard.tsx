import {Pressable, View} from 'react-native'
import {LinearGradient} from 'expo-linear-gradient'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useNavigation} from '@react-navigation/native'

import {genreLabel} from '#/lib/books/model'
import {type NavigationProp} from '#/lib/routes/types'
import {shareUrl} from '#/lib/sharing'
import {AUTHORS} from '#/lib/write/seed'
import {writeRepository} from '#/lib/write/store'
import {type BookPost, type WritePost} from '#/lib/write/types'
import {atoms as a, useTheme, web} from '#/alf'
import {
  AquaMediaChrome,
  AquaPlainActionRow,
  AquaTextActionBar,
  LikeCapsule,
  SparkleButton,
  WhySheet,
} from '#/components/AquaPostCard'
import {AQUA, AQUA_RADIUS} from '#/components/AquaPostCard/palette'
import {
  type PostLikerPreview,
  useWhySeeingThis,
} from '#/components/AquaPostCard/plugins'
import * as Dialog from '#/components/Dialog'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {Avatar, bookSubtitle, formatAge, ProgressBar, TypeBadge} from './ui'

/**
 * Write feed card. Media posts use the frameless Aqua card (cover edge to
 * edge, author over the photo, white notch). Opinions use the text-only bar.
 * Ranking, royalties, and the local repository stay outside this view.
 */
export function WritePostCard({
  post,
  liked,
  reposted,
  saved,
  inLibrary,
}: {
  post: WritePost
  liked: boolean
  reposted: boolean
  saved: boolean
  inLibrary: boolean
}) {
  const t = useTheme()
  const {_} = useLingui()
  const navigation = useNavigation<NavigationProp>()
  const whyControl = Dialog.useDialogControl()
  const why = useWhySeeingThis(post.id)
  const light = t.name === 'light'
  const cardBg = light ? AQUA.white : (t.atoms.bg.backgroundColor ?? AQUA.white)
  const ink = light ? AQUA.ink : t.atoms.text.color
  const muted = light ? AQUA.muted : t.atoms.text_contrast_medium.color
  const borderColor = light
    ? AQUA.line
    : t.atoms.border_contrast_low.borderColor
  const media = post.type !== 'opinion'
  const readId = post.type === 'book' ? post.chapter.id : post.id

  const actions = (
    <AquaPlainActionRow
      postUri={post.id}
      liked={liked}
      reposted={reposted}
      saved={saved}
      likeLabel={liked ? _(msg`Unlike`) : _(msg`Like`)}
      replyLabel={_(msg`Reply`)}
      sendLabel={_(msg`Share`)}
      onLike={() => writeRepository.toggleLike(post.id)}
      onReply={() => navigation.navigate('WriteRead', {id: readId})}
      onSend={() => {
        const path = `/books/read/${readId}`
        const url =
          typeof window !== 'undefined'
            ? `${window.location.origin}${path}`
            : path
        shareUrl(url).catch(() => {
          // Clipboard can be blocked. The card still works without a toast.
        })
      }}
      onRepost={() => writeRepository.toggleRepost(post.id)}
      onSave={() => writeRepository.toggleSave(post.id)}
    />
  )
  const sparkle = <SparkleButton onPress={whyControl.open} />
  const capsule = (
    <LikeCapsule
      postUri={post.id}
      likeCount={post.engagement.likes}
      likers={post.engagement.likes > 0 ? sampleLikers(post) : []}
    />
  )

  return (
    <View
      testID={`writePost-${post.id}`}
      style={[
        {
          backgroundColor: cardBg,
          borderRadius: AQUA_RADIUS.card,
          borderWidth: media ? 0 : 1,
          borderColor,
          padding: media ? 0 : 14,
          overflow: 'hidden',
        },
        web({boxShadow: '0 10px 30px rgba(15,23,42,0.06)'}),
      ]}>
      {media ? (
        <View style={{position: 'relative'}}>
          <Link
            to={`/books/read/${readId}`}
            label={openLabel(post)}
            style={{
              width: '100%',
              paddingVertical: 0,
              paddingHorizontal: 0,
              borderRadius: 0,
            }}
            hoverStyle={{backgroundColor: 'transparent'}}
            onPress={() => {
              if (post.type === 'book') {
                writeRepository.recordEvent({
                  kind: 'continue_reading',
                  postId: post.id,
                  authorId: post.author.id,
                  bookId: post.book.id,
                })
              }
            }}>
            <Cover post={post} />
          </Link>
          <AquaMediaChrome
            placement="card"
            notchColor={cardBg}
            actions={actions}
            capsule={capsule}
            sparkle={sparkle}
            header={<AuthorRow post={post} overlay />}
          />
        </View>
      ) : (
        <AuthorRow post={post} overlay={false} />
      )}
      <View
        style={
          media
            ? {paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 8}
            : [a.gap_xs, a.mt_sm]
        }>
        {media ? <TypeBadge type={post.type} /> : null}
        {post.type === 'book' ? (
          <BookCaption
            post={post}
            ink={ink}
            muted={muted}
            inLibrary={inLibrary}
          />
        ) : null}
        {post.type === 'article' ? (
          <View style={[a.gap_xs]}>
            <CaptionLead
              name={post.author.displayName}
              text={post.title}
              ink={ink}
            />
            <Text style={[a.text_sm, {color: muted, lineHeight: 20}]}>
              {post.subtitle}
            </Text>
            <View style={[a.flex_row, a.gap_sm, a.flex_wrap, a.mt_xs]}>
              <Pill label={`${post.readMinutes} min read`} />
              {post.tags.map(tag => (
                <Pill
                  key={tag}
                  label={tag === 'tecnologia' ? 'Tecnologia' : tag}
                />
              ))}
            </View>
          </View>
        ) : null}
        {post.type === 'recipe' ? (
          <RecipeCaption post={post} ink={ink} />
        ) : null}
        {post.type === 'opinion' ? (
          <View style={[a.gap_xs]}>
            <Text style={[a.text_md, {color: ink, lineHeight: 22}]}>
              {post.text}
            </Text>
            {post.quote ? (
              <Text style={[a.text_sm, {color: muted, lineHeight: 20}]}>
                “{post.quote.text}”
              </Text>
            ) : null}
          </View>
        ) : null}
        {media ? null : (
          <AquaTextActionBar
            actions={actions}
            sparkle={sparkle}
            capsule={capsule}
          />
        )}
      </View>
      <WhySheet control={whyControl} data={why} />
    </View>
  )
}

function BookCaption({
  post,
  ink,
  muted,
  inLibrary,
}: {
  post: BookPost
  ink: string
  muted: string
  inLibrary: boolean
}) {
  const t = useTheme()
  const fresh = post.chapter.number > post.book.chaptersRead
  const pct =
    post.book.chapterCount === 0
      ? 0
      : (post.book.chaptersRead / post.book.chapterCount) * 100
  return (
    <View style={[a.gap_xs]}>
      <CaptionLead name={post.author.displayName} text={post.text} ink={ink} />
      <Text style={[a.font_bold, {fontSize: 17, color: ink}]}>
        {post.book.title}
      </Text>
      <Text style={[a.text_sm, {color: muted}]}>{bookSubtitle(post)}</Text>
      <ProgressBar value={pct} />
      <Text style={[a.text_sm, {color: muted}]}>
        You read {post.book.chaptersRead} of {post.book.chapterCount} · Ch.{' '}
        {post.chapter.number} “{post.chapter.title}”{fresh ? ' is new' : ''}
      </Text>
      <View
        style={[a.flex_row, a.align_center, a.gap_sm, a.flex_wrap, a.mt_xs]}>
        <Link
          to={`/books/read/${post.chapter.id}`}
          label={`Continue reading ${post.book.title}`}
          onPress={() =>
            writeRepository.recordEvent({
              kind: 'continue_reading',
              postId: post.id,
              authorId: post.author.id,
              bookId: post.book.id,
            })
          }>
          <View
            style={[
              a.rounded_full,
              a.px_md,
              a.py_sm,
              {backgroundColor: t.palette.primary_500},
            ]}>
            <Text style={[a.font_bold, a.text_sm, {color: AQUA.white}]}>
              Continue reading
            </Text>
          </View>
        </Link>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={inLibrary ? 'In library' : 'Add to library'}
          accessibilityHint=""
          onPress={() => writeRepository.toggleLibrary(post.book.id)}
          style={[a.rounded_full, a.px_md, a.py_sm, t.atoms.bg_contrast_50]}>
          <Text style={[a.font_bold, a.text_sm]}>
            {inLibrary ? 'In library' : '+ Library'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function RecipeCaption({
  post,
  ink,
}: {
  post: Extract<WritePost, {type: 'recipe'}>
  ink: string
}) {
  const minutes = post.prepMinutes + post.cookMinutes
  const difficulty =
    post.difficulty === 'easy'
      ? 'Easy'
      : post.difficulty === 'medium'
        ? 'Medium'
        : 'Hard'
  return (
    <View style={[a.gap_sm]}>
      <CaptionLead name={post.author.displayName} text={post.title} ink={ink} />
      <View style={[a.flex_row, a.gap_sm, a.flex_wrap]}>
        <Pill label={`${minutes} min`} />
        <Pill label={`${post.servings} servings`} />
        <Pill label={difficulty} />
      </View>
    </View>
  )
}

function CaptionLead({
  name,
  text,
  ink,
}: {
  name: string
  text: string
  ink: string
}) {
  return (
    <Text style={[a.text_md, a.leading_snug, {color: ink}]}>
      <Text style={[a.font_bold, {fontWeight: '800', color: ink}]}>
        {name}{' '}
      </Text>
      {text}
    </Text>
  )
}

function Cover({post}: {post: Exclude<WritePost, {type: 'opinion'}>}) {
  const tone = coverTone(post)
  const title = post.type === 'book' ? post.book.title : post.title
  const detail =
    post.type === 'book'
      ? `Chapter ${post.chapter.number} · ${post.book.genres.map(genreLabel).join(' · ')}`
      : post.type === 'article'
        ? `${post.readMinutes} min`
        : `${post.prepMinutes + post.cookMinutes} min`
  return (
    <View
      style={{
        width: '100%',
        minHeight: post.type === 'book' ? 440 : 280,
        backgroundColor: tone.bg,
        justifyContent: 'flex-end',
      }}>
      <View style={{paddingHorizontal: 20, paddingBottom: 84, maxWidth: '78%'}}>
        <Text
          style={[
            a.font_bold,
            {color: tone.fg, fontSize: post.type === 'book' ? 28 : 22},
          ]}>
          {title}
        </Text>
        <Text style={[a.text_sm, a.mt_xs, {color: tone.fg, opacity: 0.9}]}>
          {detail}
        </Text>
      </View>
    </View>
  )
}

function AuthorRow({post, overlay}: {post: WritePost; overlay: boolean}) {
  const t = useTheme()
  const light = t.name === 'light'
  const ink = overlay ? AQUA.white : light ? AQUA.ink : t.atoms.text.color
  const muted = overlay
    ? 'rgba(255,255,255,0.92)'
    : light
      ? AQUA.muted
      : t.atoms.text_contrast_medium.color
  const legible = overlay
    ? {
        textShadowColor: 'rgba(0,0,0,0.45)',
        textShadowOffset: {width: 0, height: 1},
        textShadowRadius: 3,
      }
    : undefined
  return (
    <View
      pointerEvents="box-none"
      style={[
        a.flex_row,
        a.align_center,
        a.gap_sm,
        overlay
          ? {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 4,
              paddingTop: 16,
              paddingHorizontal: 16,
              paddingBottom: 34,
            }
          : [a.mb_xs, a.z_20],
      ]}>
      {overlay ? (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(10,16,40,0.45)', 'rgba(10,16,40,0)']}
          style={[a.absolute, {top: 0, left: 0, right: 0, bottom: 0}]}
        />
      ) : null}
      <View style={{padding: 2, borderRadius: 999, backgroundColor: AQUA.iris}}>
        <View
          style={{
            borderRadius: 999,
            borderWidth: 2,
            borderColor: overlay || light ? AQUA.white : cardInk(t),
          }}>
          <Avatar author={post.author} size={42} />
        </View>
      </View>
      <View style={[a.flex_1]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <Text
            numberOfLines={1}
            style={[
              a.font_bold,
              a.leading_tight,
              {fontSize: 15, fontWeight: '800', color: ink, flexShrink: 1},
              legible,
            ]}>
            {post.author.displayName}
          </Text>
          {overlay ? null : <TypeBadge type={post.type} />}
        </View>
        <Text
          numberOfLines={1}
          style={[
            a.text_sm,
            a.leading_tight,
            a.mt_2xs,
            {color: muted},
            legible,
          ]}>
          @{post.author.handle} · {formatAge(post.createdAt)}
        </Text>
      </View>
    </View>
  )
}

function Pill({label}: {label: string}) {
  const t = useTheme()
  return (
    <View style={[a.rounded_full, a.px_sm, a.py_xs, t.atoms.bg_contrast_50]}>
      <Text style={[a.text_xs, a.font_bold]}>{label}</Text>
    </View>
  )
}

function coverTone(post: Exclude<WritePost, {type: 'opinion'}>): {
  bg: string
  fg: string
} {
  if (post.type === 'recipe') return {bg: '#FFE3C2', fg: AQUA.ink}
  if (post.type === 'article') return {bg: '#12307A', fg: AQUA.white}
  if (post.book.fanfic) return {bg: '#334155', fg: AQUA.white}
  return {bg: AQUA.primary, fg: AQUA.white}
}

function sampleLikers(post: WritePost): PostLikerPreview[] {
  return Object.values(AUTHORS)
    .filter(author => author.id !== post.author.id)
    .slice(0, 2)
    .map(author => ({
      did: author.id,
      displayName: author.displayName,
      handle: author.handle,
      color: author.color,
    }))
}

function openLabel(post: Exclude<WritePost, {type: 'opinion'}>) {
  if (post.type === 'book') return `Continue reading ${post.book.title}`
  return post.title
}

function cardInk(t: ReturnType<typeof useTheme>) {
  return t.atoms.bg.backgroundColor ?? AQUA.white
}
