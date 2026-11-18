import {type AquaIdentityConfig, type Failure} from './types'

export function assessAbuse(
  config: Pick<
    AquaIdentityConfig,
    'inviteRequired' | 'captchaEnabled' | 'captchaSiteKey'
  >,
  input: {inviteCode?: string; captchaToken?: string},
): {ok: true} | Failure {
  if (config.inviteRequired && !input.inviteCode?.trim()) {
    return {ok: false, reason: 'invite-required'}
  }
  if (config.captchaEnabled) {
    // A token the browser invented is not a check. Without a site key the
    // BFF cannot verify anything, so signup fails closed.
    if (!config.captchaSiteKey || !input.captchaToken?.trim()) {
      return {ok: false, reason: 'captcha-required'}
    }
  }
  return {ok: true}
}

/** Client-side presence is not proof. The BFF or PDS must verify the token. */
export function captchaIsConfigured(
  config: Pick<AquaIdentityConfig, 'captchaEnabled' | 'captchaSiteKey'>,
): boolean {
  return config.captchaEnabled && config.captchaSiteKey.length > 0
}
