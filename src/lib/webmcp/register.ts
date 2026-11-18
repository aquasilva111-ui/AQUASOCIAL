import {buildWebMcpTools, type WebMcpDeps} from '#/lib/webmcp/tools'
import {
  type WebMcpModelContext,
  type WebMcpScope,
  type WebMcpTool,
} from '#/lib/webmcp/types'
import {logger} from '#/logger'
import {isWeb} from '#/platform/detection'

let registeredTools = new WeakMap<object, Set<string>>()

export function resetWebMcpRegistrationForTests() {
  registeredTools = new WeakMap()
}

/**
 * Feature-detect every model context the browser actually exposes.
 * `navigator.modelContext` is checked first. `document.modelContext` is the
 * current WebMCP surface and is registered too when it is a different object.
 */
export function collectModelContexts(
  scope?: WebMcpScope,
): WebMcpModelContext[] {
  const source = scope ?? defaultScope()
  const found: WebMcpModelContext[] = []
  const seen = new Set<object>()
  for (const holder of [source.navigator, source.document]) {
    const candidate = readModelContext(holder)
    if (!candidate || seen.has(candidate)) continue
    if (typeof candidate.registerTool !== 'function') continue
    seen.add(candidate)
    found.push(candidate)
  }
  return found
}

export async function registerWebMcpOnLoad(options: {
  isWeb?: boolean
  contexts?: WebMcpModelContext[]
  deps: WebMcpDeps
}): Promise<{registered: string[]}> {
  if (!(options.isWeb ?? isWeb)) return {registered: []}
  try {
    const contexts = options.contexts ?? collectModelContexts()
    const tools = buildWebMcpTools(options.deps)
    const registered: string[] = []
    for (const context of contexts) {
      const names = await registerTools(context, tools)
      for (const name of names) {
        if (!registered.includes(name)) registered.push(name)
      }
    }
    return {registered}
  } catch (err) {
    logger.warn('webmcp: registration failed', {
      message: err instanceof Error ? err.message : String(err),
    })
    return {registered: []}
  }
}

async function registerTools(
  context: WebMcpModelContext,
  tools: WebMcpTool[],
): Promise<string[]> {
  const registered: string[] = []
  for (const tool of tools) {
    if (hasTool(context, tool.name)) continue
    markTool(context, tool.name)
    try {
      await context.registerTool(tool)
      registered.push(tool.name)
    } catch (err) {
      unmarkTool(context, tool.name)
      logger.warn('webmcp: registerTool failed', {
        message: err instanceof Error ? err.message : String(err),
        tool: tool.name,
      })
    }
  }
  return registered
}

function defaultScope(): WebMcpScope {
  return {
    navigator: typeof navigator === 'undefined' ? undefined : navigator,
    document: typeof document === 'undefined' ? undefined : document,
  }
}

function readModelContext(holder: unknown): WebMcpModelContext | null {
  if (!holder || (typeof holder !== 'object' && typeof holder !== 'function')) {
    return null
  }
  try {
    const candidate = (holder as {modelContext?: unknown}).modelContext
    if (!candidate || typeof candidate !== 'object') return null
    return candidate as WebMcpModelContext
  } catch {
    return null
  }
}

function toolSet(context: object): Set<string> {
  let names = registeredTools.get(context)
  if (!names) {
    names = new Set()
    registeredTools.set(context, names)
  }
  return names
}

function hasTool(context: object, name: string): boolean {
  return registeredTools.get(context)?.has(name) ?? false
}

function markTool(context: object, name: string) {
  toolSet(context).add(name)
}

function unmarkTool(context: object, name: string) {
  registeredTools.get(context)?.delete(name)
}
