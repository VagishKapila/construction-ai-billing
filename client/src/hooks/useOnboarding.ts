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
   * Skip if localStorage indicates onboarding was dismissed in current session
   */
  React.useEffect(() => {
    // Early exit if tour was dismissed in this session
    if (localStorage.getItem('onboarding_dismissed') === 'true') {
      setLocalShowTour(false);
      return;
    }

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
   * Sets localStorage flag immediately to prevent re-showing in current session
   */
  const completeTour = useCallback(async () => {
    try {
      // Set localStorage flag FIRST to prevent tour re-appearing while API processes
      localStorage.setItem('onboarding_dismissed', 'true');
      setLocalShowTour(false);
      setIsLoading(true);

      // Call API in background
      await api.post('/api/onboarding/complete');

      // Refresh user to update has_completed_onboarding flag
      await refreshUser();
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      // Tour stays closed due to localStorage flag
    } finally {
      setIsLoading(false);
    }
  }, [refreshUser]);

  /**
   * Skip the tour — same as complete (marks as done)
   * Sets localStorage flag immediately to prevent re-showing in current session
   */
  const skipTour = useCallback(async () => {
    try {
      // Set localStorage flag FIRST to prevent tour re-appearing while API processes
      localStorage.setItem('onboarding_dismissed', 'true');
      setLocalShowTour(false);
      setIsLoading(true);

      // Call API in background
      await api.post('/api/onboarding/complete');

      // Refresh user to update has_completed_onboarding flag
      await refreshUser();
    } catch (error) {
      console.error('Failed to skip onboarding:', error);
      // Tour stays closed due to localStorage flag
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
