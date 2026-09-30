import {ScrollView, View} from 'react-native'
import {Image} from 'expo-image'

import {liveThumbUrl, type StreamplaceLivestreamView} from '#/lib/streamplace'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {useLiveUsersQuery} from '#/state/queries/streamplace'
import {atoms as a, useTheme, web} from '#/alf'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'

function formatViewers(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} mi`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} mil`
  return `${n}`
}

/**
 * "Ao vivo agora" — live broadcasts from the Streamplace node
 * (place.stream.live.getLiveUsers), shown on top of the Aqua Views page.
 */
export function LiveNowSection({enabled}: {enabled: boolean}) {
  const t = useTheme()
  const {data: streams, isError} = useLiveUsersQuery({enabled})

  if (isError || !streams?.length) return null

  return (
    <View style={[a.pb_sm]}>
      <View style={[a.flex_row, a.align_center, a.gap_xs, a.px_md, a.pb_sm]}>
        <View
          style={[
            {
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: '#e0242e',
            },
          ]}
        />
        <Text style={[a.text_md, a.font_bold, t.atoms.text]}>
          Ao vivo agora
        </Text>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          {streams.length}{' '}
          {streams.length === 1 ? 'transmissão' : 'transmissões'}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          a.gap_md,
          a.pl_md,
          web({paddingRight: 0, minWidth: '100%'}) ?? a.pr_md,
        ]}>
        {streams.map(stream => (
          <LiveCard key={stream.uri} stream={stream} />
        ))}
      </ScrollView>
    </View>
  )
}

function LiveCard({stream}: {stream: StreamplaceLivestreamView}) {
  const t = useTheme()
  const viewers = stream.viewerCount?.count ?? 0
  const title = stream.record.title || 'Transmissão ao vivo'

  return (
    <Link
      to={`/views/live/${stream.author.did}`}
      label={title}
      // Link is a row-laid Button; stack the title under the thumbnail.
      style={[a.flex_col, a.align_stretch, {width: 260}]}>
      <View
        style={[
          a.w_full,
          a.overflow_hidden,
          t.atoms.bg_contrast_25,
          {aspectRatio: 16 / 9, borderRadius: 12},
        ]}>
        <Image
          accessibilityIgnoresInvertColors
          accessibilityHint="Abre a transmissão ao vivo"
          source={{uri: liveThumbUrl(stream.author.did)}}
          style={[a.w_full, a.h_full]}
          contentFit="cover"
          accessibilityLabel={title}
          transition={150}
          recyclingKey={stream.uri}
        />
        <View
          style={[
            a.absolute,
            a.rounded_sm,
            {top: 8, left: 8, backgroundColor: '#e0242e'},
            a.px_xs,
            {paddingVertical: 2},
          ]}>
          <Text style={[a.text_xs, a.font_bold, {color: '#fff'}]}>
            ● AO VIVO
          </Text>
        </View>
        {viewers > 0 && (
          <View
            style={[
              a.absolute,
              a.rounded_sm,
              {bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)'},
              a.px_xs,
              {paddingVertical: 2},
            ]}>
            <Text style={[a.text_xs, {color: '#fff'}]}>
              {formatViewers(viewers)} assistindo
            </Text>
          </View>
        )}
      </View>
      <View style={[a.flex_row, a.gap_sm, a.pt_sm]}>
        <View style={[a.flex_1, {minWidth: 0}]}>
          <Text
            numberOfLines={2}
            style={[a.text_sm, a.font_semi_bold, a.leading_snug]}>
            {title}
          </Text>
          <Text
            numberOfLines={1}
            style={[a.text_xs, t.atoms.text_contrast_medium, a.pt_2xs]}>
            {sanitizeDisplayName(
              stream.author.displayName || sanitizeHandle(stream.author.handle),
            )}{' '}
            · {sanitizeHandle(stream.author.handle, '@')}
          </Text>
        </View>
      </View>
    </Link>
  )
}
