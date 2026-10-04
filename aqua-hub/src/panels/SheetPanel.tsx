import { useEffect, useRef, useState } from 'react'

import type { SheetSession } from 'aqua-runtime/src/adapters/sheet'

import { useSession } from './hooks'

/** Univer is loaded only when a sheet is opened (it is ~7 MB of JS). */
export default function SheetPanel({ itemId }: { itemId: string }) {
  const { session } = useSession<SheetSession>(itemId)
  const host = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('Carregando planilha…')

  useEffect(() => {
    if (!session || !host.current) return
    let dispose = () => {}
    let dead = false
    ;(async () => {
      const [{ createUniver, LocaleType, mergeLocales }, { UniverSheetsCorePreset }, enUS] = await Promise.all([
        import('@univerjs/presets'),
        import('@univerjs/preset-sheets-core'),
        import('@univerjs/preset-sheets-core/locales/en-US'),
        import('@univerjs/preset-sheets-core/lib/index.css')
      ])
      if (dead || !host.current) return
      const { univerAPI, univer } = createUniver({
        locale: LocaleType.EN_US,
        locales: { [LocaleType.EN_US]: mergeLocales(enUS.default) },
        presets: [UniverSheetsCorePreset({ container: host.current })]
      })
      univerAPI.createWorkbook((session.state.workbook as never) ?? { name: session.state.title })
      setStatus('')
      let timer: ReturnType<typeof setTimeout> | undefined
      const save = () => {
        const wb = univerAPI.getActiveWorkbook()
        if (!wb) return
        const values = wb.getActiveSheet().getDataRange().getValues() as SheetSession['state']['values']
        session.setSnapshot(wb.save() as never, values)
      }
      const sub = univerAPI.addEvent(univerAPI.Event.CommandExecuted, () => {
        clearTimeout(timer)
        timer = setTimeout(save, 600)
      })
      dispose = () => {
        clearTimeout(timer)
        save()
        sub.dispose()
        univer.dispose()
      }
    })().catch((e) => setStatus(`Não consegui abrir a planilha: ${e.message}`))
    return () => {
      dead = true
      dispose()
    }
  }, [session])

  return (
    <>
      {status && <p className="note">{status}</p>}
      <div ref={host} style={{ height: 'calc(100vh - 140px)', border: '1px solid var(--line)' }} />
    </>
  )
}
