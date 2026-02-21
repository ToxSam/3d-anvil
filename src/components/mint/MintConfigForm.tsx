'use client';

import { useState, useEffect } from 'react';
import { MintConfig, DEFAULT_MINT_CONFIG, type MintAccessType } from '@/lib/types/mintConfig';
import DateTimePicker from '@/components/DateTimePicker';
import { ForgeNumberInput } from '@/components/ForgeNumberInput';

interface Props {
  onSave: (config: MintConfig) => void | Promise<void>;
  initialConfig?: MintConfig;
  saving?: boolean;
  /** When true, render inline without the Save button (parent handles submit) */
  inline?: boolean;
  /** Expose config changes to parent when inline */
  onChange?: (config: MintConfig) => void;
}

function getInitialAccess(config: MintConfig): MintAccessType {
  if (config.access === 'anyone' || config.access === 'custom') return config.access;
  if (config.requiresAllowlist || config.access === 'allowlist' || config.access === 'token_holders') return 'custom';
  return 'anyone';
}

/** Normalize tokenHolderMints from config (support legacy tokenHolderMint). */
function getTokenHolderMints(config: MintConfig): string[] {
  if (config.tokenHolderMints && config.tokenHolderMints.length > 0) return config.tokenHolderMints;
  if (config.tokenHolderMint?.trim()) return [config.tokenHolderMint.trim()];
  return [];
}

type CustomAccessTab = 'token_holders' | 'allowlist';

