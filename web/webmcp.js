// This script belongs to the web document and runs independently of React.
;(function () {
  const modelContext = document.modelContext || navigator.modelContext
  if (typeof modelContext?.registerTool !== 'function') return

  async function register() {
    await modelContext.registerTool({
      name: 'get_aqua_site_guide',
      description:
        'Read the AQUA Social overview and find links to its public features, contact and terms.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: {readOnlyHint: true},
      async execute(_input, {signal} = {}) {
        const response = await fetch('/llms.txt', {signal})
        if (!response.ok) throw new Error('The AQUA site guide is unavailable.')
        return response.text()
      },
    })
  }

  // An unavailable browser permission must not interfere with loading the app.
  register().catch(error =>
    console.warn('AQUA WebMCP tool registration failed', error),
  )
})()
