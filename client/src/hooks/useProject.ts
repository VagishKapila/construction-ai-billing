/**
 * useProject Hook — Single project detail with SOV lines and pay apps
 */

import { useState, useEffect, useCallback } from 'react';
import type { Project, SOVLine, PayApp } from '@/types';
import * as projectApi from '@/api/projects';
import * as payAppsApi from '@/api/payApps';

export interface UseProjectReturn {
  project: Project | null;
  sovLines: SOVLine[];
  payApps: PayApp[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateProject: (data: Partial<projectApi.CreateProjectData>) => Promise<Project | null>;
}

export function useProject(
  projectId: number | string,
): UseProjectReturn {
  const [project, setProject] = useState<Project | null>(null);
  const [sovLines, setSovLines] = useState<SOVLine[]>([]);
  const [payApps, setPayApps] = useState<PayApp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const id = Number(projectId);

  /**
   * Fetch project data, SOV lines, and pay apps
   */
  const refresh = useCallback(async () => {
    if (!id || isNaN(id)) {
      setError('Invalid project ID');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Fetch SOV lines
      const sovResponse = await projectApi.getSOVLines(id);
      if (sovResponse.data) {
        setSovLines(sovResponse.data);
      }

      // Fetch pay apps
      const payAppsResponse = await projectApi.getProjects(); // Gets all projects, then filter
      // This approach fetches all and filters; alternatively, we'd need a getProject endpoint
      // For now, we'll fetch all projects and find the one we need
      if (payAppsResponse.data) {
        const foundProject = payAppsResponse.data.find((p) => p.id === id);
        if (foundProject) {
          setProject(foundProject);

          // Fetch pay apps for this project
          const payAppsRes = await payAppsApi.getPayApps(id);
          if (payAppsRes.data) {
            setPayApps(payAppsRes.data);
          }
        } else {
          setError('Project not found');
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load project data';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  /**
   * Load project on mount
   */
  useEffect(() => {
    refresh();
  }, [id, refresh]);

  /**
   * Update project
   */
  const updateProject = useCallback(
    async (data: Partial<projectApi.CreateProjectData>): Promise<Project | null> => {
      try {
        setError(null);
        const response = await projectApi.updateProject(id, data);

        if (response.error) {
          setError(response.error);
          return null;
        }

        if (response.data) {
          setProject(response.data);
          return response.data;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update project';
        setError(message);
      }

      return null;
    },
    [id],
  );

  return {
    project,
    sovLines,
    payApps,
    isLoading,
    error,
    refresh,
    updateProject,
  };
}
