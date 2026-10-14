import {type Automaton, type ContextLayer, type Workspace} from './types'

export type ProviderId = 'openai' | 'kimi' | 'anthropic' | 'gemini' | 'local'
export type AIMessage = {role: 'user' | 'assistant' | 'system'; content: string}
export interface AIProviderAdapter {
  id: ProviderId
  capabilities: {tools: boolean; files: boolean; streaming: boolean}
  sendMessage(messages: AIMessage[], signal: AbortSignal): Promise<string>
  stream?(messages: AIMessage[], signal: AbortSignal): AsyncIterable<string>
  cancel(): void
  estimateUsage(messages: AIMessage[]): {estimatedInputTokens: number}
  supportsTools(): boolean
  supportsFiles(): boolean
}
export type ProviderTransport = (
  id: ProviderId,
  messages: AIMessage[],
  signal: AbortSignal,
) => Promise<string>
/** Transport must point to an authenticated server gateway; never a provider secret in the UI. */
export class GatewayAdapter implements AIProviderAdapter {
  private controller?: AbortController
  constructor(
    public id: ProviderId,
    private transport: ProviderTransport,
    public capabilities = {tools: false, files: false, streaming: false},
  ) {}
  async sendMessage(messages: AIMessage[], signal: AbortSignal) {
    const controller = new AbortController()
    this.controller = controller
    const abort = () => controller.abort()
    signal.addEventListener('abort', abort, {once: true})
    if (signal.aborted) abort()
    try {
      return await this.transport(this.id, messages, controller.signal)
    } finally {
      signal.removeEventListener('abort', abort)
    }
  }
  cancel() {
    this.controller?.abort()
  }
  estimateUsage(messages: AIMessage[]) {
    return {
      estimatedInputTokens: Math.ceil(
        messages.reduce((n, m) => n + m.content.length, 0) / 4,
      ),
    }
  }
  supportsTools() {
    return this.capabilities.tools
  }
  supportsFiles() {
    return this.capabilities.files
  }
}
export class OpenAIAdapter extends GatewayAdapter {
  constructor(t: ProviderTransport) {
    super('openai', t)
  }
}
export class KimiAdapter extends GatewayAdapter {
  constructor(t: ProviderTransport) {
    super('kimi', t)
  }
}
export class AnthropicAdapter extends GatewayAdapter {
  constructor(t: ProviderTransport) {
    super('anthropic', t)
  }
}
export class GeminiAdapter extends GatewayAdapter {
  constructor(t: ProviderTransport) {
    super('gemini', t)
  }
}
export class LocalAdapter extends GatewayAdapter {
  constructor(t: ProviderTransport) {
    super('local', t)
  }
}

export interface KnowledgeExtension {
  synthesize(query: string, workspaceId: string): Promise<string | undefined>
}
export interface ConventionExtension {
  constraints(workspaceId: string): Promise<string[]>
}
export interface SynapseExtension {
  related(reference: string): Promise<string[]>
}
export function selectContext(
  workspace: Workspace,
  layers: ContextLayer[],
  maxCharacters = 12000,
) {
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 0)
    throw new Error('Limite inválido')
  return layers
    .map(l => `${l}: ${workspace.context[l] ?? ''}`)
    .join('\n')
    .slice(0, maxCharacters)
}
export type MissionPlan = {
  status: 'ready' | 'NEEDS_DECISION' | 'not_configured'
  strategy: 'deterministic' | 'cache' | 'local' | 'external'
  reason: string
  taskIds: string[]
}
export function planMission(
  intent: string,
  workspace: Workspace,
  availableTools: string[],
  providers: ProviderId[],
): MissionPlan {
  const taskIds = workspace.tasks
    .filter(t => t.status === 'pending')
    .map(t => t.id)
  if (availableTools.includes(intent))
    return {
      status: 'ready',
      strategy: 'deterministic',
      reason: 'Ferramenta conhecida disponível.',
      taskIds,
    }
  if (workspace.tasks.some(t => t.status === 'NEEDS_DECISION'))
    return {
      status: 'NEEDS_DECISION',
      strategy: 'deterministic',
      reason: 'Há uma decisão pendente. As outras tarefas podem continuar.',
      taskIds,
    }
  if (providers.includes('local'))
    return {
      status: 'ready',
      strategy: 'local',
      reason: 'Modelo local configurado.',
      taskIds,
    }
  if (providers.length)
    return {
      status: 'ready',
      strategy: 'external',
      reason: 'Nenhuma ferramenta determinística resolve esta intenção.',
      taskIds,
    }
  return {
    status: 'not_configured',
    strategy: 'deterministic',
    reason: 'Nenhuma ferramenta ou IA configurada para esta intenção.',
    taskIds,
  }
}

