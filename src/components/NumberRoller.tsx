import React, { useState, useEffect } from 'react';

interface DigitRollerProps {
  fromDigits: string;
  toDigits: string;
  currencySymbol: string;
  duration: number;
}

const DigitScroller: React.FC<{ fromDigit: number; toDigit: number; duration: number }> = ({
  fromDigit,
  toDigit,
  duration,
}) => {
  const [transform, setTransform] = useState(`translateY(-${fromDigit * 100}%)`);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTransform(`translateY(-${toDigit * 100}%)`);
    }, 50);

    return () => clearTimeout(timer);
  }, [toDigit]);

  return (
    <div className="relative w-[3.5rem] h-[6.5rem] flex items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none z-20"
        style={{
          background:
            'linear-gradient(to bottom, rgba(10, 10, 12, 1) 0%, rgba(10, 10, 12, 0.4) 10%, rgba(10, 10, 12, 0) 30%, rgba(10, 10, 12, 0) 70%, rgba(10, 10, 12, 0.4) 90%, rgba(10, 10, 12, 1) 100%)',
        }}
      />

      <div
        className="flex flex-col transition-transform"
        style={{
          transform,
          transitionDuration: `${duration}ms`,
          transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <div
            key={num}
            className="h-[6.5rem] flex items-center justify-center text-[6.5rem] font-black leading-none"
          >
            {num}
          </div>
        ))}
      </div>
    </div>
  );
};

export const NumberRoller: React.FC<DigitRollerProps> = ({
  fromDigits,
  toDigits,
  currencySymbol,
  duration,
}) => {
  const fromArray = fromDigits.split('').map((d) => parseInt(d));
  const toArray = toDigits.split('').map((d) => parseInt(d));

  // Pad arrays to same length
  const maxLen = Math.max(fromArray.length, toArray.length);
  while (fromArray.length < maxLen) fromArray.unshift(0);
  while (toArray.length < maxLen) toArray.unshift(0);

  return (
    <div>
      <span className="font-mono text-xs text-iron-dust uppercase tracking-[3px] block mb-2">
        Total Net Worth
      </span>
      <div className="text-[6.5rem] font-black leading-none tracking-[-4px] text-white flex items-baseline">
        <span>{currencySymbol}</span>
        <div className="flex items-baseline">
          {toArray.map((toDigit, i) => (
            <DigitScroller
              key={i}
              fromDigit={fromArray[i]}
              toDigit={toDigit}
              duration={duration}
            />
          ))}
        </div>
        <span className="font-light opacity-30 text-[4rem] tracking-normal ml-1">.00</span>
      </div>
    </div>
  );
};
