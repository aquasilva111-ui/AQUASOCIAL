import {type ReactNode} from 'react'
import {ActivityIndicator, TextInput, View} from 'react-native'

import {ECOSYSTEM_CONFIGURED} from '#/lib/ecosystem/api'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Layout from '#/components/Layout'
import {Link} from '#/components/Link'
import {Text} from '#/components/Typography'

export function Page({title, children}: {title: string; children: ReactNode}) {
  return (
    <Layout.Screen testID={`ecosystem-${title}`}>
      <Layout.Header.Outer>
        <Layout.Header.BackButton />
        <Layout.Header.Content>
          <Layout.Header.TitleText>{title}</Layout.Header.TitleText>
        </Layout.Header.Content>
        <Layout.Header.Slot />
      </Layout.Header.Outer>
      <Layout.Content
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{padding: 24, gap: 20}}>
        {children}
      </Layout.Content>
    </Layout.Screen>
  )
}
export function Card({children}: {children: ReactNode}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.p_lg,
        a.gap_md,
        a.border,
        a.rounded_lg,
        t.atoms.border_contrast_low,
        t.atoms.bg,
      ]}>
      {children}
    </View>
  )
}
export function Field({
  label,
  value,
  onChange,
  multiline = false,
  secret = false,
}: {
  label: string
  value: string
  onChange: (s: string) => void
  multiline?: boolean
  secret?: boolean
}) {
  const t = useTheme()
  return (
    <View style={[a.gap_sm]}>
      <Text style={[a.font_semi_bold]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint="Preencha este campo"
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        secureTextEntry={secret}
        autoCapitalize="none"
        style={[
          a.border,
          a.rounded_sm,
          a.p_md,
          t.atoms.border_contrast_medium,
          t.atoms.text,
          {minHeight: 48},
        ]}
      />
    </View>
  )
}
export function Action({
  label,
  onPress,
  disabled = false,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Button
      label={label}
      onPress={onPress}
      disabled={disabled}
      size="small"
      color="primary">
      <ButtonText>{label}</ButtonText>
    </Button>
  )
}
export function NoticeText({
  children,
  error = false,
}: {
  children: ReactNode
  error?: boolean
}) {
  const t = useTheme()
  return (
    <Text
      accessibilityLiveRegion={error ? 'assertive' : 'polite'}
      style={[
        a.text_md,
        a.leading_snug,
        error ? {color: t.palette.negative_600} : t.atoms.text_contrast_medium,
      ]}>
      {children}
    </Text>
  )
}
export function Status({
  pending,
  error,
  onRetry,
}: {
  pending?: boolean
  error?: Error | null
  onRetry?: () => void
}) {
  if (pending)
    return (
      <ActivityIndicator
        accessibilityLabel="Carregando"
        accessibilityHint="Aguarde a resposta do serviço"
      />
    )
  if (error)
    return (
      <Card>
        <NoticeText error>{error.message}</NoticeText>
        {onRetry && <Action label="Tentar novamente" onPress={onRetry} />}
      </Card>
    )
  return null
}
export function ServiceNotice() {
  const {hasSession} = useSession()
  if (!hasSession)
    return (
      <NoticeText>
        Conecte sua conta AQUA para usar sua identidade e acessar os recursos.
      </NoticeText>
    )
  if (!ECOSYSTEM_CONFIGURED)
    return (
      <Card>
        <NoticeText>
          Conexão com o serviço AQUA não configurada. Nenhum dado ou operação
          será simulado.
        </NoticeText>
      </Card>
    )
  return null
}
export function ResourceLinks() {
  return (
    <View style={[a.flex_row, a.flex_wrap, a.gap_lg]}>
      {[
        ['/creators', 'Creators'],
        ['/communities', 'Communities'],
        ['/portals', 'Portals'],
        ['/charts', 'Charts'],
        ['/apps', 'Games & Apps'],
        ['/broadcast', 'Broadcast'],
        ['/wallet', 'Wallet'],
        ['/analytics', 'Analytics'],
        ['/verification/request', 'Solicitar verificação'],
      ].map(([to, label]) => (
        <Link key={to} to={to} label={label}>
          <Text
            style={[
              a.text_sm,
              a.font_semi_bold,
              {color: '#002BEF', paddingVertical: 12},
            ]}>
            {label}
          </Text>
        </Link>
      ))}
    </View>
  )
}
