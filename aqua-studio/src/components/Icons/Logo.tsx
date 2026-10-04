/** AQUA mark: ring in the current color. */
function Logo({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" height={size} width={size} role="img" aria-label="Aqua">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="4.5" />
    </svg>
  )
}

export default Logo
