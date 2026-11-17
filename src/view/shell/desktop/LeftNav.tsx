import {
  cloneElement,
  type JSX,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {Image, StyleSheet, useWindowDimensions, View} from 'react-native'
import {type AppBskyActorDefs} from '@atproto/api'
import {msg, plural, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useNavigation, useNavigationState} from '@react-navigation/native'

import {useActorStatus} from '#/lib/actor-status'
import {useAccountSwitcher} from '#/lib/hooks/useAccountSwitcher'
import {usePalette} from '#/lib/hooks/usePalette'
import {useWebMediaQueries} from '#/lib/hooks/useWebMediaQueries'
import {getCurrentRoute, isTab} from '#/lib/routes/helpers'
import {makeProfileLink} from '#/lib/routes/links'
import {
  type CommonNavigatorParams,
  type NavigationProp,
} from '#/lib/routes/types'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {isWeb} from '#/platform/detection'
import {useA11y} from '#/state/a11y'
import {emitSoftReset} from '#/state/events'
import {useProfilesQuery} from '#/state/queries/profile'
import {type SessionAccount, useSession, useSessionApi} from '#/state/session'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {useCloseAllActiveElements} from '#/state/util'
import {LoadingPlaceholder} from '#/view/com/util/LoadingPlaceholder'
import {PressableWithHover} from '#/view/com/util/PressableWithHover'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {HubButtons} from '#/view/shell/desktop/HubButtons'
import {NavSignupCard} from '#/view/shell/NavSignupCard'
import {atoms as a, tokens, useLayoutBreakpoints, useTheme, web} from '#/alf'
import {Button} from '#/components/Button'
import {type DialogControlProps} from '#/components/Dialog'
import {AquaLogo} from '#/components/icons/AquaLogo'
import {ArrowBoxLeft_Stroke2_Corner0_Rounded as LeaveIcon} from '#/components/icons/ArrowBoxLeft'
import {DotGrid_Stroke2_Corner0_Rounded as EllipsisIcon} from '#/components/icons/DotGrid'
import {Globe_Stroke2_Corner0_Rounded as GlobeIcon} from '#/components/icons/Globe'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Reads_Filled_Corner2_Rounded as Book} from '#/components/icons/Reads'
import {
  SettingsGear2_Filled_Corner0_Rounded as SettingsFilled,
  SettingsGear2_Stroke2_Corner0_Rounded as Settings,
} from '#/components/icons/SettingsGear2'
import {UserCircle_Stroke2_Corner0_Rounded as UserCircle} from '#/components/icons/UserCircle'
import {ViewsButterfly_Filled as ViewsButterfly} from '#/components/icons/ViewsButterfly'
import {
  CENTER_COLUMN_HALF_WIDTH,
  CENTER_COLUMN_OFFSET,
  getNavEdgeInset,
  LEFT_NAV_MINIMAL_WIDTH,
  LEFT_NAV_WIDTH,
  SIDEBAR_OPEN_WIDTH,
  SIDEBAR_RAIL_WIDTH,
} from '#/components/Layout'
import * as Menu from '#/components/Menu'
import * as Prompt from '#/components/Prompt'
import {Text} from '#/components/Typography'
import {PlatformInfo} from '../../../../modules/expo-bluesky-swiss-army'
import {router} from '../../../routes'

const NAV_ICON_WIDTH = 28
const RAIL_ICON = 24
const uiAiIcon = require('../../../../assets/icons/ui-ai.png')
const visionboardIcon = require('../../../../assets/icons/visionboard.png')

function tintRailIcon(node: JSX.Element, color: string) {
  return cloneElement(node, {
    width: RAIL_ICON,
    height: RAIL_ICON,
    tintColor: color,
    style: [node.props.style, {color, width: RAIL_ICON, height: RAIL_ICON}],
  })
}

