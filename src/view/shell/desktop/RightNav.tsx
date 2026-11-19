import {useEffect, useState} from 'react'
import {View} from 'react-native'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'
import {useNavigation} from '@react-navigation/core'

import {FEEDBACK_FORM_URL, HELP_DESK_URL} from '#/lib/constants'
import {useKawaiiMode} from '#/state/preferences/kawaii'
import {useSession} from '#/state/session'
import {DesktopFeeds} from '#/view/shell/desktop/Feeds'
import {DesktopSearch} from '#/view/shell/desktop/Search'
import {SidebarTrendingTopics} from '#/view/shell/desktop/SidebarTrendingTopics'
import {isWriteRoute, WriteRightRail} from '#/screens/Write/WriteRightRail'
import {
  atoms as a,
  useGutters,
  useLayoutBreakpoints,
  useTheme,
  web,
} from '#/alf'
import {AppLanguageDropdown} from '#/components/AppLanguageDropdown'
import {Divider} from '#/components/Divider'
import {RIGHT_NAV_EDGE_INSET, RIGHT_NAV_WIDTH} from '#/components/Layout'
import {InlineLinkText, SimpleInlineLinkText} from '#/components/Link'
import {ProgressGuideList} from '#/components/ProgressGuide/List'
import {StoriesTray} from '#/components/stories/StoriesTray'
import {Text} from '#/components/Typography'

function useWebQueryParams() {
  const navigation = useNavigation()
  const [params, setParams] = useState<Record<string, string>>({})

  useEffect(() => {
    return navigation.addListener('state', e => {
      try {
        const {state} = e.data
        const lastRoute = state.routes[state.routes.length - 1]
        setParams(lastRoute.params)
      } catch (err) {}
    })
  }, [navigation, setParams])

  return params
}

export function DesktopRightNav({routeName}: {routeName: string}) {
  const t = useTheme()
  const {_} = useLingui()
  const {hasSession, currentAccount} = useSession()
  const kawaii = useKawaiiMode()
  const gutters = useGutters(['base', 0])
  const isSearchScreen = routeName === 'Search'
  const webqueryParams = useWebQueryParams()
  const searchQuery = webqueryParams?.q
  const showTrending = !isSearchScreen || (isSearchScreen && !!searchQuery)
  const {rightNavVisible, leftNavMinimal} = useLayoutBreakpoints()

  if (
    !rightNavVisible ||
    routeName === 'VideoWatch' ||
    routeName === 'ImageDetail' ||
    routeName === 'VisionboardBoards' ||
    routeName === 'VisionboardBoardView'
  ) {
    return null
  }

  return (
    <View
      style={[
        gutters,
        a.gap_lg,
        web({
          position: 'fixed',
          // Anchored to the viewport, like X. The feed stays centered, so
          // the gap between them grows with the window. Home and /books
          // share this shell; hide the nav (rightNavVisible) when it would
          // cover the feed.
          right: RIGHT_NAV_EDGE_INSET,
          width: RIGHT_NAV_WIDTH,
          maxHeight: '100vh',
        }),
      ]}>
      {isWriteRoute(routeName) ? (
        <WriteRightRail
          routeName={routeName}
          chapterId={
            typeof webqueryParams?.id === 'string'
              ? webqueryParams.id
              : undefined
          }
        />
      ) : (
        <>
          {!isSearchScreen && <DesktopSearch />}

          {hasSession && (
            <>
              <ProgressGuideList />
              <DesktopFeeds />
              <Divider />
            </>
          )}

          {hasSession && routeName === 'Home' && <StoriesTray />}

          {showTrending && <SidebarTrendingTopics />}

          <Text style={[a.leading_snug, t.atoms.text_contrast_low]}>
            {hasSession && (
              <>
                <InlineLinkText
                  to={FEEDBACK_FORM_URL({
                    email: currentAccount?.email,
                    handle: currentAccount?.handle,
                  })}
                  label={_(msg`Feedback`)}>
                  {_(msg`Feedback`)}
                </InlineLinkText>
                {' • '}
              </>
            )}
            {routeName === 'Home' && (
              <>
                <SimpleInlineLinkText to="/about" label={_(msg`About AQUA`)}>
                  {_(msg`About AQUA`)}
                </SimpleInlineLinkText>
                {' • '}
                <SimpleInlineLinkText to="/contact" label={_(msg`Contact`)}>
                  {_(msg`Contact`)}
                </SimpleInlineLinkText>
                {' • '}
                <SimpleInlineLinkText
                  to="/terms"
                  label={_(msg`Terms and privacy`)}>
                  {_(msg`Terms and privacy`)}
                </SimpleInlineLinkText>
                {' • '}
              </>
            )}
            <InlineLinkText
              to="https://bsky.social/about/support/privacy-policy"
              label={_(msg`Privacy`)}>
              {_(msg`Privacy`)}
            </InlineLinkText>
            {' • '}
            <InlineLinkText
              to="https://bsky.social/about/support/tos"
              label={_(msg`Terms`)}>
              {_(msg`Terms`)}
            </InlineLinkText>
            {' • '}
            <InlineLinkText label={_(msg`Help`)} to={HELP_DESK_URL}>
              {_(msg`Help`)}
            </InlineLinkText>
          </Text>

          {kawaii && (
            <Text style={[t.atoms.text_contrast_medium, {marginTop: 12}]}>
              <Trans>
                Logo by{' '}
                <InlineLinkText
                  label={_(msg`Logo by @sawaratsuki.bsky.social`)}
                  to="/profile/sawaratsuki.bsky.social">
                  @sawaratsuki.bsky.social
                </InlineLinkText>
              </Trans>
            </Text>
          )}

          {!hasSession && leftNavMinimal && (
            <View style={[a.w_full, {height: 32}]}>
              <AppLanguageDropdown />
            </View>
          )}
        </>
      )}
    </View>
  )
}
