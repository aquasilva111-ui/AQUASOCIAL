import {Pressable, View} from 'react-native'

import {genreLabel} from '#/lib/books/model'
import {type WriteAuthor, type WritePost} from '#/lib/write/types'
import {atoms as a, useTheme, web} from '#/alf'
import {Bookmark, BookmarkFilled} from '#/components/icons/Bookmark'
import {Bubble_Stroke2_Corner2_Rounded as Bubble} from '#/components/icons/Bubble'
import {Heart2_Stroke2_Corner0_Rounded as Heart} from '#/components/icons/Heart2'
import {Repost_Stroke2_Corner2_Rounded as Repost} from '#/components/icons/Repost'
import {Text} from '#/components/Typography'

export function formatAge(iso: string, now = Date.now()): string {
  const mins = Math.max(1, Math.round((now - Date.parse(iso)) / 60_000))
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

export function Avatar({
  author,
  size = 42,
}: {
  author: Pick<WriteAuthor, 'color' | 'displayName'>
  size?: number
}) {
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: author.color,
      }}
    />
  )
}

export function TypeBadge({type}: {type: WritePost['type']}) {
  const t = useTheme()
  const label = {
    book: 'BOOK',
    article: 'ARTICLE',
    opinion: 'OPINION',
    recipe: 'RECIPE',
  }[type]
  return (
    <View
      style={[
        a.rounded_xs,
        a.px_sm,
        a.py_2xs,
        {backgroundColor: t.palette.primary_50},
      ]}>
      <Text
        style={[
          a.font_bold,
          {color: t.palette.primary_500, fontSize: 11, letterSpacing: 0.4},
        ]}>
        {label}
      </Text>
    </View>
  )
}

export function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string
  selected: boolean
  onPress: () => void
  testID?: string
}) {
  const t = useTheme()
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint=""
      accessibilityState={{selected}}
      onPress={onPress}
      style={[
        a.rounded_full,
        a.px_md,
        a.py_xs,
        selected ? t.atoms.bg_contrast_900 : t.atoms.bg_contrast_50,
      ]}>
      <Text
        style={[
          a.text_sm,
          a.font_bold,
          selected ? {color: t.palette.contrast_0} : t.atoms.text,
        ]}>
        {label}
      </Text>
    </Pressable>
  )
}

export function ProgressBar({value}: {value: number}) {
  const t = useTheme()
  const pct = Math.max(0, Math.min(100, value))
  return (
    <View
      style={[
        a.flex_row,
        a.overflow_hidden,
        a.rounded_full,
        t.atoms.bg_contrast_50,
        {height: 6},
      ]}>
      <View
        style={{
          flex: pct,
          backgroundColor: t.palette.primary_500,
        }}
      />
      <View style={{flex: Math.max(0.001, 100 - pct)}} />
    </View>
  )
}

export function PostActions({
  replies,
  reposts,
  likes,
  liked,
  reposted,
  saved,
  onReply,
  onRepost,
  onLike,
  onSave,
  quote,
}: {
  replies: number
  reposts?: number
  likes: number
  liked?: boolean
  reposted?: boolean
  saved?: boolean
  onReply?: () => void
  onRepost?: () => void
  onLike?: () => void
  onSave?: () => void
  quote?: boolean
}) {
  const t = useTheme()
  const color = t.palette.contrast_500
  const hot = t.palette.primary_500
  return (
    <View style={[a.flex_row, a.align_center, a.gap_xl, a.mt_sm]}>
      <Action
        label={`${replies} replies`}
        onPress={onReply}
        icon={<Bubble width={18} style={{color}} />}
        count={replies}
      />
      {reposts !== undefined && (
        <Action
          label={`${reposts} reposts`}
          onPress={onRepost}
          icon={<Repost width={18} style={{color: reposted ? hot : color}} />}
          count={reposts}
        />
      )}
      <Action
        label={`${likes} likes`}
        onPress={onLike}
        icon={<Heart width={18} style={{color: liked ? hot : color}} />}
        count={likes}
      />
      <Action
        label={saved ? 'Saved' : 'Save'}
        onPress={onSave}
        icon={
          saved ? (
            <BookmarkFilled width={18} style={{color: hot}} />
          ) : (
            <Bookmark width={18} style={{color}} />
          )
        }
      />
      {quote && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quote"
          accessibilityHint=""
          onPress={onReply}
          style={[a.flex_row, a.align_center, a.gap_xs]}>
          <Text style={[{color}, a.text_sm]}>“ Quote</Text>
        </Pressable>
      )}
    </View>
  )
}

function Action({
  label,
  icon,
  count,
  onPress,
}: {
  label: string
  icon: React.ReactNode
  count?: number
  onPress?: () => void
}) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint=""
      onPress={onPress}
      style={[a.flex_row, a.align_center, a.gap_xs]}>
      {icon}
      {count !== undefined && (
        <Text style={[a.text_sm, {color: t.palette.contrast_500}]}>
          {count}
        </Text>
      )}
    </Pressable>
  )
}

export function MetaLine({
  author,
  age,
  type,
}: {
  author: WriteAuthor
  age: string
  type: WritePost['type']
}) {
  const t = useTheme()
  return (
    <View style={[a.flex_row, a.align_center, a.gap_xs, a.flex_wrap]}>
      <Text style={[a.font_bold, a.text_md]}>{author.displayName}</Text>
      <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
        @{author.handle} · {age}
      </Text>
      <TypeBadge type={type} />
    </View>
  )
}

export function bookSubtitle(post: Extract<WritePost, {type: 'book'}>) {
  const genre = post.book.genres.map(genreLabel).join(' · ')
  return `${genre} · ${post.book.chapterCount} chapters · ${post.book.status}`
}

export function PlaceholderBanner() {
  const t = useTheme()
  return (
    <Text
      style={[
        a.text_center,
        a.py_sm,
        a.px_md,
        {fontSize: 11, color: t.palette.contrast_400},
      ]}>
      MOCKUP — all names and content are placeholder examples
    </Text>
  )
}

export function RailCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.rounded_md,
        a.p_md,
        a.border,
        a.gap_sm,
        t.atoms.border_contrast_low,
        web({borderRadius: 14}),
      ]}>
      <Text style={[a.font_bold, a.text_md]}>{title}</Text>
      {children}
    </View>
  )
}

export const OPINION_LIMIT = 600
