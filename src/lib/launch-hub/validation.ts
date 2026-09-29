import {getAdapter} from '#/lib/launch-hub/adapters'
import {
  FIELD_LABELS,
  getLaunchType,
  type LaunchTypeField,
} from '#/lib/launch-hub/launch-types'
import {getProvider} from '#/lib/launch-hub/providers'
import {
  type ContentPackage,
  type DestinationValidation,
  type LaunchDestination,
  type LaunchType,
  type ManagedProfile,
  type ValidationIssue,
} from '#/lib/launch-hub/types'

export function getFieldValue(content: ContentPackage, field: LaunchTypeField) {
  if (field.startsWith('music.')) {
    const key = field.slice('music.'.length) as keyof NonNullable<
      ContentPackage['music']
    >
    return content.music?.[key]
  }
  return content[field as 'title' | 'description' | 'link']
}

/** Checks that apply to the launch as a whole, before any destination. */
export function validateLaunchContent(
  type: LaunchType,
  content: ContentPackage,
): ValidationIssue[] {
  return getLaunchType(type)
    .required.filter(field => !getFieldValue(content, field)?.trim())
    .map(field => ({
      level: 'blocked' as const,
      message: `${FIELD_LABELS[field]} é obrigatório.`,
    }))
}

export function summarize(issues: ValidationIssue[]): DestinationValidation {
  return {
    level: issues.some(i => i.level === 'blocked')
      ? 'blocked'
      : issues.length
        ? 'warning'
        : 'ready',
    issues,
  }
}

/**
 * Per-destination readiness. Incompatible content is reported, never
 * silently dropped.
 */
export function validateDestination({
  type,
  content,
  destination,
  profile,
}: {
  type: LaunchType
  content: ContentPackage
  destination: Pick<LaunchDestination, 'customCaption' | 'customTitle'>
  profile: ManagedProfile | undefined
}): DestinationValidation {
  if (!profile) {
    return summarize([
      {
        level: 'blocked',
        message: 'Perfil não encontrado entre as contas conectadas.',
      },
    ])
  }
  const provider = getProvider(profile.provider)
  const adapter = getAdapter(profile.provider)
  if (!adapter.isConfigured()) {
    return summarize([
      {
        level: 'blocked',
        message: `Integração com ${provider.name} ainda não configurada.`,
      },
    ])
  }
  if (profile.status !== 'connected') {
    return summarize([
      {level: 'blocked', message: 'Conexão expirada. Reconecte a conta.'},
    ])
  }
  if (profile.unavailableReason) {
    return summarize([{level: 'blocked', message: profile.unavailableReason}])
  }
  return summarize([
    ...validateLaunchContent(type, content),
    ...adapter.validateContent({type, content, destination, profile}),
  ])
}
