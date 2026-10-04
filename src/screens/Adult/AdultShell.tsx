import {useCallback, useEffect} from 'react'
import {View} from 'react-native'
import {useNavigation} from '@react-navigation/native'
import {useQuery} from '@tanstack/react-query'

import {fetchAdultRelations} from '#/lib/adult/api'
import {adultQueryKey} from '#/lib/adult/isolation'
import {type NavigationProp} from '#/lib/routes/types'
import {useAdultContext} from '#/state/adult/context'
import {hydrateAdultRelationships} from '#/state/adult/relationships'
import {useAgent} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {ArrowBoxLeft_Stroke2_Corner0_Rounded as LeaveIcon} from '#/components/icons/ArrowBoxLeft'
import * as Layout from '#/components/Layout'
import {Text} from '#/components/Typography'
import {AdultGate} from './AdultGate'

/** Subtle permanent marker that the user is inside the adult context. */
const CONTEXT_ACCENT = '#c2570c'

/**
 * Visual/logical container of the AQUA +18 environment. Same AQUA chrome,
 * plus a context banner with the explicit exit. Exiting tears down the
 * adult context before navigating away, and nothing +18 renders outside
 * the gate — so leaving unmounts any adult media and sensitive previews.
 */
export function AdultShell({
  title,
  testID,
  children,
}: {
  title: string
  testID: string
  children: React.ReactNode
}) {
  const t = useTheme()
  const navigation = useNavigation<NavigationProp>()
  const ctx = useAdultContext()
  const agent = useAgent()
  const did = ctx.identity?.did

  // Follows, mutes and blocks are stored on the server; load them into the
  // in-memory state so they survive reloads and other devices.
  const relations = useQuery({
    queryKey: adultQueryKey('relations', did),
    queryFn: () => fetchAdultRelations(agent),
    enabled: ctx.adultAccessEnabled && !!did,
    staleTime: 5 * 60_000,
  })
  useEffect(() => {
    if (did && relations.data) hydrateAdultRelationships(did, relations.data)
  }, [did, relations.data])

  const exitAdult = useCallback(() => {
    ctx.exit()
    navigation.navigate('Home')
  }, [ctx, navigation])

  return (
    <Layout.Screen testID={testID}>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>{title}</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.justify_between,
          a.px_md,
          a.py_sm,
          a.border_b,
          t.atoms.border_contrast_low,
        ]}>
        <View style={[a.flex_row, a.align_center, a.gap_xs]}>
          <View
            style={[
              a.rounded_full,
              {width: 10, height: 10, backgroundColor: '#ff8a1f'},
            ]}
          />
          <Text style={[a.text_sm, a.font_semi_bold, {color: CONTEXT_ACCENT}]}>
            Ambiente +18
          </Text>
        </View>
        <Button
          label="Sair do +18"
          size="small"
          variant="ghost"
          color="secondary"
          onPress={exitAdult}>
          <ButtonIcon icon={LeaveIcon} />
          <ButtonText>Sair do +18</ButtonText>
        </Button>
      </View>
      <AdultGate ctx={ctx}>{children}</AdultGate>
    </Layout.Screen>
  )
}
