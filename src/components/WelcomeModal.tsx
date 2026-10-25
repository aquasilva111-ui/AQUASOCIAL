import {useEffect, useState} from 'react'
import {Pressable, View} from 'react-native'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {FocusGuards, FocusScope} from 'radix-ui/internal'

import {logger} from '#/logger'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {Logo} from '#/view/icons/Logo'
import {atoms as a, flatten, useBreakpoints, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {TimesLarge_Stroke2_Corner0_Rounded as XIcon} from '#/components/icons/Times'
import {Text} from '#/components/Typography'

/**
 * Frosted white card. `aqua-design-core` exposes `AQUA.white` (`#FFFFFF`) but
 * no glass or Nazar iris token, so the wash uses the brand iris `#7EC8F5`.
 */
const welcomeCardGlass = {
  backgroundColor: 'rgba(255, 255, 255, 0.72)',
  borderWidth: 1,
  borderStyle: 'solid' as const,
  borderColor: 'rgba(255, 255, 255, 0.6)',
  ...web({
    backdropFilter: 'blur(24px) saturate(1.4)',
    WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
    boxShadow: '0 16px 48px rgba(15, 23, 42, 0.14)',
    backgroundImage:
      'radial-gradient(280px 240px at 100% 0%, rgba(126, 200, 245, 0.26), rgba(126, 200, 245, 0) 72%)',
  }),
}

interface WelcomeModalProps {
  control: {
    isOpen: boolean
    open: () => void
    close: () => void
  }
}

export function WelcomeModal({control}: WelcomeModalProps) {
  const {_} = useLingui()
  const {requestSwitchToAccount} = useLoggedOutViewControls()
  const {gtMobile} = useBreakpoints()
  const [isExiting, setIsExiting] = useState(false)
  const [signInLinkHovered, setSignInLinkHovered] = useState(false)

  const fadeOutAndClose = (callback?: () => void) => {
    setIsExiting(true)
    setTimeout(() => {
      control.close()
      if (callback) callback()
    }, 150)
  }

  useEffect(() => {
    if (control.isOpen) {
      logger.metric('welcomeModal:presented', {})
    }
  }, [control.isOpen])

  const onPressCreateAccount = () => {
    logger.metric('welcomeModal:signupClicked', {})
    control.close()
    requestSwitchToAccount({requestedAccount: 'new'})
  }

  const onPressExplore = () => {
    logger.metric('welcomeModal:exploreClicked', {})
    fadeOutAndClose()
  }

  const onPressSignIn = () => {
    logger.metric('welcomeModal:signinClicked', {})
    control.close()
    requestSwitchToAccount({requestedAccount: 'existing'})
  }

  FocusGuards.useFocusGuards()

  return (
    <View
      role="dialog"
      aria-modal
      style={[
        a.fixed,
        a.inset_0,
        a.justify_center,
        a.align_center,
        {zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.2)'},
        isExiting ? a.fade_out : a.fade_in,
      ]}>
      <FocusScope.FocusScope asChild loop trapped>
        <View
          style={flatten([
            {
              maxWidth: 800,
              maxHeight: 600,
              width: '90%',
              height: '90%',
            },
            welcomeCardGlass,
            a.rounded_lg,
            a.overflow_hidden,
            a.zoom_in,
          ])}>
          <View style={[a.flex_1, a.justify_center]}>
            <View style={[a.gap_2xl, a.align_center, a.p_4xl]}>
              <View
                style={[
                  a.flex_row,
                  a.align_center,
                  a.justify_center,
                  a.w_full,
                  a.p_0,
                ]}>
                <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                  <Logo width={26} />
                  <Text
                    style={[
                      a.text_2xl,
                      a.font_semi_bold,
                      a.user_select_none,
                      {color: '#354358', letterSpacing: -0.5},
                    ]}>
                    Aqua
                  </Text>
                </View>
              </View>
              <View
                style={[
                  a.gap_sm,
                  a.align_center,
                  a.pt_5xl,
                  a.pb_3xl,
                  a.mt_2xl,
                ]}>
                <Text
                  style={[
                    gtMobile ? a.text_4xl : a.text_3xl,
                    a.font_semi_bold,
                    a.text_center,
                    {color: '#354358'},
                    web({
                      backgroundImage:
                        'linear-gradient(180deg, #313F54 0%, #4C607C 72%, #5A7090 100%)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      color: 'transparent',
                      lineHeight: 1.2,
                      letterSpacing: -0.5,
                    }),
                  ]}>
                  <Trans>Real people.</Trans>
                  {'\n'}
                  <Trans>Real conversations.</Trans>
                  {'\n'}
                  <Trans>Social media you control.</Trans>
                </Text>
              </View>
              <View style={[a.gap_md, a.align_center]}>
                <View>
                  <Button
                    onPress={onPressCreateAccount}
                    label={_(msg`Create account`)}
                    size="large"
                    color="primary"
                    style={{
                      width: 200,
                      backgroundColor: '#002bef',
                    }}>
                    <ButtonText>
                      <Trans>Create account</Trans>
                    </ButtonText>
                  </Button>
                  <Button
                    onPress={onPressExplore}
                    label={_(msg`Explore the app`)}
                    size="large"
                    color="primary"
                    variant="ghost"
                    style={[a.bg_transparent, {width: 200}]}
                    hoverStyle={[a.bg_transparent]}>
                    {({hovered}) => (
                      <ButtonText
                        style={[hovered && [a.underline], {color: '#002bef'}]}>
                        <Trans>Explore the app</Trans>
                      </ButtonText>
                    )}
                  </Button>
                </View>
                <View style={[a.align_center, {minWidth: 200}]}>
                  <Text
                    style={[
                      a.text_md,
                      a.text_center,
                      {color: '#405168', lineHeight: 24},
                    ]}>
                    <Trans>Already have an account?</Trans>{' '}
                    <Pressable
                      onPointerEnter={() => setSignInLinkHovered(true)}
                      onPointerLeave={() => setSignInLinkHovered(false)}
                      accessibilityRole="button"
                      accessibilityLabel={_(msg`Sign in`)}
                      accessibilityHint="">
                      <Text
                        style={[
                          a.font_medium,
                          {
                            color: '#002bef',
                            fontSize: undefined,
                          },
                          signInLinkHovered && a.underline,
                        ]}
                        onPress={onPressSignIn}>
                        <Trans>Sign in</Trans>
                      </Text>
                    </Pressable>
                  </Text>
                </View>
              </View>
            </View>
            <Button
              label={_(msg`Close welcome modal`)}
              style={[
                a.absolute,
                {
                  top: 8,
                  right: 8,
                },
                a.bg_transparent,
              ]}
              hoverStyle={[a.bg_transparent]}
              onPress={() => {
                logger.metric('welcomeModal:dismissed', {})
                fadeOutAndClose()
              }}
              color="secondary"
              size="small"
              variant="ghost"
              shape="round">
              {({hovered, pressed, focused}) => (
                <XIcon
                  size="md"
                  style={{
                    color: '#354358',
                    opacity: hovered || pressed || focused ? 1 : 0.7,
                  }}
                />
              )}
            </Button>
          </View>
        </View>
      </FocusScope.FocusScope>
    </View>
  )
}
