'use client';

import { useId, useMemo, useRef } from 'react';

type StepValue = number | string | undefined;

function toNumber(v: StepValue): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function stepDecimals(step: StepValue): number {
  if (step === undefined || step === null) return 0;
  const s = String(step);
  const idx = s.indexOf('.');
  return idx === -1 ? 0 : Math.max(0, s.length - idx - 1);
}

export type ForgeNumberInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> & {
  value: string | number;
  onValueChange: (next: string) => void;
  /** Extra classNames for the wrapper */
  containerClassName?: string;
  /** Extra classNames for the input element */
  inputClassName?: string;
  /** When false, renders as plain input (still type=number). */
  showStepper?: boolean;
};

export function ForgeNumberInput({
  value,
  onValueChange,
  containerClassName = '',
  inputClassName = '',
  showStepper = true,
  step,
  min,
  max,
  disabled,
  id,
  'aria-label': ariaLabel,
  ...rest
}: ForgeNumberInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);

  const dec = useMemo(() => stepDecimals(step), [step]);

  function applyStep(direction: 1 | -1) {
    if (disabled) return;

    const stepNum = toNumber(step) ?? 1;
    const minNum = toNumber(min);
    const maxNum = toNumber(max);

    const currentNumRaw =
      typeof value === 'number' ? value : value === '' ? NaN : parseFloat(value);
    const currentNum = Number.isFinite(currentNumRaw)
      ? currentNumRaw
      : minNum ?? 0;

    let next = currentNum + direction * stepNum;
    if (minNum != null) next = Math.max(minNum, next);
    if (maxNum != null) next = Math.min(maxNum, next);

    const nextStr = dec > 0 ? next.toFixed(dec) : String(next);
    onValueChange(nextStr);

    // Keep focus on the input for good keyboard flow
    inputRef.current?.focus();
  }

  return (
    <div className={`relative ${containerClassName}`}>
      <input
        ref={inputRef}
        id={inputId}
        type="number"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={ariaLabel}
        // Ensure value doesn't sit under the stepper (slim rail = more room for text)
        className={`input-forge ${showStepper ? '!pr-8' : ''} ${inputClassName}`}
        {...rest}
      />

      {showStepper && (
        <div
          className={`absolute inset-y-0 right-0 w-7 flex flex-col border-l border-gray-300/30 dark:border-gray-700/20 ${
            disabled ? 'opacity-40' : ''
          }`}
          aria-hidden={disabled ? true : undefined}
        >
          <button
            type="button"
            onClick={() => applyStep(1)}
            disabled={disabled}
            className="flex-1 flex items-center justify-center min-h-0 py-0.5 text-gray-500 dark:text-gray-400 hover:text-orange-400 transition-colors bg-transparent hover:bg-orange-400/5"
            aria-label="Increase value"
            title="Increase"
          >
            <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 14l6-6 6 6" />
            </svg>
          </button>
          <div className="h-px flex-shrink-0 bg-gray-300/20 dark:bg-gray-700/20" />
          <button
            type="button"
            onClick={() => applyStep(-1)}
            disabled={disabled}
            className="flex-1 flex items-center justify-center min-h-0 py-0.5 text-gray-500 dark:text-gray-400 hover:text-orange-400 transition-colors bg-transparent hover:bg-orange-400/5"
            aria-label="Decrease value"
            title="Decrease"
          >
            <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 10l-6 6-6-6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

