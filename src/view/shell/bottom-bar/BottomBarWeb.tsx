import React from 'react'
import {View} from 'react-native'
import {msg, plural, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useNavigationState} from '@react-navigation/native'

import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {useWebMediaQueries} from '#/lib/hooks/useWebMediaQueries'
import {getCurrentRoute, isTab} from '#/lib/routes/helpers'
import {makeProfileLink} from '#/lib/routes/links'
import {type CommonNavigatorParams} from '#/lib/routes/types'
import {useUnreadMessageCount} from '#/state/queries/messages/list-conversations'
import {useUnreadNotifications} from '#/state/queries/notifications/unread'
import {useSession} from '#/state/session'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {useShellLayout} from '#/state/shell/shell-layout'
import {useCloseAllActiveElements} from '#/state/util'
import {Link} from '#/view/com/util/Link'
import {Logo} from '#/view/icons/Logo'
import {Logotype} from '#/view/icons/Logotype'
import {atoms as a, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {
  Bell_Filled_Corner0_Rounded as BellFilled,
  Bell_Stroke2_Corner0_Rounded as Bell,
} from '#/components/icons/Bell'
import {
  HomeOpen_Filled_Corner0_Rounded as HomeFilled,
  HomeOpen_Stoke2_Corner0_Rounded as Home,
} from '#/components/icons/HomeOpen'
import {
  Message_Stroke2_Corner0_Rounded as Message,
  Message_Stroke2_Corner0_Rounded_Filled as MessageFilled,
} from '#/components/icons/Message'
import {
  Play_Filled_Corner2_Rounded as PlayFilled,
  Play_Stroke2_Corner2_Rounded as Play,
} from '#/components/icons/Play'
import {PlusLarge_Stroke2_Corner0_Rounded as PlusIcon} from '#/components/icons/Plus'
import {
  UserCircle_Filled_Corner0_Rounded as UserCircleFilled,
  UserCircle_Stroke2_Corner0_Rounded as UserCircle,
} from '#/components/icons/UserCircle'
import {Text} from '#/components/Typography'
import {styles} from './BottomBarStyles'

export function BottomBarWeb() {
  const {_} = useLingui()
  const {hasSession, currentAccount} = useSession()
  const t = useTheme()
  const {requestSwitchToAccount} = useLoggedOutViewControls()
  const closeAllActiveElements = useCloseAllActiveElements()
  const {footerHeight} = useShellLayout()
  const {isTabletOrDesktop} = useWebMediaQueries()
  const {openComposer} = useOpenComposer()
  const iconWidth = 24
  const showLabels = isTabletOrDesktop

  const unreadMessageCount = useUnreadMessageCount()
  const notificationCountStr = useUnreadNotifications()

  const showSignIn = React.useCallback(() => {
    closeAllActiveElements()
    requestSwitchToAccount({requestedAccount: 'none'})
  }, [requestSwitchToAccount, closeAllActiveElements])

  const showCreateAccount = React.useCallback(() => {
    closeAllActiveElements()
    requestSwitchToAccount({requestedAccount: 'new'})
  }, [requestSwitchToAccount, closeAllActiveElements])

  const dockSurface =
    t.scheme === 'dark' ? 'rgba(22, 24, 28, 0.78)' : 'rgba(255, 255, 255, 0.78)'
  const dockBorder =
    t.scheme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.08)'

  return (
    <View
      role="navigation"
      pointerEvents="box-none"
      style={[styles.bottomBar, styles.bottomBarWeb]}
      onLayout={event => footerHeight.set(event.nativeEvent.layout.height)}>
      {hasSession ? (
        <View
          style={[
            styles.dock,
            {
              backgroundColor: dockSurface,
              borderColor: dockBorder,
              boxShadow:
                t.scheme === 'dark'
                  ? '0 8px 28px rgba(0, 0, 0, 0.35)'
                  : '0 8px 28px rgba(15, 23, 42, 0.10)',
            },
            web({
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
            }),
          ]}>
          <NavItem
            routeName="Home"
            href="/"
            label="Home"
            showLabel={showLabels}>
            {({isActive}) => {
              const Icon = isActive ? HomeFilled : Home
              return (
                <Icon
                  aria-hidden={true}
                  width={iconWidth + 1}
                  style={[styles.ctrlIcon, t.atoms.text, styles.homeIcon]}
                />
              )
            }}
          </NavItem>
          <NavItem
            routeName="Drops"
            href="/drops"
            label="Drops"
            showLabel={showLabels}>
            {({isActive}) => {
              const Icon = isActive ? PlayFilled : Play
              return (
                <Icon
                  aria-hidden={true}
                  width={iconWidth + 2}
                  style={[styles.ctrlIcon, t.atoms.text, styles.searchIcon]}
                />
              )
            }}
          </NavItem>

          <View style={styles.createCtrl}>
            <Button
              onPress={() => openComposer({})}
              label="Create"
              style={[
                styles.createBtn,
                {backgroundColor: t.palette.primary_500},
              ]}>
              <PlusIcon
                aria-hidden={true}
                width={22}
                fill={t.palette.white}
                style={{color: t.palette.white}}
              />
            </Button>
            {showLabels && (
              <Text
                style={[
                  styles.ctrlLabel,
                  t.atoms.text_contrast_medium,
                  {marginTop: 4},
                ]}>
                Create
              </Text>
            )}
          </View>

          <NavItem
            routeName="Messages"
            href="/messages"
            label="Mailssage"
            notificationCount={unreadMessageCount.numUnread}
            hasNew={unreadMessageCount.hasNew}
            showLabel={showLabels}>
            {({isActive}) => {
              const Icon = isActive ? MessageFilled : Message
              return (
                <Icon
                  aria-hidden={true}
                  width={iconWidth - 1}
                  style={[styles.ctrlIcon, t.atoms.text, styles.messagesIcon]}
                />
              )
            }}
          </NavItem>
          <NavItem
            routeName="Notifications"
            href="/notifications"
            label="Notifications"
            notificationCount={notificationCountStr}
            showLabel={showLabels}>
            {({isActive}) => {
              const Icon = isActive ? BellFilled : Bell
              return (
                <Icon
                  aria-hidden={true}
                  width={iconWidth}
                  style={[styles.ctrlIcon, t.atoms.text, styles.bellIcon]}
                />
              )
            }}
          </NavItem>
          <NavItem
            routeName="Profile"
            href={
              currentAccount
                ? makeProfileLink({
                    did: currentAccount.did,
                    handle: currentAccount.handle,
                  })
                : '/'
            }
            label="Profile"
            showLabel={showLabels}>
            {({isActive}) => {
              const Icon = isActive ? UserCircleFilled : UserCircle
              return (
                <Icon
                  aria-hidden={true}
                  width={iconWidth}
                  style={[styles.ctrlIcon, t.atoms.text, styles.profileIcon]}
                />
              )
            }}
          </NavItem>
        </View>
      ) : (
        <View
          style={[
            styles.dock,
            {
              backgroundColor: dockSurface,
              borderColor: dockBorder,
            },
            web({
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
            }),
          ]}>
          <View
            style={{
              width: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 8,
              paddingBottom: 8,
              paddingLeft: 14,
              paddingRight: 6,
              gap: 8,
            }}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
              <Logo width={32} />
              <View style={{paddingTop: 4}}>
                <Logotype width={80} fill={t.atoms.text.color} />
              </View>
            </View>

            <View style={[a.flex_row, a.flex_wrap, a.gap_sm]}>
              <Button
                onPress={showCreateAccount}
                label={_(msg`Create account`)}
                size="small"
                variant="solid"
                color="primary">
                <ButtonText>
                  <Trans>Create account</Trans>
                </ButtonText>
              </Button>
              <Button
                onPress={showSignIn}
                label={_(msg`Sign in`)}
                size="small"
                variant="solid"
                color="secondary">
                <ButtonText>
                  <Trans>Sign in</Trans>
                </ButtonText>
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

const NavItem: React.FC<{
  children: (props: {isActive: boolean}) => React.ReactNode
  href: string
  routeName: string
  label: string
  showLabel?: boolean
  hasNew?: boolean
  notificationCount?: string
}> = ({
  children,
  href,
  routeName,
  label,
  showLabel,
  hasNew,
  notificationCount,
}) => {
  const t = useTheme()
  const {_} = useLingui()
  const {currentAccount} = useSession()
  const currentRoute = useNavigationState(state => {
    if (!state) {
      return {name: 'Home'}
    }
    return getCurrentRoute(state)
  })

  const isOnDifferentProfile =
    currentRoute.name === 'Profile' &&
    routeName === 'Profile' &&
    (currentRoute.params as CommonNavigatorParams['Profile']).name !==
      currentAccount?.handle

  const isActive =
    currentRoute.name === 'Profile'
      ? isTab(currentRoute.name, routeName) &&
        (currentRoute.params as CommonNavigatorParams['Profile']).name ===
          (routeName === 'Profile'
            ? currentAccount?.handle
            : (currentRoute.params as CommonNavigatorParams['Profile']).name)
      : isTab(currentRoute.name, routeName)

  return (
    <Link
      href={href}
      style={[styles.ctrl]}
      navigationAction={isOnDifferentProfile ? 'push' : 'navigate'}
      aria-role="link"
      aria-label={label}
      accessible={true}>
      {children({isActive})}
      {showLabel && (
        <Text
          style={[
            styles.ctrlLabel,
            isActive ? t.atoms.text : t.atoms.text_contrast_medium,
            isActive && a.font_bold,
          ]}>
          {label}
        </Text>
      )}
      {notificationCount ? (
        <View
          style={[
            styles.notificationCount,
            styles.notificationCountWeb,
            {backgroundColor: t.palette.primary_500},
          ]}
          aria-label={_(
            msg`${plural(notificationCount, {
              one: '# unread item',
              other: '# unread items',
            })}`,
          )}>
          <Text style={styles.notificationCountLabel}>{notificationCount}</Text>
        </View>
      ) : hasNew ? (
        <View style={styles.hasNewBadge} />
      ) : null}
    </Link>
  )
}
