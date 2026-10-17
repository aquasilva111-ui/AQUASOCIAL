import {
  type ContentSemanticsInput,
  type SemanticEvent,
} from '#/lib/conventions/types'

/**
 * Shape of `ViewEvent` from `#/lib/views/events`. Kept structural so the
 * engine does not import the view recorder just to read an event.
 */
export type ViewEventLike = {
  id?: string
  contentUri: string
  contentType: string
  viewerDid?: string
  sessionId?: string
  surface: string
  eventType: string
  timestamp?: string
  visibleMs?: number
  watchMs?: number
  progress?: number
  source?: string
}

export function viewEventToSemanticEvent(
  event: ViewEventLike,
  content?: ContentSemanticsInput,
  now = new Date().toISOString(),
): SemanticEvent | null {
  if (!event.viewerDid || !event.contentUri || !event.eventType) return null
  return {
    id:
      event.id ??
      `view:${event.contentUri}:${event.eventType}:${event.timestamp ?? now}`,
    subjectId: event.viewerDid,
    eventType: event.eventType,
    timestamp: event.timestamp ?? now,
    contentUri: event.contentUri,
    content: {
      ...content,
      uri: content?.uri ?? event.contentUri,
      contentType: content?.contentType ?? event.contentType,
    },
    context: {
      surface: event.surface,
      sessionId: event.sessionId,
      contentType: event.contentType,
      ...(content?.creatorDid ? {creator: content.creatorDid} : {}),
    },
    source: 'behavior',
    watchMs: event.watchMs,
    visibleMs: event.visibleMs,
    progress: event.progress,
    scope: 'personal',
    classification: content?.classification,
  }
}
