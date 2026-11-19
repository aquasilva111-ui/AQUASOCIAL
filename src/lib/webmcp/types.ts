/**
 * The slice of WebMCP this app registers.
 *
 * Current browsers expose `document.modelContext`. `navigator.modelContext`
 * is the earlier surface (removed in Chromium 150). Both are feature-detected;
 * neither is required for the page to load.
 */
export type WebMcpJsonSchema = {
  type: 'object'
  additionalProperties: false
  properties: Record<string, WebMcpJsonSchemaProperty>
  required?: string[]
}

export type WebMcpJsonSchemaProperty = {
  type: 'string' | 'integer'
  description: string
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  default?: string | number
  enum?: string[]
}

export type WebMcpToolAnnotations = {
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
}

export type WebMcpExecuteOptions = {
  signal?: AbortSignal
}

export type WebMcpTool = {
  name: string
  title: string
  description: string
  inputSchema: WebMcpJsonSchema
  annotations: WebMcpToolAnnotations
  execute: (
    input: unknown,
    options?: WebMcpExecuteOptions,
  ) => Promise<unknown> | unknown
}

export type WebMcpModelContext = {
  registerTool: (
    tool: WebMcpTool,
    options?: {signal?: AbortSignal},
  ) => void | Promise<void>
}

export type WebMcpScope = {
  navigator?: unknown
  document?: unknown
}
