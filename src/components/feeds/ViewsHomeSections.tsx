import {useEffect, useState} from 'react'
import {ScrollView, View} from 'react-native'
import {Image} from 'expo-image'
import {AtUri} from '@atproto/api'

import {getPostMedia} from '#/lib/media/experiences'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {splitTitle} from '#/lib/view-watch/chapters'
import {
  formatDuration,
  formatRelativePt,
  formatViewLabel,
  knownDurationSeconds,
  knownViewCount,
} from '#/lib/views/format'
import {type FeedPostSliceItem} from '#/state/queries/post-feed'
import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'

const HEADER_HEIGHT = 56

export const VIEW_CATEGORIES = [
  'Música',
  'Oceanos',
  'Culinária',
  'Tecnologia',
  'Esportes',
  'Ciência',
  'Viagens',
  'Podcasts',
  'Jogos',
] as const

export function ViewsCategoryChips({
  topics,
  selected,
  onSelect,
}: {
  topics: string[]
  selected: string
  onSelect: (id: string) => void
}) {
  const t = useTheme()
  const extras = topics.filter(
    topic =>
      !VIEW_CATEGORIES.some(
        category => category.toLocaleLowerCase('pt-BR') === topic,
      ),
  )
  const chips = [
    {id: 'all', label: 'Tudo'},
    {id: 'live', label: 'Ao vivo'},
    ...VIEW_CATEGORIES.map(label => ({
      id: label.toLocaleLowerCase('pt-BR'),
      label,
    })),
    ...extras.slice(0, 8).map(topic => ({id: topic, label: `#${topic}`})),
  ]
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      style={[
        web({
          position: 'sticky',
          top: HEADER_HEIGHT,
          zIndex: 10,
        }),
        t.atoms.bg,
      ]}
      contentContainerStyle={[a.gap_sm, a.px_lg, a.py_sm]}>
      {chips.map(chip => {
        const on = selected === chip.id
        return (
          <Button
            key={chip.id}
            label={chip.label}
            size="small"
            color={on ? 'primary' : 'secondary'}
            variant={on ? 'solid' : 'solid'}
            accessibilityRole="tab"
            accessibilityState={{selected: on}}
            onPress={() => onSelect(chip.id)}
            style={[!on && t.atoms.bg_contrast_25, a.rounded_sm]}>
            <ButtonText style={!on ? t.atoms.text : undefined}>
              {chip.label}
            </ButtonText>
          </Button>
        )
      })}
    </ScrollView>
  )
}

export function ViewsHero({items}: {items: FeedPostSliceItem[]}) {
  const slides = items.slice(0, 3)
  const firstUri = slides[0]?.uri
  const [index, setIndex] = useState(0)
  useEffect(() => {
    setIndex(0)
  }, [slides.length, firstUri])
  useEffect(() => {
    if (slides.length < 2) return
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return
    const timer = setInterval(
      () => setIndex(current => (current + 1) % slides.length),
      6000,
    )
    return () => clearInterval(timer)
  }, [slides.length])
  if (!slides.length) return null
  const current = Math.min(index, slides.length - 1)
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel="Destaques"
      accessibilityHint=""
      style={[
        a.mx_lg,
        a.mt_sm,
        a.mb_lg,
        a.overflow_hidden,
        web({
          position: 'relative',
          borderRadius: 16,
          aspectRatio: '21 / 7',
          minHeight: 200,
        }),
      ]}>
      {slides.map((item, slideIndex) => (
        <HeroSlide
          key={item.uri}
          item={item}
          visible={slideIndex === current}
          position={`${slideIndex + 1} de ${slides.length}`}
        />
      ))}
      {slides.length > 1 && (
        <View
          style={[
            a.absolute,
            a.flex_row,
            a.gap_xs,
            {right: 20, bottom: 20, zIndex: 2},
          ]}>
          {slides.map((item, slideIndex) => (
            <Button
              key={item.uri}
              label={`Destaque ${slideIndex + 1}`}
              onPress={() => setIndex(slideIndex)}
              size="tiny"
              variant="solid"
              color={slideIndex === current ? 'primary' : 'secondary'}
              style={{
                width: slideIndex === current ? 22 : 8,
                height: 8,
                padding: 0,
                borderRadius: 4,
                backgroundColor:
                  slideIndex === current ? '#fff' : 'rgba(255,255,255,0.5)',
              }}>
              <ButtonText>{''}</ButtonText>
            </Button>
          ))}
        </View>
      )}
    </View>
  )
}

function HeroSlide({
  item,
  visible,
  position,
}: {
  item: FeedPostSliceItem
  visible: boolean
  position: string
}) {
  const post = item.post
  const text = (item.record as {text?: string}).text ?? ''
  const {title, description} = splitTitle(text)
  const media = getPostMedia(post)
  const thumbnail = media.type === 'video' ? media.view.thumbnail : undefined
  const rkey = new AtUri(post.uri).rkey
  const href = `/views/watch/${post.author.did}/${rkey}`
  const channel = sanitizeDisplayName(
    post.author.displayName || sanitizeHandle(post.author.handle),
  )
  const views = formatViewLabel(knownViewCount(post))
  const when = formatRelativePt(post.indexedAt)
  const duration = formatDuration(
    media.type === 'video' ? knownDurationSeconds(media.view) : undefined,
  )
  const meta = [channel, views, when].filter(Boolean).join(' · ')
  return (
    <View
      accessibilityLabel={position}
      accessibilityHint=""
      style={[
        a.absolute,
        a.inset_0,
        web({opacity: visible ? 1 : 0, transition: 'opacity 500ms ease'}),
      ]}>
      {thumbnail ? (
        <Image
          source={{uri: thumbnail}}
          style={[a.absolute, a.inset_0]}
          contentFit="cover"
          accessibilityIgnoresInvertColors
          accessibilityLabel=""
          accessibilityHint=""
        />
      ) : (
        <View style={[a.absolute, a.inset_0, {backgroundColor: '#0a4d73'}]} />
      )}
      <View
        style={[
          a.absolute,
          a.inset_0,
          web({
            backgroundImage: 'linear-gradient(transparent, rgba(0,0,0,0.62))',
          } as object),
        ]}
      />
      <View
        style={[
          a.absolute,
          a.flex_1,
          a.justify_end,
          {left: 0, right: 0, bottom: 0, padding: 28, maxWidth: 640},
        ]}>
        {!!duration && (
          <Text style={[a.text_xs, a.font_bold, {color: '#fff'}]}>
            {duration}
          </Text>
        )}
        {!!title && (
          <Text
            numberOfLines={2}
            style={[a.text_2xl, a.font_bold, a.leading_snug, {color: '#fff'}]}>
            {title}
          </Text>
        )}
        {!!description && (
          <Text
            numberOfLines={2}
            style={[a.text_md, a.pt_xs, web({color: 'rgba(255,255,255,0.9)'})]}>
            {description}
          </Text>
        )}
        {!!meta && (
          <Text style={[a.text_sm, a.pt_xs, {color: 'rgba(255,255,255,0.85)'}]}>
            {meta}
          </Text>
        )}
        <View style={[a.flex_row, a.pt_md]}>
          <Link
            to={href}
            label={title ? `Assistir ${title}` : 'Assistir'}
            style={[
              a.rounded_full,
              a.px_lg,
              a.py_sm,
              {backgroundColor: '#fff'},
            ]}>
            <Text style={[a.font_bold, {color: '#000'}]}>Assistir</Text>
          </Link>
        </View>
      </View>
    </View>
  )
}
