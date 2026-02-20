import { useState, useEffect, useRef } from 'react';

interface CachedValue {
  value: number;
  timestamp: number;
}

export const useAnimatedCounter = (
  targetValue: number,
  duration: number = 1500,
  cacheKey: string = 'animated_counter'
) => {
  const [displayValue, setDisplayValue] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const startValueRef = useRef<number>(0);

  useEffect(() => {
    const cachedData = localStorage.getItem(cacheKey);
    let initialValue = 0;

    if (cachedData) {
      try {
        const parsed: CachedValue = JSON.parse(cachedData);
        const ageInMs = Date.now() - parsed.timestamp;
        const thirtyMinutesInMs = 30 * 60 * 1000;

        if (ageInMs < thirtyMinutesInMs) {
          initialValue = parsed.value;
          setDisplayValue(parsed.value);
        }
      } catch (e) {
        console.info('Failed to load cached counter value');
      }
    }

    startValueRef.current = initialValue;
    startTimeRef.current = Date.now();
    setIsAnimating(true);

    const animate = () => {
      if (!startTimeRef.current) return;

      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      const easeOutQuad = 1 - (1 - progress) * (1 - progress);
      const currentValue = startValueRef.current + (targetValue - startValueRef.current) * easeOutQuad;

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
        setDisplayValue(targetValue);
        localStorage.setItem(
          cacheKey,
          JSON.stringify({
            value: targetValue,
            timestamp: Date.now()
          } as CachedValue)
        );
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [targetValue, duration, cacheKey]);

  return { displayValue, isAnimating };
};
