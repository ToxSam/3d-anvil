'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';

const FULL_TEXT = 'Forge 3D Assets On Solana';

/** Milliseconds between hammer strikes. Lower = more frequent (e.g. 1500). Higher = less (e.g. 3500). */
const STRIKE_INTERVAL_MS = 2000;

/** Index after which we break to a new line (after "Assets" -> line 2: "On Solana") */
const LINE_BREAK_AFTER_WORD_INDEX = 2;

export function ForgeWord() {
  const [struckIndex, setStruckIndex] = useState<number | null>(null);

  const wordList = useMemo(() => {
    const words = FULL_TEXT.split(/\s+/);
    let index = 0;
    return words.map((word) => {
      const startIndex = index;
      index += word.length + 1; // +1 for space after word
      return { word, startIndex };
    });
  }, []);

  const line1Words = useMemo(() => wordList.slice(0, LINE_BREAK_AFTER_WORD_INDEX + 1), [wordList]);
  const line2Words = useMemo(() => wordList.slice(LINE_BREAK_AFTER_WORD_INDEX + 1), [wordList]);

  const nonSpaceIndices = useMemo(() => {
    const indices: number[] = [];
    wordList.forEach(({ word, startIndex }) => {
      for (let j = 0; j < word.length; j++) indices.push(startIndex + j);
    });
    return indices;
  }, [wordList]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const interval = setInterval(() => {
      const i = nonSpaceIndices[Math.floor(Math.random() * nonSpaceIndices.length)];
      setStruckIndex(i);
      timeoutId = setTimeout(() => setStruckIndex(null), 650);
    }, STRIKE_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [nonSpaceIndices]);

  const renderWord = (wi: number, word: string, startIndex: number, isLastInLine: boolean) => (
    <Fragment key={wi}>
      <span className="forge-word inline-block">
        {word.split('').map((char, j) => {
          const globalIndex = startIndex + j;
          const delayMs = Math.min(globalIndex * 45, 600);
          return (
            <span
              key={j}
              className={`forge-letter ${struckIndex === globalIndex ? 'forge-strike' : ''}`}
              style={{ '--forge-delay': `${delayMs}ms` } as React.CSSProperties}
            >
              {char}
              {/* Particles burst at same moment letter appears (same --forge-delay) */}
              <span className="forge-reveal-particles" aria-hidden>
                {Array.from({ length: 6 }, (_, k) => (
                  <span key={k} className="forge-reveal-particle" />
                ))}
              </span>
              {/* Lightning / smash particles when letter is struck (hammer on anvil) */}
              {struckIndex === globalIndex && (
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
      {!isLastInLine && (
        <span className="forge-letter forge-space" style={{ '--forge-delay': `${Math.min(startIndex + word.length * 45, 600)}ms` } as React.CSSProperties}>
          {' '}
        </span>
      )}
    </Fragment>
  );

  return (
    <span className="forge-phrase" aria-hidden>
      <span className="forge-line forge-line-1">
        {line1Words.map(({ word, startIndex }, wi) => renderWord(wi, word, startIndex, wi === line1Words.length - 1))}
      </span>
      <span className="forge-line-gap" aria-hidden />
      <span className="forge-line forge-line-2">
        {line2Words.map(({ word, startIndex }, wi) => renderWord(LINE_BREAK_AFTER_WORD_INDEX + 1 + wi, word, startIndex, wi === line2Words.length - 1))}
      </span>
    </span>
  );
}
