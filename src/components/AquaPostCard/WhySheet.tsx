import {useState} from 'react'
import {View} from 'react-native'
import {msg, Trans} from '@lingui/macro'
import {useLingui} from '@lingui/react'

import * as Toast from '#/view/com/util/Toast'
import {atoms as a, useTheme} from '#/alf'
import {Button} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {ChevronRight_Stroke2_Corner0_Rounded as Chevron} from '#/components/icons/Chevron'
import {Lock_Stroke2_Corner0_Rounded as Lock} from '#/components/icons/Lock'
import {Sparkle_Stroke2_Corner0_Rounded as Sparkle} from '#/components/icons/Sparkle'
import {Text} from '#/components/Typography'
import {AQUA} from './palette'
import {
  dispatchWhySeeingThis,
  openMyConventions,
  type SurfacedConvention,
  type WhySeeingThis,
  type WhySeeingThisAction,
} from './plugins'

export function WhySheet({
  control,
  data,
}: {
  control: Dialog.DialogOuterProps['control']
  data: WhySeeingThis
}) {
  return (
    <Dialog.Outer control={control} nativeOptions={{preventExpansion: true}}>
      <Dialog.Handle />
      <WhySheetInner control={control} data={data} />
    </Dialog.Outer>
  )
}

function WhySheetInner({
  control,
  data,
}: {
  control: Dialog.DialogOuterProps['control']
  data: WhySeeingThis
}) {
  const t = useTheme()
  const {_} = useLingui()
  const light = t.name === 'light'
  const [showMine, setShowMine] = useState(false)
  const ink = light ? AQUA.ink : t.atoms.text.color
  const muted = light ? AQUA.muted : t.atoms.text_contrast_medium.color

  const run = (type: WhySeeingThisAction['type']) => {
    if (data.conventions.length === 0) {
      Toast.show(_(msg`No Convention is attached to this post yet`))
      return
    }
    for (const convention of data.conventions) {
      dispatchWhySeeingThis({
        type,
        postUri: data.postUri,
        conventionId: convention.id,
      })
    }
    Toast.show(
      type === 'show_more'
        ? _(msg`We'll show more of this`)
        : type === 'show_less'
          ? _(msg`We'll show less of this`)
          : _(msg`Topic muted on this device`),
    )
  }

  return (
    <Dialog.Inner
      label={_(msg`Why am I seeing this?`)}
      style={[
        a.pt_sm,
        {backgroundColor: light ? 'rgba(255,255,255,0.96)' : undefined},
      ]}>
      <View style={[a.flex_row, a.align_center, a.gap_sm]}>
        <Sparkle width={18} height={18} style={{color: AQUA.primary}} />
        <Text style={[a.text_xl, a.font_bold, {color: ink}]}>
          <Trans>Why am I seeing this?</Trans>
        </Text>
      </View>
      <Text
        style={[a.text_sm, a.mt_xs, a.mb_md, {color: muted, lineHeight: 20}]}>
        <Trans>
          This post showed up because it matches these Conventions of yours.
        </Trans>
      </Text>
      {data.conventions.length === 0 ? (
        <Text style={[a.text_sm, a.mb_md, {color: muted}]}>
          <Trans>No Conventions are attached to this post yet.</Trans>
        </Text>
      ) : (
        data.conventions.map(convention => (
          <ConventionRow key={convention.id} convention={convention} />
        ))
      )}
      <View style={[a.flex_row, a.gap_sm, a.mt_sm, a.mb_md]}>
        <SheetButton
          label={_(msg`Show more of this`)}
          primary
          onPress={() => run('show_more')}
        />
        <SheetButton
          label={_(msg`Show less of this`)}
          onPress={() => run('show_less')}
        />
        <SheetButton label={_(msg`Mute topic`)} onPress={() => run('mute')} />
      </View>
      <Button
        label={_(msg`My Conventions`)}
        onPress={() => {
          if (openMyConventions()) {
            control.close()
            return
          }
          setShowMine(open => !open)
        }}>
        {({pressed}) => (
          <View
            style={[
              a.flex_row,
              a.align_center,
              a.justify_between,
              a.w_full,
              a.py_xs,
              {opacity: pressed ? 0.6 : 1},
            ]}>
            <Text style={[a.text_md, a.font_bold, {color: AQUA.primary}]}>
              <Trans>My Conventions</Trans>
            </Text>
            <Chevron width={18} height={18} style={{color: AQUA.primary}} />
          </View>
        )}
      </Button>
      {showMine && (
        <Text style={[a.text_sm, a.mt_xs, {color: muted}]}>
          {data.conventions.length === 0 ? (
            <Trans>
              Your Conventions will be listed here when the feed explains a
              post.
            </Trans>
          ) : (
            data.conventions.map(convention => convention.label).join(' · ')
          )}
        </Text>
      )}
      <View style={[a.flex_row, a.align_center, a.gap_xs, a.mt_md]}>
        <Lock width={13} height={13} style={{color: muted}} />
        <Text style={[a.flex_1, a.text_xs, {color: muted}]}>
          <Trans>
            We only show the link between ideas, never your personal data.
          </Trans>
        </Text>
      </View>
    </Dialog.Inner>
  )
}

