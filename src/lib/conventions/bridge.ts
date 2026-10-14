import {type ConventionEngine} from '#/lib/conventions/processor'
import {type ContentSemanticsInput} from '#/lib/conventions/types'
import {
  recordViewEvent,
  subscribeViewEvents,
  type ViewEvent,
} from '#/lib/views/events'

/**
 * Opt-in connection to the existing view events.
 * Nothing in Home, Feed, or Profile calls this. A disabled or failing
 * engine does not change the event that `recordViewEvent` returns.
 */
export function attachConventionEngine(
  engine: ConventionEngine,
  resolveContent?: (event: ViewEvent) => ContentSemanticsInput | undefined,
): () => void {
  return subscribeViewEvents(event => {
    if (!engine.enabled) return
    engine
      .ingestViewEvent(event, resolveContent?.(event))
      .catch(() => undefined)
  })
}

export async function recordViewForConventions(
  engine: ConventionEngine,
  input: ViewEvent,
  content?: ContentSemanticsInput,
): Promise<{event: ViewEvent; processed: boolean}> {
  const event = recordViewEvent(input)
  if (!engine.enabled) return {event, processed: false}
  try {
    const result = await engine.ingestViewEvent(event, content)
    return {event, processed: result.applied}
  } catch {
    return {event, processed: false}
  }
}
