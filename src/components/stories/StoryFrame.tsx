import {View} from 'react-native'
import {Image} from 'expo-image'

import {type StoryOverlay, type StoryView} from '#/lib/stories/model'
import {atoms as a} from '#/alf'
import {Text} from '#/components/Typography'

export const FRAME_RATIO = 9 / 16

/** Largest 9:16 frame that fits the container (what viewers see). */
export function frameSize(containerW: number, containerH: number) {
  const width = Math.min(containerW, containerH * FRAME_RATIO)
  return {width, height: width / FRAME_RATIO}
}

type Content = Pick<StoryView, 'mediaUrl' | 'background' | 'fit' | 'overlays'>

const TEXT_BASE = 0.075
const STICKER_BASE = 0.16

/** Dark pill colours get white text, light ones get dark text. */
function readableOn(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  return lum > 150 ? '#111827' : '#FFFFFF'
}

/**
 * One text/emoji overlay, centred on (x, y) of the frame. The wrapper has
 * zero height so the child is centred on the line without needing to know
 * its own size.
 */
export function OverlayView({
  overlay,
  width,
  height,
  selected,
  children,
}: {
  overlay: StoryOverlay
  width: number
  height: number
  selected?: boolean
  /** Gesture handlers, in the creator. */
  children?: (box: React.ReactNode) => React.ReactNode
}) {
  const isText = overlay.kind === 'text'
  const fontSize = width * (isText ? TEXT_BASE : STICKER_BASE) * overlay.scale
  const box = (
    <View
      style={[
        isText && overlay.pill && a.rounded_md,
        isText &&
          overlay.pill && {
            backgroundColor: overlay.color,
            paddingHorizontal: fontSize * 0.5,
            paddingVertical: fontSize * 0.2,
          },
        selected && {
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.9)',
          borderStyle: 'dashed',
          borderRadius: 8,
        },
        {maxWidth: width * 0.92},
      ]}>
      <Text
        style={[
          a.font_bold,
          {
            fontSize,
            lineHeight: fontSize * 1.2,
            textAlign: 'center',
            color:
              isText && overlay.pill
                ? readableOn(overlay.color)
                : overlay.color,
            textShadowColor:
              isText && !overlay.pill ? 'rgba(0,0,0,0.45)' : 'transparent',
            textShadowRadius: 4,
            textShadowOffset: {width: 0, height: 1},
          },
        ]}>
        {overlay.text}
      </Text>
    </View>
  )
  return (
    <View
      pointerEvents="box-none"
      style={[
        a.absolute,
        a.align_center,
        a.justify_center,
        {
          left: overlay.x * width - width / 2,
          top: overlay.y * height,
          width,
          height: 0,
        },
      ]}>
      {children ? children(box) : box}
    </View>
  )
}

/**
 * The 9:16 story canvas: colour background, optional photo, overlays.
 * The creator and the viewer both render this, so what you compose is
 * exactly what people see.
 */
export function StoryFrame({
  story,
  width,
  onLoad,
  onError,
  renderOverlay,
}: {
  story: Content
  width: number
  onLoad?: () => void
  onError?: () => void
  /** Lets the creator wrap overlays with gestures. */
  renderOverlay?: (o: StoryOverlay, w: number, h: number) => React.ReactNode
}) {
  const height = width / FRAME_RATIO
  return (
    <View
      style={[
        a.overflow_hidden,
        {width, height, backgroundColor: story.background ?? '#000'},
      ]}>
      {story.mediaUrl && (
        <Image
          accessibilityIgnoresInvertColors
          accessibilityHint=""
          accessibilityLabel="Foto do story"
          source={{uri: story.mediaUrl}}
          style={[a.absolute, a.inset_0]}
          contentFit={story.fit}
          onLoad={onLoad}
          onError={onError}
        />
      )}
      {story.overlays.map(o =>
        renderOverlay ? (
          renderOverlay(o, width, height)
        ) : (
          <OverlayView key={o.id} overlay={o} width={width} height={height} />
        ),
      )}
    </View>
  )
}

/** Small square/circle preview: the photo, or the colour with its first text. */
export function StoryPreview({story}: {story: Content}) {
  if (story.mediaUrl) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        accessibilityHint=""
        accessibilityLabel="Story"
        source={{uri: story.mediaUrl}}
        style={[a.flex_1]}
        contentFit="cover"
      />
    )
  }
  const first = story.overlays[0]
  return (
    <View
      style={[
        a.flex_1,
        a.align_center,
        a.justify_center,
        {backgroundColor: story.background ?? '#111827'},
      ]}>
      {first && (
        <Text
          numberOfLines={2}
          style={[
            a.font_bold,
            {color: '#fff', fontSize: 11, textAlign: 'center', padding: 2},
          ]}>
          {first.text}
        </Text>
      )}
    </View>
  )
}
