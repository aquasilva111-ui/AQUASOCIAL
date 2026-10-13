import {useEffect, useState} from 'react'
import {View} from 'react-native'
import {WebView} from 'react-native-webview'

import {IUChatUnavailable} from '#/screens/IUChat/Unavailable'
import {useIuChatEmbed} from '#/screens/IUChat/useIuChatEmbed'
import {atoms as a, useTheme} from '#/alf'
import * as Layout from '#/components/Layout'

/**
 * IU Chat no app: WebView em tela cheia. O documento é de primeiro nível,
 * então a sessão do chat vale sem depender de cookie de terceiro.
 */
export function IUChatScreen() {
  const t = useTheme()
  const {view, retry} = useIuChatEmbed()
  const [webViewFailed, setWebViewFailed] = useState(false)

  useEffect(() => {
    setWebViewFailed(false)
  }, [view.status, view.url])

  useEffect(() => {
    if (!webViewFailed) return
    const timer = setInterval(() => setWebViewFailed(false), 5000)
    return () => clearInterval(timer)
  }, [webViewFailed])

  const status = webViewFailed && view.status === 'embed' ? 'down' : view.status

  return (
    <Layout.Screen testID="iuChatScreen">
      <Layout.Header.Outer>
        <Layout.Header.MenuButton />
        <Layout.Header.Content align="left">
          <Layout.Header.TitleText>IU Chat</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      {status === 'embed' ? (
        <View style={[a.flex_1, t.atoms.bg]}>
          <WebView
            source={{uri: view.url}}
            style={[a.flex_1, {backgroundColor: 'transparent'}]}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            setSupportMultipleWindows={false}
            onError={() => setWebViewFailed(true)}
          />
        </View>
      ) : (
        <IUChatUnavailable
          status={status}
          url={view.url}
          onRetry={() => {
            setWebViewFailed(false)
            retry()
          }}
        />
      )}
    </Layout.Screen>
  )
}
