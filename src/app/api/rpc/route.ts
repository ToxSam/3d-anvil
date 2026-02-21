import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side Solana RPC proxy.
 *
 * Keeps the Helius API key out of the client bundle. All browser RPC / DAS
 * calls hit /api/rpc; this handler forwards them to the real endpoint using
 * the private HELIUS_RPC_URL env var, then streams the response back.
 *
 * Includes best-effort rate limiting (works while the serverless function is
 * warm) to prevent runaway client-side polling from draining Helius credits.
 */

const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
const PUBLIC_FALLBACK =
  SOLANA_NETWORK === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';

const TARGET_URL = process.env.HELIUS_RPC_URL || PUBLIC_FALLBACK;

// ── Best-effort rate limiter (persists while the serverless fn is warm) ──
const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 80;
let windowStart = Date.now();
let windowCount = 0;

function checkRateLimit(): boolean {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount++;
  return windowCount > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  if (checkRateLimit()) {
    return new NextResponse(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32005, message: 'Proxy rate limit — slow down' },
        id: null,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '5',
        },
      },
    );
  }

  try {
    const body = await req.text();

    const upstream = await fetch(TARGET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const responseText = await upstream.text();

    return new NextResponse(responseText, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[RPC proxy] upstream error:', err);
    return NextResponse.json({ error: 'RPC proxy error' }, { status: 502 });
  }
}
