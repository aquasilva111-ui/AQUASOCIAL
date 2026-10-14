import {NoticeText} from './shared'

export function AppFrame({src, title}: {src: string; title: string}) {
  const url = new URL(src)
  if (url.protocol !== 'https:' || url.origin === window.location.origin)
    return (
      <NoticeText error>
        O runner exige uma origem HTTPS separada do AQUA.
      </NoticeText>
    )
  return (
    <iframe
      src={url.href}
      title={title}
      sandbox="allow-scripts"
      allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; clipboard-read 'none'; clipboard-write 'none'"
      referrerPolicy="no-referrer"
      style={{
        width: '100%',
        height: 480,
        border: '1px solid #7EC8F5',
        borderRadius: 12,
      }}
    />
  )
}
