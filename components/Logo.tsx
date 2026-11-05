/**
 * The mark: a lime leaf with a forest vein on a forest tile. Same geometry as
 * scripts/generate-icons.mjs, so the app, the tab icon and the iPhone Home
 * Screen icon match.
 */
export function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#1f5c46" />
      <path d="M9.73 22.27A12.23 12.23 0 0 1 22.27 9.73A12.23 12.23 0 0 1 9.73 22.27Z" fill="#f3f68c" />
      <path d="M9.73 22.27L18.24 13.76" stroke="#1f5c46" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}
