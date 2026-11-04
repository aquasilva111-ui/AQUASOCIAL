/**
 * Camada semântica para o Git pessoal do AQUA.
 *
 * Transforma commits técnicos em commits com significado:
 * tipo de mudança, escopo (ferramenta/item), descrição humana
 * e tags opcionais ligadas a Convenções de Realidade ou intenção criativa.
 */

export type SemanticType =
  | 'feat'
  | 'fix'
  | 'style'
  | 'content'
  | 'structure'
  | 'remix'
  | 'archive'
  | 'chore'

export interface SemanticCommit {
  type: SemanticType
  scope?: string
  description: string
  tags?: string[]
  body?: string
}

/** Formata um SemanticCommit no estilo Conventional Commits + tags. */
export function formatSemanticMessage(sc: SemanticCommit): string {
  const header = sc.scope
    ? `${sc.type}(${sc.scope}): ${sc.description}`
    : `${sc.type}: ${sc.description}`

  const parts = [header]
  if (sc.body) parts.push('', sc.body)
  if (sc.tags && sc.tags.length > 0) {
    parts.push('', `Tags: ${sc.tags.join(', ')}`)
  }
  return parts.join('\n')
}

/**
 * Sugestão simples de mensagem semântica baseada no tipo de item e tamanho da mudança.
 * Pode ser estendido depois com análise real de conteúdo (imagem, texto, áudio).
 */
export function suggestSemanticMessage(
  itemType: string,
  previousSize = 0,
  newSize = 0,
  hint?: string
): SemanticCommit {
  const delta = newSize - previousSize
  const scope = itemType.toLowerCase()

  if (hint) {
    return { type: 'content', scope, description: hint }
  }

  if (previousSize === 0) {
    return { type: 'feat', scope, description: `criado ${itemType}` }
  }
  if (newSize === 0) {
    return { type: 'archive', scope, description: `removido ${itemType}` }
  }
  if (Math.abs(delta) < 50) {
    return { type: 'style', scope, description: `ajuste fino em ${itemType}` }
  }
  if (delta > 0) {
    return { type: 'content', scope, description: `expandido ${itemType}` }
  }
  return { type: 'structure', scope, description: `refatorado ${itemType}` }
}

/** Extrai informação semântica de uma mensagem de commit (melhor esforço). */
export function parseSemanticMessage(message: string): Partial<SemanticCommit> | null {
  const lines = message.trim().split('\n')
  const header = lines[0]
  const match = header.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/)
  if (!match) return null

  const result: Partial<SemanticCommit> = {
    type: match[1] as SemanticType,
    scope: match[2],
    description: match[3]
  }

  const tagsLine = lines.find((l) => l.startsWith('Tags:'))
  if (tagsLine) {
    result.tags = tagsLine.replace('Tags:', '').split(',').map((t) => t.trim()).filter(Boolean)
  }
  return result
}
