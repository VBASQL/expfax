type LogoProps = {
  className?: string;
  /** Render only the icon mark (no wordmark). */
  iconOnly?: boolean;
  /** Pixel height. Width is derived from the aspect ratio. */
  height?: number;
};

/**
 * Inline ExpFax / Expedia logo.
 *
 * Inlined (vs <img src="/logo.svg" />) so:
 *  - the SVG inherits the page's loaded Inter font (sharp, correct metrics)
 *  - text-rendering / shape-rendering hints apply
 *  - integer width/height avoid subpixel scaling
 */
export function Logo({ className, iconOnly = false, height = 36 }: LogoProps) {
  const aspect = iconOnly ? 1 : 1160 / 310;
  const width = Math.round(height * aspect);
  const viewBox = iconOnly ? "0 0 310 310" : "0 0 1160 310";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width={width}
      height={height}
      role="img"
      aria-label="ExpFax"
      className={className}
      style={{ fontFamily: "var(--font-inter), 'Inter', 'Helvetica Neue', Arial, sans-serif" }}
      shapeRendering="geometricPrecision"
      textRendering="geometricPrecision"
    >
      <defs>
        <linearGradient id="logoGreenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7DD957" />
          <stop offset="100%" stopColor="#2E9E3E" />
        </linearGradient>
        <radialGradient id="logoRayGlow" cx="20%" cy="80%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <clipPath id="logoIconClip">
          <rect x="5" y="5" width="300" height="300" rx="48" ry="48" />
        </clipPath>
      </defs>

      {/* Icon mark */}
      <g>
        <rect x="5" y="5" width="300" height="300" rx="48" ry="48" fill="url(#logoGreenGrad)" />
        <g clipPath="url(#logoIconClip)">
          <g transform="translate(60, 250)">
            <polygon points="0,0 360,-30 360,-10" fill="#ffffff" opacity="0.95" />
            <polygon points="0,0 360,-90 360,-65" fill="#ffffff" opacity="0.95" />
            <polygon points="0,0 340,-160 345,-130" fill="#ffffff" opacity="0.95" />
            <polygon points="0,0 290,-230 305,-205" fill="#ffffff" opacity="0.95" />
            <polygon points="0,0 220,-285 240,-265" fill="#ffffff" opacity="0.95" />
            <polygon points="0,0 130,-310 150,-300" fill="#ffffff" opacity="0.95" />
          </g>
          <rect x="5" y="5" width="300" height="300" fill="url(#logoRayGlow)" />
        </g>
        <circle cx="60" cy="250" r="10" fill="#ffffff" />
      </g>

      {/* Wordmark */}
      {!iconOnly && (
        <g>
          <text
            x="345"
            y="160"
            fontSize="170"
            fontWeight="800"
            fill="#0F1B2D"
            letterSpacing="-2"
          >
            EXPEDIA
          </text>
          <rect x="348" y="182" width="120" height="6" rx="3" fill="url(#logoGreenGrad)" />
          <text
            x="348"
            y="250"
            fontSize="58"
            fontWeight="500"
            fill="#4A5568"
            letterSpacing="1"
          >
            Business-Speed Telecom
          </text>
        </g>
      )}
    </svg>
  );
}
