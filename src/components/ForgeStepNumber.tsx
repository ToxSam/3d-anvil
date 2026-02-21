'use client';

/** Step label e.g. "01", "02", "03". Renders with forge-letter styling and optional strike on a digit. */
export function ForgeStepNumber({
  value,
  stepIndex,
  struckStepIndex,
  struckDigitIndex,
}: {
  value: '01' | '02' | '03';
  stepIndex: number;
  struckStepIndex: number | null;
  struckDigitIndex: number | null;
}) {
  const digits = value.split('');
  const isStruck = struckStepIndex === stepIndex && struckDigitIndex !== null;

  return (
    <span className="forge-step-number inline-block text-gray-900 dark:text-gray-100 font-extrabold font-mono" aria-hidden>
      {digits.map((char, j) => {
        const struck = isStruck && struckDigitIndex === j;
        const delayMs = Math.min(j * 45, 100);
        return (
          <span
            key={j}
            className={`forge-letter ${struck ? 'forge-strike' : ''}`}
            style={{ '--forge-delay': `${delayMs}ms` } as React.CSSProperties}
          >
            {char}
            <span className="forge-reveal-particles" aria-hidden>
              {Array.from({ length: 6 }, (_, k) => (
                <span key={k} className="forge-reveal-particle" />
              ))}
            </span>
            {struck && (
              <>
                <span className="forge-strike-flash" aria-hidden />
                <span className="forge-sparks" aria-hidden>
                  <span className="forge-spark" />
                  <span className="forge-spark" />
                  <span className="forge-spark" />
                  <span className="forge-spark" />
                  <span className="forge-spark" />
                  <span className="forge-spark" />
                  <span className="forge-spark" />
                </span>
                <span className="forge-dust" aria-hidden>
                  {Array.from({ length: 12 }, (_, k) => (
                    <span key={k} className="forge-dust-particle" />
                  ))}
                </span>
              </>
            )}
          </span>
        );
      })}
    </span>
  );
}
