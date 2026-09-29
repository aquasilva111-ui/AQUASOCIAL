import {type Attributes, SpanStatusCode, trace} from '@opentelemetry/api'

import {isWeb} from '#/platform/detection'

const tracer = trace.getTracer('aqua.views')
const SESSION_STORAGE_KEY = 'aqua-view-session-id'

export type ViewContentType =
  | 'post'
  | 'video'
  | 'image'
  | 'article'
  | 'book'
  | 'portal'
  | 'product'
  | 'livestream'
  | 'other'

export type ViewEventType =
  | 'impression'
  | 'view'
  | 'unique_view'
  | 'video_start'
  | 'video_progress'
  | 'video_complete'
  | 'play'
  | 'pause'
  | 'click'
  | 'expand'
  | 'watch_time'
  | 'live_join'
  | 'live_leave'
  | 'live_watch_time'

export type ViewSurface =
  | 'social'
  | 'view'
  | 'visionboard'
  | 'profile'
  | 'search'
  | 'portal'
  | 'community'
  | 'other'

export type ViewEventSource = 'aqua-client' | 'local-placeholder' | string

export type ViewEvent = {
  id?: string
  contentUri: string
  contentType: ViewContentType
  viewerDid?: string
  sessionId?: string
  surface: ViewSurface
  eventType: ViewEventType
  timestamp?: string
  visibleMs?: number
  watchMs?: number
  progress?: number
  source?: ViewEventSource
}

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

function getSessionId() {
  if (!isWeb) return createId()
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (existing) return existing
    const next = createId()
    sessionStorage.setItem(SESSION_STORAGE_KEY, next)
    return next
  } catch {
    return createId()
  }
}

type NormalizedViewEvent = ViewEvent & {
  id: string
  sessionId: string
  timestamp: string
  source: ViewEventSource
}

function eventAttributes(event: NormalizedViewEvent): Attributes {
  return {
    'aqua.view.event_id': event.id,
    'aqua.view.content_uri': event.contentUri,
    'aqua.view.content_type': event.contentType,
    'aqua.view.event_type': event.eventType,
    'aqua.view.surface': event.surface,
    'aqua.view.session_id': event.sessionId,
    'aqua.view.timestamp': event.timestamp,
    'aqua.view.source': event.source,
    ...(event.viewerDid ? {'aqua.view.viewer_did': event.viewerDid} : {}),
    ...(typeof event.visibleMs === 'number'
      ? {'aqua.view.visible_ms': event.visibleMs}
      : {}),
    ...(typeof event.watchMs === 'number'
      ? {'aqua.view.watch_ms': event.watchMs}
      : {}),
    ...(typeof event.progress === 'number'
      ? {'aqua.view.progress': event.progress}
      : {}),
  }
}

export function recordViewEvent(input: ViewEvent) {
  const event: NormalizedViewEvent = {
    id: input.id ?? createId(),
    contentUri: input.contentUri,
    contentType: input.contentType,
    viewerDid: input.viewerDid,
    sessionId: input.sessionId ?? getSessionId(),
    surface: input.surface,
    eventType: input.eventType,
    timestamp: input.timestamp ?? new Date().toISOString(),
    visibleMs: input.visibleMs,
    watchMs: input.watchMs,
    progress: input.progress,
    source: input.source ?? 'aqua-client',
  }
  const attributes = eventAttributes(event)
  const span = tracer.startSpan(`aqua.view.${event.eventType}`, {attributes})

  try {
    span.addEvent('aqua.view.event', attributes)
    span.setStatus({code: SpanStatusCode.OK})
  } catch (err) {
    span.recordException(err as Error)
    span.setStatus({code: SpanStatusCode.ERROR})
  } finally {
    span.end()
  }

  return event
}
