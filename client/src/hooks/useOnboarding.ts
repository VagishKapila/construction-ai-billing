/**
 * useOnboarding Hook — Manage onboarding tour state and lifecycle
 * Tracks completion status, handles API calls, and provides tour controls
 */

import React, { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/api/client';

export interface UseOnboardingReturn {
  showTour: boolean;
  startTour: () => void;
  completeTour: () => Promise<void>;
  skipTour: () => Promise<void>;
  resetTour: () => Promise<void>;
  isLoading: boolean;
}

/**
 * Hook to manage onboarding tour state
 * - Automatically shows tour on first login if not completed
 * - Tracks completion status via has_completed_onboarding flag
 * - Provides methods to start, skip, complete, and reset tour
 *
 * @returns Onboarding control object
 * @throws If used outside AuthProvider
 *
 * @example
 * const { showTour, completeTour, skipTour } = useOnboarding();
 * return (
 *   <>
 *     <GuidedTour
 *       isOpen={showTour}
 *       onComplete={completeTour}
 *       onSkip={skipTour}
 *     />
 *   </>
 * );
 */
export function useOnboarding(): UseOnboardingReturn {
  const { user, refreshUser } = useAuth();
  const [isLoading, setIsLoading] = React.useState(false);
  const [localShowTour, setLocalShowTour] = React.useState(false);

  /**
   * Determine if tour should be shown
   * - Only show if user is logged in AND has not completed onboarding
   */
  const showTour = React.useMemo(() => {
    return !!user && !user.has_completed_onboarding && localShowTour;
  }, [user, localShowTour]);

  /**
   * Initialize tour on mount if user is logged in and hasn't completed onboarding
   */
  React.useEffect(() => {
    if (user && !user.has_completed_onboarding) {
      // Small delay to ensure page is fully loaded before showing tour
      const timer = setTimeout(() => {
        setLocalShowTour(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [user]);

  /**
   * Start/resume the tour
   */
  const startTour = useCallback(() => {
    setLocalShowTour(true);
  }, []);

  /**
   * Complete the tour — calls API and updates user state
   */
  const completeTour = useCallback(async () => {
    try {
      setIsLoading(true);
      await api.post('/api/onboarding/complete');

      // Refresh user to update has_completed_onboarding flag
      await refreshUser();

      // Close tour
      setLocalShowTour(false);
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      // Still close tour even if API call fails
      setLocalShowTour(false);
    } finally {
      setIsLoading(false);
    }
  }, [refreshUser]);

  /**
   * Skip the tour — same as complete (marks as done)
   */
  const skipTour = useCallback(async () => {
    try {
      setIsLoading(true);
      await api.post('/api/onboarding/complete');

      // Refresh user to update has_completed_onboarding flag
      await refreshUser();

      // Close tour
      setLocalShowTour(false);
    } catch (error) {
      console.error('Failed to skip onboarding:', error);
      // Still close tour even if API call fails
      setLocalShowTour(false);
    } finally {
      setIsLoading(false);
    }
  }, [refreshUser]);

  /**
   * Reset the tour — allows re-triggering from Settings
   */
  const resetTour = useCallback(async () => {
    try {
      setIsLoading(true);
      await api.post('/api/onboarding/reset');

      // Refresh user to update has_completed_onboarding flag
      await refreshUser();

      // Restart tour
      setLocalShowTour(true);
    } catch (error) {
      console.error('Failed to reset onboarding:', error);
    } finally {
      setIsLoading(false);
    }
  }, [refreshUser]);

  return {
    showTour,
    startTour,
    completeTour,
    skipTour,
    resetTour,
    isLoading,
  };
}
