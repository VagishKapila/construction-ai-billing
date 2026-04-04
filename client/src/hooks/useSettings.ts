/**
 * useSettings Hook — Company settings management
 * Handles logo, signature, and company settings
 */

import { useState, useEffect, useCallback } from 'react';
import type { CompanySettings } from '@/types';
import * as settingsApi from '@/api/settings';

export interface UseSettingsReturn {
  settings: CompanySettings | null;
  isLoading: boolean;
  error: string | null;
  saveSettings: (data: settingsApi.UpdateSettingsRequest) => Promise<CompanySettings | null>;
  uploadLogo: (file: File) => Promise<settingsApi.FileUploadResponse | null>;
  uploadSignature: (file: File) => Promise<settingsApi.FileUploadResponse | null>;
  refresh: () => Promise<void>;
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch settings from server
   */
  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await settingsApi.getSettings();

      if (response.error) {
        setError(response.error);
        setSettings(null);
      } else if (response.data) {
        setSettings(response.data);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load settings';
      setError(message);
      setSettings(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Load settings on mount
   */
  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Save settings
   */
  const saveSettings = useCallback(
    async (data: settingsApi.UpdateSettingsRequest): Promise<CompanySettings | null> => {
      try {
        setError(null);
        const response = await settingsApi.saveSettings(data);

        if (response.error) {
          setError(response.error);
          return null;
        }

        if (response.data) {
          setSettings(response.data);
          return response.data;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save settings';
        setError(message);
      }

      return null;
    },
    [],
  );

  /**
   * Upload logo
   */
  const uploadLogo = useCallback(
    async (file: File): Promise<settingsApi.FileUploadResponse | null> => {
      try {
        setError(null);
        const response = await settingsApi.uploadLogo(file);

        if (response.error) {
          setError(response.error);
          return null;
        }

        if (response.data) {
          // Update settings with new logo filename
          if (settings) {
            setSettings({
              ...settings,
              logo_filename: response.data.filename,
              logo_original_name: file.name,
            });
          }
          return response.data;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to upload logo';
        setError(message);
      }

      return null;
    },
    [settings],
  );

  /**
   * Upload signature
   */
  const uploadSignature = useCallback(
    async (file: File): Promise<settingsApi.FileUploadResponse | null> => {
      try {
        setError(null);
        const response = await settingsApi.uploadSignature(file);

        if (response.error) {
          setError(response.error);
          return null;
        }

        if (response.data) {
          // Update settings with new signature filename
          if (settings) {
            setSettings({
              ...settings,
              signature_filename: response.data.filename,
            });
          }
          return response.data;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to upload signature';
        setError(message);
      }

      return null;
    },
    [settings],
  );

  return {
    settings,
    isLoading,
    error,
    saveSettings,
    uploadLogo,
    uploadSignature,
    refresh,
  };
}
