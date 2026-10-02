import {useMutation} from '@tanstack/react-query'

import {DM_SERVICE_HEADERS} from '#/lib/constants'
import {storyReplyText} from '#/lib/stories/player'
import {useAgent} from '#/state/session'

/**
 * Replies and reactions to a story are sent as a direct message to its
 * author. A story is its own record type (not a post), so there is no
 * public thread to reply to; a DM keeps it private and reuses AQUA's
 * existing chat, moderation, blocks and notifications.
 */
export function useSendStoryReply() {
  const agent = useAgent()
  return useMutation({
    mutationFn: async ({
      did,
      kind,
      body,
    }: {
      did: string
      kind: 'reply' | 'reaction'
      body: string
    }) => {
      const text = storyReplyText(kind, body)
      if (!text) throw new Error('empty_reply')
      const {data} = await agent.chat.bsky.convo.getConvoForMembers(
        {members: [did]},
        {headers: DM_SERVICE_HEADERS},
      )
      await agent.chat.bsky.convo.sendMessage(
        {convoId: data.convo.id, message: {text}},
        {encoding: 'application/json', headers: DM_SERVICE_HEADERS},
      )
    },
  })
}
