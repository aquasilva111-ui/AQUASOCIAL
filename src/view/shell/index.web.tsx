import {useEffect, useLayoutEffect, useState} from 'react'
import {StyleSheet, TouchableWithoutFeedback, View} from 'react-native'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useNavigation} from '@react-navigation/native'
import {RemoveScrollBar} from 'react-remove-scroll-bar'

import {useIntentHandler} from '#/lib/hooks/useIntentHandler'
import {useWebMediaQueries} from '#/lib/hooks/useWebMediaQueries'
import {type NavigationProp} from '#/lib/routes/types'
import {useIsDrawerOpen, useSetDrawerOpen} from '#/state/shell'
import {useComposerKeyboardShortcut} from '#/state/shell/composer/useComposerKeyboardShortcut'
import {useCloseAllActiveElements} from '#/state/util'
import {Lightbox} from '#/view/com/lightbox/Lightbox'
import {ModalsContainer} from '#/view/com/modals/Modal'
import {ErrorBoundary} from '#/view/com/util/ErrorBoundary'
import {atoms as a, select, useTheme} from '#/alf'
import {AgeAssuranceRedirectDialog} from '#/components/ageAssurance/AgeAssuranceRedirectDialog'
import {EmailDialog} from '#/components/dialogs/EmailDialog'
import {LinkWarningDialog} from '#/components/dialogs/LinkWarning'
import {MutedWordsDialog} from '#/components/dialogs/MutedWords'
import {SigninDialog} from '#/components/dialogs/Signin'
import {useWelcomeModal} from '#/components/hooks/useWelcomeModal'
import {
  Outlet as PolicyUpdateOverlayPortalOutlet,
  usePolicyUpdateContext,
} from '#/components/PolicyUpdateOverlay'
import {Outlet as PortalOutlet} from '#/components/Portal'
import {ViewMiniPlayer} from '#/components/view-watch/MiniPlayer'
import {WelcomeModal} from '#/components/WelcomeModal'
import {useAgeAssurance} from '#/ageAssurance'
import {NoAccessScreen} from '#/ageAssurance/components/NoAccessScreen'
import {RedirectOverlay} from '#/ageAssurance/components/RedirectOverlay'
import {FlatNavigator, RoutesContainer} from '#/Navigation'
import {Composer} from './Composer.web'
import {DrawerContent} from './Drawer'

function ShellInner() {
  const t = useTheme()
  const isDrawerOpen = useIsDrawerOpen()
  const setDrawerOpen = useSetDrawerOpen()
  const {isDesktop} = useWebMediaQueries()
  const navigator = useNavigation<NavigationProp>()
  const closeAllActiveElements = useCloseAllActiveElements()
  const {_} = useLingui()
  const showDrawer = !isDesktop && isDrawerOpen
  const [showDrawerDelayedExit, setShowDrawerDelayedExit] = useState(showDrawer)
  const {state: policyUpdateState} = usePolicyUpdateContext()
  const welcomeModalControl = useWelcomeModal()

  useLayoutEffect(() => {
    if (showDrawer !== showDrawerDelayedExit) {
      if (showDrawer) {
        setShowDrawerDelayedExit(true)
      } else {
        const timeout = setTimeout(() => {
          setShowDrawerDelayedExit(false)
        }, 160)
        return () => clearTimeout(timeout)
      }
    }
  }, [showDrawer, showDrawerDelayedExit])

  useComposerKeyboardShortcut()
  useIntentHandler()

  useEffect(() => {
    const unsubscribe = navigator.addListener('state', () => {
      closeAllActiveElements()
    })
    return unsubscribe
  }, [navigator, closeAllActiveElements])

  return (
    <>
      <ErrorBoundary>
        <FlatNavigator />
      </ErrorBoundary>
      <Composer winHeight={0} />
      <ViewMiniPlayer />
      <ModalsContainer />
      <MutedWordsDialog />
      <SigninDialog />
      <EmailDialog />
      <AgeAssuranceRedirectDialog />
      <LinkWarningDialog />
      <Lightbox />

      {welcomeModalControl.isOpen && (
        <WelcomeModal control={welcomeModalControl} />
      )}

      {/* Until policy update has been completed by the user, don't render anything that is portaled */}
      {policyUpdateState.completed && (
        <>
          <PortalOutlet />
        </>
      )}

      {showDrawerDelayedExit && (
        <>
          <RemoveScrollBar />
          <TouchableWithoutFeedback
            onPress={ev => {
              // Only close if press happens outside of the drawer
              if (ev.target === ev.currentTarget) {
                setDrawerOpen(false)
              }
            }}
            accessibilityLabel={_(msg`Close drawer menu`)}
            accessibilityHint="">
            <View
              style={[
                styles.drawerMask,
                {
                  backgroundColor: showDrawer
                    ? select(t.name, {
                        light: 'rgba(0, 57, 117, 0.1)',
                        dark: 'rgba(1, 82, 168, 0.1)',
                        dim: 'rgba(10, 13, 16, 0.8)',
                      })
                    : 'transparent',
                },
                a.transition_color,
              ]}>
              <View
                style={[
                  styles.drawerContainer,
                  showDrawer ? a.slide_in_left : a.slide_out_left,
                ]}>
                <DrawerContent />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </>
      )}

      <PolicyUpdateOverlayPortalOutlet />
    </>
  )
}

export function Shell() {
  const t = useTheme()
  const aa = useAgeAssurance()
  return (
    <View style={[a.util_screen_outer, t.atoms.bg]}>
      {aa.state.access === aa.Access.None ? (
        <NoAccessScreen />
      ) : (
        <RoutesContainer>
          <ShellInner />
        </RoutesContainer>
      )}

      <RedirectOverlay />
    </View>
  )
}

const styles = StyleSheet.create({
  drawerMask: {
    ...a.fixed,
    width: '100%',
    height: '100%',
    top: 0,
    left: 0,
  },
  drawerContainer: {
    display: 'flex',
    ...a.fixed,
    top: 0,
    left: 0,
    height: '100%',
    // On iOS Safari `100%` of a fixed box can be taller than what is actually
    // visible (browser toolbars), pushing the end of the menu offscreen.
    // @ts-expect-error web only
    maxHeight: '100dvh',
    width: 330,
    maxWidth: '80%',
  },
})
