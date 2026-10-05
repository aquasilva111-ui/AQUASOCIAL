import {useState} from 'react'
import {Pressable, TextInput, View} from 'react-native'
import {Image} from 'expo-image'
import {useQueryClient} from '@tanstack/react-query'

import {
  adultApi,
  type AdultEngagement,
  type AdultEngageType,
  adultMediaUrl,
  type AdultNetworkAuthor,
  type AdultNetworkPost,
  setAdultEngagement,
} from '#/lib/adult/api'
import {adultQueryKey} from '#/lib/adult/isolation'
import {useAgent} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'
import {AdultReportButton} from './AdultReportButton'

export function authorName(author: AdultNetworkAuthor) {
  return (
    author.displayName ??
    (author.handle ? `@${author.handle}` : `${author.did.slice(0, 18)}…`)
  )
}

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  return `${Math.floor(s / 86400)} d`
}

const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)} mil` : String(n)

/**
 * Like / repost / comment bar for any +18 content (post, video, book, pin).
 * Updates optimistically and rolls back if the server refuses.
 */
export function AdultEngageBar({
  type,
  id,
  engagement,
  onComments,
}: {
  type: AdultEngageType
  id: string
  engagement: AdultEngagement
  /** Opens the comments; omitted where the comments are already on screen. */
  onComments?: () => void
}) {
  const agent = useAgent()
  const t = useTheme()
  const [e, setE] = useState(engagement)

  const toggle = (kind: 'like' | 'repost') => {
    const key = kind === 'like' ? 'liked' : 'reposted'
    const count = kind === 'like' ? 'likes' : 'reposts'
    const on = !e[key]
    const prev = e
    setE({...e, [key]: on, [count]: Math.max(0, e[count] + (on ? 1 : -1))})
    setAdultEngagement(agent, type, id, kind, on).catch(() => setE(prev))
  }

  const item = (
    label: string,
    value: string,
    active: boolean,
    color: string,
    onPress?: () => void,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Toque para alternar"
      onPress={onPress}
      style={[a.flex_row, a.align_center, a.gap_xs]}>
      <Text
        style={[
          a.text_sm,
          a.font_bold,
          active ? {color} : t.atoms.text_contrast_medium,
        ]}>
        {label}
      </Text>
      <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>{value}</Text>
    </Pressable>
  )

  return (
    <View style={[a.flex_row, a.gap_xl, a.pt_sm]}>
      {item(
        e.liked ? 'Curtiu' : 'Curtir',
        compact(e.likes),
        e.liked,
        '#c2570c',
        () => toggle('like'),
      )}
      {item(
        e.reposted ? 'Republicado' : 'Republicar',
        compact(e.reposts),
        e.reposted,
        '#0f8a5f',
        () => toggle('repost'),
      )}
      {item('Comentar', compact(e.comments), false, '#0a5cff', onComments)}
    </View>
  )
}

function AdultPostMedia({media}: {media: AdultNetworkPost['media']}) {
  const t = useTheme()
  const [revealed, setRevealed] = useState(false)
  if (!media.length) return null
  return (
    <View style={[a.gap_xs, a.pt_sm]}>
      {media.map(m => (
        <View
          key={m.id}
          style={[
            a.w_full,
            a.rounded_md,
            a.overflow_hidden,
            t.atoms.bg_contrast_50,
            {aspectRatio: m.width && m.height ? m.width / m.height : 4 / 3},
          ]}>
          <Image
            source={{uri: adultMediaUrl(m.url)}}
            style={[a.w_full, a.h_full]}
            contentFit="cover"
            blurRadius={m.sensitive && !revealed ? 40 : 0}
            accessibilityIgnoresInvertColors
          />
          {m.sensitive && !revealed && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Revelar imagem"
              accessibilityHint="Mostra a imagem sem desfoque"
              onPress={() => setRevealed(true)}
              style={[a.absolute, a.inset_0, a.align_center, a.justify_center]}>
              <Text style={[a.text_sm, a.font_bold]}>Toque para revelar</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  )
}

/** One post of the +18 network, in the feed, on a profile or on its own page. */
export function AdultNetworkPostCard({
  post,
  detail,
}: {
  post: AdultNetworkPost
  /** On the post's own page: no link back to itself. */
  detail?: boolean
}) {
  const t = useTheme()
  const name = authorName(post.author)
  const body = (
    <View style={[a.gap_2xs]}>
      <Text style={[a.text_md]}>{post.body}</Text>
      <AdultPostMedia media={post.media} />
    </View>
  )
  return (
    <View
      style={[
        a.p_md,
        a.gap_xs,
        a.border_b,
        t.atoms.border_contrast_low,
        {maxWidth: 680, width: '100%', alignSelf: 'center'},
      ]}>
      {post.repostedBy && (
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
          {`${authorName(post.repostedBy)} republicou`}
        </Text>
      )}
      <View style={[a.flex_row, a.gap_sm, a.align_center]}>
        <View
          style={[
            a.rounded_full,
            a.align_center,
            a.justify_center,
            t.atoms.bg_contrast_50,
            {width: 36, height: 36},
          ]}>
          <Text style={[a.text_md, a.font_bold]}>
            {(post.author.displayName ?? post.author.handle ?? '?')
              .replace('@', '')
              .slice(0, 1)
              .toUpperCase()}
          </Text>
        </View>
        <Link
          to={`/adult/user/${encodeURIComponent(post.author.did)}`}
          label={name}
          style={[a.flex_1]}>
          <Text style={[a.text_md, a.font_bold]} numberOfLines={1}>
            {name}
          </Text>
        </Link>
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
          {timeAgo(post.createdAt)}
        </Text>
      </View>
      {detail ? (
        body
      ) : (
        <Link
          to={`/adult/post/${post.id}`}
          label="Abrir post"
          style={[a.flex_col]}>
          {body}
        </Link>
      )}
      <AdultEngageBar type="post" id={post.id} engagement={post.engagement} />
      <View style={[a.flex_row, a.gap_md, a.pt_xs]}>
        {!detail && (
          <Link
            to={`/adult/post/${post.id}`}
            label="Ver comentários"
            style={[a.flex_row]}>
            <Text style={[a.text_xs, {color: '#0a5cff'}]}>Ver comentários</Text>
          </Link>
        )}
        <AdultReportButton
          targetType="content"
          resourceType="social_post"
          resourceId={post.id}
        />
      </View>
    </View>
  )
}

/**
 * Text box + publish button. `kind: 'post'` creates a post; `kind: 'comment'`
 * adds a comment to the given target.
 */
export function AdultComposer({
  placeholder,
  submitLabel,
  maxLength,
  path,
  field,
  invalidate,
}: {
  placeholder: string
  submitLabel: string
  maxLength: number
  /** API path that receives the text. */
  path: string
  /** Name of the body field. */
  field: 'body'
  /** Query key prefixes to refresh after success. */
  invalidate: unknown[][]
}) {
  const t = useTheme()
  const agent = useAgent()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    setError(null)
    try {
      await adultApi(agent, path, {method: 'POST', body: {[field]: value}})
      setText('')
      await Promise.all(
        invalidate.map(queryKey => qc.invalidateQueries({queryKey})),
      )
    } catch (e: any) {
      setError(
        e?.code === 'rate_limited'
          ? 'Calma: muitas publicações em pouco tempo.'
          : 'Não foi possível publicar. Tente de novo.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <View
      style={[
        a.p_md,
        a.gap_sm,
        a.border_b,
        t.atoms.border_contrast_low,
        {maxWidth: 680, width: '100%', alignSelf: 'center'},
      ]}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor="#8a8a90"
        multiline
        maxLength={maxLength}
        accessibilityLabel={placeholder}
        accessibilityHint="Digite o texto a publicar"
        style={[
          a.p_md,
          a.rounded_md,
          a.text_md,
          t.atoms.bg_contrast_25,
          t.atoms.text,
          {minHeight: 72, textAlignVertical: 'top'},
        ]}
      />
      {error && <Text style={[a.text_sm, {color: '#c2570c'}]}>{error}</Text>}
      <View style={[a.flex_row, a.justify_between, a.align_center]}>
        <Text style={[a.text_xs, t.atoms.text_contrast_medium]}>
          {`${text.length}/${maxLength}`}
        </Text>
        <Button
          label={submitLabel}
          size="small"
          color="primary"
          disabled={!text.trim() || busy}
          onPress={submit}>
          <ButtonText>{busy ? 'Enviando…' : submitLabel}</ButtonText>
        </Button>
      </View>
    </View>
  )
}

export const networkKey = (...parts: unknown[]) =>
  adultQueryKey('network', ...(parts as string[]))
