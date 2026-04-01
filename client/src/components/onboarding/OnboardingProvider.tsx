/**
 * OnboardingProvider — Integrates GuidedTour into the app
 * Manages tour state and ensures tour is available throughout the app
 */

import { GuidedTour } from './GuidedTour';
import { useOnboarding } from '@/hooks/useOnboarding';

/**
 * Wrapper component that provides the guided tour to the entire app.
 * Place this at the root level (in Shell or App) so the tour is available everywhere.
 */
export function OnboardingProvider() {
  const { showTour, completeTour, skipTour } = useOnboarding();

  return (
    <GuidedTour
      isOpen={showTour}
      onComplete={completeTour}
      onSkip={skipTour}
    />
  );
}