function ConventionRow({convention}: {convention: SurfacedConvention}) {
  const t = useTheme()
  const {_} = useLingui()
  const light = t.name === 'light'
  const requested = convention.source === 'requested'
  return (
    <View
      style={[
        a.flex_row,
        a.align_center,
        a.gap_sm,
        a.p_md,
        a.mb_xs,
        a.rounded_lg,
        {
          backgroundColor: light
            ? AQUA.surface
            : t.atoms.bg_contrast_25.backgroundColor,
        },
      ]}>
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: AQUA.iris,
          borderWidth: 2,
          borderColor: AQUA.white,
        }}
      />
      <View style={[a.flex_1]}>
        <Text
          style={[
            a.text_md,
            a.font_bold,
            {color: light ? AQUA.ink : t.atoms.text.color},
          ]}>
          {convention.label}
        </Text>
        <Text
          style={[
            a.text_xs,
            {color: light ? AQUA.muted : t.atoms.text_contrast_medium.color},
          ]}>
          {convention.detail}
        </Text>
      </View>
      <View
        style={[
          a.rounded_full,
          a.px_sm,
          a.py_xs,
          requested
            ? {backgroundColor: AQUA.requestedBg}
            : {
                backgroundColor: light ? AQUA.white : 'transparent',
                borderWidth: 1,
                borderColor: light
                  ? AQUA.line
                  : t.atoms.border_contrast_low.borderColor,
              },
        ]}>
        <Text
          style={[
            a.font_bold,
            {
              fontSize: 11,
              color: requested
                ? AQUA.primary
                : light
                  ? AQUA.muted
                  : t.atoms.text_contrast_medium.color,
            },
          ]}>
          {requested ? _(msg`You asked`) : _(msg`Inferred`)}
        </Text>
      </View>
    </View>
  )
}

function SheetButton({
  label,
  onPress,
  primary,
}: {
  label: string
  onPress: () => void
  primary?: boolean
}) {
  const t = useTheme()
  const light = t.name === 'light'
  return (
    <Button label={label} onPress={onPress} style={[a.flex_1]}>
      {({pressed}) => (
        <View
          style={[
            a.align_center,
            a.justify_center,
            a.rounded_full,
            a.px_sm,
            a.w_full,
            {
              paddingVertical: 10,
              opacity: pressed ? 0.75 : 1,
              backgroundColor: primary
                ? AQUA.primary
                : light
                  ? AQUA.white
                  : 'transparent',
              borderWidth: primary ? 0 : 1,
              borderColor: light
                ? AQUA.line
                : t.atoms.border_contrast_low.borderColor,
            },
          ]}>
          <Text
            style={[
              a.text_center,
              a.font_bold,
              {
                fontSize: 12,
                color: primary
                  ? AQUA.white
                  : light
                    ? AQUA.ink
                    : t.atoms.text.color,
              },
            ]}>
            {label}
          </Text>
        </View>
      )}
    </Button>
  )
}
