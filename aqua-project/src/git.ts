import git from 'isomorphic-git'

/**
 * Git-backed history for a project (isomorphic-git, MIT). One repository per project,
 * one file per item (`items/<id>`), one commit per save. Gives what snapshots do not:
 * branches (try a variation of a design/doc) and a remote to sync with later.
 *
 * `fs` is injected: IndexedDB (`@isomorphic-git/lightning-fs`) in the browser, memfs in tests.
 */
export type GitFs = Parameters<typeof git.init>[0]['fs']

export interface GitCommit {
  oid: string
  message: string
  at: string
}

const AUTHOR = { name: 'AQUA', email: 'noreply@aquaapp.online' }
const path = (itemId: string) => `items/${itemId}`

export class ProjectGit {
  constructor(
    private fs: GitFs,
    private dir = '/project'
  ) {}

  async init(): Promise<void> {
    await git.init({ fs: this.fs, dir: this.dir, defaultBranch: 'main' })
  }

  /** Commits the bytes as the item's new content. Returns null when nothing changed. */
  async commitItem(itemId: string, bytes: Uint8Array, message: string, at = new Date()): Promise<string | null> {
    const file = path(itemId)
    const full = `${this.dir}/${file}`
    await mkdirp(this.fs, `${this.dir}/items`)
    await (this.fs as any).promises.writeFile(full, bytes)
    await git.add({ fs: this.fs, dir: this.dir, filepath: file })
    const status = await git.status({ fs: this.fs, dir: this.dir, filepath: file })
    if (status === 'unmodified') return null
    return git.commit({
      fs: this.fs,
      dir: this.dir,
      message: message || 'Salvo',
      author: { ...AUTHOR, timestamp: Math.floor(at.getTime() / 1000) }
    })
  }

  /** Commits that touched the item, newest first, on the current branch. */
  async history(itemId: string): Promise<GitCommit[]> {
    const file = path(itemId)
    const log = await git.log({ fs: this.fs, dir: this.dir, filepath: file })
    return log.map((e) => ({ oid: e.oid, message: e.commit.message.trim(), at: new Date(e.commit.author.timestamp * 1000).toISOString() }))
  }

  async readAt(itemId: string, oid: string): Promise<Uint8Array> {
    const { blob } = await git.readBlob({ fs: this.fs, dir: this.dir, oid, filepath: path(itemId) })
    return blob
  }

  async branches(): Promise<string[]> {
    return git.listBranches({ fs: this.fs, dir: this.dir })
  }

  currentBranch(): Promise<string | void> {
    return git.currentBranch({ fs: this.fs, dir: this.dir }).then((b) => b ?? undefined)
  }

  /** New branch from the current commit; checks it out. */
  async branch(name: string): Promise<void> {
    await git.branch({ fs: this.fs, dir: this.dir, ref: name, checkout: true })
  }

  async checkout(name: string): Promise<void> {
    await git.checkout({ fs: this.fs, dir: this.dir, ref: name })
  }

  /** Current content of an item on the checked-out branch. */
  async read(itemId: string): Promise<Uint8Array | undefined> {
    try {
      const log = await git.log({ fs: this.fs, dir: this.dir, depth: 1 })
      return await this.readAt(itemId, log[0].oid)
    } catch {
      return undefined
    }
  }
}

async function mkdirp(fs: GitFs, dir: string) {
  await (fs as any).promises.mkdir(dir, { recursive: true })
}
