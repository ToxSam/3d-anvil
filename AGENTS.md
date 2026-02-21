# AGENTS.md — 3D Anvil

Read this before touching anything. It covers what the project is,
what's working and must not break, the security rules, and how
everything fits together.

---

## What this is

3D Anvil is an open NFT launchpad for 3D assets (VRM avatars, GLB
models) on Solana. Think Manifold but built for 3D game assets and
metaverse inventory. Creators deploy collections and drops with
on-chain mint rules; collectors mint and own assets permanently on
Arweave. Zero platform fees.

**Deployed at:** asset-minter-solana.vercel.app (domain moving to
3danvil.com)
**Network:** Solana devnet (mainnet cutover coming)
**Stack:** Next.js 14 App Router, TypeScript, Tailwind, Solana/
Metaplex/Umi, Candy Machine, Irys/Arweave, Vercel KV (Upstash Redis)

---

## DO NOT TOUCH — working and must not break

These are complete, tested, and in production. Do not refactor,
reorganize, or "improve" unless explicitly asked. If a task
requires changes near these files, stop and ask first.

**Minting system (entire flow):**
- Candy Machine setup and guard building
- Drop creation: open edition, Dutch auction, allowlist,
  per-wallet limits, token gating, revenue splits
- `src/components/CreateDropWithVRM.tsx`
- `src/components/TransactionProgressModal.tsx`
- `src/components/TransactionConfirmModal.tsx`
- `src/app/drop/[address]/` — drop detail and mint page
- `src/app/mint/[address]/` — mint page
- `src/app/create-drop/` — drop creation flow
- `src/app/create/` — create hub and mint flow

**Infrastructure:**
- `src/app/api/rpc/route.ts` — RPC proxy. All browser RPC/DAS
  calls route through here. HELIUS_RPC_URL never reaches the client.
  Do not add new direct RPC calls from the browser.
- `src/providers/WalletProvider.tsx` — wallet adapter setup
- `src/providers/ThemeProvider.tsx` — dark/light theme
- `src/app/providers.tsx` — root provider composition (wraps both)
- `src/app/api/upload/route.ts` — local file upload handler for
  dev mode (saves to `public/uploads/` when `USE_LOCAL_STORAGE=true`).
  Irys uploading happens client-side through the Irys SDK.

**3D viewer:**
- `src/components/VRMViewer.tsx` and related Three.js/R3F code

---

## Security rules — never break these

1. `HELIUS_RPC_URL` is server-only. No `NEXT_PUBLIC_` prefix. Ever.
   All RPC goes through `/api/rpc`.
2. `KV_REST_API_URL` and `KV_REST_API_TOKEN` are server-only.
   Never expose to client.
3. Never trust client-provided metadata tags (e.g.
   `collection.family`). Only trust on-chain verified collection
   group from DAS.
4. The register-collection endpoint must always verify the tx
   on-chain before writing to KV. Chain verification is the only
   thing that makes a registration trustworthy.
5. Use `"finalized"` commitment before writing to the registry —
   not `"confirmed"`.
6. No new `NEXT_PUBLIC_*` secrets. Ever.

---

## Launchpad registry

Stores collection mints created through this app in Vercel KV.
Protects the registry from fake registrations via on-chain tx
verification with replay protection.

**KV key structure:**
- `lp:collection:<mint>` → `{ mint, creator, createdAt, network }`
- `lp:sig:<txSig>` → `1` (TTL 30 days — replay protection)

**Files:**
- `src/lib/server/launchpadRegistry.ts` — KV abstraction
- `src/lib/server/das.ts` — server-side DAS helpers
- `src/lib/server/solanaVerify.ts` — Solana connection factory
- `src/app/api/launchpad/register-collection/route.ts` — write
  endpoint (verifies tx on-chain before registering)
- `src/app/balances/[address]/route.ts` — read endpoint (DAS +
  batch KV MGET, always 2 external calls max)
