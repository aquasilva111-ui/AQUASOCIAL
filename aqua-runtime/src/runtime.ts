import {
  addItem,
  exportsFor,
  launchableFor,
  linkItem,
  removeItem,
  moveItem,
  renameItem,
  saveItem,
  type AssetRef,
  type AssetStore,
  type ItemKind,
  type LaunchCapability,
  type Project,
  type ProjectItem
} from 'aqua-project/src/index'

import type { CollabTransport, ExportedFile, ToolAdapter, ToolSession } from './types'

export interface RuntimeOptions {
  project: Project
  store: AssetStore
  adapters: ToolAdapter[]
  transport?: CollabTransport
  /** Idle time after the last edit before an automatic save. 0 disables autosave (use `save`). */
  autosaveMs?: number
  /** Called whenever the project record changes, so the host can persist it. */
  onProject?: (project: Project) => void
  /** Snapshot-history depth for tools without native undo. */
  historyLimit?: number
}

interface Open {
  session: ToolSession
  adapter: ToolAdapter
  dirty: boolean
  timer?: ReturnType<typeof setTimeout>
  past: Uint8Array[]
  future: Uint8Array[]
  applying: boolean
  offs: (() => void)[]
}

export class ToolNotAvailableError extends Error {
  constructor(kind: ItemKind) {
    super(`Tool not available yet: ${kind}`)
  }
}

export class CreativeRuntime {
  project: Project
  private open = new Map<string, Open>()
  private adapters = new Map<ItemKind, ToolAdapter>()

  constructor(private opts: RuntimeOptions) {
    this.project = opts.project
    for (const a of opts.adapters) this.adapters.set(a.kind, a)
  }

  /** Kinds this runtime can open now; the rest of the Hub's tools are still to come. */
  availableKinds(): ItemKind[] {
    return [...this.adapters.keys()]
  }

  async create(kind: ItemKind, name: string): Promise<ProjectItem> {
    const adapter = this.adapterFor(kind)
    const added = addItem(this.project, kind, name)
    this.setProject(added.project)
    const session = adapter.create(name)
    this.attach(added.item.id, adapter, session)
    await this.save(added.item.id, 'Criado')
    return this.project.items.find((i) => i.id === added.item.id)!
  }

  async openItem(itemId: string): Promise<ToolSession> {
    const existing = this.open.get(itemId)
    if (existing) return existing.session
    const item = this.item(itemId)
    const adapter = this.adapterFor(item.kind)
    let session: ToolSession
    if (item.head) {
      const blob = await this.opts.store.get(item.head)
      if (!blob) throw new Error(`Asset missing for item ${itemId}`)
      session = adapter.open(blob.bytes)
    } else {
      session = adapter.create(item.name)
    }
    this.attach(itemId, adapter, session)
    return session
  }

  async save(itemId: string, message = ''): Promise<AssetRef | undefined> {
    const o = this.open.get(itemId)
    if (!o) return undefined
    clearTimeout(o.timer)
    const { project, ref } = await saveItem(this.project, this.opts.store, itemId, o.session.serialize(), o.adapter.mime, message)
    o.dirty = false
    if (project !== this.project) this.setProject(project)
    return ref
  }

  /** Saves every item with unsaved edits. Call before closing the app. */
  async flush(): Promise<void> {
    await Promise.all([...this.open].filter(([, o]) => o.dirty).map(([id]) => this.save(id, 'Autosave')))
  }

  undo(itemId: string): boolean {
    const o = this.mustOpen(itemId)
    const h = o.session.history
    if (h) {
      if (!h.canUndo()) return false
      h.undo()
      return true
    }
    const prev = o.past.pop()
    if (!prev || !o.session.restore) return false
    o.future.push(o.session.serialize())
    this.applySnapshot(o, prev)
    return true
  }

  redo(itemId: string): boolean {
    const o = this.mustOpen(itemId)
    const h = o.session.history
    if (h) {
      if (!h.canRedo()) return false
      h.redo()
      return true
    }
    const next = o.future.pop()
    if (!next || !o.session.restore) return false
    o.past.push(o.session.serialize())
    this.applySnapshot(o, next)
    return true
  }

  canUndo(itemId: string): boolean {
    const o = this.mustOpen(itemId)
    return o.session.history ? o.session.history.canUndo() : o.past.length > 0
  }

  rename(itemId: string, name: string): void {
    this.setProject(renameItem(this.project, itemId, name))
  }

