import {RichText} from '@atproto/api'

import {composePostText} from '#/lib/launch-hub/adapters/atproto'
import {resolveAssetUri} from '#/lib/launch-hub/media-cache'
import {
  type ProviderCapabilities,
  type ValidationIssue,
} from '#/lib/launch-hub/types'
import {LONG_TEXT_FIELD, splitLongPost} from '#/lib/strings/long-post'
import {
  type AdapterContext,
  type DestinationPreview,
  type ProviderAdapter,
  type PublishJob,
  type ValidationInput,
} from './types'

const MASTODON_STATUS_LIMIT = 500
const MASTODON_MAX_IMAGES = 4

const CAPABILITIES: ProviderCapabilities = {
  supports: ['text', 'image', 'multi_image', 'alt_text', 'link'],
  limits: {
    maxTextGraphemes: MASTODON_STATUS_LIMIT,
    maxImages: MASTODON_MAX_IMAGES,
  },
}

function mastodonApi(
  instance: string,
  token: string,
  path: string,
  init?: RequestInit,
) {
  const base = instance.replace(/\/$/, '')
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
}

async function mastodonUploadMedia(
  instance: string,
  token: string,
  assetUri: string,
  mime: string,
  alt: string,
): Promise<string> {
  const body = new FormData()
  body.append(
    'image',
    {uri: assetUri, name: 'aqua-upload', type: mime} as never,
    mime,
  )
  body.append('description', alt)
  const res = await mastodonApi(instance, token, '/api/v2/media', {
    method: 'POST',
    body,
  })
  const data = (await res.json()) as {id?: string}
  if (!res.ok || !data.id) {
    throw new Error(
      `Falha ao enviar mídia para o Mastodon: ${await res
        .text()
        .then(t => t)
        .catch(() => res.statusText)}`,
    )
  }
  return String(data.id)
}

/**
 * Launch Hub phase 1 — Mastodon destination.
 *
 * Publishes through the official Mastodon API (`/api/v1/statuses` + `/api/v2/media`)
 * using the OAuth token of the connected instance. The token itself is never
 * part of the domain model: it travels in the adapter context only.
 */
export const mastodonAdapter: ProviderAdapter = {
  isConfigured: () => true,

  getCapabilities: () => CAPABILITIES,

  renderPreview: ({content, destination}): DestinationPreview => {
    const text = composePostText(content, destination)
    const images = content.media.filter(m => m.kind === 'image')
    return {
      text,
      media: images,
      textLength: new RichText({text}).graphemeLength,
      limit: MASTODON_STATUS_LIMIT,
      alt: images[0]?.alt,
    }
  },

  validateContent: ({
    content,
    destination,
  }: ValidationInput): ValidationIssue[] => {
    const issues: ValidationIssue[] = []
    const text = composePostText(content, destination)
    const images = content.media.filter(m => m.kind === 'image')

    if (!text && images.length === 0) {
      issues.push({level: 'blocked', message: 'Adicione um texto ou imagem.'})
    }
    const length = new RichText({text}).graphemeLength
    if (length > MASTODON_STATUS_LIMIT) {
      issues.push({
        level: 'blocked',
        message: `O texto tem ${length} caracteres; o limite do Mastodon é ${MASTODON_STATUS_LIMIT}.`,
      })
    }
    if (images.some(img => !resolveAssetUri(img))) {
      issues.push({
        level: 'blocked',
        message:
          'Uma imagem não está mais disponível neste dispositivo. Anexe de novo.',
      })
    }
    if (images.some(img => !img.alt?.trim())) {
      issues.push({level: 'warning', message: 'Imagem sem texto alternativo.'})
    }
    return issues
  },

  async publish({destination, launch}: PublishJob, {mastodon}: AdapterContext) {
    const token = mastodon?.accessToken ?? ''
    const instance = mastodon?.instance ?? ''
    if (!token || !instance) {
      throw new Error('Conexão com o Mastodon não encontrada.')
    }

    const text = composePostText(launch.contentPackage, destination)
    const rt = new RichText({text})
    const {text: postText, facets, longText} = splitLongPost(rt)
    const status: Record<string, unknown> = {
      status: postText,
      ...(facets ? {facets: facets as never} : {}),
      ...(longText ? {[LONG_TEXT_FIELD]: longText} : {}),
    }

    const images = launch.contentPackage.media.filter(m => m.kind === 'image')
    const mediaIds: string[] = []
    for (const asset of images) {
      const uri = resolveAssetUri(asset)
      if (!uri) throw new Error('Imagem indisponível neste dispositivo.')
      mediaIds.push(
        await mastodonUploadMedia(
          instance,
          token,
          uri,
          asset.mime,
          asset.alt ?? '',
        ),
      )
    }
    if (mediaIds.length) {
      status.media_ids = mediaIds
    }

    const res = await mastodonApi(instance, token, '/api/v1/statuses', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(status),
    })
    const data = (await res.json()) as {id?: string; url?: string}
    if (!res.ok) {
      throw new Error(
        await res
          .text()
          .then(t => t)
          .catch(() => res.statusText),
      )
    }
    return {remotePostId: data.id, remoteUrl: data.url}
  },

  async delete(remotePostId, ctx) {
    const token = ctx?.mastodon?.accessToken ?? ''
    const instance = ctx?.mastodon?.instance ?? ''
    const id = String(remotePostId).split('/').pop() ?? String(remotePostId)
    const res = await mastodonApi(instance, token, `/api/v1/statuses/${id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      throw new Error(
        await res
          .text()
          .then(t => t)
          .catch(() => res.statusText),
      )
    }
  },
}
