/**
 * Reusable SOL token icon (Web3 Icons mono).
 * Source: https://www.web3icons.io/tokens/SOL
 */
interface SolanaIconProps {
  /** CSS class (e.g. Tailwind w-4 h-4). Overrides size when both are set. */
  className?: string;
  /** Pixel size (width/height). Default 16. Ignored if className is provided. */
  size?: number;
  /** Hide from assistive tech when decorative. Default true. */
  ariaHidden?: boolean;
}

export function SolanaIcon({ className, size = 16, ariaHidden = true }: SolanaIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden={ariaHidden}
    >
      <path
        fill="currentColor"
        d="M18.413 7.901a.62.62 0 0 1-.411.164H3.58c-.512 0-.77-.585-.416-.928l2.368-2.284a.6.6 0 0 1 .41-.169h14.479c.517 0 .77.59.41.934zm0 11.257a.6.6 0 0 1-.411.158H3.58c-.512 0-.77-.58-.416-.923l2.368-2.289a.6.6 0 0 1 .41-.163h14.479c.517 0 .77.585.41.928zm0-8.685a.6.6 0 0 0-.411-.157H3.58c-.512 0-.77.58-.416.922l2.368 2.29a.62.62 0 0 0 .41.163h14.479c.517 0 .77-.585.41-.928z"
      />
    </svg>
  );
}