function labelRevealStyle(hidden: boolean, reduceMotion: boolean) {
  return web({
    opacity: hidden ? 0 : 1,
    transform: hidden ? 'translateX(-6px)' : 'translateX(0px)',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    transitionProperty: reduceMotion ? 'none' : 'opacity, transform',
    transitionDuration: reduceMotion ? '0ms' : '160ms, 200ms',
    transitionDelay: reduceMotion || hidden ? '0ms' : '20ms, 0ms',
    transitionTimingFunction: 'ease-out',
  })
}

function ProfileCard({
  minimal,
  revealLabel,
}: {
  minimal: boolean
  revealLabel: boolean
}) {
  const {currentAccount, accounts} = useSession()
  const {logoutEveryAccount} = useSessionApi()
  const {isLoading, data} = useProfilesQuery({
    handles: accounts.map(acc => acc.did),
  })
  const profiles = data?.profiles
  const signOutPromptControl = Prompt.usePromptControl()
  const {reduceMotionEnabled} = useA11y()
  const {_} = useLingui()
  const t = useTheme()

  const size = 48

  const profile = profiles?.find(p => p.did === currentAccount!.did)
  const otherAccounts = accounts
    .filter(acc => acc.did !== currentAccount!.did)
    .map(account => ({
      account,
      profile: profiles?.find(p => p.did === account.did),
    }))

  const {isActive: live} = useActorStatus(profile)

  const showAccountText = revealLabel || !minimal

  return (
    <View
      style={[
        a.my_md,
        showAccountText && [a.w_full, a.align_start],
        revealLabel && {height: 48, marginTop: 2, marginBottom: 10},
      ]}>
      {!isLoading && profile ? (
        <Menu.Root>
          <Menu.Trigger label={_(msg`Switch accounts`)}>
            {({props, state, control}) => {
              const active = state.hovered || state.focused || control.isOpen
              return (
                <Button
                  label={props.accessibilityLabel}
                  {...props}
                  style={[
                    a.w_full,
                    a.transition_color,
                    active ? t.atoms.bg_contrast_25 : a.transition_delay_50ms,
                    a.rounded_full,
                    a.justify_between,
                    a.align_center,
                    a.flex_row,
                    {gap: revealLabel ? 0 : 6},
                    !minimal && !revealLabel && [a.pl_lg, a.pr_md],
                    revealLabel && {
                      height: 48,
                      paddingLeft: 0,
                      paddingRight: 0,
                      borderRadius: 999,
                    },
                  ]}>
                  <View
                    style={[
                      !revealLabel &&
                        !PlatformInfo.getIsReducedMotionEnabled() && [
                          a.transition_transform,
                          {transitionDuration: '250ms'},
                          !active && a.transition_delay_50ms,
                        ],
                      a.relative,
                      a.z_10,
                      revealLabel && {
                        width: SIDEBAR_RAIL_WIDTH,
                        height: 48,
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                      active &&
                        !revealLabel && {
                          transform: [
                            {scale: !minimal ? 2 / 3 : 0.8},
                            {translateX: !minimal ? -22 : 0},
                          ],
                        },
                    ]}>
                    <UserAvatar
                      avatar={profile.avatar}
                      size={revealLabel ? 40 : size}
                      type={profile?.associated?.labeler ? 'labeler' : 'user'}
                      live={live}
                    />
                  </View>
                  {showAccountText && (
                    <>
                      <View
                        style={[
                          !revealLabel && [
                            a.flex_1,
                            a.transition_opacity,
                            !active && a.transition_delay_50ms,
                            {
                              marginLeft: tokens.space.xl * -1,
                              opacity: active ? 1 : 0,
                            },
                          ],
                          revealLabel && [
                            a.flex_1,
                            a.flex_row,
                            a.align_center,
                            a.gap_sm,
                            labelRevealStyle(minimal, reduceMotionEnabled),
                          ],
                        ]}>
                        <View style={[a.flex_1]}>
                          <Text
                            style={[a.font_bold, a.text_sm, a.leading_snug]}
                            numberOfLines={1}>
                            {sanitizeDisplayName(
                              profile.displayName || profile.handle,
                            )}
                          </Text>
                          <Text
                            style={[
                              a.text_xs,
                              a.leading_snug,
                              t.atoms.text_contrast_medium,
                            ]}
                            numberOfLines={1}>
                            {sanitizeHandle(profile.handle, '@')}
                          </Text>
                        </View>
                        {revealLabel && (
                          <EllipsisIcon
                            aria-hidden={true}
                            style={t.atoms.text_contrast_medium}
                            size="sm"
                          />
                        )}
                      </View>
                      {!revealLabel && (
                        <EllipsisIcon
                          aria-hidden={true}
                          style={[
                            t.atoms.text_contrast_medium,
                            a.transition_opacity,
                            {opacity: active ? 1 : 0},
                          ]}
                          size="sm"
                        />
                      )}
                    </>
                  )}
                </Button>
              )
            }}
          </Menu.Trigger>
          <SwitchMenuItems
            accounts={otherAccounts}
            signOutPromptControl={signOutPromptControl}
          />
        </Menu.Root>
      ) : (
        <LoadingPlaceholder
          width={size}
          height={size}
          style={[{borderRadius: size}, !minimal && !revealLabel && a.ml_lg]}
        />
      )}
      <Prompt.Basic
        control={signOutPromptControl}
        title={_(msg`Sign out?`)}
        description={_(msg`You will be signed out of all your accounts.`)}
        onConfirm={() => logoutEveryAccount('Settings')}
        confirmButtonCta={_(msg`Sign out`)}
        cancelButtonCta={_(msg`Cancel`)}
        confirmButtonColor="negative"
      />
    </View>
  )
}

function SwitchMenuItems({
  accounts,
  signOutPromptControl,
}: {
  accounts:
    | {
        account: SessionAccount
        profile?: AppBskyActorDefs.ProfileViewDetailed
      }[]
    | undefined
  signOutPromptControl: DialogControlProps
}) {
  const {_} = useLingui()
  const {setShowLoggedOut} = useLoggedOutViewControls()
  const closeEverything = useCloseAllActiveElements()

  const onAddAnotherAccount = () => {
    setShowLoggedOut(true)
    closeEverything()
  }

  return (
    <Menu.Outer>
      {accounts && accounts.length > 0 && (
        <>
          <Menu.Group>
            <Menu.LabelText>
              <Trans>Switch account</Trans>
            </Menu.LabelText>
            {accounts.map(other => (
              <SwitchMenuItem
                key={other.account.did}
                account={other.account}
                profile={other.profile}
              />
            ))}
          </Menu.Group>
          <Menu.Divider />
        </>
      )}
      <SwitcherMenuProfileLink />
      <Menu.Item
        label={_(msg`Add another account`)}
        onPress={onAddAnotherAccount}>
        <Menu.ItemIcon icon={PlusIcon} />
        <Menu.ItemText>
          <Trans>Add another account</Trans>
        </Menu.ItemText>
      </Menu.Item>
      <Menu.Item label={_(msg`Sign out`)} onPress={signOutPromptControl.open}>
        <Menu.ItemIcon icon={LeaveIcon} />
        <Menu.ItemText>
          <Trans>Sign out</Trans>
        </Menu.ItemText>
      </Menu.Item>
    </Menu.Outer>
  )
}

function SwitcherMenuProfileLink() {
  const {_} = useLingui()
  const {currentAccount} = useSession()
  const navigation = useNavigation()
  const context = Menu.useMenuContext()
  const profileLink = currentAccount ? makeProfileLink(currentAccount) : '/'
  const [pathName] = useMemo(() => router.matchPath(profileLink), [profileLink])
  const currentRouteInfo = useNavigationState(state => {
    if (!state) {
      return {name: 'Home'}
    }
    return getCurrentRoute(state)
  })
  let isCurrent =
    currentRouteInfo.name === 'Profile'
      ? isTab(currentRouteInfo.name, pathName) &&
        (currentRouteInfo.params as CommonNavigatorParams['Profile']).name ===
          currentAccount?.handle
      : isTab(currentRouteInfo.name, pathName)
  const onProfilePress = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return
      }
      e.preventDefault()
      context.control.close()
      if (isCurrent) {
        emitSoftReset()
      } else {
        const [screen, params] = router.matchPath(profileLink)
        // @ts-expect-error TODO: type matchPath well enough that it can be plugged into navigation.navigate directly
        navigation.navigate(screen, params, {pop: true})
      }
    },
    [navigation, profileLink, isCurrent, context],
  )
  return (
    <Menu.Item
      label={_(msg`Go to profile`)}
      // @ts-expect-error The function signature differs on web -inb
      onPress={onProfilePress}
      href={profileLink}>
      <Menu.ItemIcon icon={UserCircle} />
      <Menu.ItemText>
        <Trans>Go to profile</Trans>
      </Menu.ItemText>
    </Menu.Item>
  )
}

