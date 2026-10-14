import {type ScheduleItem} from './types'
export function validateSchedule(items: ScheduleItem[]) {
  const sorted = [...items].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt),
  )
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i]!
    if (
      !Number.isFinite(Date.parse(item.startAt)) ||
      !Number.isFinite(Date.parse(item.endAt)) ||
      Date.parse(item.startAt) >= Date.parse(item.endAt)
    )
      throw new Error('Intervalo inválido')
    if (i && Date.parse(sorted[i - 1]!.endAt) > Date.parse(item.startAt))
      throw new Error('Programas sobrepostos')
    if (
      (!item.mediaUri && !item.liveSource) ||
      (item.mediaUri && item.liveSource)
    )
      throw new Error('Defina uma única fonte')
  }
  return sorted
}
export function nowAndNext(items: ScheduleItem[], now = Date.now()) {
  const sorted = validateSchedule(items)
  return {
    now: sorted.find(
      i => Date.parse(i.startAt) <= now && now < Date.parse(i.endAt),
    ),
    next: sorted.find(i => Date.parse(i.startAt) > now),
    archive: sorted.filter(i => Date.parse(i.endAt) <= now),
  }
}
