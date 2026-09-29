import {type ReactNode} from 'react'
import {View} from 'react-native'

import {getProvider} from '#/lib/launch-hub/providers'
import {
  type ConnectionStatus,
  type DestinationStatus,
  type DestinationValidation,
  type LaunchStatus,
  type ManagedProfile,
  type ProfileType,
  type ProviderId,
} from '#/lib/launch-hub/types'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'

export const PROFILE_TYPE_LABELS: Record<ProfileType, string> = {
  personal: 'Pessoal',
  professional: 'Profissional',
  brand: 'Marca',
  client: 'Cliente gerenciado',
}

export const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Conectado',
  needs_reconnect: 'Reconectar',
  revoked: 'Acesso revogado',
  not_configured: 'Não configurado',
}

export const LAUNCH_STATUS_LABELS: Record<LaunchStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  publishing: 'Publicando',
  published: 'Publicado',
  partial: 'Parcial',
  failed: 'Falhou',
}

export const DESTINATION_STATUS_LABELS: Record<DestinationStatus, string> = {
  pending: 'Pendente',
  scheduled: 'Agendado',
  processing: 'Processando',
  published: 'Publicado',
  failed: 'Falhou',
  skipped: 'Ignorado',
}

type Tone = 'neutral' | 'positive' | 'warning' | 'negative' | 'info'

const TONE_FOR_STATUS: Record<DestinationStatus | LaunchStatus, Tone> = {
  draft: 'neutral',
  pending: 'neutral',
  skipped: 'neutral',
  scheduled: 'info',
  publishing: 'info',
  processing: 'info',
  published: 'positive',
  partial: 'warning',
  failed: 'negative',
}

export function PillText({children, tone}: {children: ReactNode; tone: Tone}) {
  const t = useTheme()
  const colors: Record<Tone, {bg: string; fg: string}> = {
    neutral: {
      bg: t.atoms.bg_contrast_50.backgroundColor,
      fg: t.atoms.text_contrast_medium.color,
    },
    info: {bg: t.palette.primary_50, fg: t.palette.primary_600},
    positive: {bg: t.palette.positive_50, fg: t.palette.positive_700},
    warning: {bg: '#fff4e0', fg: '#9a5b00'},
    negative: {bg: t.palette.negative_50, fg: t.palette.negative_600},
  }
  const {bg, fg} = colors[tone]
  return (
    <Text
      style={[
        a.text_xs,
        a.font_bold,
        a.rounded_full,
        a.px_sm,
        a.self_start,
        a.overflow_hidden,
        {paddingVertical: 2, backgroundColor: bg, color: fg},
      ]}>
      {children}
    </Text>
  )
}

export function StatusPill({
  status,
}: {
  status: DestinationStatus | LaunchStatus
}) {
  const label =
    status in LAUNCH_STATUS_LABELS
      ? LAUNCH_STATUS_LABELS[status as LaunchStatus]
      : DESTINATION_STATUS_LABELS[status as DestinationStatus]
  return <PillText tone={TONE_FOR_STATUS[status]}>{label}</PillText>
}

export function ValidationPill({
  validation,
}: {
  validation: DestinationValidation
}) {
  switch (validation.level) {
    case 'ready':
      return <PillText tone="positive">Pronto</PillText>
    case 'warning':
      return <PillText tone="warning">Atenção</PillText>
    case 'blocked':
      return <PillText tone="negative">Bloqueado</PillText>
  }
}

/** Monogram badge; brand artwork is intentionally not bundled. */
export function ProviderBadge({
  provider,
  size = 32,
}: {
  provider: ProviderId
  size?: number
}) {
  const {monogram, color} = getProvider(provider)
  return (
    <View
      style={[
        a.rounded_full,
        a.align_center,
        a.justify_center,
        {width: size, height: size, backgroundColor: color},
      ]}>
      <Text
        style={[
          a.font_bold,
          {color: '#fff', fontSize: size * (monogram.length > 2 ? 0.28 : 0.36)},
        ]}>
        {monogram}
      </Text>
    </View>
  )
}

export function ProfileAvatar({
  profile,
  size = 36,
}: {
  profile: ManagedProfile
  size?: number
}) {
  if (profile.avatar || profile.provider === 'aqua') {
    return <UserAvatar avatar={profile.avatar} size={size} type="user" />
  }
  return <ProviderBadge provider={profile.provider} size={size} />
}

export function SectionTitleText({children}: {children: ReactNode}) {
  const t = useTheme()
  return (
    <Text
      style={[
        a.text_xs,
        a.font_bold,
        t.atoms.text_contrast_medium,
        {letterSpacing: 0.8, textTransform: 'uppercase'},
      ]}>
      {children}
    </Text>
  )
}

export function Card({children}: {children: ReactNode}) {
  const t = useTheme()
  return (
    <View
      style={[
        a.border,
        a.rounded_md,
        a.p_md,
        a.gap_sm,
        t.atoms.border_contrast_low,
        t.atoms.bg,
      ]}>
      {children}
    </View>
  )
}

export function NoticeText({children}: {children: ReactNode}) {
  const t = useTheme()
  return (
    <Text
      style={[
        a.text_sm,
        a.leading_snug,
        a.rounded_sm,
        a.p_sm,
        a.overflow_hidden,
        t.atoms.bg_contrast_25,
        t.atoms.text_contrast_medium,
      ]}>
      {children}
    </Text>
  )
}
