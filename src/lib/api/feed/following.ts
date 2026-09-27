import {type AppBskyFeedDefs, type BskyAgent} from '@atproto/api'

import {type FeedAPI, type FeedAPIResponse} from './types'

export class FollowingFeedAPI implements FeedAPI {
  agent: BskyAgent

  constructor({agent}: {agent: BskyAgent}) {
    this.agent = agent
  }

  async peekLatest({
    limit = 1,
  }: {
    limit?: number
  } = {}): Promise<AppBskyFeedDefs.FeedViewPost[]> {
    const res = await this.agent.getTimeline({
      limit,
    })
    return res.data.feed
  }

  async fetch({
    cursor,
    limit,
  }: {
    cursor: string | undefined
    limit: number
  }): Promise<FeedAPIResponse> {
    const res = await this.agent.getTimeline({
      cursor,
      limit,
    })
    if (res.success) {
      return {
        cursor: res.data.cursor,
        feed: res.data.feed,
      }
    }
    return {
      feed: [],
    }
  }
}
