# 3D Anvil — Your Metaverse Inventory, On-Chain

The open launchpad for 3D assets on Solana. Mint VRM avatars and 
GLB models as NFTs — game items, wearables, characters — stored 
permanently on Arweave and owned by whoever holds them.

Think Manifold, but built for 3D. Anyone can create a collection 
or drop, set their own rules (Dutch auction, allowlist, token gating, 
per-wallet limits), and keep 100% of revenue. No platform fees, 
no gatekeeping, all enforced on-chain.

---

## What It Does

### For Creators

- **Create collections** — Standard NFT collections with name, symbol, description, image, royalties, and creator splits.
- **Create drops** — Timed mint releases with full configurable rules:
  - Fixed price or free mint
  - Max supply cap
  - Start and end dates
  - Max mints per wallet
  - **Dutch auction** — Price decreases over time (configurable start/end price and duration)
  - **Allowlist** — Restrict minting to specific wallet addresses
  - **Token-holder gating** — Require holders of specific NFTs/tokens to mint
  - Revenue splits among multiple collaborators
- **Upload 3D assets** — Supports **GLB** (standard 3D models) and **VRM** (humanoid avatars). Assets are uploaded to **Arweave** via Irys for permanent storage.
- **Dashboard** — View your collections, drops, and NFTs in one place. Filter and sort by date, name, or item count.
- **Collection analytics** — View mint counts, holders, and collection stats for your drops.

### For Collectors

- **Mint from drops** — Connect your Solana wallet (Phantom, Solflare) and mint directly from drop pages.
- **Item detail pages** — View NFT metadata, 3D preview (VRM/GLB viewer), download links, and traits.
- **Share** — Each drop, collection, item, and creator page has rich Open Graph meta for social sharing.

### Platform Features

- **Zero platform fees** — All mint payments go to creators (minus Solana network fees).
- **On-chain enforcement** — Mint rules (price, supply, dates, allowlist, per-wallet, Dutch auction) are enforced by the **Candy Machine** program on Solana.
- **Launchpad registry** (optional) — Curate collections created through 3D Anvil and expose a **Balances API** (`GET /balances/[address]`) that returns only NFTs from those collections.
- **Discover** — Browse collections and drops by creator address (requires DAS-capable RPC).
- **Mainnet live** — Production runs on Solana mainnet; local dev can use devnet.
- **Dark mode** — Theme toggle with system preference support.
- **Desktop-first** — Optimized for desktop; mobile-friendly version planned.

---

## Tech Stack

- **Framework** — Next.js 14 (App Router)
- **3D** — Three.js, React Three Fiber, DREI, @pixiv/three-vrm
- **Blockchain** — Solana (Wallet Adapter, Metaplex, Umi, Candy Machine)
- **Storage** — Arweave via Irys
- **Styling** — Tailwind CSS
- **Registry** (optional) — Vercel KV (Upstash Redis)

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Solana wallet (Phantom or Solflare recommended)
- For production: Helius RPC (for DAS/Discover/Analytics), Irys, and optionally Vercel KV

### 1. Clone and Install

```bash
git clone <repo-url> 3d-anvil
cd 3d-anvil
npm install
```

> **Note:** The original folder name was `sol-avatars` (placeholder). If your clone uses that name, you can rename it to `3d-anvil` or any name you prefer. The project name in `package.json` is `3d-anvil`.

### 2. Environment Variables

Copy the example env file and configure:

```bash
cp .env.example .env.local
```

| Variable | Visibility | Local Dev | Production | Notes |
|----------|------------|-----------|------------|-------|
| `NEXT_PUBLIC_SOLANA_NETWORK` | Public | `devnet` | `mainnet-beta` | Solana network |
| `HELIUS_RPC_URL` | **Private** | Optional | Required for DAS | No `NEXT_PUBLIC_` — server-side only. All RPC/DAS goes through `/api/rpc` proxy. |
| `NEXT_PUBLIC_USE_LOCAL_STORAGE` | Public | `true` | `false` | `true` = local uploads (no Irys) for dev |
| `NEXT_PUBLIC_IRYS_NODE` | Public | (ignored if local) | e.g. `https://devnet.irys.xyz` | Irys node for Arweave |
| `NEXT_PUBLIC_EXPLORER_URL` | Public | Optional | Optional | e.g. `https://explorer.solana.com` |

