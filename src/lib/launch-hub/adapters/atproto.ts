import {
  type $Typed,
  type AppBskyEmbedImages,
  type AppBskyFeedPost,
  RichText,
} from '@atproto/api'

import {uploadBlob} from '#/lib/api'
import {MAX_GRAPHEME_LENGTH, POST_IMG_MAX} from '#/lib/constants'
import {getLaunchType} from '#/lib/launch-hub/launch-types'
import {resolveAssetUri} from '#/lib/launch-hub/media-cache'
import {
  type ContentPackage,
  type LaunchDestination,
  type ProviderCapabilities,
  type ValidationIssue,
} from '#/lib/launch-hub/types'
import {compressIfNeeded} from '#/lib/media/manip'
import {LONG_TEXT_FIELD, splitLongPost} from '#/lib/strings/long-post'
import {
  type AdapterContext,
  type ProviderAdapter,
  type PublishJob,
  type ValidationInput,
} from './types'

const POST_COLLECTION = 'app.bsky.feed.post'
const MAX_IMAGES = 4

const CAPABILITIES: ProviderCapabilities = {
  supports: ['text', 'image', 'multi_image', 'alt_text', 'link'],
  limits: {maxTextGraphemes: MAX_GRAPHEME_LENGTH, maxImages: MAX_IMAGES},
}

/** The text a destination will actually post. */
export function composePostText(
  content: ContentPackage,
  destination: Pick<LaunchDestination, 'customCaption' | 'customTitle'>,
) {
  let text = destination.customCaption?.trim() || content.text.trim()
  if (!text) {
    const title = destination.customTitle?.trim() || content.title?.trim()
    text = [title, content.description?.trim()].filter(Boolean).join('\n\n')
  }
  const link = content.link?.trim()
  if (link && !text.includes(link)) {
    text = text ? `${text}\n\n${link}` : link
  }
  return text
}

function isRecordNotFound(e: unknown) {
  const message = e instanceof Error ? e.message : String(e)
  return (
    message.includes('Could not locate record') ||
    (e as {error?: string})?.error === 'RecordNotFound'
  )
}

/**
 * AQUA destination: publishes an AT Protocol post with the account that is
 * signed in to the app, reusing the existing session (no second auth).
 * The destination's idempotency key is the record key, so a retry after a
 * lost response finds the earlier post instead of creating a duplicate.
 */
export const atprotoAdapter: ProviderAdapter = {
  isConfigured: () => true,

  getCapabilities: () => CAPABILITIES,

  renderPreview: ({content, destination}) => ({
    text: composePostText(content, destination),
    media: content.media.filter(m => m.kind === 'image'),
  }),

  validateContent({type, content, destination}: ValidationInput) {
    const issues: ValidationIssue[] = []
    const text = composePostText(content, destination)
    const images = content.media.filter(m => m.kind === 'image')
    const other = content.media.filter(m => m.kind !== 'image')

    if (!text && images.length === 0) {
      issues.push({level: 'blocked', message: 'Adicione um texto ou imagem.'})
    }
    const length = new RichText({text}).graphemeLength
    if (length > MAX_GRAPHEME_LENGTH) {
      issues.push({
        level: 'blocked',
        message: `O texto tem ${length} caracteres; o limite é ${MAX_GRAPHEME_LENGTH}.`,
      })
    }
    if (images.length > MAX_IMAGES) {
      issues.push({
        level: 'blocked',
        message: `No máximo ${MAX_IMAGES} imagens por post.`,
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
    for (const asset of other) {
      issues.push({
        level: 'warning',
        message: `${asset.kind === 'audio' ? 'Áudio' : 'Vídeo'} não é enviado para o AQUA ainda; só o post sai.`,
      })
    }
    if (type !== 'social_post') {
      issues.push({
        level: 'warning',
        message: `${getLaunchType(type).label}: sai no AQUA como post de anúncio.`,
      })
    }
    return issues
  },

  async publish(
    {destination, profile, launch}: PublishJob,
    {agent}: AdapterContext,
  ) {
    const repo = profile.externalProfileId
    if (agent.session?.did !== repo) {
      throw new Error(
        `Troque para ${profile.handle ? '@' + profile.handle : 'esta conta'} para publicar.`,
      )
    }
    const rkey = destination.idempotencyKey
    const postPath = `/profile/${profile.handle || repo}/post/${rkey}`

    try {
      const existing = await agent.com.atproto.repo.getRecord({
        repo,
        collection: POST_COLLECTION,
        rkey,
      })
      return {
        remotePostId: existing.data.uri,
        remoteUrl: postPath,
        alreadyPublished: true,
      }
    } catch (e) {
      if (!isRecordNotFound(e)) throw e
    }

    const rt = new RichText({
      text: composePostText(launch.contentPackage, destination),
    })
    await rt.detectFacets(agent)

    const images = launch.contentPackage.media.filter(m => m.kind === 'image')
    let embed: $Typed<AppBskyEmbedImages.Main> | undefined
    if (images.length) {
      embed = {
        $type: 'app.bsky.embed.images',
        images: await Promise.all(
          images.map(async asset => {
            const uri = resolveAssetUri(asset)
            if (!uri) throw new Error('Imagem indisponível neste dispositivo.')
            const compressed = await compressIfNeeded(
              {
                path: uri,
                mime: asset.mime,
                width: asset.width ?? 0,
                height: asset.height ?? 0,
                size: asset.size ?? Infinity,
              },
              POST_IMG_MAX.size,
            )
            const res = await uploadBlob(
              agent,
              compressed.path,
              compressed.mime,
            )
            return {
              image: res.data.blob,
              alt: asset.alt ?? '',
              aspectRatio:
                compressed.width && compressed.height
                  ? {width: compressed.width, height: compressed.height}
                  : undefined,
            }
          }),
        ),
      }
    }

    const {text, facets, longText} = splitLongPost(rt)
    const record: $Typed<AppBskyFeedPost.Record> = {
      $type: POST_COLLECTION,
      text,
      facets,
      ...(longText && {[LONG_TEXT_FIELD]: longText}),
      embed,
      createdAt: new Date().toISOString(),
    }
    const res = await agent.com.atproto.repo.createRecord({
      repo,
      collection: POST_COLLECTION,
      rkey,
      record,
    })
    return {remotePostId: res.data.uri, remoteUrl: postPath}
  },

  async delete(remotePostId, {agent}) {
    const [, , repo, , rkey] = remotePostId.split('/')
    await agent.com.atproto.repo.deleteRecord({
      repo,
      collection: POST_COLLECTION,
      rkey,
    })
  },
}