function SwitchMenuItem({
  account,
  profile,
}: {
  account: SessionAccount
  profile: AppBskyActorDefs.ProfileViewDetailed | undefined
}) {
  const {_} = useLingui()
  const {onPressSwitchAccount, pendingDid} = useAccountSwitcher()
  const {isActive: live} = useActorStatus(profile)

  return (
    <Menu.Item
      disabled={!!pendingDid}
      style={[a.gap_sm, {minWidth: 150}]}
      key={account.did}
      label={_(
        msg`Switch to ${sanitizeHandle(
          profile?.handle ?? account.handle,
          '@',
        )}`,
      )}
      onPress={() => onPressSwitchAccount(account, 'SwitchAccount')}>
      <View>
        <UserAvatar
          avatar={profile?.avatar}
          size={20}
          type={profile?.associated?.labeler ? 'labeler' : 'user'}
          live={live}
          hideLiveBadge
        />
      </View>
      <Menu.ItemText>
        {sanitizeHandle(profile?.handle ?? account.handle, '@')}
      </Menu.ItemText>
    </Menu.Item>
  )
}

interface NavItemProps {
  count?: string
  hasNew?: boolean
  href: string
  icon: JSX.Element
  iconFilled: JSX.Element
  label: string
  minimal: boolean
  /** Desktop hover: keep the icon slot and fade the label instead of unmounting it. */
  revealLabel: boolean
  /** Coarse pointer: the first press opens the rail instead of navigating. */
  holdNavigation?: boolean
  onRequestOpen?: () => void
}
function NavItem({
  count,
  hasNew,
  href,
  icon,
  iconFilled,
  label,
  minimal,
  revealLabel,
  holdNavigation,
  onRequestOpen,
}: NavItemProps) {
  const t = useTheme()
  const {_} = useLingui()
  const {currentAccount} = useSession()
  const {reduceMotionEnabled} = useA11y()
  const iconSlot = minimal || revealLabel ? 40 : 24
  const [pathName] = useMemo(() => router.matchPath(href), [href])
  const currentRouteInfo = useNavigationState(state => {
    if (!state) {
      return {name: 'Home'}
    }
    return getCurrentRoute(state)
  })
  let isCurrent =
    currentRouteInfo.name === 'Profile'
      ? isTab(currentRouteInfo.name, pathName) &&
        (currentRouteInfo.params as CommonNavigatorParams['Profile']).name ===
          currentAccount?.handle
      : isTab(currentRouteInfo.name, pathName)
  const navigation = useNavigation<NavigationProp>()
  const onPressWrapped = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
      if (holdNavigation) {
        e.preventDefault()
        onRequestOpen?.()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return
      }
      e.preventDefault()
      if (isCurrent) {
        emitSoftReset()
      } else {
        const [screen, params] = router.matchPath(href)
        // @ts-expect-error TODO: type matchPath well enough that it can be plugged into navigation.navigate directly
        navigation.navigate(screen, params, {pop: true})
      }
    },
    [navigation, href, isCurrent, holdNavigation, onRequestOpen],
  )

  const night = t.scheme === 'dark'
  const railInk = night ? '#E8EEF7' : '#0F172A'
  const railAccent = night ? '#7EC8F5' : '#002BEF'
  const shownIcon = revealLabel
    ? tintRailIcon(
        isCurrent ? iconFilled : icon,
        isCurrent ? railAccent : railInk,
      )
    : isCurrent
      ? iconFilled
      : icon

  return (
    <PressableWithHover
      style={[
        a.flex_row,
        a.align_center,
        a.p_md,
        a.rounded_sm,
        a.gap_sm,
        a.outline_inset_1,
        a.transition_color,
        revealLabel && {
          height: 48,
          marginHorizontal: 8,
          padding: 0,
          borderRadius: 999,
          backgroundColor:
            isCurrent && night
              ? 'rgba(126,200,245,0.14)'
              : isCurrent
                ? 'rgba(0,43,239,0.08)'
                : 'transparent',
        },
      ]}
      hoverStyle={
        revealLabel
          ? {
              backgroundColor: night
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(15,23,42,0.05)',
            }
          : t.atoms.bg_contrast_25
      }
      // @ts-expect-error the function signature differs on web -prf
      onPress={onPressWrapped}
      href={href}
      dataSet={{noUnderline: 1}}
      role="link"
      accessibilityLabel={label}
      accessibilityHint=""
      aria-current={isCurrent ? 'page' : undefined}>
      <View
        style={[
          a.align_center,
          a.justify_center,
          {
            width: revealLabel ? SIDEBAR_RAIL_WIDTH - 16 : iconSlot,
            height: revealLabel ? 48 : iconSlot,
          },
        ]}>
        {shownIcon}
        {typeof count === 'string' && count ? (
          <View
            style={[
              a.absolute,
              a.inset_0,
              {right: -20}, // more breathing room
            ]}>
            <Text
              accessibilityLabel={_(
                msg`${plural(count, {
                  one: '# unread item',
                  other: '# unread items',
                })}`,
              )}
              accessibilityHint=""
              accessible={true}
              numberOfLines={1}
              style={[
                a.absolute,
                a.text_xs,
                a.font_semi_bold,
                a.rounded_full,
                a.text_center,
                a.leading_tight,
                a.z_20,
                {
                  top: '-10%',
                  left: count.length === 1 ? 12 : 8,
                  backgroundColor: t.palette.primary_500,
                  color: t.palette.white,
                  lineHeight: a.text_sm.fontSize,
                  paddingHorizontal: 4,
                  paddingVertical: 1,
                  minWidth: 16,
                },
                (minimal || revealLabel) && [
                  {
                    top: '10%',
                    left: count.length === 1 ? 20 : 16,
                  },
                ],
              ]}>
              {count}
            </Text>
          </View>
        ) : hasNew ? (
          <View
            style={[
              a.absolute,
              a.rounded_full,
              a.z_20,
              {
                backgroundColor: t.palette.primary_500,
                width: 8,
                height: 8,
                right: -2,
                top: -4,
              },
              (minimal || revealLabel) && {
                right: 4,
                top: 2,
              },
            ]}
          />
        ) : null}
      </View>
      {(revealLabel || !minimal) && (
        <Text
          numberOfLines={1}
          style={[
            a.text_xl,
            isCurrent ? a.font_bold : a.font_normal,
            revealLabel && a.flex_1,
            revealLabel && labelRevealStyle(minimal, reduceMotionEnabled),
          ]}>
          {label}
        </Text>
      )}
    </PressableWithHover>
  )
}

