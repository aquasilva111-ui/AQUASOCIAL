import {useRef, useState} from 'react'
import {ScrollView, View} from 'react-native'
import {Image} from 'expo-image'

import {liveThumbUrl, type StreamplaceLivestreamView} from '#/lib/streamplace'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {formatWatchingLabel} from '#/lib/views/format'
import {useLiveUsersQuery} from '#/state/queries/streamplace'
import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonIcon} from '#/components/Button'
import {
  ChevronLeft_Stroke2_Corner0_Rounded as ChevronLeft,
  ChevronRight_Stroke2_Corner0_Rounded as ChevronRight,
} from '#/components/icons/Chevron'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'

/**
 * "Ao vivo agora" — live broadcasts from Streamplace. The row scrolls with
 * arrows and a right-edge fade that disappears once the last card is in view.
 */
export function LiveNowSection({
  enabled,
  showEmpty = false,
}: {
  enabled: boolean
  showEmpty?: boolean
}) {
  const t = useTheme()
  const scroller = useRef<ScrollView>(null)
  const [offset, setOffset] = useState(0)
  const [viewport, setViewport] = useState(0)
  const [contentWidth, setContentWidth] = useState(0)
  const {data: streams, isError, isLoading} = useLiveUsersQuery({enabled})
  const atEnd = contentWidth <= viewport + offset + 8
  const canScroll = contentWidth > viewport + 8

  if (isError || (!isLoading && !streams?.length)) {
    if (!showEmpty) return null
    return (
      <Text style={[a.px_lg, a.py_md, t.atoms.text_contrast_medium]}>
        Ninguém ao vivo agora.
      </Text>
    )
  }
  if (!streams?.length) return null

  const step = Math.max(240, viewport * 0.8)
  const scrollBy = (direction: number) => {
    scroller.current?.scrollTo({
      x: Math.max(0, offset + direction * step),
      animated: true,
    })
  }

  return (
    <View nativeID="ao-vivo-agora" style={[a.pb_lg, {minWidth: 0}]}>
      <View style={[a.flex_row, a.align_center, a.gap_sm, a.px_lg, a.pb_sm]}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#e5252a',
          }}
        />
        <Text style={[a.text_xl, a.font_bold, a.flex_1, t.atoms.text]}>
          Ao vivo agora
        </Text>
        {canScroll && (
          <View style={[a.flex_row, a.gap_xs]}>
            <Button
              label="Anterior"
              size="small"
              variant="outline"
              color="secondary"
              shape="round"
              onPress={() => scrollBy(-1)}>
              <ButtonIcon icon={ChevronLeft} />
            </Button>
            <Button
              label="Próximo"
              size="small"
              variant="outline"
              color="secondary"
              shape="round"
              onPress={() => scrollBy(1)}>
              <ButtonIcon icon={ChevronRight} />
            </Button>
          </View>
        )}
      </View>
      <View style={{position: 'relative', minWidth: 0}}>
        {canScroll && !atEnd && (
          <View
            pointerEvents="none"
            style={[
              a.absolute,
              web({
                top: 0,
                right: 0,
                bottom: 0,
                width: 64,
                zIndex: 1,
                backgroundImage: `linear-gradient(90deg, transparent, ${t.atoms.bg.backgroundColor ?? '#fff'})`,
              } as object),
            ]}
          />
        )}
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          onLayout={event => setViewport(event.nativeEvent.layout.width)}
          onContentSizeChange={width => setContentWidth(width)}
          onScroll={event => setOffset(event.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
          contentContainerStyle={[a.gap_md, a.px_lg]}>
          {streams.map(stream => (
            <LiveCard key={stream.uri} stream={stream} />
          ))}
        </ScrollView>
      </View>
    </View>
  )
}

function LiveCard({stream}: {stream: StreamplaceLivestreamView}) {
  const t = useTheme()
  const watching = formatWatchingLabel(stream.viewerCount?.count)
  const title = stream.record.title || 'Transmissão ao vivo'
  const channel = sanitizeDisplayName(
    stream.author.displayName || sanitizeHandle(stream.author.handle),
  )

  return (
    <Link
      to={`/views/live/${stream.author.did}`}
      label={title}
      style={[
        a.flex_col,
        a.align_stretch,
        web({
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: 280,
          width: 280,
          scrollSnapAlign: 'start',
        }),
      ]}>
      <View
        style={[
          a.w_full,
          a.overflow_hidden,
          t.atoms.bg_contrast_25,
          {aspectRatio: 16 / 9, borderRadius: 12},
        ]}>
        <Image
          accessibilityIgnoresInvertColors
          accessibilityHint="Abre a transmissão ao vivo"
          source={{uri: liveThumbUrl(stream.author.did)}}
          style={[a.w_full, a.h_full]}
          contentFit="cover"
          accessibilityLabel={title}
          transition={150}
          recyclingKey={stream.uri}
        />
        <View
          style={[
            a.absolute,
            a.rounded_xs,
            a.px_xs,
            {top: 8, left: 8, backgroundColor: '#e5252a', paddingVertical: 2},
          ]}>
          <Text style={[a.text_xs, a.font_bold, {color: '#fff'}]}>AO VIVO</Text>
        </View>
      </View>
      <View style={[a.pt_sm, {minWidth: 0}]}>
        <Text
          numberOfLines={2}
          style={[a.text_md, a.font_bold, a.leading_snug]}>
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={[a.text_xs, t.atoms.text_contrast_medium, a.pt_2xs]}>
          {channel}
        </Text>
        {!!watching && (
          <Text
            numberOfLines={1}
            style={[a.text_xs, t.atoms.text_contrast_medium]}>
            {watching}
          </Text>
        )}
      </View>
    </Link>
  )
}
