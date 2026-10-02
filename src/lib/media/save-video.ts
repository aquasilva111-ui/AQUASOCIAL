import {useCallback} from 'react'
import * as FileSystem from 'expo-file-system/legacy'
import * as MediaLibrary from 'expo-media-library'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {logger} from '#/logger'
import {isAndroid, isNative} from '#/platform/detection'
import * as Toast from '#/components/Toast'

const ALBUM_NAME = 'Aqua'

/**
 * Downloads a video and saves it to the device's photo library, in the
 * "Aqua" album. Handles the permission prompt and toasts. Native only.
 */
export function useSaveVideoToMediaLibrary() {
  const {_} = useLingui()
  return useCallback(
    async (uri: string) => {
      if (!isNative) {
        throw new Error('useSaveVideoToMediaLibrary is native only')
      }

      const permission = await MediaLibrary.requestPermissionsAsync(true, [
        'video',
      ])
      if (!permission.granted) {
        Toast.show(
          _(
            msg`Videos cannot be saved unless permission is granted to access your photo library.`,
          ),
          {type: 'error'},
        )
        return
      }

      const tmp = `${FileSystem.cacheDirectory}drop-${Date.now()}.mp4`
      try {
        await FileSystem.downloadAsync(uri, tmp)
        const asset = await MediaLibrary.createAssetAsync(tmp)
        // Android prompts for every album move, so only group on iOS.
        if (!isAndroid) {
          try {
            const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME)
            if (album) {
              await MediaLibrary.addAssetsToAlbumAsync([asset], album, false)
            } else {
              await MediaLibrary.createAlbumAsync(ALBUM_NAME, asset, false)
            }
          } catch (err) {
            logger.info('Failed to add saved video to the Aqua album', {
              safeMessage: err,
            })
          }
        }
        Toast.show(_(msg`Video saved`))
      } catch (e: any) {
        Toast.show(_(msg`Failed to save video: ${String(e)}`), {
          type: 'error',
        })
      } finally {
        FileSystem.deleteAsync(tmp, {idempotent: true}).catch(() => {})
      }
    },
    [_],
  )
}
