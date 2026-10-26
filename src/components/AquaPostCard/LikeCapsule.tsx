import {View} from 'react-native'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {useFormatPostStatCount} from '#/components/PostControls/util'
import {Text} from '#/components/Typography'
import {aquaGlass} from './glass'
import {AQUA} from './palette'
import {usePostLikerPreviews} from './plugins'

export function LikeCapsule({
  postUri,
  likeCount,
}: {
  postUri: string
  likeCount: number
}) {
  const t = useTheme()
  const {_} = useLingui()
  const format = useFormatPostStatCount()
  const likers = usePostLikerPreviews(postUri)
  const light = t.name === 'light'
  const faces = likers.filter(liker => liker.avatar).slice(0, 2)
  if (likeCount <= 0 && faces.length === 0) return null

  const label =
    likeCount > 0
      ? _(msg`${format(likeCount)} liked`)
      : _(msg`${faces.length} liked`)

  return (
    <View
      accessibilityLabel={label}
      accessibilityHint=""
      style={[
        a.flex_row,
        a.align_center,
        a.rounded_full,
        a.gap_xs,
        aquaGlass(light),
        {
          paddingTop: 3,
          paddingBottom: 3,
          paddingLeft: faces.length ? 3 : 9,
          paddingRight: 10,
        },
      ]}>
      {faces.length > 0 && (
        <View style={[a.flex_row, a.align_center]}>
          {faces.map((liker, index) => (
            <View
              key={liker.did}
              style={[
                a.rounded_full,
                {
                  marginLeft: index === 0 ? 0 : -6,
                  borderWidth: 2,
                  borderColor: AQUA.white,
                },
              ]}>
              <UserAvatar type="user" size={18} avatar={liker.avatar} />
            </View>
          ))}
        </View>
      )}
      <Text
        numberOfLines={1}
        style={[
          a.font_bold,
          a.leading_tight,
          {
            fontSize: 12,
            color: light ? AQUA.ink : AQUA.white,
          },
        ]}>
        {label}
      </Text>
    </View>
  )
}

export function LikedByLine({
  postUri,
  likeCount,
}: {
  postUri: string
  likeCount: number
}) {
  const {_} = useLingui()
  const t = useTheme()
  const likers = usePostLikerPreviews(postUri)
  if (likers.length === 0) return null
  const light = t.name === 'light'
  const first = likers[0].displayName || likers[0].handle || ''
  const second = likers[1]?.displayName || likers[1]?.handle
  const others = Math.max(0, likeCount - (second ? 2 : 1))
  let line = _(msg`${first} liked this post`)
  if (second && others > 0) {
    line = _(msg`${first}, ${second} and others liked this post`)
  } else if (second) {
    line = _(msg`${first} and ${second} liked this post`)
  } else if (others > 0) {
    line = _(msg`${first} and others liked this post`)
  }

  return (
    <Text
      style={[
        a.text_sm,
        a.mt_xs,
        {color: light ? AQUA.muted : t.atoms.text_contrast_medium.color},
      ]}>
      {line}
    </Text>
  )
}
