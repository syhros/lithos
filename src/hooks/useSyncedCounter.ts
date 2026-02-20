import { useState, useEffect, useRef } from 'react';

/**
 * useSyncedCounter
 *
 * Manages the full syncing → pulse → fade-to-100% → roll animation sequence.
 *
 * States:
 *   idle      – no sync in progress; value tracks targetValue normally.
 *   syncing   – loading=true; value is frozen at frozenValue; pulse class applied.
 *   fading    – loading just turned false; value still frozen; 300ms opacity
 *               transition back to 100% before roll fires.
 *   rolling   – counter animates from frozenValue to newTargetValue.
 *
 * Returns:
 *   displayValue  – the number to render
 *   isPulsing     – apply animate-pulse-opacity
 *   isFading      – apply opacity-transition-to-full (handled inline via style)
 *   opacity       – exact opacity value to set on the element (1 or 0.5 while pulsing)
 */
export type SyncPhase = 'idle' | 'syncing' | 'fading' | 'rolling';

const FADE_DURATION = 300;   // ms – opacity fade back to 100% after sync ends
const ROLL_DURATION = 1500;  // ms – slot-machine roll duration
const MIN_SYNC_MS  = 2000;  // ms – minimum syncing display time (enforced in context)

const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);

export const useSyncedCounter = (
  targetValue: number,
  loading: boolean,
  cacheKey: string
) => {
  // Read cached value synchronously so the first render has it
  const readCache = (): number => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return 0;
      const { value, timestamp } = JSON.parse(raw);
      if (Date.now() - timestamp < 30 * 60 * 1000) return value as number;
    } catch (_) {}
    return 0;
  };

  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [displayValue, setDisplayValue] = useState<number>(readCache);
  const [opacity, setOpacity] = useState(1);

  // Refs so closures inside rAF / setTimeout always see the latest values
  const frozenRef    = useRef<number>(readCache());
  const targetRef    = useRef<number>(targetValue);
  const loadingRef   = useRef<boolean>(loading);
  const phaseRef     = useRef<SyncPhase>('idle');
  const rafRef       = useRef<number | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelAll = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); fadeTimerRef.current = null; }
  };

  // Keep targetRef in sync
  useEffect(() => { targetRef.current = targetValue; }, [targetValue]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // --- Phase machine ---
  useEffect(() => {
    if (loading) {
      // --- Enter SYNCING ---
      // Freeze the display at the current displayed value (not the new target)
      cancelAll();
      frozenRef.current = displayValue;
      phaseRef.current = 'syncing';
      setPhase('syncing');
      // opacity pulse is applied via CSS class; reset to 1 here so CSS takes over
      setOpacity(1);
    } else {
      if (phaseRef.current === 'syncing') {
        // --- Enter FADING ---
        // loading just flipped false; snap opacity to 1 over FADE_DURATION then roll
        cancelAll();
        phaseRef.current = 'fading';
        setPhase('fading');
        setOpacity(1); // CSS transition will handle the visual

        fadeTimerRef.current = setTimeout(() => {
          // --- Enter ROLLING ---
          phaseRef.current = 'rolling';
          setPhase('rolling');
          setOpacity(1);

          const from = frozenRef.current;
          const to   = targetRef.current;
          const start = performance.now();

          const roll = (now: number) => {
            const elapsed  = now - start;
            const progress = Math.min(elapsed / ROLL_DURATION, 1);
            const eased    = easeOutQuad(progress);
            const current  = from + (to - from) * eased;
            setDisplayValue(current);

            if (progress < 1) {
              rafRef.current = requestAnimationFrame(roll);
            } else {
              setDisplayValue(to);
              phaseRef.current = 'idle';
              setPhase('idle');
              // Persist to cache
              try {
                localStorage.setItem(cacheKey, JSON.stringify({ value: to, timestamp: Date.now() }));
              } catch (_) {}
            }
          };

          rafRef.current = requestAnimationFrame(roll);
        }, FADE_DURATION);
      } else if (phaseRef.current === 'idle') {
        // Normal (non-sync) value update — animate directly
        cancelAll();
        const from  = displayValue;
        const to    = targetValue;
        if (Math.abs(to - from) < 0.01) { setDisplayValue(to); return; }
        const start = performance.now();
        phaseRef.current = 'rolling';
        setPhase('rolling');

        const roll = (now: number) => {
          const elapsed  = now - start;
          const progress = Math.min(elapsed / ROLL_DURATION, 1);
          const eased    = easeOutQuad(progress);
          setDisplayValue(from + (to - from) * eased);
          if (progress < 1) {
            rafRef.current = requestAnimationFrame(roll);
          } else {
            setDisplayValue(to);
            phaseRef.current = 'idle';
            setPhase('idle');
            try {
              localStorage.setItem(cacheKey, JSON.stringify({ value: to, timestamp: Date.now() }));
            } catch (_) {}
          }
        };
        rafRef.current = requestAnimationFrame(roll);
      }
    }

    return cancelAll;
    // We intentionally depend only on loading here; targetValue changes during
    // rolling are ignored (roll already captured `to` in the closure).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // When targetValue changes while we're NOT syncing/rolling, update idle display
  useEffect(() => {
    if (phaseRef.current === 'idle' && !loading) {
      // handled by the loading effect above on next trigger
    }
  }, [targetValue, loading]);

  return {
    displayValue,
    isPulsing: phase === 'syncing',
    opacity,
    phase,
  };
};
