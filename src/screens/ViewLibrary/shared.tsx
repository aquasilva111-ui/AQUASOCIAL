import {View} from 'react-native'
import {Image} from 'expo-image'

import {type ViewVideoRef} from '#/state/view-playback'
import {ViewShell} from '#/screens/ViewChannel/ViewShell'
import {atoms as a, useTheme} from '#/alf'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'

export const watchPath = (v: {did: string; rkey: string}) =>
  `/videos/watch/${v.did}/${v.rkey}`

/** Page chrome shared by the Views library screens. */
export function LibraryPage({
  title,
  subtitle,
  testID,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  testID: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <ViewShell title={title} testID={testID}>
      <View style={[a.px_lg, a.py_xl, a.gap_lg, {maxWidth: 960}]}>
        <View style={[a.flex_row, a.flex_wrap, a.align_end, a.gap_md]}>
          <View style={[a.flex_1, a.gap_xs, {minWidth: 220}]}>
            <Text style={[a.text_3xl, a.font_bold]} accessibilityRole="header">
              {title}
            </Text>
            {subtitle && (
              <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
                {subtitle}
              </Text>
            )}
          </View>
          {actions && (
            <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>{actions}</View>
          )}
        </View>
        {children}
      </View>
    </ViewShell>
  )
}

export function Empty({title, body}: {title: string; body?: string}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.p_xl,
        a.gap_xs,
        a.align_center,
        a.rounded_lg,
        a.border,
        t.atoms.border_contrast_low,
      ]}>
      <Text style={[a.text_lg, a.font_bold, a.text_center]}>{title}</Text>
      {body && (
        <Text
          style={[
            a.text_md,
            a.text_center,
            t.atoms.text_contrast_medium,
            {maxWidth: 440},
          ]}>
          {body}
        </Text>
      )}
    </View>
  )
}

export function Thumb({uri, width = 168}: {uri?: string; width?: number}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.rounded_md,
        a.overflow_hidden,
        t.atoms.bg_contrast_50,
        {width, aspectRatio: 16 / 9},
      ]}>
      {uri && (
        <Image
          source={{uri}}
          style={{width: '100%', height: '100%'}}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      )}
    </View>
  )
}

/** One video line: thumbnail + title/author, optional trailing actions. */
export function VideoRow({
  video,
  meta,
  actions,
}: {
  video: ViewVideoRef
  meta?: string
  actions?: React.ReactNode
}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.flex_row,
        a.align_center,
        a.gap_md,
        a.py_sm,
        a.border_b,
        t.atoms.border_contrast_low,
      ]}>
      <Link
        to={watchPath(video)}
        label={`${video.title}, de ${video.author}`}
        style={[a.flex_row, a.gap_md, a.flex_1, {minWidth: 0}]}>
        <Thumb uri={video.thumbnail} width={152} />
        <View style={[a.flex_1, a.gap_2xs, {minWidth: 0}]}>
          <Text style={[a.text_md, a.font_bold]} numberOfLines={2}>
            {video.title}
          </Text>
          <Text
            style={[a.text_sm, t.atoms.text_contrast_medium]}
            numberOfLines={1}>
            {[video.author, meta].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </Link>
      {actions && (
        <View style={[a.flex_row, a.gap_xs, a.align_center]}>{actions}</View>
      )}
    </View>
  )
}

/** Grid card: full-width thumbnail, title, author and an optional line. */
export function VideoCard({
  video,
  meta,
}: {
  video: ViewVideoRef
  meta?: React.ReactNode
}) {
  const t = useTheme()
  return (
    <Link
      to={watchPath(video)}
      label={`${video.title}, de ${video.author}`}
      style={[a.gap_xs, {width: 260, maxWidth: '100%'}]}>
      <Thumb uri={video.thumbnail} width={260} />
      <Text style={[a.text_md, a.font_bold]} numberOfLines={2}>
        {video.title}
      </Text>
      <Text style={[a.text_sm, t.atoms.text_contrast_medium]} numberOfLines={1}>
        {video.author}
        {meta ? <> · {meta}</> : null}
      </Text>
    </Link>
  )
}