**Launchpad registry (optional):**

| Variable | Visibility | Purpose |
|----------|------------|---------|
| `KV_REST_API_URL` | Private | Upstash KV endpoint |
| `KV_REST_API_TOKEN` | Private | Upstash token |
| `LOCAL_KV_PATH` | Optional | Local JSON path for dev (e.g. `/tmp/lp-registry.json`) |
| `LAUNCHPAD_REGISTRY_SECRET` | Optional | Bearer auth for register-collection API |

Without `HELIUS_RPC_URL`, basic mint and wallet flows work, but Discover and Analytics (DAS) will not.

### 3. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Connect your wallet (Devnet recommended for testing) and start creating.

### 4. Build and Start

```bash
npm run build
npm start
```

---

## Routes Overview

| Route | Description |
|-------|-------------|
| `/` | Homepage with 3D hero and forge steps |
| `/create` | Create hub — collections and drops |
| `/create-collection` | New collection |
| `/create-drop` | New drop (with VRM/GLB upload) |
| `/create/mint` | Mint from a collection |
| `/about` | Product overview, FAQ, formats, tech |
| `/dashboard` | Your collections, drops, NFTs (wallet required) |
| `/drops` | Public drops list |
| `/discover` | Browse by creator (DAS-based) |
| `/drop/[address]` | Drop detail and mint page |
| `/collection/[address]` | Collection detail |
| `/item/[address]` | Individual NFT detail |
| `/mint/[address]` | Mint page (redirects to drop when applicable) |
| `/creator/[address]` | Creator profile |
| `/balances/[address]` | API: NFTs from launchpad-registered collections only |

---

## Deployment (Vercel)

1. Push the repo to GitHub (or your Vercel-connected Git provider).
2. In Vercel: **New Project** → Import the repo. Use Next.js preset.
3. Add environment variables (see table above). **Important:** `HELIUS_RPC_URL` must **not** use the `NEXT_PUBLIC_` prefix so the RPC key stays server-side.
4. Deploy. The build uses a safe wrapper for `fs.rename` (handles `EXDEV` on some CI environments).

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rpc` | POST | Proxies Solana RPC/DAS requests (keeps `HELIUS_RPC_URL` private) |
| `/api/upload` | POST | Uploads files to Irys (or local storage when `NEXT_PUBLIC_USE_LOCAL_STORAGE=true`) |
| `/api/launchpad/register-collection` | POST | Registers a collection in the launchpad allowlist |
| `/balances/[address]` | GET | Returns NFTs whose collection is in the launchpad registry (requires registry configured) |

---

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API routes (rpc, upload, launchpad)
│   ├── balances/           # Balances API
│   ├── create/             # Create hub, mint flow
│   ├── create-collection/  # New collection
│   ├── create-drop/        # New drop
│   ├── dashboard/          # User dashboard
│   ├── discover/           # Browse by creator
│   ├── drop/[address]/     # Drop detail & mint
│   ├── collection/[address]/
│   ├── item/[address]/
│   ├── mint/[address]/
│   └── creator/[address]/
├── components/             # UI components (VRMViewer, Navbar, etc.)
├── lib/                    # Utilities, Candy Machine, DAS, Irys
│   ├── server/             # Server-only (DAS, launchpad registry)
│   └── types/              # Mint config types
├── providers/              # Wallet, theme
└── hooks/
```

---

## Supported Formats

- **GLB** — Binary glTF. Works for characters, props, wearables, environments.
- **VRM** — Humanoid avatar format. Carries license info, expressions, rigging. Parsed for metadata and preview.

Files and metadata are stored on **Arweave** for permanence. Once minted, assets can be used in any compatible wallet, game engine, or virtual world.

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build (uses safe wrapper for `fs.rename`) |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |

---

## License

[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) 
— public domain. Do whatever you want with it.
