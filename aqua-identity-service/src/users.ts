import {randomUUID} from 'node:crypto'
import {type DatabaseSync} from 'node:sqlite'

import {
  deleteIdentity,
  findIdentity,
  findUser,
  findUserByDid,
  insertIdentity,
  insertUser,
  isUniqueError,
  listIdentities,
  setPasswordHash,
  setUserDid,
  setUserHandle,
  withTransaction,
} from './db.ts'
import {isDid} from './handles.ts'
import {hashPassword} from './passwords.ts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LOGIN_PROVIDERS = new Set([
  'google',
  'apple',
  'github',
  'email',
  'atproto',
  'password',
])

export class AccountError extends Error {
  reason: string

  constructor(reason: string) {
    super(reason)
    this.reason = reason
  }
}

export type ExternalProfile = {
  provider: 'google' | 'apple' | 'github' | 'email' | 'atproto'
  subject: string
  email: string | null
}

export function normalizeEmail(value: string): string | undefined {
  const email = value.trim().toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > 320) return undefined
  return email
}

export function assertSubject(provider: string, subject: string): string {
  if (!LOGIN_PROVIDERS.has(provider)) throw new AccountError('invalid-subject')
  if (provider === 'email') {
    const email = normalizeEmail(subject)
    if (!email) throw new AccountError('invalid-subject')
    return email
  }
  if (provider === 'atproto') {
    if (!isDid(subject.trim())) throw new AccountError('invalid-subject')
    return subject.trim()
  }
  const value = subject.trim()
  if (!value || value.length > 256 || /\s/.test(value)) {
    throw new AccountError('invalid-subject')
  }
  return value
}

/**
 * Permissions use the internal id and, when the account has one, the DID.
 * The handle is a display label and is not part of this object.
 */
export function authorizationSubject(user: {id: string; did: string | null}): {
  userId: string
  did: string | null
} {
  return {userId: user.id, did: user.did}
}

/**
 * Looks up provider+subject only. A matching e-mail on another provider
 * does not select or merge an account.
 */
export function loginWithProvider(
  db: DatabaseSync,
  profile: ExternalProfile,
  now: number,
): {userId: string; created: boolean} {
  const subject = assertSubject(profile.provider, profile.subject)
  const existing = findIdentity(db, profile.provider, subject)
  if (existing) return {userId: existing.user_id, created: false}
  try {
    return withTransaction(db, () => {
      const again = findIdentity(db, profile.provider, subject)
      if (again) return {userId: again.user_id, created: false}
      const userId = randomUUID()
      insertUser(db, {
        id: userId,
        did: profile.provider === 'atproto' ? subject : null,
        handle: null,
        passwordHash: null,
        now,
      })
      insertIdentity(db, {
        id: randomUUID(),
        userId,
        provider: profile.provider,
        subject,
        email: profile.email,
        now,
      })
      return {userId, created: true}
    })
  } catch (error) {
    if (!isUniqueError(error)) throw error
    const winner = findIdentity(db, profile.provider, subject)
    if (winner) return {userId: winner.user_id, created: false}
    throw new AccountError('did-conflict')
  }
}

export function linkProvider(
  db: DatabaseSync,
  userId: string,
  profile: ExternalProfile,
  now: number,
): {userId: string; created: boolean} {
  const subject = assertSubject(profile.provider, profile.subject)
  const user = findUser(db, userId)
  if (!user) throw new AccountError('session-required')
  const existing = findIdentity(db, profile.provider, subject)
  if (existing) {
    if (existing.user_id !== userId) throw new AccountError('account-conflict')
    return {userId, created: false}
  }
  if (profile.provider === 'atproto') {
    if (user.did && user.did !== subject) throw new AccountError('did-conflict')
    const owner = findUserByDid(db, subject)
    if (owner && owner.id !== userId) throw new AccountError('account-conflict')
  }
  try {
    return withTransaction(db, () => {
      const again = findIdentity(db, profile.provider, subject)
      if (again) {
        if (again.user_id !== userId) throw new AccountError('account-conflict')
        return {userId, created: false}
      }
      insertIdentity(db, {
        id: randomUUID(),
        userId,
        provider: profile.provider,
        subject,
        email: profile.email,
        now,
      })
      if (profile.provider === 'atproto' && !user.did) {
        setUserDid(db, userId, subject, now)
      }
      return {userId, created: true}
    })
  } catch (error) {
    if (error instanceof AccountError) throw error
    if (!isUniqueError(error)) throw error
    const winner = findIdentity(db, profile.provider, subject)
    if (winner?.user_id === userId) return {userId, created: false}
    throw new AccountError('account-conflict')
  }
}

export function unlinkProvider(
  db: DatabaseSync,
  userId: string,
  provider: string,
  now: number,
) {
  if (!LOGIN_PROVIDERS.has(provider)) throw new AccountError('invalid-subject')
  const user = findUser(db, userId)
  if (!user) throw new AccountError('session-required')
  if (provider === 'email' && user.password_hash) {
    throw new AccountError('password-depends-on-email')
  }
  const identities = listIdentities(db, userId)
  const target = identities.find(item => item.provider === provider)
  if (!target) throw new AccountError('not-linked')
  if (identities.length <= 1) throw new AccountError('last-method')
  withTransaction(db, () => {
    deleteIdentity(db, target.id)
    if (provider === 'password') setPasswordHash(db, userId, null, now)
  })
}

export async function setLocalPassword(
  db: DatabaseSync,
  userId: string,
  password: string,
  now: number,
) {
  if (password.length < 8) throw new AccountError('password-too-short')
  if (password.length > 200) throw new AccountError('password-rejected')
  const user = findUser(db, userId)
  if (!user) throw new AccountError('session-required')
  const email = listIdentities(db, userId).find(
    item => item.provider === 'email',
  )
  if (!email) throw new AccountError('email-required')
  const passwordHash = await hashPassword(password)
  withTransaction(db, () => {
    setPasswordHash(db, userId, passwordHash, now)
    const current = listIdentities(db, userId).find(
      item => item.provider === 'password',
    )
    if (!current) {
      insertIdentity(db, {
        id: randomUUID(),
        userId,
        provider: 'password',
        subject: userId,
        email: null,
        now,
      })
    }
  })
}

export function recordDisplayHandle(
  db: DatabaseSync,
  userId: string,
  handle: string,
  now: number,
) {
  const user = findUser(db, userId)
  if (!user?.did) throw new AccountError('missing-did')
  setUserHandle(db, userId, handle, now)
  const updated = findUser(db, userId)
  if (!updated) throw new AccountError('session-required')
  return {
    authorization: authorizationSubject(updated),
    handle: updated.handle,
  }
}
