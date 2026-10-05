/// <reference lib="dom" />
/* eslint-disable bsky-internal/avoid-unwrapped-text -- web-only file that renders raw DOM elements, not React Native <Text> */
import {useRef, useState} from 'react'

import {ACCEPTED_IMAGE_TYPES} from '#/lib/visionboard/uploads'
import {type DroppedFile, type ImageDropZoneProps} from './ImageDropZone.types'

export type {DroppedFile, ImageDropZoneProps} from './ImageDropZone.types'

const ACCEPT = ACCEPTED_IMAGE_TYPES.join(',')

/**
 * Drag-and-drop area (plus a file picker) for images from the computer.
 * Dropped files are handed to `onFiles`; validation and upload happen there.
 */
export function ImageDropZone({
  onFiles,
  busy,
  progress,
  compact,
  color,
}: ImageDropZoneProps) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const take = (list: FileList | null | undefined) => {
    if (busy || !list?.length) return
    onFiles(Array.from(list) as DroppedFile[])
  }

  const border = over ? color : `${color}55`
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Arraste imagens aqui ou clique para escolher do computador"
      onClick={() => !busy && input.current?.click()}
      onKeyDown={e => {
        if ((e.key === 'Enter' || e.key === ' ') && !busy) {
          e.preventDefault()
          input.current?.click()
        }
      }}
      onDragEnter={e => {
        e.preventDefault()
        setOver(true)
      }}
      onDragOver={e => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setOver(true)
      }}
      onDragLeave={e => {
        // ignore leaves into a child element
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOver(false)
        }
      }}
      onDrop={e => {
        e.preventDefault()
        setOver(false)
        take(e.dataTransfer.files)
      }}
      style={{
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: compact ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: compact ? 12 : 10,
        margin: compact ? '8px 40px 0' : '16px 40px 40px',
        padding: compact ? '14px 20px' : '56px 24px',
        minHeight: compact ? undefined : 260,
        borderRadius: 28,
        border: `2px dashed ${border}`,
        background: over ? `${color}14` : 'transparent',
        color,
        cursor: busy ? 'progress' : 'pointer',
        textAlign: 'center',
        transition: 'background 150ms, border-color 150ms',
        outline: 'none',
        fontFamily: 'inherit',
      }}>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={e => {
          take(e.target.files)
          e.target.value = '' // lets the same file be chosen again
        }}
      />
      <svg
        width={compact ? 22 : 40}
        height={compact ? 22 : 40}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{opacity: 0.7}}>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </svg>
      <div>
        <div style={{fontSize: compact ? 15 : 18, fontWeight: 600}}>
          {busy
            ? `Enviando imagens… ${progress ?? ''}`
            : over
              ? 'Solte para adicionar'
              : 'Arraste imagens aqui'}
        </div>
        {!busy && (
          <div style={{fontSize: 13, opacity: 0.65, marginTop: 2}}>
            ou clique para escolher do computador · JPG, PNG, WebP ou GIF
          </div>
        )}
      </div>
    </div>
  )
}
