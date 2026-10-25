import {createContext, useContext, useMemo} from 'react'
import {type GestureResponderEvent, type Insets, type View} from 'react-native'

import {useHaptics} from '#/lib/haptics'
import {atoms as a, useTheme} from '#/alf'
import {aquaGlass, GLASS_ICON} from '#/components/AquaPostCard/glass'
import {Button, type ButtonProps} from '#/components/Button'
import {type Props as SVGIconProps} from '#/components/icons/common'
import {Text, type TextProps} from '#/components/Typography'

export const DEFAULT_HITSLOP = {top: 5, bottom: 10, left: 10, right: 10}

const PostControlContext = createContext<{
  big?: boolean
  glass?: boolean
  active?: boolean
  color?: {color: string}
}>({})
PostControlContext.displayName = 'PostControlContext'

// Base button style, which the the other ones extend
export function PostControlButton({
  ref,
  onPress,
  onLongPress,
  children,
  big,
  glass,
  active,
  activeColor,
  iconColor,
  ...props
}: Omit<ButtonProps, 'hitSlop'> & {
  ref?: React.Ref<View>
  active?: boolean
  big?: boolean
  /** Glass capsule, used by the Aqua action bar. */
  glass?: boolean
  color?: string
  /** Icon fill when the control is not in its active color. */
  iconColor?: string
  activeColor?: string
  hitSlop?: Insets
}) {
  const t = useTheme()
  const playHaptic = useHaptics()
  const light = t.name === 'light'

  const ctx = useMemo(
    () => ({
      big,
      glass,
      active,
      color: {
        color:
          activeColor && active
            ? activeColor
            : (iconColor ?? t.palette.contrast_500),
      },
    }),
    [big, glass, active, activeColor, iconColor, t.palette.contrast_500],
  )

  const style = useMemo(
    () =>
      glass
        ? [
            a.align_center,
            a.justify_center,
            a.rounded_full,
            aquaGlass(light),
            {width: GLASS_ICON, height: GLASS_ICON, padding: 0},
          ]
        : [
            a.flex_row,
            a.align_center,
            a.gap_xs,
            a.bg_transparent,
            {padding: 5},
          ],
    [glass, light],
  )

  const handlePress = useMemo(() => {
    if (!onPress) return
    return (evt: GestureResponderEvent) => {
      playHaptic('Light')
      onPress(evt)
    }
  }, [onPress, playHaptic])

  const handleLongPress = useMemo(() => {
    if (!onLongPress) return
    return (evt: GestureResponderEvent) => {
      playHaptic('Heavy')
      onLongPress(evt)
    }
  }, [onLongPress, playHaptic])

  const {style: styleProp, hoverStyle: hoverStyleProp, ...rest} = props
  const glassHover = {
    backgroundColor: light ? 'rgba(255,255,255,0.8)' : 'rgba(15,23,42,0.85)',
  }

  return (
    <Button
      ref={ref}
      onPress={handlePress}
      onLongPress={handleLongPress}
      shape="round"
      variant="ghost"
      color="secondary"
      {...rest}
      // Glass wins over trigger props (the share menu spreads Radix props).
      style={glass ? [styleProp, style] : [style, styleProp]}
      hoverStyle={glass ? glassHover : [t.atoms.bg_contrast_25, hoverStyleProp]}
      hitSlop={{
        ...DEFAULT_HITSLOP,
        ...(props.hitSlop || {}),
      }}>
      {typeof children === 'function' ? (
        args => (
          <PostControlContext.Provider value={ctx}>
            {children(args)}
          </PostControlContext.Provider>
        )
      ) : (
        <PostControlContext.Provider value={ctx}>
          {children}
        </PostControlContext.Provider>
      )}
    </Button>
  )
}

export function PostControlButtonIcon({
  icon: Comp,
  style,
  ...rest
}: SVGIconProps & {
  icon: React.ComponentType<SVGIconProps>
}) {
  const {big, glass, color} = useContext(PostControlContext)

  return (
    <Comp
      style={[color, a.pointer_events_none, style]}
      {...rest}
      width={glass ? 21 : big ? 22 : 18}
    />
  )
}

export function PostControlButtonText({style, ...props}: TextProps) {
  const {big, active, color} = useContext(PostControlContext)

  return (
    <Text
      style={[
        color,
        big ? a.text_md : a.text_sm,
        active && a.font_semi_bold,
        style,
      ]}
      {...props}
    />
  )
}
