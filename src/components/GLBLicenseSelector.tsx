'use client';

import { GLB_LICENSE_OPTIONS, GLB_LICENSE_INFO, GLBLicenseValue } from '@/lib/vrmParser';

interface Props {
  license: string;
  commercialUse: string;
  onLicenseChange: (license: string) => void;
  onCommercialUseChange: (value: string) => void;
  compact?: boolean;
}

const COMMERCIAL_OPTIONS = [
  { value: 'Allow', label: 'Allow' },
  { value: 'Disallow', label: 'Disallow' },
] as const;

export function GLBLicenseSelector({
  license,
  commercialUse,
  onLicenseChange,
  onCommercialUseChange,
  compact,
}: Props) {
  const selectedValue = license as GLBLicenseValue;
  const info = selectedValue && GLB_LICENSE_INFO[selectedValue as keyof typeof GLB_LICENSE_INFO];
  const showCommercialChoice = info?.showCommercialChoice ?? false;

  function handleLicenseChange(value: GLBLicenseValue) {
    onLicenseChange(value);
    const nextInfo = value && GLB_LICENSE_INFO[value as keyof typeof GLB_LICENSE_INFO];
    if (nextInfo?.impliedCommercialUse) {
      onCommercialUseChange(nextInfo.impliedCommercialUse);
    }
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <p className="text-caption text-gray-500 dark:text-gray-400">
        GLB files don&apos;t include embedded license data. Select a license for this model.
      </p>

      <div>
        <label className="text-caption font-medium text-gray-700 dark:text-gray-300 block mb-1.5">
          License <span className="text-orange-400">*</span>
        </label>
        <select
          value={license}
          onChange={(e) => handleLicenseChange(e.target.value as GLBLicenseValue)}
          className="input-forge w-full"
        >
          <option value="">Select a license…</option>
          {GLB_LICENSE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {info && (
          <div className="mt-2 flex flex-wrap items-start gap-1.5 text-caption text-gray-500 dark:text-gray-400">
            <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-gray-300/60 dark:bg-gray-600/60 text-gray-600 dark:text-gray-300 font-medium leading-none" title="License summary">
              ?
            </span>
            <span className="flex-1 min-w-0">
              {info.description}
              {info.infoUrl && (
                <>
                  {' '}
                  <a
                    href={info.infoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-400 hover:underline focus:outline-none focus:ring-2 focus:ring-orange-400/50 rounded"
                  >
                    Learn more
                  </a>
                </>
              )}
            </span>
          </div>
        )}
      </div>

      {showCommercialChoice && (
        <div>
          <label className="text-caption font-medium text-gray-700 dark:text-gray-300 block mb-1.5">
            Commercial Use
          </label>
          <div className="flex gap-3">
            {COMMERCIAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onCommercialUseChange(opt.value)}
                className={`flex-1 py-2 px-3 text-small rounded border transition-colors ${
                  commercialUse === opt.value
                    ? 'border-orange-400/60 bg-orange-400/10 text-orange-400'
                    : 'border-gray-300/30 dark:border-gray-700/30 text-gray-600 dark:text-gray-400 hover:border-gray-400/50 dark:hover:border-gray-600/50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
