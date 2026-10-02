import {View} from 'react-native'

import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {Text} from '#/components/Typography'

/** Horizontal single-select filter row (Drops, Visionboard, Reads). */
export function AdultFilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: {id: T; label: string}[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
      {options.map(option => (
        <Button
          key={option.id}
          label={option.label}
          size="small"
          variant={option.id === value ? 'solid' : 'outline'}
          color={option.id === value ? 'primary' : 'secondary'}
          onPress={() => onChange(option.id)}>
          <ButtonText>{option.label}</ButtonText>
        </Button>
      ))}
    </View>
  )
}

/**
 * Empty state for +18 areas with no content source yet. Content is not
 * wired until the hash-matching scanner (B2) and the +18 backends exist, so
 * nothing from the social graph is shown here.
 */
export function AdultAreaEmpty({
  title,
  description,
}: {
  title: string
  description: string
}) {
  const t = useTheme()
  return (
    <View style={[a.align_center, a.gap_sm, a.px_xl, a.py_5xl]}>
      <Text style={[a.text_lg, a.font_bold, a.text_center]}>{title}</Text>
      <Text style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
        {description}
      </Text>
    </View>
  )
}

/** Plain-language rule shown at the bottom of an area. */
export function AdultAreaNote({text}: {text: string}) {
  return (
    <View
      style={[
        a.p_md,
        a.rounded_md,
        {
          backgroundColor: '#fff3e0',
          borderLeftWidth: 3,
          borderColor: '#ff8a1f',
        },
      ]}>
      <Text style={[a.text_sm, {color: '#000'}]}>{text}</Text>
    </View>
  )
}