function AccessSection({ config, update }: { config: MintConfig; update: (patch: Partial<MintConfig>) => void }) {
  const [customTab, setCustomTab] = useState<CustomAccessTab>('token_holders');
  const mints = getTokenHolderMints(config);
  const hasCustom = (config.access || 'anyone') === 'custom';
  // Local state for allowlist text so Enter creates newlines; sync to config on blur
  const [allowlistText, setAllowlistText] = useState(() => (config.allowlistAddresses || []).join('\n'));
  useEffect(() => {
    setAllowlistText((config.allowlistAddresses || []).join('\n'));
  }, [config.allowlistAddresses?.length, config.allowlistAddresses?.join(',')]);

  function commitAllowlist() {
    const lines = allowlistText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    update({ allowlistAddresses: lines, requiresAllowlist: lines.length > 0 });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-label mb-1">Access</p>
        <p className="text-caption text-gray-500 dark:text-gray-400 mb-3">
          Who can mint from this collection
        </p>
        <div className="flex gap-2 border-b border-gray-200/30 dark:border-gray-700/30">
          <button
            type="button"
            onClick={() => update({ access: 'anyone', requiresAllowlist: false, tokenHolderMints: undefined, allowlistAddresses: undefined })}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              !hasCustom
                ? 'border-orange-400 text-orange-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            Default
          </button>
          <button
            type="button"
            onClick={() =>
              update({
                access: 'custom',
                requiresAllowlist: (config.allowlistAddresses?.length ?? 0) > 0,
                tokenHolderMints: mints.length > 0 ? mints : undefined,
              })
            }
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              hasCustom
                ? 'border-orange-400 text-orange-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            Custom
          </button>
        </div>

        {!hasCustom ? (
          <div className="pt-4">
            <p className="text-body text-gray-700 dark:text-gray-300">Anyone can mint. No token or allowlist restrictions.</p>
          </div>
        ) : (
          <div className="pt-4 space-y-4">
          <div className="flex gap-2 border-b border-gray-200/30 dark:border-gray-700/30">
            <button
              type="button"
              onClick={() => setCustomTab('token_holders')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                customTab === 'token_holders'
                  ? 'border-orange-400 text-orange-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              Token holders
            </button>
            <button
              type="button"
              onClick={() => setCustomTab('allowlist')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                customTab === 'allowlist'
                  ? 'border-orange-400 text-orange-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              Allowlist
            </button>
          </div>

          {customTab === 'token_holders' && (
            <div className="space-y-3">
              <p className="text-caption text-gray-500 dark:text-gray-400">
                Holders of <strong>any</strong> of these tokens or NFTs can mint. Add multiple mints.
              </p>
              {mints.map((mint, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={mint}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      const next = [...mints];
                      next[i] = v;
                      update({ tokenHolderMints: next.filter(Boolean) });
                    }}
                    className="input-forge flex-1 font-mono text-small"
                    placeholder="Token or NFT mint address"
                  />
                  <button
                    type="button"
                    onClick={() => update({ tokenHolderMints: mints.filter((_, j) => j !== i) })}
                    className="text-gray-400 hover:text-red-500 p-2"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => update({ tokenHolderMints: [...mints, ''] })}
                className="btn-forge-outline text-sm"
              >
                + Add token or NFT
              </button>
              {mints.some((m) => !m.trim()) && (
                <p className="text-caption text-amber-600 dark:text-amber-400">
                  Fill in or remove empty mint addresses.
                </p>
              )}
            </div>
          )}

          {customTab === 'allowlist' && (
            <div>
              <label className="text-label block mb-2">Allowed wallet addresses</label>
              <textarea
                value={allowlistText}
                onChange={(e) => setAllowlistText(e.target.value)}
                onBlur={commitAllowlist}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.stopPropagation();
                }}
                className="input-forge min-h-[120px] font-mono text-small w-full resize-y"
                placeholder="Paste one wallet address per line. You can combine with token holders above."
                rows={6}
              />
              <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
                One Solana address per line. Press Enter for a new line. These can be used together with token holders.
                {(() => {
                  const count = allowlistText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length;
                  return count > 0 ? (
                    <span className="text-orange-400 font-bold ml-1">
                      {count} address{count !== 1 ? 'es' : ''} (saved on blur)
                    </span>
                  ) : null;
                })()}
              </p>
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  );
}

export function MintConfigForm({ onSave, initialConfig, saving, inline, onChange }: Props) {
  const [config, setConfig] = useState<MintConfig>(() => {
    const base = initialConfig || { ...DEFAULT_MINT_CONFIG };
    if (!base.access) base.access = getInitialAccess(base);
    return base;
  });

  function update(patch: Partial<MintConfig>) {
    const next = { ...config, ...patch };
    setConfig(next);
    onChange?.(next);
  }

  return (
    <div className="space-y-6">
      {!inline && (
        <div>
          <p className="text-label mb-1">Public Minting</p>
          <h3 className="text-title font-bold text-gray-900 dark:text-gray-100 mb-1">
            Mint Settings
          </h3>
          <p className="text-caption text-gray-500 dark:text-gray-400">
            Configure how others can mint from this collection.
          </p>
        </div>
      )}

      {/* Public Toggle */}
      <div className="flex items-center justify-between gap-4 p-4 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg border border-gray-200/30 dark:border-gray-700/20">
        <div>
          <p className="text-body font-bold text-gray-900 dark:text-gray-100">
            Enable Public Minting
          </p>
          <p className="text-caption text-gray-500 dark:text-gray-400">
            Allow anyone with a Solana wallet to mint from this collection
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={config.isPublic}
          onClick={() => update({ isPublic: !config.isPublic })}
          className={`relative flex-shrink-0 w-12 h-7 rounded-full transition-colors duration-200 ${
            config.isPublic
              ? 'bg-orange-400'
              : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${
              config.isPublic ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {config.isPublic && (
        <>
          {/* ── Mint Price ──────────────────────────────────────────── */}
          <div>
            <label className="text-label block mb-2">Mint Price (SOL)</label>
            <ForgeNumberInput
              step="0.01"
              min="0"
              value={config.price}
              onValueChange={(v) => update({ price: parseFloat(v) || 0 })}
              placeholder="0.5"
              disabled={config.isDutchAuction}
            />
            <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
              {config.isDutchAuction
                ? 'Price is controlled by the Dutch Auction settings below.'
                : 'Set to 0 for free mints. Mint revenue goes directly to your wallet.'}
            </p>
            {!config.isDutchAuction && (
              <div className="flex gap-2 mt-2">
                {[0, 0.1, 0.25, 0.5, 1, 2].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => update({ price: preset })}
                    className={`chip-forge ${
                      config.price === preset
                        ? 'chip-forge-active'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {preset === 0 ? 'Free' : `${preset} SOL`}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="divider-forge" />

          {/* ── Max Supply ──────────────────────────────────────────── */}
          <div>
            <label className="text-label block mb-2">Max Supply</label>
            <ForgeNumberInput
              min="1"
              value={config.maxSupply ?? ''}
              onValueChange={(v) =>
                update({ maxSupply: v ? parseInt(v) : null })
              }
              placeholder="Leave empty for unlimited"
            />
            <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
              Total number of NFTs that can be minted. Leave empty for unlimited.
            </p>
          </div>

          {/* ── Max Per Wallet ──────────────────────────────────────── */}
          <div>
            <label className="text-label block mb-2">Max Per Wallet</label>
            <ForgeNumberInput
              min="1"
              value={config.maxPerWallet ?? ''}
              onValueChange={(v) =>
                update({ maxPerWallet: v ? parseInt(v) : null })
              }
              placeholder="Leave empty for unlimited"
            />
            <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
              Prevent whales from minting everything. Leave empty for no limit.
            </p>
          </div>

          <div className="divider-forge" />

          {/* ── Schedule ────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-label block mb-2">Start Date (Optional)</label>
              <DateTimePicker
                value={config.startDate || undefined}
                onChange={(value) => update({ startDate: value })}
                placeholder="Start immediately"
              />
              <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
                Leave empty to start immediately
              </p>
            </div>

            <div>
              <label className="text-label block mb-2">End Date (Optional)</label>
              <DateTimePicker
                value={config.endDate || undefined}
                minDate={config.startDate ?? new Date().toISOString()}
                onChange={(value) => update({ endDate: value })}
                placeholder="No end date"
              />
              <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
                Leave empty for no end date
              </p>
            </div>
          </div>

          <div className="divider-forge" />

          {/* ── Dutch Auction ──────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 p-4 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg border border-gray-200/30 dark:border-gray-700/20">
              <div>
                <p className="text-body font-bold text-gray-900 dark:text-gray-100">
                  Dutch Auction
                </p>
                <p className="text-caption text-gray-500 dark:text-gray-400">
                  Price starts high and drops over time until someone buys
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.isDutchAuction}
                onClick={() => {
                  const enabling = !config.isDutchAuction;
                  update({
                    isDutchAuction: enabling,
                    dutchAuction: enabling
                      ? config.dutchAuction || { startPrice: 2, endPrice: 0.1, durationHours: 24 }
                      : config.dutchAuction,
                    // Set base price to the start price when enabling
                    price: enabling ? (config.dutchAuction?.startPrice || 2) : config.price,
                  });
                }}
                className={`relative flex-shrink-0 w-12 h-7 rounded-full transition-colors duration-200 ${
                  config.isDutchAuction
                    ? 'bg-orange-400'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${
                    config.isDutchAuction ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {config.isDutchAuction && (
              <div className="ml-4 pl-4 border-l-2 border-orange-400/30 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-label block mb-2">Start Price (SOL)</label>
                    <ForgeNumberInput
                      step="0.01"
                      min="0"
                      value={config.dutchAuction?.startPrice ?? 2}
                      onValueChange={(v) => {
                        const next = parseFloat(v) || 0;
                        update({
                          dutchAuction: {
                            ...(config.dutchAuction || { startPrice: 2, endPrice: 0.1, durationHours: 24 }),
                            startPrice: next,
                          },
                          price: next,
                        });
                      }}
                      placeholder="2"
                    />
                    <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
                      The highest price at auction start
                    </p>
                  </div>

                  <div>
                    <label className="text-label block mb-2">End Price (SOL)</label>
                    <ForgeNumberInput
                      step="0.01"
                      min="0"
                      value={config.dutchAuction?.endPrice ?? 0.1}
                      onValueChange={(v) => {
                        const next = parseFloat(v) || 0;
                        update({
                          dutchAuction: {
                            ...(config.dutchAuction || { startPrice: 2, endPrice: 0.1, durationHours: 24 }),
                            endPrice: next,
                          },
                        });
                      }}
                      placeholder="0.1"
                    />
                    <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
                      The lowest price at auction end
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-label block mb-2">Duration (Hours)</label>
                  <ForgeNumberInput
                    min="1"
                    value={config.dutchAuction?.durationHours ?? 24}
                    onValueChange={(v) => {
                      const next = parseInt(v) || 1;
                      update({
                        dutchAuction: {
                          ...(config.dutchAuction || { startPrice: 2, endPrice: 0.1, durationHours: 24 }),
                          durationHours: next,
                        },
                      });
                    }}
                    placeholder="24"
                  />
                  <p className="text-caption text-gray-500 dark:text-gray-400 mt-1.5">
                    How long the price drops from start to end price
                  </p>
                  <div className="flex gap-2 mt-2">
                    {[6, 12, 24, 48, 72].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() =>
                          update({
                            dutchAuction: {
                              ...(config.dutchAuction || { startPrice: 2, endPrice: 0.1, durationHours: 24 }),
                              durationHours: preset,
                            },
                          })
                        }
                        className={`chip-forge ${
                          config.dutchAuction?.durationHours === preset
                            ? 'chip-forge-active'
                            : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {preset}h
                      </button>
                    ))}
                  </div>
                </div>

                {/* Price Preview */}
                {config.dutchAuction && (
                  <div className="p-3 bg-orange-400/5 border border-orange-400/20 rounded-lg">
                    <p className="text-caption text-orange-400 font-bold mb-1">Auction Preview</p>
                    <p className="text-caption text-gray-500 dark:text-gray-400">
                      Price will start at{' '}
                      <span className="text-gray-900 dark:text-gray-100 font-bold">
                        {config.dutchAuction.startPrice} SOL
                      </span>{' '}
                      and linearly drop to{' '}
                      <span className="text-gray-900 dark:text-gray-100 font-bold">
                        {config.dutchAuction.endPrice} SOL
                      </span>{' '}
                      over{' '}
                      <span className="text-gray-900 dark:text-gray-100 font-bold">
                        {config.dutchAuction.durationHours} hours
                      </span>
                      . After that, the price stays at {config.dutchAuction.endPrice} SOL.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="divider-forge" />

          {/* ── Access ───────────────────────────────────────────────── */}
          <AccessSection config={config} update={update} />
        </>
      )}

      {/* Save Button (hidden in inline mode) */}
      {!inline && (
        <button
          type="button"
          onClick={() => {
            const sanitized = {
              ...config,
              tokenHolderMints: config.tokenHolderMints?.filter(Boolean).length
                ? config.tokenHolderMints.filter(Boolean)
                : undefined,
            };
            onSave(sanitized);
          }}
          disabled={saving}
          className="btn-hero-primary w-full disabled:opacity-40 disabled:cursor-not-allowed py-4 text-center"
        >
          {saving ? 'Saving...' : 'Save Mint Settings'}
        </button>
      )}
    </div>
  );
}
