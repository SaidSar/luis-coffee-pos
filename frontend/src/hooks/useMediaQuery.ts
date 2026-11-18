import { useSyncExternalStore } from 'react';

// true mientras la media query coincide (p. ej. el breakpoint lg de Tailwind: '(min-width: 64rem)')
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const LG_QUERY = '(min-width: 64rem)';
