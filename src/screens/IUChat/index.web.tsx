import {View} from 'react-native'

import {useWebMediaQueries} from '#/lib/hooks/useWebMediaQueries'
import {useSession} from '#/state/session'
import {DesktopLeftNav} from '#/view/shell/desktop/LeftNav'
import {IUChatUnavailable} from '#/screens/IUChat/Unavailable'
import {useIuChatEmbed} from '#/screens/IUChat/useIuChatEmbed'
import {atoms as a, useLayoutBreakpoints, useTheme, web} from '#/alf'
import * as Layout from '#/components/Layout'
import {LEFT_NAV_WIDTH} from '#/components/Layout/const'

/**
 * IU Chat na web: o menu da esquerda continua o do Aqua e o chat ocupa o
 * resto da altura. Não abre outra aba.
 */
export function IUChatScreen() {
  const t = useTheme()
  const {hasSession} = useSession()
  const {isMobile, isDesktop} = useWebMediaQueries()
  const {leftNavMinimal} = useLayoutBreakpoints()
  const {view, retry} = useIuChatEmbed()
  const navWidth = leftNavMinimal ? 86 : LEFT_NAV_WIDTH
  const showNav = !isMobile && (hasSession || isDesktop)

  return (
    <View
      testID="iuChatScreen"
      style={[
        a.flex_1,
        a.flex_row,
        t.atoms.bg,
        web({minHeight: '100vh', height: '100vh'}),
      ]}>
      {showNav && (
        <View
          style={[
            t.atoms.border_contrast_low,
            {width: navWidth, borderRightWidth: 1},
            web({height: '100vh'}),
          ]}>
          <DesktopLeftNav embedded />
        </View>
      )}
      <View style={[a.flex_1, web({minWidth: 0, height: '100vh'})]}>
        {isMobile && (
          <Layout.Header.Outer>
            <Layout.Header.MenuButton />
            <Layout.Header.Content align="left">
              <Layout.Header.TitleText>IU Chat</Layout.Header.TitleText>
            </Layout.Header.Content>
            <Layout.Header.Slot />
          </Layout.Header.Outer>
        )}
        {view.status === 'embed' ? (
          <iframe
            src={view.url}
            title="IU Chat"
            style={{
              flex: 1,
              width: '100%',
              minHeight: 0,
              height: '100%',
              border: 'none',
              display: 'block',
              background: 'transparent',
            }}
          />
        ) : (
          <IUChatUnavailable
            status={view.status}
            url={view.url}
            onRetry={retry}
          />
        )}
      </View>
    </View>
  )
}
