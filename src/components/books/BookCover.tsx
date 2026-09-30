import {View} from 'react-native'
import {Image} from 'expo-image'

import {atoms as a} from '#/alf'
import {Text} from '#/components/Typography'

const COLORS = [
  '#0b4f8a',
  '#6b2a5c',
  '#1f3b2d',
  '#2b2a5a',
  '#8a3b0b',
  '#0a5c63',
]

function colorFor(title: string) {
  let h = 0
  for (let i = 0; i < title.length; i++)
    h = (h * 31 + title.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

/** Cover blob when the book has one, otherwise a solid cover with the title. */
export function BookCover({
  title,
  url,
  width,
}: {
  title: string
  url?: string
  width: number
}) {
  const height = Math.round(width * 1.45)
  return (
    <View
      style={[
        a.rounded_sm,
        a.overflow_hidden,
        {width, height, backgroundColor: colorFor(title)},
      ]}
      accessibilityLabel={`Capa de ${title}`}
      accessibilityHint=""
      accessibilityRole="image">
      {url ? (
        <Image
          source={{uri: url}}
          style={[a.w_full, a.h_full]}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={[a.flex_1, a.justify_end, {padding: Math.max(6, width / 12)}]}>
          <Text
            numberOfLines={4}
            style={[
              a.font_bold,
              {color: '#fff', fontSize: Math.max(11, width / 8)},
            ]}>
            {title}
          </Text>
        </View>
      )}
    </View>
  )
}
