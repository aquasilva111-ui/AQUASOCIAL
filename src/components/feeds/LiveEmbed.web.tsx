import {liveEmbedUrl} from '#/lib/streamplace'

/**
 * Streamplace live player embed (web) — iframe pointing at the node embed
 * route (`/embed/:user`), which carries the full player + chat UI.
 */
export function LiveEmbed({name}: {name: string}) {
  return (
    <iframe
      src={liveEmbedUrl(name)}
      title="Aqua Live"
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
      style={{
        width: '100%',
        aspectRatio: '16 / 9',
        border: 'none',
        borderRadius: 12,
        background: '#000',
        display: 'block',
      }}
    />
  )
}
