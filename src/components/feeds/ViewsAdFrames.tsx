import {ScrollView, View} from 'react-native'
import {Image} from 'expo-image'

import {VIEWS_FRAMES, type ViewsFrame} from '#/lib/media/viewsFrames'
import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'

/** Wide banner proportion shared by every frame, so they line up. */
const FRAME_ASPECT = 2.2

/**
 * "Views Frames" — the ad row on Aqua Views. Three frames side by side on
 * wide screens; a horizontal scroller on phones. Creatives come from
 * VIEWS_FRAMES; empty frames show a placeholder.
 */
export function ViewsAdFrames() {
  const {gtMobile} = useBreakpoints()
  if (!VIEWS_FRAMES.length) return null

  if (gtMobile) {
    return (
      <View style={[a.flex_row, a.gap_md, a.px_md, a.pb_md]}>
        {VIEWS_FRAMES.map(frame => (
          <View key={frame.id} style={[a.flex_1, {minWidth: 0}]}>
            <Frame frame={frame} />
          </View>
        ))}
      </View>
    )
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[a.gap_md, a.px_md, a.pb_md]}>
      {VIEWS_FRAMES.map(frame => (
        <View key={frame.id} style={{width: 280}}>
          <Frame frame={frame} />
        </View>
      ))}
    </ScrollView>
  )
}

function Frame({frame}: {frame: ViewsFrame}) {
  const t = useTheme()
  const body = (
    <View
      style={[
        a.w_full,
        a.rounded_lg,
        a.overflow_hidden,
        a.align_center,
        a.justify_center,
        t.atoms.bg_contrast_50,
        {aspectRatio: FRAME_ASPECT},
      ]}>
      {frame.image ? (
        <>
          <Image
            source={frame.image}
            style={[a.absolute, a.inset_0]}
            contentFit="cover"
            accessibilityIgnoresInvertColors
            accessibilityLabel={frame.alt}
            accessibilityHint=""
          />
          {frame.sponsored && (
            <View
              style={[
                a.absolute,
                a.rounded_full,
                a.px_sm,
                {
                  top: 8,
                  left: 8,
                  paddingVertical: 2,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                },
              ]}>
              <Text style={[a.text_2xs, a.font_bold, {color: '#fff'}]}>
                Patrocinado
              </Text>
            </View>
          )}
        </>
      ) : (
        <Text style={[a.text_2xl, a.text_center, t.atoms.text_contrast_medium]}>
          Views Frame
        </Text>
      )}
    </View>
  )

  if (!frame.href) return body
  return (
    <Link to={frame.href} label={frame.alt}>
      {body}
    </Link>
  )
}
