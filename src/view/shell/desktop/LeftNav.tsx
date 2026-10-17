import {type JSX, useCallback, useMemo} from 'react'
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
import {emitSoftReset} from '#/state/events'
import {useUnreadMessageCount} from '#/state/queries/messages/list-conversations'
import {useUnreadNotifications} from '#/state/queries/notifications/unread'
import {useProfilesQuery} from '#/state/queries/profile'
import {useLiveUsersQuery} from '#/state/queries/streamplace'
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
import {
  Bell_Filled_Corner0_Rounded as BellFilled,
  Bell_Stroke2_Corner0_Rounded as Bell,
} from '#/components/icons/Bell'
import {DotGrid_Stroke2_Corner0_Rounded as EllipsisIcon} from '#/components/icons/DotGrid'
import {
  Drop_Filled_Corner0_Rounded as DropFilled,
  Drop_Stroke2_Corner0_Rounded as Drop,
} from '#/components/icons/Drop'
import {Globe_Stroke2_Corner0_Rounded as GlobeIcon} from '#/components/icons/Globe'
import {
  HomeOpen_Filled_Corner0_Rounded as HomeFilled,
  HomeOpen_Stoke2_Corner0_Rounded as Home,
} from '#/components/icons/HomeOpen'
import {MagnifyingGlass_Filled_Stroke2_Corner0_Rounded as SearchFilled} from '#/components/icons/MagnifyingGlass'
import {MagnifyingGlass2_Stroke2_Corner0_Rounded as SearchIcon} from '#/components/icons/MagnifyingGlass2'
import {
  Message_Stroke2_Corner0_Rounded as Message,
  Message_Stroke2_Corner0_Rounded_Filled as MessageFilled,
} from '#/components/icons/Message'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {Reads_Filled_Corner2_Rounded as Book} from '#/components/icons/Reads'
import {
  SettingsGear2_Filled_Corner0_Rounded as SettingsFilled,
  SettingsGear2_Stroke2_Corner0_Rounded as Settings,
} from '#/components/icons/SettingsGear2'
import {UserCircle_Stroke2_Corner0_Rounded as UserCircle} from '#/components/icons/UserCircle'
import {
  CENTER_COLUMN_HALF_WIDTH,
  CENTER_COLUMN_OFFSET,
  getNavEdgeInset,
  LEFT_NAV_WIDTH,
} from '#/components/Layout'
import {ViewIcon} from '#/components/media/ViewIcon'
import * as Menu from '#/components/Menu'
import * as Prompt from '#/components/Prompt'
import {Text} from '#/components/Typography'
import {PlatformInfo} from '../../../../modules/expo-bluesky-swiss-army'
import {router} from '../../../routes'

const NAV_ICON_WIDTH = 28
const uiAiIcon = require('../../../../assets/icons/ui-ai.png')
const visionboardIcon = require('../../../../assets/icons/visionboard.png')

