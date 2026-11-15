function studioUrl(value: string | undefined) {
  if (!value?.trim()) return null
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}

const studio = studioUrl(import.meta.env.VITE_AQUA_MATHSTUDIO_URL)

export function MathStudioLauncher() {
  return (
    <section className="mathstudio-launcher" aria-label="Aqua MathStudio">
      <strong>Aqua MathStudio</strong>
      {studio ? (
        <a href={studio} target="_blank" rel="noopener noreferrer">
          Abrir Aqua MathStudio ↗
        </a>
      ) : (
        <small>Em preparação</small>
      )}
    </section>
  )
}
