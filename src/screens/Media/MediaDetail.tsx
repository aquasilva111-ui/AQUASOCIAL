import {useEffect, useMemo} from 'react'
import {View} from 'react-native'

import {DISCOVER_FEED_URI} from '#/lib/constants'
import {getRelatedMedia, type MediaExperience} from '#/lib/media/experiences'
import {recordView} from '#/lib/media/views'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {makeRecordUri} from '#/lib/strings/url-helpers'
import {isNative} from '#/platform/detection'
import {usePostQuery} from '#/state/queries/post'
import {usePostFeedQuery} from '#/state/queries/post-feed'
import {useSelectedFeed} from '#/state/shell/selected-feed'
import {PostThread} from '#/screens/PostThread'
import {atoms as a} from '#/alf'
import {MediaCard} from '#/components/feeds/MediaCard'
import {MediaGallery} from '#/components/feeds/MediaGallery'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {RelatedLayout} from './RelatedLayout'

export function VideoWatchScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'VideoWatch'>) {
  return (
    <MediaDetail
      name={route.params.name}
      rkey={route.params.rkey}
      mode="video"
    />
  )
}
export function ImageDetailScreen({
  route,
}: NativeStackScreenProps<CommonNavigatorParams, 'ImageDetail'>) {
  return (
    <MediaDetail
      name={route.params.name}
      rkey={route.params.rkey}
      mode="images"
    />
  )
}

function MediaDetail({
  name,
  rkey,
  mode,
}: {
  name: string
  rkey: string
  mode: MediaExperience
}) {
  const uri = makeRecordUri(name, 'app.bsky.feed.post', rkey)
  useEffect(() => {
    if (mode === 'video') recordView(uri)
  }, [uri, mode])
  return (
    <Layout.Screen testID={`aqua-detail-${mode}`}>
      <PostThread
        uri={uri}
        title={mode === 'video' ? 'AQUA Video+Stream' : 'AQUA Pics'}
        related={<RelatedMedia uri={uri} mode={mode} />}
      />
    </Layout.Screen>
  )
}

function RelatedMedia({uri, mode}: {uri: string; mode: MediaExperience}) {
  const selected = useSelectedFeed()
  const post = usePostQuery(uri)
  const feed = usePostFeedQuery(selected ?? `feedgen|${DISCOVER_FEED_URI}`)
  const items = useMemo(
    () =>
      post.data
        ? getRelatedMedia(
            post.data,
            feed.data?.pages.flatMap(page =>
              page.slices.flatMap(slice => slice.items),
            ) ?? [],
            mode,
          ).slice(0, 12)
        : [],
    [post.data, feed.data, mode],
  )
  if (!items.length) return null
  return (
    <RelatedLayout>
      <View>
        <Text style={[a.text_lg, a.font_bold, a.p_md]}>
          {mode === 'images' ? 'Imagens relacionadas' : 'Mais vídeos'}
        </Text>
        {isNative ? (
          items.slice(0, 6).map(item => (
            <View key={item.uri} style={a.p_md}>
              <MediaCard item={item} mode={mode} />
            </View>
          ))
        ) : (
          <MediaGallery items={items} mode={mode} />
        )}
      </View>
    </RelatedLayout>
  )
}
