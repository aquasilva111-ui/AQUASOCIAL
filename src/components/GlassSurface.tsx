import {type ReactNode} from 'react'
import {type StyleProp, View, type ViewStyle} from 'react-native'
import {GlassView, isLiquidGlassAvailable} from 'expo-glass-effect'

/**
 * A translucent surface. On iOS 26+ it renders the native Liquid Glass
 * effect. Everywhere else (older iOS, Android, web) it is a plain View that
 * uses `fallbackStyle`, which should carry the old translucent background.
 */
export function GlassSurface({
  children,
  style,
  fallbackStyle,
  effect = 'regular',
  tintColor,
  interactive,
  testID,
  pointerEvents,
}: {
  children?: ReactNode
  style?: StyleProp<ViewStyle>
  fallbackStyle?: StyleProp<ViewStyle>
  effect?: 'regular' | 'clear'
  tintColor?: string
  interactive?: boolean
  testID?: string
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only'
}) {
  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle={effect}
        tintColor={tintColor}
        isInteractive={interactive}
        style={style}
        testID={testID}
        pointerEvents={pointerEvents}>
        {children}
      </GlassView>
    )
  }
  return (
    <View
      style={[style, fallbackStyle]}
      testID={testID}
      pointerEvents={pointerEvents}>
      {children}
    </View>
  )
}
