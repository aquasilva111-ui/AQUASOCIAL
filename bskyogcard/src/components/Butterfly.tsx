import React from 'react'

/**
 * Aqua eye (option A). The export name stays `Butterfly` so existing
 * OG-card imports keep working.
 */
export function Butterfly(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 1100 1100"
      {...props}>
      <circle cx={550} cy={550} r={510} fill="#002BEF" />
      <circle cx={550} cy={550} r={320} fill="#FFFFFF" />
      <circle cx={550} cy={550} r={205} fill="#7EC8F5" />
      <circle cx={550} cy={550} r={96} fill="#000000" />
    </svg>
  )
}
