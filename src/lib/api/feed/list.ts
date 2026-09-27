import {
  type Agent,
  type AppBskyFeedDefs,
  type AppBskyFeedGetListFeed as GetListFeed,
} from '@atproto/api'

import {type FeedAPI, type FeedAPIResponse} from './types'

export class ListFeedAPI implements FeedAPI {
  agent: Agent
  params: GetListFeed.QueryParams

  constructor({
    agent,
    feedParams,
  }: {
    agent: Agent
    feedParams: GetListFeed.QueryParams
  }) {
    this.agent = agent
    this.params = feedParams
  }

  async peekLatest({
    limit = 1,
  }: {
    limit?: number
  } = {}): Promise<AppBskyFeedDefs.FeedViewPost[]> {
    const res = await this.agent.app.bsky.feed.getListFeed({
      ...this.params,
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
    const res = await this.agent.app.bsky.feed.getListFeed({
      ...this.params,
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
