/**
 * OnboardingProvider — Integrates GuidedTour + CompanySetupModal into the app
 *
 * Sequence for new users:
 *   1. CompanySetupModal (Step 1) — capture company profile, autofill for future projects
 *   2. GuidedTour (Step 2) — walkthrough of key app features
 *
 * Both steps are skippable. Once company setup is seen (or already has a company name),
 * that step never shows again. Tour is suppressed while company setup is open.
 */

import { useState } from 'react';
import { GuidedTour } from './GuidedTour';
import { CompanySetupModal } from './CompanySetupModal';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Wrapper component that provides the full onboarding sequence to the entire app.
 * Place this at the root level (in Shell or App) so onboarding is available everywhere.
 */
export function OnboardingProvider() {
  const { user } = useAuth();
  const { settings, isLoading: settingsLoading } = useSettings();
  const { showTour, completeTour, skipTour } = useOnboarding();

  // Track whether company setup has already been shown/dismissed this session.
  // Persisted in localStorage so refreshing doesn't re-show it.
  const [companySetupSeen, setCompanySetupSeen] = useState<boolean>(
    () => localStorage.getItem('company_setup_seen') === 'true',
  );

  /**
   * Show company setup when:
   * - User is logged in and hasn't completed full onboarding
   * - Settings have loaded and there's no company name yet
   * - The modal hasn't been shown/dismissed yet this session
   */
  const showCompanySetup =
    !!user &&
    !user.has_completed_onboarding &&
    !settingsLoading &&
    !settings?.company_name &&
    !companySetupSeen;

  const handleCompanySetupDone = () => {
    localStorage.setItem('company_setup_seen', 'true');
    setCompanySetupSeen(true);
  };

  // Suppress the guided tour while company setup modal is open so they don't stack
  const tourVisible = showTour && !showCompanySetup;

  return (
    <>
      <CompanySetupModal
        isOpen={showCompanySetup}
        onComplete={handleCompanySetupDone}
        onSkip={handleCompanySetupDone}
      />
      <GuidedTour
        isOpen={tourVisible}
        onComplete={completeTour}
        onSkip={skipTour}
      />
    </>
  );
}