/**
 * `embedded`: render inside a column (e.g. IU & AI's collapsible) instead of
 * floating fixed over the page, so it pushes content rather than covering it.
 */
export function DesktopLeftNav({embedded = false}: {embedded?: boolean} = {}) {
  const {hasSession} = useSession()
  const pal = usePalette('default')
  const t = useTheme()
  const {_} = useLingui()
  const {reduceMotionEnabled} = useA11y()
  const {isDesktop} = useWebMediaQueries()
  const {leftNavMinimal, centerColumnOffset} = useLayoutBreakpoints()
  const {width: windowWidth} = useWindowDimensions()
  const [open, setOpen] = useState(false)
  const [coarsePointer, setCoarsePointer] = useState(false)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const railRef = useRef<View>(null)

  // Wide web desktop only. The tablet rail stays icon-only, native never
  // mounts this overlay, and the embedded IU & AI column keeps its own toggle.
  const hoverCapable = !embedded && !leftNavMinimal
  const collapsed = leftNavMinimal || (hoverCapable && !open)
  const night = t.scheme === 'dark'

  const clearRailTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
    openTimer.current = null
    closeTimer.current = null
  }, [])

  const openNow = useCallback(() => {
    clearRailTimers()
    setOpen(true)
  }, [clearRailTimers])

  const scheduleOpen = useCallback(() => {
    clearRailTimers()
    const delay = reduceMotionEnabled ? 0 : 120
    openTimer.current = setTimeout(() => setOpen(true), delay)
  }, [clearRailTimers, reduceMotionEnabled])

  const scheduleClose = useCallback(
    (delayMs: number) => {
      clearRailTimers()
      const delay = reduceMotionEnabled ? 0 : delayMs
      closeTimer.current = setTimeout(() => setOpen(false), delay)
    },
    [clearRailTimers, reduceMotionEnabled],
  )

  useEffect(() => clearRailTimers, [clearRailTimers])

  useEffect(() => {
    if (!hoverCapable || !isWeb || typeof document === 'undefined') return
    const accent = night ? '#7EC8F5' : '#002BEF'
    const ring = night ? '#000' : '#fff'
    const el = document.createElement('style')
    el.setAttribute('data-sidebar-rail-focus', '1')
    el.textContent = `[data-sidebar-rail] a:focus-visible,[data-sidebar-rail] [role="link"]:focus-visible{box-shadow:0 0 0 2px ${ring},0 0 0 4px ${accent};}`
    document.head.appendChild(el)
    return () => el.remove()
  }, [hoverCapable, night])

  useEffect(() => {
    if (!hoverCapable || !isWeb || typeof window === 'undefined') return
    const hoverNone = window.matchMedia('(hover: none)')
    const coarse = window.matchMedia('(pointer: coarse)')
    const update = () => setCoarsePointer(hoverNone.matches || coarse.matches)
    update()
    hoverNone.addEventListener?.('change', update)
    coarse.addEventListener?.('change', update)
    return () => {
      hoverNone.removeEventListener?.('change', update)
      coarse.removeEventListener?.('change', update)
    }
  }, [hoverCapable])

  useEffect(() => {
    if (!hoverCapable || !open || !coarsePointer || !isWeb) return
    const onDown = (event: PointerEvent) => {
      const root = railRef.current as unknown as HTMLElement | null
      if (
        root &&
        event.target instanceof Node &&
        !root.contains(event.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [hoverCapable, open, coarsePointer])

  if (!hasSession && !isDesktop) {
    return null
  }

  const holdNavigation = hoverCapable && coarsePointer && !open

  return (
    <View
      ref={railRef}
      role="navigation"
      accessibilityLabel={hoverCapable ? 'Menu principal' : undefined}
      accessibilityHint=""
      dataSet={hoverCapable ? {sidebarRail: '1'} : undefined}
      {...web(
        hoverCapable
          ? {
              onMouseEnter: () => {
                if (!coarsePointer) scheduleOpen()
              },
              onMouseLeave: () => {
                if (!coarsePointer) scheduleClose(100)
              },
              onFocus: () => openNow(),
              onBlur: (event: {
                nativeEvent?: {relatedTarget?: EventTarget | null}
              }) => {
                const next = event.nativeEvent?.relatedTarget
                const root = railRef.current as unknown as HTMLElement | null
                if (root && next instanceof Node && root.contains(next)) return
                scheduleClose(80)
              },
              onKeyDown: (event: {key?: string}) => {
                if (event.key !== 'Escape') return
                setOpen(false)
                const active = document.activeElement
                if (active instanceof HTMLElement) active.blur()
              },
            }
          : {},
      )}
      style={[
        a.px_xl,
        embedded ? styles.leftNavEmbedded : styles.leftNav,
        collapsed && !hoverCapable && styles.leftNavMinimal,
        !embedded &&
          !hoverCapable &&
          (leftNavMinimal
            ? {
                transform: [
                  {
                    translateX:
                      -CENTER_COLUMN_HALF_WIDTH +
                      (centerColumnOffset ? CENTER_COLUMN_OFFSET : 0),
                  },
                  {translateX: '-100%'},
                  ...a.scrollbar_offset.transform,
                ],
              }
            : {
                left: getNavEdgeInset(windowWidth, LEFT_NAV_WIDTH),
                transform: a.scrollbar_offset.transform,
              }),
        hoverCapable && {
          left: 0,
          top: 0,
          bottom: 0,
          width: open ? SIDEBAR_OPEN_WIDTH : SIDEBAR_RAIL_WIDTH,
          paddingTop: 14,
          paddingBottom: 16,
          paddingLeft: 0,
          paddingRight: 0,
          height: '100vh',
          zIndex: 20,
          flexDirection: 'column',
          transform: [],
          ...web({
            overflow: 'hidden',
            backgroundColor: night
              ? 'rgba(255,255,255,0.07)'
              : 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(18px) saturate(160%)',
            WebkitBackdropFilter: 'blur(18px) saturate(160%)',
            borderRightWidth: 1,
            borderRightStyle: 'solid',
            borderRightColor: open
              ? night
                ? 'rgba(255,255,255,0.16)'
                : 'rgba(255,255,255,0.85)'
              : night
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(15,23,42,0.06)',
            boxShadow: open
              ? night
                ? '8px 0 32px rgba(0,0,0,.5), 0 8px 24px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08)'
                : '8px 0 32px rgba(15,23,42,.08), 0 8px 24px rgba(0,43,239,.08), inset 0 1px 0 #fff'
              : 'none',
            transitionProperty: reduceMotionEnabled
              ? 'none'
              : 'width, box-shadow, border-color, background-color',
            transitionDuration: reduceMotionEnabled ? '0ms' : '200ms',
            transitionTimingFunction: 'ease-out',
          }),
        },
      ]}>
      {hasSession ? (
        <ProfileCard minimal={collapsed} revealLabel={hoverCapable} />
      ) : !collapsed ? (
        <View style={[a.pt_xl, hoverCapable && {paddingLeft: 20}]}>
          <NavSignupCard />
        </View>
      ) : null}

      {hasSession && (
        <>
          <NavItem
            minimal={collapsed}
            revealLabel={hoverCapable}
            holdNavigation={holdNavigation}
            onRequestOpen={openNow}
            href="/views"
            icon={<ViewsButterfly width={NAV_ICON_WIDTH} style={pal.text} />}
            iconFilled={
              <ViewsButterfly width={NAV_ICON_WIDTH} style={pal.text} />
            }
            label="Views"
          />
          <NavItem
            minimal={collapsed}
            revealLabel={hoverCapable}
            holdNavigation={holdNavigation}
            onRequestOpen={openNow}
            href="/visionboard"
            icon={
              <Image
                accessibilityIgnoresInvertColors
                source={visionboardIcon}
                style={{
                  width: NAV_ICON_WIDTH,
                  height: NAV_ICON_WIDTH,
                  tintColor: pal.text.color,
                }}
              />
            }
            iconFilled={
              <Image
                accessibilityIgnoresInvertColors
                source={visionboardIcon}
                style={{
                  width: NAV_ICON_WIDTH,
                  height: NAV_ICON_WIDTH,
                  tintColor: pal.text.color,
                }}
              />
            }
            label="Visionboard"
          />
          <NavItem
            minimal={collapsed}
            revealLabel={hoverCapable}
            holdNavigation={holdNavigation}
            onRequestOpen={openNow}
            href="/books"
            icon={
              <Book
                aria-hidden={true}
                width={NAV_ICON_WIDTH}
                style={pal.text}
              />
            }
            iconFilled={
              <Book
                aria-hidden={true}
                width={NAV_ICON_WIDTH}
                style={pal.text}
              />
            }
            label="Write"
          />
          <NavItem
            minimal={collapsed}
            revealLabel={hoverCapable}
            holdNavigation={holdNavigation}
            onRequestOpen={openNow}
            href="/noticias"
            icon={
              <GlobeIcon
                aria-hidden={true}
                width={NAV_ICON_WIDTH}
                style={pal.text}
              />
            }
            iconFilled={
              <GlobeIcon
                aria-hidden={true}
                width={NAV_ICON_WIDTH}
                style={pal.text}
              />
            }
            label="Notícias"
          />
          <NavItem
            minimal={collapsed}
            revealLabel={hoverCapable}
            holdNavigation={holdNavigation}
            onRequestOpen={openNow}
            href="/ui-ai"
            icon={
              <Image
                accessibilityIgnoresInvertColors
                source={uiAiIcon}
                style={{
                  width: NAV_ICON_WIDTH,
                  height: NAV_ICON_WIDTH,
                  tintColor: pal.text.color,
                }}
              />
            }
            iconFilled={
              <Image
                accessibilityIgnoresInvertColors
                source={uiAiIcon}
                style={{
                  width: NAV_ICON_WIDTH,
                  height: NAV_ICON_WIDTH,
                  tintColor: pal.text.color,
                }}
              />
            }
            label="IU & AI"
          />
          <NavItem
            minimal={collapsed}
            revealLabel={hoverCapable}
            holdNavigation={holdNavigation}
            onRequestOpen={openNow}
            href="/adult"
            icon={
              <AquaLogo
                aria-hidden={true}
                width={NAV_ICON_WIDTH}
                style={pal.text}
              />
            }
            iconFilled={
              <AquaLogo
                aria-hidden={true}
                width={NAV_ICON_WIDTH}
                style={pal.text}
              />
            }
            label="+18 Content"
          />
          <NavItem
            minimal={collapsed}
            revealLabel={hoverCapable}
            holdNavigation={holdNavigation}
            onRequestOpen={openNow}
            href="/settings"
            icon={
              <Settings
                aria-hidden={true}
                width={NAV_ICON_WIDTH}
                style={pal.text}
              />
            }
            iconFilled={
              <SettingsFilled
                aria-hidden={true}
                width={NAV_ICON_WIDTH}
                style={pal.text}
              />
            }
            label={_(msg`Settings`)}
          />

          {hoverCapable && <View style={{flex: 1, minHeight: 8}} />}
          <HubButtons
            flush={hoverCapable}
            minimal={collapsed}
            rail={hoverCapable}
            open={hoverCapable && !collapsed}
            reduceMotion={reduceMotionEnabled}
            holdNavigation={holdNavigation}
            onFirstPress={openNow}
          />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  leftNav: {
    ...a.fixed,
    top: 0,
    paddingTop: 10,
    paddingBottom: 110,
    left: '50%',
    width: LEFT_NAV_WIDTH,
    // @ts-expect-error web only
    maxHeight: '100vh',
    overflowY: 'auto',
  },
  leftNavEmbedded: {
    position: 'relative',
    paddingTop: 10,
    paddingBottom: 40,
    width: LEFT_NAV_WIDTH,
    height: '100%',
    // @ts-expect-error web only
    overflowY: 'auto',
  },
  leftNavMinimal: {
    paddingTop: 0,
    paddingBottom: 110,
    paddingLeft: 0,
    paddingRight: 0,
    height: '100%',
    width: LEFT_NAV_MINIMAL_WIDTH,
    alignItems: 'center',
    ...web({overflowX: 'hidden'}),
  },
  backBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 30,
    height: 30,
  },
})
