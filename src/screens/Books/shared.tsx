import {useMemo} from 'react'
import {View} from 'react-native'
import {moderateProfile} from '@atproto/api'

import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {useProfileQuery} from '#/state/queries/profile'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'

export function BooksShell({
  title,
  testID,
  children,
  keyboardAware,
}: {
  title: string
  testID: string
  children: React.ReactNode
  keyboardAware?: boolean
}) {
  const Content = keyboardAware ? Layout.KeyboardAwareContent : Layout.Content
  return (
    <Layout.Screen testID={testID}>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>{title}</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Content>{children}</Content>
    </Layout.Screen>
  )
}

export function Notice({
  title,
  body,
  children,
}: {
  title: string
  body?: string
  children?: React.ReactNode
}) {
  const t = useTheme()
  return (
    <View style={[a.align_center, a.gap_md, a.px_xl, {paddingTop: 72}]}>
      <Text style={[a.text_xl, a.font_bold, a.text_center]}>{title}</Text>
      {body && (
        <Text
          style={[
            a.text_md,
            a.text_center,
            t.atoms.text_contrast_medium,
            {maxWidth: 420},
          ]}>
          {body}
        </Text>
      )}
      {children}
    </View>
  )
}

export function PillLink({
  to,
  label,
  primary = true,
}: {
  to: string
  label: string
  primary?: boolean
}) {
  const t = useTheme()
  return (
    <Link to={to} label={label}>
      <View
        style={[
          a.rounded_full,
          a.px_lg,
          a.py_sm,
          primary ? t.atoms.bg_contrast_900 : t.atoms.bg_contrast_50,
        ]}>
        <Text
          style={[
            a.font_bold,
            primary ? {color: t.atoms.bg.backgroundColor} : t.atoms.text,
          ]}>
          {label}
        </Text>
      </View>
    </Link>
  )
}

export function RetryNotice({
  title,
  onRetry,
}: {
  title: string
  onRetry: () => void
}) {
  return (
    <Notice title={title}>
      <Button
        label="Tentar novamente"
        size="small"
        color="secondary"
        onPress={onRetry}>
        <ButtonText>Tentar novamente</ButtonText>
      </Button>
    </Notice>
  )
}

/** Author of a book, resolved from the route handle. Same AQUA Profile. */
export function useBookAuthor(handle: string | undefined) {
  const {currentAccount} = useSession()
  const moderationOpts = useModerationOpts()
  const profile = useProfileQuery({did: handle})
  const did = profile.data?.did
  const moderated = useMemo(() => {
    if (!profile.data || !moderationOpts) return false
    const labels = profile.data.labels ?? []
    return (
      labels.some(l => l.val === '!takedown' || l.val === '!suspend') ||
      moderateProfile(profile.data, moderationOpts).ui('profileView').filter
    )
  }, [profile.data, moderationOpts])
  return {
    profile,
    did,
    handle: profile.data?.handle ?? handle,
    isOwner: !!did && did === currentAccount?.did,
    moderated,
  }
}