export type AutomatonOperation = {
  capability: string
  mode: 'read' | 'write' | 'execute'
  target: string
  external?: boolean
}
export type AutomatonTool = {
  operation: AutomatonOperation
  run(signal: AbortSignal): Promise<string>
  succeeds(result: string): boolean
}
function within(target: string, scope: string) {
  if (
    !target ||
    target.startsWith('/') ||
    target.includes('..') ||
    target.includes('\\') ||
    target.includes('\0')
  )
    return false
  return scope.endsWith('/**')
    ? target.startsWith(scope.slice(0, -2))
    : target === scope
}
export function authorizeOperation(
  automaton: Automaton,
  operation: AutomatonOperation,
) {
  const {target, mode, capability} = operation
  if (!automaton.capabilities.includes(capability))
    return 'Capacidade não concedida'
  if (automaton.permissions.denied.some(s => within(target, s)))
    return 'Operação explicitamente negada'
  if (mode !== 'execute' && !automaton.territory.some(s => within(target, s)))
    return 'Fora do território'
  if (!automaton.permissions[mode].some(s => within(target, s)))
    return `Permissão ${mode} ausente`
  return undefined
}
/** Tools are trusted registered functions; no eval, shell execution or arbitrary code. */
export async function runAutomaton(
  input: Automaton,
  tools: AutomatonTool[],
  now = () => Date.now(),
): Promise<Automaton> {
  const automaton = structuredClone(input)
  if (!['NASCENT', 'EQUIPPED'].includes(automaton.status))
    throw new Error('Autômato não pode executar neste estado')
  if (
    !Number.isSafeInteger(automaton.limits.maxSteps) ||
    automaton.limits.maxSteps < 1 ||
    !Number.isSafeInteger(automaton.limits.maxExternalCalls) ||
    automaton.limits.maxExternalCalls < 0 ||
    !Number.isSafeInteger(automaton.limits.maxDurationMs) ||
    automaton.limits.maxDurationMs < 1 ||
    automaton.limits.maxDurationMs > 60000
  )
    throw new Error('Limites inválidos')
  automaton.status = 'RUNNING'
  const started = now()
  automaton.startedAt = new Date(started).toISOString()
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    automaton.limits.maxDurationMs,
  )
  let externalCalls = 0
  try {
    if (!tools.length) {
      automaton.status = 'BLOCKED'
      automaton.blockedReason = 'Nenhuma ferramenta registrada'
      return automaton
    }
    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i]!
      const denied = authorizeOperation(automaton, tool.operation)
      if (
        denied ||
        i >= automaton.limits.maxSteps ||
        now() - started >= automaton.limits.maxDurationMs ||
        (tool.operation.external &&
          ++externalCalls > automaton.limits.maxExternalCalls)
      ) {
        automaton.status = 'BLOCKED'
        automaton.blockedReason = denied ?? 'Limite de execução alcançado'
        break
      }
      const result = await Promise.race([
        tool.run(controller.signal),
        new Promise<never>((_, reject) => {
          if (controller.signal.aborted)
            reject(new Error('Tempo de execução excedido'))
          else
            controller.signal.addEventListener(
              'abort',
              () => reject(new Error('Tempo de execução excedido')),
              {once: true},
            )
        }),
      ])
      automaton.logs.push(`${tool.operation.mode}:${tool.operation.target}`)
      automaton.result = result
      if (!tool.succeeds(result)) {
        automaton.status = 'FAILED'
        automaton.blockedReason = 'Condição de sucesso não atendida'
        break
      }
    }
    if (automaton.status === 'RUNNING') automaton.status = 'COMPLETED'
  } catch (error) {
    automaton.status = 'FAILED'
    automaton.blockedReason =
      error instanceof Error ? error.message : 'Falha na ferramenta'
  } finally {
    clearTimeout(timer)
    controller.abort()
    automaton.finishedAt = new Date(now()).toISOString()
  }
  return automaton
}
