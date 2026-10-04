export type PublishMessage = {
  type: 'aqua-docs:publish'
  title: string
  /** Documento exportado em Markdown (BlockNote blocksToMarkdownLossy). */
  markdown: string
  /** Documento exportado em HTML (BlockNote blocksToHTMLLossy). */
  html: string
}

function download(filename: string, text: string, mime: string) {
  const blob = new Blob([text], {type: mime})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadMarkdown(title: string, markdown: string) {
  download(
    `${title || 'documento'}.md`,
    markdown,
    'text/markdown;charset=utf-8',
  )
}

export function downloadHtml(title: string, html: string) {
  download(`${title || 'documento'}.html`, html, 'text/html;charset=utf-8')
}

/**
 * Envia o documento exportado para o app AQUA que incorpora o Docs. A
 * mensagem só vai para a origem dada em ?host=, nunca "*". Sem host
 * (standalone) o Markdown é baixado como arquivo.
 */
export function publishToAqua(opts: {
  host: string | null
  title: string
  markdown: string
  html: string
}) {
  const {host, title, markdown, html} = opts
  const target = window.parent !== window ? window.parent : window.opener
  if (host && target) {
    const msg: PublishMessage = {
      type: 'aqua-docs:publish',
      title,
      markdown,
      html,
    }
    target.postMessage(msg, host)
    return 'sent' as const
  }
  downloadMarkdown(title, markdown)
  return 'downloaded' as const
}
