import {type Attributes, SpanStatusCode, trace} from '@opentelemetry/api'

const tracer = trace.getTracer('aqua.conventions')

const SAFE_KEYS = new Set([
  'aqua.convention.event_type',
  'aqua.convention.count',
  'aqua.convention.synapse_count',
  'aqua.convention.surface',
  'aqua.convention.content_type',
  'aqua.convention.enabled',
  'aqua.convention.result',
])

function safeAttributes(attributes: Attributes): Attributes {
  const safe: Attributes = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (!SAFE_KEYS.has(key)) continue
    if (typeof value === 'string') {
      if (value.length > 80) continue
      safe[key] = value
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      safe[key] = value
    } else if (typeof value === 'boolean') {
      safe[key] = value
    }
  }
  return safe
}

/** Spans carry counts and types, never titles, queries, or graph text. */
export async function withConventionSpan<T>(
  name: string,
  attributes: Attributes,
  fn: () => Promise<T>,
): Promise<T> {
  let span: ReturnType<typeof tracer.startSpan> | undefined
  try {
    span = tracer.startSpan(name, {attributes: safeAttributes(attributes)})
  } catch {
    return fn()
  }
  try {
    const result = await fn()
    span.setStatus({code: SpanStatusCode.OK})
    return result
  } catch (error) {
    try {
      span.recordException(
        error instanceof Error ? error : new Error('convention'),
      )
      span.setStatus({code: SpanStatusCode.ERROR})
    } catch {
      // Telemetry must not replace the original failure.
    }
    throw error
  } finally {
    try {
      span.end()
    } catch {
      // Ignore a broken tracer.
    }
  }
}
