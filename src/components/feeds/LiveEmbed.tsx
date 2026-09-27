import {View} from 'react-native'
import {WebView} from 'react-native-webview'

import {liveEmbedUrl} from '#/lib/streamplace'
import {atoms as a, useTheme} from '#/alf'

/**
 * Streamplace live player embed (native) — renders the node embed page in a
 * WebView.
 */
export function LiveEmbed({name}: {name: string}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.w_full,
        a.overflow_hidden,
        t.atoms.bg_contrast_25,
        {aspectRatio: 16 / 9, borderRadius: 12},
      ]}>
      <WebView
        source={{uri: liveEmbedUrl(name)}}
        style={[a.flex_1]}
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  )
}
