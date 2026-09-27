import {type AppBskyFeedDefs, type BskyAgent} from '@atproto/api'

import {DEMO_FEED} from '#/lib/demo'
import {type FeedAPI, type FeedAPIResponse} from './types'

export class DemoFeedAPI implements FeedAPI {
  agent: BskyAgent

  constructor({agent}: {agent: BskyAgent}) {
    this.agent = agent
  }

  async peekLatest({
    limit = 1,
  }: {
    limit?: number
  } = {}): Promise<AppBskyFeedDefs.FeedViewPost[]> {
    return DEMO_FEED.feed.slice(0, limit)
  }

  async fetch(): Promise<FeedAPIResponse> {
    return DEMO_FEED
  }
}
