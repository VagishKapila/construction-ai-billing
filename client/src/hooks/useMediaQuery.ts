/**
 * useMediaQuery Hook — Responsive breakpoint detection
 * Returns true if the media query matches
 */

import { useEffect, useState } from 'react';

/**
 * Hook to detect if a CSS media query matches
 * @param query CSS media query string (e.g., "(max-width: 768px)")
 * @returns true if the query matches, false otherwise
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    // Create media query list
    const mediaQueryList = window.matchMedia(query);

    // Set initial value
    setMatches(mediaQueryList.matches);

    /**
     * Handler for when media query changes
     */
    const handleChange = (e: MediaQueryListEvent) => {
      setMatches(e.matches);
    };

    // Add listener
    mediaQueryList.addEventListener('change', handleChange);

    // Cleanup
    return () => {
      mediaQueryList.removeEventListener('change', handleChange);
    };
  }, [query]);

  return matches;
}
