import {randomBytes} from 'node:crypto'

import {argon2id, argon2Verify} from 'hash-wasm'

/**
 * Local AQUA passwords only. Google, Apple, GitHub, and Bluesky passwords
 * are never accepted or hashed. OWASP argon2id: 19 MiB, 2 iterations, p=1.
 */
const MEMORY_KIB = 19_456
const ITERATIONS = 2
const PARALLELISM = 1
const HASH_LENGTH = 32

export async function hashPassword(password: string): Promise<string> {
  const encoded = await argon2id({
    password,
    salt: randomBytes(16),
    parallelism: PARALLELISM,
    iterations: ITERATIONS,
    memorySize: MEMORY_KIB,
    hashLength: HASH_LENGTH,
    outputType: 'encoded',
  })
  if (!encoded.startsWith('$argon2id$')) {
    throw new Error('password hash must be argon2id')
  }
  return encoded
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  if (!encoded.startsWith('$argon2id$')) return false
  return argon2Verify({password, hash: encoded})
}
