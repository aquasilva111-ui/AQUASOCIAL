import {forwardRef, useImperativeHandle} from 'react'
import {View} from 'react-native'
import {Image} from 'expo-image'

import {atoms as a} from '#/alf'
import {VideoEmbed} from '#/components/Post/Embed/VideoEmbed'
import {type ViewPlayerHandle, type ViewPlayerProps} from './ViewPlayer.types'

/**
 * Native: the app's existing video player plus the channel watermark.
 * Speed, quality and chapter seeking are web-only in this first phase.
 */
export const ViewPlayer = forwardRef<ViewPlayerHandle, ViewPlayerProps>(
  function ViewPlayer({embed, watermarkUri}, ref) {
    useImperativeHandle(ref, () => ({
      seek: () => {},
      getTime: () => 0,
      isPlaying: () => false,
      play: () => {},
      pause: () => {},
    }))
    return (
      <View style={[a.relative, a.w_full]}>
        <VideoEmbed embed={embed} />
        {watermarkUri && (
          <View
            pointerEvents="none"
            style={[a.absolute, {right: 12, top: 12, width: 36, height: 36}]}>
            <Image
              source={{uri: watermarkUri}}
              style={{width: '100%', height: '100%', opacity: 0.7}}
              contentFit="contain"
              accessibilityIgnoresInvertColors
            />
          </View>
        )}
      </View>
    )
  },
)
