/**
 * useTrial Hook — Trial and subscription status tracking
 * Reads from AuthContext and computes trial metrics
 */

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export interface UseTrialReturn {
  daysRemaining: number | null;
  isExpired: boolean;
  isActive: boolean;
  isPro: boolean;
  isFreeOverride: boolean;
  isTrialGated: boolean;
  subscriptionStatus: string;
  planType: string;
  trialEndDate: string | null;
}

export function useTrial(): UseTrialReturn {
  const { user } = useAuth();

  /**
   * Calculate days remaining in trial
   */
  const daysRemaining = useMemo((): number | null => {
    if (!user?.trial_end_date) return null;

    const endDate = new Date(user.trial_end_date);
    const now = new Date();
    const diffTime = endDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
  }, [user?.trial_end_date]);

  /**
   * Check if trial is expired
   */
  const isExpired = useMemo((): boolean => {
    if (!user?.trial_end_date) return false;

    const endDate = new Date(user.trial_end_date);
    const now = new Date();
    return now >= endDate;
  }, [user?.trial_end_date]);

  /**
   * Check if trial is active
   */
  const isActive = useMemo((): boolean => {
    return user?.subscription_status === 'trial' && !isExpired;
  }, [user?.subscription_status, isExpired]);

  /**
   * Check if user is on Pro plan
   */
  const isPro = useMemo((): boolean => {
    return user?.subscription_status === 'active' && user?.plan_type === 'pro';
  }, [user?.subscription_status, user?.plan_type]);

  /**
   * Check if user has free override
   */
  const isFreeOverride = useMemo((): boolean => {
    return user?.subscription_status === 'free_override' || user?.plan_type === 'free_override';
  }, [user?.subscription_status, user?.plan_type]);

  /**
   * Check if user is trial-gated (trial expired and not pro or free override)
   */
  const isTrialGated = useMemo((): boolean => {
    return isExpired && !isPro && !isFreeOverride;
  }, [isExpired, isPro, isFreeOverride]);

  const subscriptionStatus = user?.subscription_status || 'trial';
  const planType = user?.plan_type || 'free_trial';
  const trialEndDate = user?.trial_end_date || null;

  return {
    daysRemaining,
    isExpired,
    isActive,
    isPro,
    isFreeOverride,
    isTrialGated,
    subscriptionStatus,
    planType,
    trialEndDate,
  };
}
