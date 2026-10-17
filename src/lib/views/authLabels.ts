import {msg} from '@lingui/macro'
import {useLingui} from '@lingui/react'

const CREATE_ACCOUNT = msg`Create account`
const SIGN_IN = msg`Sign in`

/**
 * Aqua Views is a pt-BR surface. When the active catalog is Portuguese, use
 * that translation; otherwise still show the pt-BR wording so the logged-out
 * banner does not fall back to the English source strings.
 */
export function useViewsAuthLabels() {
  const {_, i18n} = useLingui()
  const portuguese = i18n.locale.toLowerCase().startsWith('pt')
  return {
    createAccount: portuguese ? _(CREATE_ACCOUNT) : 'Criar conta',
    signIn: portuguese ? _(SIGN_IN) : 'Entrar',
  }
}
