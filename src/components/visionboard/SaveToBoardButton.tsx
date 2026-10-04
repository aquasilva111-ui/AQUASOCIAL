import {useEffect, useMemo, useState} from 'react'

import {boardsContaining} from '#/lib/visionboard/boards'
import {
  useBoardsQuery,
  usePinsByBoardQuery,
} from '#/state/queries/visionboard-boards'
import {useRequireAuth, useSession} from '#/state/session'
import * as Dialog from '#/components/Dialog'
import {type SaveTarget, SaveToBoardDialog} from './SaveToBoardDialog'
import {Capsule} from './VisionboardCapsule'

/** Titles of the user's boards that already hold this exact image. */
export function useSavedBoardTitles(target: SaveTarget, enabled: boolean) {
  const {currentAccount} = useSession()
  const did = enabled ? currentAccount?.did : undefined
  const boards = useBoardsQuery(did)
  const pins = usePinsByBoardQuery(did)
  return useMemo(() => {
    if (!boards.data || !pins.data) return []
    const held = new Set(
      boardsContaining(
        pins.data,
        {uri: target.post.uri, cid: target.post.cid},
        target.imageIndex,
      ),
    )
    return boards.data.filter(b => held.has(b.uri)).map(b => b.board.title)
  }, [
    boards.data,
    pins.data,
    target.post.uri,
    target.post.cid,
    target.imageIndex,
  ])
}

/**
 * "Salvar" capsule that opens the board picker. The dialog (and its board
 * queries) mount on first press only, so a grid of hundreds of cards stays
 * cheap.
 */
export function SaveToBoardButton({
  target,
  variant = 'glass',
  compact,
  showSavedIn,
}: {
  target: SaveTarget
  variant?: 'glass' | 'ink'
  compact?: boolean
  /** Reads the user's boards up front to label the button "Salvo em X ✓". */
  showSavedIn?: boolean
}) {
  const control = Dialog.useDialogControl()
  const requireAuth = useRequireAuth()
  const [armed, setArmed] = useState(false)
  const savedIn = useSavedBoardTitles(target, !!showSavedIn)

  useEffect(() => {
    if (armed) control.open()
  }, [armed, control])

  const saved = savedIn.length > 0 || !!target.post.viewer?.bookmarked
  const label = savedIn.length
    ? `Salvo em ${savedIn[0]}${savedIn.length > 1 ? ` +${savedIn.length - 1}` : ''} ✓`
    : saved
      ? 'Salvo ✓'
      : 'Salvar'

  const onPress = () =>
    requireAuth(() => {
      if (armed) control.open()
      else setArmed(true)
    })

  return (
    <>
      <Capsule
        label={
          saved ? 'Salvo. Escolher visionboard' : 'Salvar em um visionboard'
        }
        variant={variant}
        compact={compact}
        active={saved}
        onPress={onPress}
        text={label}
      />
      {armed && <SaveToBoardDialog control={control} target={target} />}
    </>
  )
}
