import {useMemo, useState} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import {logAdultEvent} from '#/lib/adult/analytics'
import {getPostMedia, toAccessControlledResource} from '#/lib/adult/content'
import {type AdultPost} from '#/lib/adult/content'
import {canAccess} from '#/lib/adult/entitlements'
import {
  getAdultActionHistory,
  likeAdult,
  saveAdult,
  unlikeAdult,
  unsaveAdult,
} from '#/state/adult/actionHistory'
import {useAdultContext} from '#/state/adult/context'
import {blockAdultCreator} from '#/state/adult/relationships'
import {useLightboxControls} from '#/state/lightbox'
import {ImageLayoutGrid} from '#/view/com/util/images/ImageLayoutGrid'
import {TimeElapsed} from '#/view/com/util/TimeElapsed'
import {PreviewableUserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {
  Bookmark as SaveIcon,
  BookmarkFilled as SavedIcon,
} from '#/components/icons/Bookmark'
import {DotGrid_Stroke2_Corner0_Rounded as EllipsisIcon} from '#/components/icons/DotGrid'
import {Flag_Stroke2_Corner0_Rounded as FlagIcon} from '#/components/icons/Flag'
import {
  Heart2_Filled_Stroke2_Corner0_Rounded as HeartFilled,
  Heart2_Stroke2_Corner0_Rounded as HeartIcon,
} from '#/components/icons/Heart2'
import {Play_Stroke2_Corner0_Rounded as PlayIcon} from '#/components/icons/Play'
import {Link} from '#/components/Link'
import * as Menu from '#/components/Menu'
import * as Hider from '#/components/moderation/Hider'
import {
  ReportDialog,
  useReportDialogControl,
} from '#/components/moderation/ReportDialog'
import {RichText} from '#/components/RichText'
import {Text} from '#/components/Typography'

/**
 * AQUA +18 post card. Engagement here is private to the adult context:
 * like/save go to the adult action history only, never to public AT records.
 * Report flows to the real Trust & Safety dialog. Access to media is decided
 * by AQUA Entitlements — this component never decides access itself.
 */
export function AdultPostCard({post}: {post: AdultPost}) {
  const {_} = useLingui()
  const t = useTheme()
  const ctx = useAdultContext()
  const reportControl = useReportDialogControl()
  const {openLightbox} = useLightboxControls()

  const decision = useMemo(
    () =>
      canAccess(
        {
          userId: ctx.identity?.did,
          resourceId: post.uri,
          resourceType: 'post',
          adultContextActive: ctx.adultAccessEnabled,
        },
        toAccessControlledResource(post),
      ),
    [ctx.identity?.did, ctx.adultAccessEnabled, post],
  )

  const history = getAdultActionHistory()
  const [liked, setLiked] = useState(history.likes.includes(post.uri))
  const [saved, setSaved] = useState(history.saves.includes(post.uri))

  const media = getPostMedia(post.item.post)
  const images = media.type === 'images' ? media.view.images : []
  const videoThumb = media.type === 'video' ? media.view.thumbnail : undefined

  const toggleLike = () => {
    setLiked(prev => {
      if (prev) unlikeAdult([post.uri])
      else likeAdult([post.uri])
      return !prev
    })
  }
  const toggleSave = () => {
    setSaved(prev => {
      if (prev) unsaveAdult([post.uri])
      else {
        saveAdult([post.uri])
        logAdultEvent('adult.content.viewed', {surface: 'feed'})
      }
      return !prev
    })
  }

  const creatorHref = `/adult/creator/${post.creator.handle}`

  return (
    <View
      style={[a.p_md, a.border_b, t.atoms.border_contrast_low]}
      testID="adult-post-card">
      <View style={[a.flex_row, a.gap_sm, a.align_center]}>
        <Link to={creatorHref} label={post.creator.handle}>
          <PreviewableUserAvatar
            size={36}
            profile={post.creator}
            moderation={post.moderation.ui('avatar')}
          />
        </Link>
        <View style={[a.flex_1, {minWidth: 0}]}>
          <Link to={creatorHref} label={post.creator.handle}>
            <Text style={[a.text_md, a.font_bold]} numberOfLines={1}>
              {post.creator.displayName || post.creator.handle}
            </Text>
            <Text
              style={[a.text_sm, t.atoms.text_contrast_medium]}
              numberOfLines={1}>
              @{post.creator.handle}
            </Text>
          </Link>
        </View>
        <TimeElapsed timestamp={post.createdAt}>
          {({timeElapsed}) => (
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              {timeElapsed}
            </Text>
          )}
        </TimeElapsed>
        <Menu.Root>
          <Menu.Trigger label={_(msg`Mais opções`)}>
            {({props}) => (
              <Button
                {...props}
                label={_(msg`Mais opções`)}
                size="small"
                variant="ghost"
                color="secondary"
                shape="round">
                <ButtonIcon icon={EllipsisIcon} />
              </Button>
            )}
          </Menu.Trigger>
          <Menu.Outer>
            <Menu.Item
              label={_(msg`Denunciar`)}
              onPress={() => reportControl.open()}>
              <Menu.ItemIcon icon={FlagIcon} />
              <Menu.ItemText>{_(msg`Denunciar`)}</Menu.ItemText>
            </Menu.Item>
            {ctx.identity && ctx.identity.did !== post.creatorId && (
              <Menu.Item
                label={_(msg`Bloquear criador`)}
                onPress={() =>
                  blockAdultCreator(ctx.identity!.did, post.creatorId)
                }>
                <Menu.ItemText>{_(msg`Bloquear criador`)}</Menu.ItemText>
              </Menu.Item>
            )}
          </Menu.Outer>
        </Menu.Root>
      </View>

      {decision.allowed ? (
        <Hider.Outer modui={post.moderation.ui('contentMedia')}>
          <Hider.Content>
            {!!post.text && (
              <View style={a.pt_sm}>
                <RichText value={post.text} enableTags />
              </View>
            )}
            {images.length > 0 && (
              <View style={[a.pt_sm]}>
                <ImageLayoutGrid
                  images={images}
                  onPress={(index, _refs, fetchedDims) => {
                    openLightbox({
                      images: images.map((img, i) => ({
                        uri: img.fullsize,
                        thumbUri: img.thumb,
                        alt: img.alt,
                        dimensions: img.aspectRatio ?? null,
                        thumbRect: null,
                        thumbDimensions: fetchedDims[i] ?? null,
                        type: 'image' as const,
                      })),
                      index,
                    })
                  }}
                />
              </View>
            )}
            {media.type === 'video' && !!videoThumb && (
              <View
                style={[
                  a.pt_sm,
                  a.rounded_sm,
                  a.overflow_hidden,
                  a.align_center,
                  a.justify_center,
                  t.atoms.bg_contrast_25,
                  {aspectRatio: 16 / 9},
                ]}>
                <PlayIcon size="xl" style={t.atoms.text_contrast_medium} />
                <Text
                  style={[a.text_xs, t.atoms.text_contrast_medium, a.pt_xs]}>
                  {_(msg`Vídeo — reprodução chega com o Media Engine`)}
                </Text>
              </View>
            )}
          </Hider.Content>
        </Hider.Outer>
      ) : (
        // Preview vs protected: the protected asset is never fetched to be
        // blurred — this panel is all the client receives.
        <View
          style={[
            a.mt_sm,
            a.p_lg,
            a.rounded_sm,
            a.align_center,
            a.gap_sm,
            t.atoms.bg_contrast_25,
          ]}>
          <Text style={[a.text_md, a.font_bold]}>
            {_(msg`Conteúdo protegido`)}
          </Text>
          <Text
            style={[a.text_sm, a.text_center, t.atoms.text_contrast_medium]}>
            {decision.reason === 'not_subscribed'
              ? _(msg`Disponível para assinantes do criador.`)
              : decision.reason === 'purchase_required'
                ? _(msg`Disponível mediante desbloqueio.`)
                : _(msg`Você não possui acesso a este conteúdo.`)}
          </Text>
          <Button
            label={_(msg`Ver opções de acesso`)}
            size="small"
            variant="solid"
            color="primary"
            onPress={() => {}}>
            <ButtonText>{_(msg`Ver opções de acesso`)}</ButtonText>
          </Button>
        </View>
      )}

      <View style={[a.flex_row, a.gap_md, a.pt_sm, a.align_center]}>
        <Button
          label={_(msg`Curtir`)}
          size="small"
          variant="ghost"
          color="secondary"
          onPress={toggleLike}>
          <ButtonIcon icon={liked ? HeartFilled : HeartIcon} />
        </Button>
        <Button
          label={saved ? _(msg`Salvo`) : _(msg`Salvar`)}
          size="small"
          variant="ghost"
          color="secondary"
          onPress={toggleSave}>
          <ButtonIcon icon={saved ? SavedIcon : SaveIcon} />
        </Button>
      </View>

      <ReportDialog
        control={reportControl}
        subject={{
          ...post.item.post,
          $type: 'app.bsky.feed.defs#postView',
        }}
      />
    </View>
  )
}
