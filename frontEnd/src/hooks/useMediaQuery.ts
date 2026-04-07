import { useState, useEffect } from 'react';

/** 与 CSS max-width 一致：匹配时视口宽度 ≤ breakpoint */
export function useMaxWidth(breakpointPx: number): boolean {
  const query = `(max-width: ${breakpointPx}px)`;
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${breakpointPx}px)`).matches : false
  );

  useEffect(() => {
    const m = window.matchMedia(query);
    const sync = () => setMatches(m.matches);
    sync();
    m.addEventListener('change', sync);
    return () => m.removeEventListener('change', sync);
  }, [query]);

  return matches;
}
