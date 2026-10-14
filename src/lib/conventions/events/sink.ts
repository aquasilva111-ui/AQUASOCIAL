import {type SemanticEvent} from '#/lib/conventions/types'

export type ConventionEventSink = (event: SemanticEvent) => void

/** In-process sink. No queue, broker, or network. */
export function createConventionEventSink(handler: {
  processEvent(event: SemanticEvent): Promise<unknown>
}): ConventionEventSink {
  return event => {
    handler.processEvent(event).catch(() => undefined)
  }
}