- `src/lib/registerLaunchpadCollection.ts` — client helper
  (fires after collection creation, silent on failure)

---

## Project structure

```
src/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/                # Server-side API endpoints
│   │   ├── rpc/            # RPC proxy
│   │   ├── upload/         # Local dev file upload
│   │   └── launchpad/      # Registry endpoints
│   ├── balances/[address]/ # Balances API route
│   └── ...                 # Page routes (see Routes table)
├── components/             # React components
│   ├── analytics/          # CollectionAnalytics
│   ├── collection/         # CollectionSettingsForm
│   └── mint/               # MintConfigForm
├── hooks/                  # Custom hooks (useUserCollections)
├── lib/                    # Shared utilities
│   ├── server/             # Server-only (KV, DAS, Solana verify)
│   └── types/              # TypeScript types (mintConfig)
└── providers/              # WalletProvider, ThemeProvider
```

---

## Environment variables

| Var | Visibility | Purpose |
|-----|-----------|---------|
| `NEXT_PUBLIC_SOLANA_NETWORK` | Public | `devnet` or `mainnet-beta` |
| `NEXT_PUBLIC_USE_LOCAL_STORAGE` | Public | `false` in production |
| `NEXT_PUBLIC_IRYS_NODE` | Public | Irys endpoint |
| `NEXT_PUBLIC_EXPLORER_URL` | Public | Explorer URL (optional) |
| `HELIUS_RPC_URL` | **Private** | Helius RPC + DAS, server-only |
| `KV_REST_API_URL` | **Private** | Upstash Redis, server-only |
| `KV_REST_API_TOKEN` | **Private** | Upstash Redis, server-only |
| `LOCAL_KV_PATH` | Optional | Local dev registry fallback |
| `LAUNCHPAD_REGISTRY_SECRET` | Optional | Registry endpoint auth |
| `NODE_OPTIONS` | Build | `--no-warnings` (suppress bigint) |

---

## Routes

| Route | Description |
|-------|-------------|
| `/` | Homepage |
| `/about` | About page |
| `/create` | Create hub |
| `/create-collection` | New collection (fires registry on success) |
| `/create-drop` | New drop with VRM/GLB upload |
| `/dashboard` | User collections, drops, NFTs |
| `/discover` | Browse by creator (DAS) |
| `/drops` | Public drops list |
| `/drop/[address]` | Drop detail + mint |
| `/collection/[address]` | Collection detail |
| `/item/[address]` | NFT detail with 3D viewer |
| `/mint/[address]` | Mint page |
| `/creator/[address]` | Creator profile |
| `/balances/[address]` | API: launchpad-filtered NFTs |
| `/api/rpc` | RPC proxy (server-side) |
| `/api/upload` | Local dev file upload handler |
| `/api/launchpad/register-collection` | Registry write |

---

## Running locally

```bash
npm install
cp .env.example .env.local

# Minimum to run:
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_USE_LOCAL_STORAGE=true   # skips Irys, uploads locally
LOCAL_KV_PATH=/tmp/lp-registry.json  # local registry

# Optional but needed for DAS (Discover, Analytics, Balances):
HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY

npm run dev
```

---

## Deploying (Vercel)

Push to GitHub → Vercel auto-deploys. Env vars in Vercel →
Settings → Environment Variables. KV store connected via Vercel
Storage tab (auto-injects KV vars).

Build command: `next build`

---

## Mainnet cutover (when ready)

Env var changes only — no code changes:
1. `NEXT_PUBLIC_SOLANA_NETWORK` → `mainnet-beta`
2. `HELIUS_RPC_URL` → mainnet Helius endpoint
3. `NEXT_PUBLIC_IRYS_NODE` → Irys mainnet node
4. Redeploy

---

## Style guide

The app uses a forge/blacksmith theme with orange/amber accents,
warm neutrals, and heat/ember animations. Before making any UI
changes, read `docs/STYLE_GUIDE.md` — it documents every CSS
class, color token, typography scale, and component pattern.