  /** Reorders the project's item list (drag and drop in the sidebar). */
  move(itemId: string, toIndex: number): void {
    this.setProject(moveItem(this.project, itemId, toIndex))
  }

  async remove(itemId: string): Promise<void> {
    this.close(itemId)
    this.setProject(removeItem(this.project, itemId))
  }

  /** Embeds `target` (another item or an asset) in `itemId`, so the pair is tracked and `usedBy` works. */
  link(itemId: string, target: { type: 'item'; id: string } | { type: 'asset'; hash: string }): void {
    this.setProject(linkItem(this.project, itemId, target))
  }

  /** Asset picker model: items other tools can embed, optionally filtered by kind. */
  pickable(kinds?: ItemKind[], excludeId?: string): ProjectItem[] {
    return this.project.items.filter((i) => i.head && i.id !== excludeId && (!kinds || kinds.includes(i.kind)))
  }

  /** Items that can be sent to a Launch Hub destination accepting `capability`. */
  launchable(capability: LaunchCapability): ProjectItem[] {
    return launchableFor(this.project.items, capability).map((i) => i as ProjectItem)
  }

  /** The file to hand to the Launch Hub, or undefined when the tool cannot render that capability here. */
  async exportForLaunch(itemId: string, capability: LaunchCapability): Promise<ExportedFile | undefined> {
    const item = this.item(itemId)
    if (!exportsFor(item.kind).some((e) => e.capability === capability)) return undefined
    const session = await this.openItem(itemId)
    return session.export?.(capability)
  }

  close(itemId: string): void {
    const o = this.open.get(itemId)
    if (!o) return
    clearTimeout(o.timer)
    o.offs.forEach((off) => off())
    o.session.dispose()
    this.open.delete(itemId)
  }

  private attach(itemId: string, adapter: ToolAdapter, session: ToolSession): void {
    const o: Open = { session, adapter, dirty: false, past: [], future: [], applying: false, offs: [] }
    this.open.set(itemId, o)
    const limit = this.opts.historyLimit ?? 100
    let last = session.serialize()

    o.offs.push(
      session.onChange(() => {
        if (o.applying) return
        if (!session.history) {
          o.past.push(last)
          if (o.past.length > limit) o.past.shift()
          o.future = []
        }
        last = session.serialize()
        o.dirty = true
        const ms = this.opts.autosaveMs ?? 0
        if (ms > 0) {
          clearTimeout(o.timer)
          o.timer = setTimeout(() => void this.save(itemId, 'Autosave'), ms)
        }
      })
    )

    const transport = this.opts.transport
    const collab = session.collab
    if (transport && collab) {
      // Messages: [kind, ...payload]. 0 = update; 1 = hello with my state vector (reply, then ask me back);
      // 2 = state diff; 3 = state vector, reply only. Both sides end up with each other's history.
      const send = (kind: number, payload: Uint8Array) => {
        const msg = new Uint8Array(payload.length + 1)
        msg[0] = kind
        msg.set(payload, 1)
        transport.publish(itemId, msg)
      }
      o.offs.push(collab.onLocalUpdate((u) => send(0, u)))
      o.offs.push(
        transport.subscribe(itemId, (msg) => {
          const body = msg.subarray(1)
          if (msg[0] === 1) {
            send(2, collab.diff(body))
            send(3, collab.stateVector())
          } else if (msg[0] === 3) send(2, collab.diff(body))
          else collab.applyRemote(body)
        })
      )
      send(1, collab.stateVector()) // a peer joining catches up with whoever is already here
    }
  }

  private applySnapshot(o: Open, bytes: Uint8Array): void {
    o.applying = true
    try {
      o.session.restore!(bytes)
    } finally {
      o.applying = false
    }
    o.dirty = true
  }

  private setProject(p: Project): void {
    this.project = p
    this.opts.onProject?.(p)
  }

  private item(id: string): ProjectItem {
    const i = this.project.items.find((x) => x.id === id)
    if (!i) throw new Error(`Item not found: ${id}`)
    return i
  }

  private adapterFor(kind: ItemKind): ToolAdapter {
    const a = this.adapters.get(kind)
    if (!a) throw new ToolNotAvailableError(kind)
    return a
  }

  private mustOpen(id: string): Open {
    const o = this.open.get(id)
    if (!o) throw new Error(`Item is not open: ${id}`)
    return o
  }
}
