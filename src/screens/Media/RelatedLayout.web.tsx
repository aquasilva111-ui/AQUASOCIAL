import {type ReactNode} from 'react'
import {useWindowDimensions} from 'react-native'
import {createPortal} from 'react-dom'

export function RelatedLayout({children}: {children: ReactNode}) {
  const {width} = useWindowDimensions()
  if (width < 1300) return <>{children}</>
  return createPortal(
    <aside
      aria-label="Related media"
      style={{
        position: 'fixed',
        top: 64,
        left: 'calc(50% + 314px)',
        width: 'min(300px, calc(50vw - 330px))',
        maxHeight: 'calc(100vh - 164px)',
        overflowY: 'auto',
      }}>
      {children}
    </aside>,
    document.body,
  )
}