function ProfileCard() {
  const {currentAccount, accounts} = useSession()
  const {logoutEveryAccount} = useSessionApi()
  const {isLoading, data} = useProfilesQuery({
    handles: accounts.map(acc => acc.did),
  })
  const profiles = data?.profiles
  const signOutPromptControl = Prompt.usePromptControl()
  const {leftNavMinimal} = useLayoutBreakpoints()
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

  return (
    <View style={[a.my_md, !leftNavMinimal && [a.w_full, a.align_start]]}>
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
                    {gap: 6},
                    !leftNavMinimal && [a.pl_lg, a.pr_md],
                  ]}>
                  <View
                    style={[
                      !PlatformInfo.getIsReducedMotionEnabled() && [
                        a.transition_transform,
                        {transitionDuration: '250ms'},
                        !active && a.transition_delay_50ms,
                      ],
                      a.relative,
                      a.z_10,
                      active && {
                        transform: [
                          {scale: !leftNavMinimal ? 2 / 3 : 0.8},
                          {translateX: !leftNavMinimal ? -22 : 0},
                        ],
                      },
                    ]}>
                    <UserAvatar
                      avatar={profile.avatar}
                      size={size}
                      type={profile?.associated?.labeler ? 'labeler' : 'user'}
                      live={live}
                    />
                  </View>
                  {!leftNavMinimal && (
                    <>
                      <View
                        style={[
                          a.flex_1,
                          a.transition_opacity,
                          !active && a.transition_delay_50ms,
                          {
                            marginLeft: tokens.space.xl * -1,
                            opacity: active ? 1 : 0,
                          },
                        ]}>
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
                      <EllipsisIcon
                        aria-hidden={true}
                        style={[
                          t.atoms.text_contrast_medium,
                          a.transition_opacity,
                          {opacity: active ? 1 : 0},
                        ]}
                        size="sm"
                      />
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
          style={[{borderRadius: size}, !leftNavMinimal && a.ml_lg]}
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
}
function NavItem({count, hasNew, href, icon, iconFilled, label}: NavItemProps) {
  const t = useTheme()
  const {_} = useLingui()
  const {currentAccount} = useSession()
  const {leftNavMinimal} = useLayoutBreakpoints()
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
    [navigation, href, isCurrent],
  )

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
      ]}
      hoverStyle={t.atoms.bg_contrast_25}
      // @ts-expect-error the function signature differs on web -prf
      onPress={onPressWrapped}
      href={href}
      dataSet={{noUnderline: 1}}
      role="link"
      accessibilityLabel={label}
      accessibilityHint="">
      <View
        style={[
          a.align_center,
          a.justify_center,
          {
            width: 24,
            height: 24,
          },
          leftNavMinimal && {
            width: 40,
            height: 40,
          },
        ]}>
        {isCurrent ? iconFilled : icon}
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
                leftNavMinimal && [
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
              leftNavMinimal && {
                right: 4,
                top: 2,
              },
            ]}
          />
        ) : null}
      </View>
      {!leftNavMinimal && (
        <Text style={[a.text_xl, isCurrent ? a.font_bold : a.font_normal]}>
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
  const {_} = useLingui()
  const {isDesktop} = useWebMediaQueries()
  const {leftNavMinimal, centerColumnOffset} = useLayoutBreakpoints()
  const {width: windowWidth} = useWindowDimensions()
  const {data: liveStreams} = useLiveUsersQuery()
  const hasLiveNow = !!liveStreams?.length

  const unreadMessageCount = useUnreadMessageCount()
  const notificationCountStr = useUnreadNotifications()

  if (!hasSession && !isDesktop) {
    return null
  }

  return (
    <View
      role="navigation"
      style={[
        a.px_xl,
        embedded ? styles.leftNavEmbedded : styles.leftNav,
        leftNavMinimal && styles.leftNavMinimal,
        embedded
          ? null
          : leftNavMinimal
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
            : // Plenty of guaranteed room in this (already-wide) breakpoint,
              // so anchor near the true left edge instead of the feed-relative
              // offset — avoids a growing dead margin on wide screens.
              {
                left: getNavEdgeInset(windowWidth, LEFT_NAV_WIDTH),
                transform: a.scrollbar_offset.transform,
              },
      ]}>
      {hasSession ? (
        <ProfileCard />
      ) : !leftNavMinimal ? (
        <View style={[a.pt_xl]}>
          <NavSignupCard />
        </View>
      ) : null}

      <NavItem
        href="/"
        icon={<Home width={NAV_ICON_WIDTH} style={pal.text} />}
        iconFilled={<HomeFilled width={NAV_ICON_WIDTH} style={pal.text} />}
        label="Início"
      />
      <NavItem
        href="/drops"
        icon={<Drop width={NAV_ICON_WIDTH} style={pal.text} />}
        iconFilled={<DropFilled width={NAV_ICON_WIDTH} style={pal.text} />}
        label="Drops"
      />
      <NavItem
        href="/search"
        icon={<SearchIcon width={NAV_ICON_WIDTH} style={pal.text} />}
        iconFilled={<SearchFilled width={NAV_ICON_WIDTH} style={pal.text} />}
        label="Buscar"
      />

      {hasSession && (
        <>
          <NavItem
            href="/notifications"
            icon={<Bell width={NAV_ICON_WIDTH} style={pal.text} />}
            iconFilled={<BellFilled width={NAV_ICON_WIDTH} style={pal.text} />}
            label="Notificações"
            count={notificationCountStr}
          />
          <NavItem
            href="/messages"
            icon={<Message width={NAV_ICON_WIDTH} style={pal.text} />}
            iconFilled={
              <MessageFilled width={NAV_ICON_WIDTH} style={pal.text} />
            }
            label="Mailssage"
            count={
              unreadMessageCount.numUnread > 0
                ? String(unreadMessageCount.numUnread)
                : undefined
            }
            hasNew={unreadMessageCount.hasNew}
          />
          <NavItem
            href="/views"
            icon={
              <ViewIcon
                introOnMount
                state={hasLiveNow ? 'live' : 'idle'}
                fill={pal.text.color}
                width={NAV_ICON_WIDTH}
              />
            }
            iconFilled={
              <ViewIcon
                introOnMount
                state={hasLiveNow ? 'live' : 'video'}
                fill={pal.text.color}
                width={NAV_ICON_WIDTH}
              />
            }
            label="Streams"
          />
          <NavItem
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
            href="/reads"
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
            label="Reads"
          />
          <NavItem
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

          <HubButtons />
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
    width: 86,
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
