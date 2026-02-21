import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

export const OG_SIZE = { width: 1200, height: 630 };

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '\u2026';
}

export function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

const logoDataUri = (() => {
  try {
    const svg = readFileSync(
      join(process.cwd(), 'public', '3da-anvil-logo.svg'),
      'utf-8',
    );
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  } catch {
    return '';
  }
})();

const STATUS_COLORS: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  green: {
    bg: 'rgba(34,197,94,0.12)',
    border: 'rgba(34,197,94,0.4)',
    text: '#22C55E',
  },
  orange: {
    bg: 'rgba(251,146,60,0.12)',
    border: 'rgba(251,146,60,0.4)',
    text: '#FB923C',
  },
  red: {
    bg: 'rgba(239,68,68,0.12)',
    border: 'rgba(239,68,68,0.4)',
    text: '#EF4444',
  },
  gray: {
    bg: 'rgba(107,114,128,0.12)',
    border: 'rgba(107,114,128,0.4)',
    text: '#6B7280',
  },
};

export interface ForgeOGOptions {
  title: string;
  subtitle?: string;
  /** Small pill label above title, e.g. "DROP", "COLLECTION" */
  label?: string;
  /** External image URL (must be absolute, accessible from server) */
  imageUrl?: string | null;
  /** Key-value stat boxes shown below the description */
  stats?: { label: string; value: string }[];
  /** Status badge shown in header (e.g. LIVE, UPCOMING) */
  status?: { text: string; color: 'green' | 'orange' | 'red' | 'gray' };
}

export async function createForgeOG(opts: ForgeOGOptions) {
  const hasImage = !!opts.imageUrl;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background:
            'linear-gradient(155deg, #0f0d1a 0%, #141311 35%, #0a0812 70%, #000000 100%)',
          fontFamily: 'sans-serif',
          color: '#F5F5F5',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Grid lines */}
        {Array.from({ length: 14 }, (_, i) => (
          <div
            key={`h${i}`}
            style={{
              position: 'absolute',
              top: i * 48,
              left: 0,
              width: '100%',
              height: 1,
              background: 'rgba(255,255,255,0.03)',
            }}
          />
        ))}
        {Array.from({ length: 26 }, (_, i) => (
          <div
            key={`v${i}`}
            style={{
              position: 'absolute',
              left: i * 48,
              top: 0,
              height: '100%',
              width: 1,
              background: 'rgba(255,255,255,0.03)',
            }}
          />
        ))}

        {/* Top accent bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background:
              'linear-gradient(90deg, transparent 5%, #FB923C 50%, transparent 95%)',
          }}
        />

        {/* Bottom ember glow */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 260,
            background:
              'radial-gradient(ellipse 80% 100% at 50% 100%, rgba(255,170,0,0.12), transparent)',
          }}
        />

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '44px 56px 0',
            position: 'relative',
          }}
        >
          {/* Header: brand mark + optional status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: hasImage ? 24 : 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {logoDataUri && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logoDataUri}
                  height={38}
                  alt=""
                  style={{ objectFit: 'contain' }}
                />
              )}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: '#FB923C',
                    letterSpacing: '-0.03em',
                    lineHeight: 1,
                    marginBottom: -2,
                  }}
                >
                  3D
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: '#FFFFFF',
                    letterSpacing: '-0.03em',
                    lineHeight: 1,
                  }}
                >
                  ANVIL
                </div>
              </div>
            </div>

            {/* Status badge */}
            {opts.status && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 18px',
                  background: STATUS_COLORS[opts.status.color].bg,
                  border: `1px solid ${STATUS_COLORS[opts.status.color].border}`,
                  borderRadius: 24,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: STATUS_COLORS[opts.status.color].text,
                  }}
                />
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    color: STATUS_COLORS[opts.status.color].text,
                  }}
                >
                  {opts.status.text}
                </div>
              </div>
            )}
          </div>

          {hasImage ? dynamicLayout(opts) : staticLayout(opts)}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 56px 28px',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 56,
              right: 56,
              height: 1,
              background:
                'linear-gradient(90deg, transparent, rgba(251,146,60,0.3), transparent)',
            }}
          />
          <div
            style={{
              display: 'flex',
              paddingTop: 18,
              fontSize: 18,
              fontWeight: 500,
              color: '#9CA3AF',
            }}
          >
            Forge 3D Assets on Solana
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              paddingTop: 18,
            }}
          >
            {logoDataUri && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={logoDataUri}
                height={18}
                alt=""
                style={{ objectFit: 'contain', opacity: 0.5 }}
              />
            )}
            <div style={{ fontSize: 16, fontWeight: 500, color: '#6B7280' }}>
              3D Anvil
            </div>
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}

function staticLayout(opts: ForgeOGOptions) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        justifyContent: 'center',
      }}
    >
      {opts.label && (
        <div style={{ display: 'flex', marginBottom: 20 }}>
          <div
            style={{
              display: 'flex',
              padding: '6px 18px',
              background: 'rgba(251,146,60,0.12)',
              border: '1px solid rgba(251,146,60,0.35)',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: '#FB923C',
            }}
          >
            {opts.label}
          </div>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          fontSize: 54,
          fontWeight: 700,
          lineHeight: 1.1,
          marginBottom: 18,
          letterSpacing: '-0.02em',
        }}
      >
        {opts.title}
      </div>
      {opts.subtitle && (
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            fontWeight: 400,
            color: '#9CA3AF',
            lineHeight: 1.4,
          }}
        >
          {opts.subtitle}
        </div>
      )}
    </div>
  );
}

function dynamicLayout(opts: ForgeOGOptions) {
  return (
    <div
      style={{ display: 'flex', flex: 1, gap: 40, alignItems: 'flex-start' }}
    >
      {/* Preview image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={opts.imageUrl!}
        width={280}
        height={280}
        alt=""
        style={{
          borderRadius: 16,
          border: '1px solid rgba(107,114,128,0.25)',
          objectFit: 'cover',
        }}
      />

      {/* Info column */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {opts.label && (
          <div style={{ display: 'flex', marginBottom: 12 }}>
            <div
              style={{
                display: 'flex',
                padding: '5px 14px',
                background: 'rgba(251,146,60,0.12)',
                border: '1px solid rgba(251,146,60,0.35)',
                borderRadius: 16,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: '#FB923C',
              }}
            >
              {opts.label}
            </div>
          </div>
        )}
        <div
          style={{
            display: 'flex',
            fontSize: 38,
            fontWeight: 700,
            lineHeight: 1.15,
            marginBottom: 10,
            letterSpacing: '-0.01em',
          }}
        >
          {truncate(opts.title, 48)}
        </div>
        {opts.subtitle && (
          <div
            style={{
              display: 'flex',
              fontSize: 18,
              fontWeight: 400,
              color: '#9CA3AF',
              lineHeight: 1.4,
              marginBottom: 20,
            }}
          >
            {truncate(opts.subtitle, 120)}
          </div>
        )}
        {opts.stats && opts.stats.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
            {opts.stats.map((s) => (
              <div
                key={s.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '10px 18px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(107,114,128,0.2)',
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    fontSize: 11,
                    fontWeight: 400,
                    color: '#6B7280',
                    marginBottom: 4,
                    letterSpacing: '0.05em',
                  }}
                >
                  {s.label.toUpperCase()}
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 18,
                    fontWeight: 700,
                    color: s.label.toLowerCase().includes('price')
                      ? '#FB923C'
                      : '#F5F5F5',
                  }}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
