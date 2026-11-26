export default function BrandLogo({
  size = 'md',
  compact = false,
  tagline = 'Continuous trust',
  className = '',
}) {
  const iconSizes = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  }

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-2xl',
  }

  const taglineSizes = {
    sm: 'text-[9px]',
    md: 'text-[10px]',
    lg: 'text-xs',
    xl: 'text-xs',
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Hexagon Shield with Bee / Honeycomb motif */}
      <div
        className={`relative flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand/20 via-brand/10 to-transparent p-1.5 ring-1 ring-brand/30 shadow-glow-sm ${
          iconSizes[size] || iconSizes.md
        }`}
      >
        <svg
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="shieldGrad" x1="5" y1="3" x2="35" y2="37" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fb923c" />
              <stop offset="1" stopColor="#ea580c" />
            </linearGradient>
            <linearGradient id="shieldGlow" x1="20" y1="6" x2="20" y2="34" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f97316" stopOpacity="0.3" />
              <stop offset="1" stopColor="#c2570c" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Hexagonal Shield Outline */}
          <path
            d="M20 3.5L34.5 10.5V22C34.5 30 20 36.5 20 36.5C20 36.5 5.5 30 5.5 22V10.5L20 3.5Z"
            fill="url(#shieldGlow)"
            stroke="url(#shieldGrad)"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Honeycomb lattice background */}
          <path
            d="M20 12L24.5 14.5V19.5L20 22L15.5 19.5V14.5L20 12Z"
            stroke="#fb923c"
            strokeWidth="1.2"
            strokeOpacity="0.6"
            fill="none"
          />
          <path
            d="M15.5 19.5L11 22V27L15.5 29.5L20 27V22"
            stroke="#fb923c"
            strokeWidth="1.1"
            strokeOpacity="0.4"
            fill="none"
          />
          <path
            d="M24.5 19.5L29 22V27L24.5 29.5L20 27"
            stroke="#fb923c"
            strokeWidth="1.1"
            strokeOpacity="0.4"
            fill="none"
          />

          {/* Bee / Guard motif in foreground */}
          {/* Wings */}
          <ellipse
            cx="14"
            cy="16"
            rx="4"
            ry="2.2"
            transform="rotate(-30 14 16)"
            fill="#f5ede4"
            fillOpacity="0.5"
          />
          <ellipse
            cx="26"
            cy="16"
            rx="4"
            ry="2.2"
            transform="rotate(30 26 16)"
            fill="#f5ede4"
            fillOpacity="0.5"
          />

          {/* Bee Body (striped abdomen & head) */}
          <ellipse cx="20" cy="19.5" rx="2.8" ry="4.5" fill="#f97316" />
          <path d="M17.5 18H22.5M17.8 20.5H22.2M18.5 22.8H21.5" stroke="#14100c" strokeWidth="1" strokeLinecap="round" />
          {/* Head & antennae */}
          <circle cx="20" cy="14" r="1.8" fill="#fb923c" />
          <path d="M19 12.8L17.5 11M21 12.8L22.5 11" stroke="#f5ede4" strokeWidth="0.8" strokeLinecap="round" />
          {/* Stinger */}
          <path d="M20 24L20 25.5" stroke="#f97316" strokeWidth="1" strokeLinecap="round" />
        </svg>
      </div>

      {!compact && (
        <div className="min-w-0">
          <p className={`font-bold tracking-wider text-text ${textSizes[size] || textSizes.md}`}>
            HONEY<span className="bg-gradient-to-r from-brand-light to-brand-dark bg-clip-text text-transparent">TRAP</span>
          </p>
          {tagline && (
            <p className={`font-medium uppercase tracking-[0.18em] text-muted ${taglineSizes[size] || taglineSizes.md}`}>
              {tagline}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
