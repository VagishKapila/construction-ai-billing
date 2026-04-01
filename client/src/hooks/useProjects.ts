/**
 * useProjects Hook — Project list management
 * Handles fetching, creating, and deleting projects
 */

import { useState, useEffect, useCallback } from 'react';
import type { Project } from '@/types';
import * as projectApi from '@/api/projects';

export interface UseProjectsReturn {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createProject: (data: projectApi.CreateProjectData) => Promise<Project | null>;
  deleteProject: (id: number) => Promise<boolean>;
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch all projects
   */
  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await projectApi.getProjects();

      if (response.error) {
        setError(response.error);
        setProjects([]);
      } else if (response.data) {
        setProjects(response.data);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch projects';
      setError(message);
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Load projects on mount
   */
  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Create a new project and refresh the list
   */
  const createProject = useCallback(
    async (data: projectApi.CreateProjectData): Promise<Project | null> => {
      try {
        setError(null);
        const response = await projectApi.createProject(data);

        if (response.error) {
          setError(response.error);
          return null;
        }

        if (response.data) {
          const newProject = response.data;
          setProjects((prev) => [newProject, ...prev]);
          return newProject;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create project';
        setError(message);
      }

      return null;
    },
    [],
  );

  /**
   * Delete a project and remove from local state
   */
  const deleteProject = useCallback(async (id: number): Promise<boolean> => {
    try {
      setError(null);
      const response = await projectApi.deleteProject(id);

      if (response.error) {
        setError(response.error);
        return false;
      }

      // Remove from local state
      setProjects((prev) => prev.filter((p) => p.id !== id));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete project';
      setError(message);
      return false;
    }
  }, []);

  return {
    projects,
    isLoading,
    error,
    refresh,
    createProject,
    deleteProject,
  };
}
