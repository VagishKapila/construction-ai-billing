/**
 * usePayApp Hook — Single pay app editor with G702/G703 math
 * Manages lines, change orders, and PDF/email operations
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  PayApp,
  PayAppLine,
  PayAppLineComputed,
  ChangeOrder,
  Project,
  SOVLine,
} from '@/types';
import { computeLine, computePayAppTotals, type PayAppTotals } from '@/lib/g702math';
import { downloadBlob } from '@/lib/download';
import * as payAppsApi from '@/api/payApps';

export interface UsePayAppReturn {
  payApp: PayApp | null;
  computedLines: PayAppLineComputed[];
  changeOrders: ChangeOrder[];
  project: Project | null;
  totals: PayAppTotals | null;
  isLoading: boolean;
  error: string | null;
  isDirty: boolean;
  updateLinePercent: (sovLineId: number, thisPct: number) => void;
  updateLineRetainage: (sovLineId: number, retainagePct: number) => void;
  updateLineStoredMaterials: (sovLineId: number, storedMaterials: number) => void;
  saveLines: () => Promise<boolean>;
  updatePayApp: (data: Partial<PayApp>) => Promise<PayApp | null>;
  downloadPDF: () => Promise<void>;
  emailPayApp: (data: payAppsApi.EmailPayAppRequest) => Promise<boolean>;
  addChangeOrder: (data: payAppsApi.ChangeOrderRequest) => Promise<ChangeOrder | null>;
  updateChangeOrder: (id: number, data: Partial<ChangeOrder>) => Promise<ChangeOrder | null>;
  deleteChangeOrder: (id: number) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function usePayApp(
  payAppId: number | string,
): UsePayAppReturn {
  const [payApp, setPayApp] = useState<PayApp | null>(null);
  const [lines, setLines] = useState<PayAppLine[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [sovLines, setSovLines] = useState<SOVLine[]>([]);
  const [computedLines, setComputedLines] = useState<PayAppLineComputed[]>([]);
  const [totals, setTotals] = useState<PayAppTotals | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const id = Number(payAppId);

  /**
   * Compute all lines with G702/G703 math
   */
  const computePayAppLines = useCallback((
    lineItems: PayAppLine[],
    sovMap: Record<number, SOVLine>,
  ): PayAppLineComputed[] => {
    return lineItems.map((line) => {
      const sovLine = sovMap[line.sov_line_id];
      if (!sovLine) {
        return {
          ...line,
          scheduledValue: 0,
          description: '',
          prevAmount: 0,
          thisAmount: 0,
          totalCompleted: 0,
          retainageHeld: 0,
          totalEarned: 0,
          prevCertificates: 0,
          currentDue: 0,
          balanceToFinish: 0,
        };
      }

      // Calculate previous certificates from prior pay apps (simplified: assume it's 0 for now)
      // In a full implementation, this would sum all previous pay app totals
      const prevCerts = 0;

      return computeLine(
        line,
        sovLine.scheduled_value,
        sovLine.description,
        prevCerts,
      );
    });
  }, []);

  /**
   * Fetch pay app with all related data
   */
  const refresh = useCallback(async () => {
    if (!id || isNaN(id)) {
      setError('Invalid pay app ID');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await payAppsApi.getPayApp(id);

      if (response.error) {
        setError(response.error);
      } else if (response.data) {
        const { payApp: pa, lines: lineItems, changeOrders: cos, project: proj, sovLines: sols } = response.data;

        setPayApp(pa);
        setLines(lineItems);
        setChangeOrders(cos);
        setProject(proj);
        setSovLines(sols);

        // Build SOV map for quick lookup
        const sovMap = sols.reduce(
          (acc, sol) => {
            acc[sol.id] = sol;
            return acc;
          },
          {} as Record<number, SOVLine>,
        );

        // Compute lines
        const computed = computePayAppLines(lineItems, sovMap);
        setComputedLines(computed);

        // Compute totals
        const newTotals = computePayAppTotals(computed);
        setTotals(newTotals);

        setIsDirty(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load pay app';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [id, computePayAppLines]);

  /**
   * Load on mount
   */
  useEffect(() => {
    refresh();
  }, [id, refresh]);

  /**
   * Update a line's this period percentage
   */
  const updateLinePercent = useCallback((sovLineId: number, thisPct: number): void => {
    setLines((prev) =>
      prev.map((line) =>
        line.sov_line_id === sovLineId
          ? { ...line, this_pct: thisPct }
          : line,
      ),
    );

    // Recompute lines and totals
    const sovMap = sovLines.reduce(
      (acc, sol) => {
        acc[sol.id] = sol;
        return acc;
      },
      {} as Record<number, SOVLine>,
    );

    const updatedLines = lines.map((line) =>
      line.sov_line_id === sovLineId
        ? { ...line, this_pct: thisPct }
        : line,
    );

    const computed = computePayAppLines(updatedLines, sovMap);
    setComputedLines(computed);
    setTotals(computePayAppTotals(computed));
    setIsDirty(true);
  }, [lines, sovLines, computePayAppLines]);

  /**
   * Update a line's retainage percentage
   */
  const updateLineRetainage = useCallback((sovLineId: number, retainagePct: number): void => {
    setLines((prev) =>
      prev.map((line) =>
        line.sov_line_id === sovLineId
          ? { ...line, retainage_pct: retainagePct }
          : line,
      ),
    );

    // Recompute
    const sovMap = sovLines.reduce(
      (acc, sol) => {
        acc[sol.id] = sol;
        return acc;
      },
      {} as Record<number, SOVLine>,
    );

    const updatedLines = lines.map((line) =>
      line.sov_line_id === sovLineId
        ? { ...line, retainage_pct: retainagePct }
        : line,
    );

    const computed = computePayAppLines(updatedLines, sovMap);
    setComputedLines(computed);
    setTotals(computePayAppTotals(computed));
    setIsDirty(true);
  }, [lines, sovLines, computePayAppLines]);

  /**
   * Update stored materials amount
   */
  const updateLineStoredMaterials = useCallback((sovLineId: number, storedMaterials: number): void => {
    setLines((prev) =>
      prev.map((line) =>
        line.sov_line_id === sovLineId
          ? { ...line, stored_materials: storedMaterials }
          : line,
      ),
    );
    setIsDirty(true);
  }, []);

  /**
   * Save lines to server
   */
  const saveLines = useCallback(async (): Promise<boolean> => {
    try {
      setError(null);

      const payload = lines.map((line) => ({
        sov_line_id: line.sov_line_id,
        this_pct: line.this_pct,
        retainage_pct: line.retainage_pct,
        stored_materials: line.stored_materials,
      }));

      const response = await payAppsApi.savePayAppLines(id, payload);

      if (response.error) {
        setError(response.error);
        return false;
      }

      setIsDirty(false);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save lines';
      setError(message);
      return false;
    }
  }, [id, lines]);

  /**
   * Update pay app header
   */
  const updatePayApp = useCallback(
    async (data: Partial<PayApp>): Promise<PayApp | null> => {
      try {
        setError(null);
        const response = await payAppsApi.updatePayApp(id, data);

        if (response.error) {
          setError(response.error);
          return null;
        }

        if (response.data) {
          setPayApp(response.data);
          return response.data;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update pay app';
        setError(message);
      }

      return null;
    },
    [id],
  );

  /**
   * Download pay app as PDF
   */
  const downloadPDF = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      const blob = await payAppsApi.downloadPayAppPDF(id);

      const filename = `PayApp-${payApp?.app_number || id}.pdf`;
      downloadBlob(blob, filename);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to download PDF';
      setError(message);
    }
  }, [id, payApp?.app_number]);

  /**
   * Email pay app
   */
  const emailPayApp = useCallback(
    async (data: payAppsApi.EmailPayAppRequest): Promise<boolean> => {
      try {
        setError(null);
        const response = await payAppsApi.emailPayApp(id, data);

        if (response.error) {
          setError(response.error);
          return false;
        }

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to email pay app';
        setError(message);
        return false;
      }
    },
    [id],
  );

  /**
   * Add change order
   */
  const addChangeOrder = useCallback(
    async (data: payAppsApi.ChangeOrderRequest): Promise<ChangeOrder | null> => {
      try {
        setError(null);
        const response = await payAppsApi.createChangeOrder(id, data);

        if (response.error) {
          setError(response.error);
          return null;
        }

        if (response.data) {
          const newOrder = response.data;
          setChangeOrders((prev) => [...prev, newOrder]);
          return newOrder;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add change order';
        setError(message);
      }

      return null;
    },
    [id],
  );

  /**
   * Update change order
   */
  const updateChangeOrder = useCallback(
    async (coId: number, data: Partial<ChangeOrder>): Promise<ChangeOrder | null> => {
      try {
        setError(null);
        const response = await payAppsApi.updateChangeOrder(coId, data);

        if (response.error) {
          setError(response.error);
          return null;
        }

        if (response.data) {
          setChangeOrders((prev) =>
            prev
              .map((co) => (co.id === coId ? response.data : co))
              .filter((x): x is ChangeOrder => x !== undefined),
          );
          return response.data;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update change order';
        setError(message);
      }

      return null;
    },
    [],
  );

  /**
   * Delete change order
   */
  const deleteChangeOrder = useCallback(async (coId: number): Promise<boolean> => {
    try {
      setError(null);
      const response = await payAppsApi.deleteChangeOrder(coId);

      if (response.error) {
        setError(response.error);
        return false;
      }

      setChangeOrders((prev) => prev.filter((co) => co.id !== coId));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete change order';
      setError(message);
      return false;
    }
  }, []);

  return {
    payApp,
    computedLines,
    changeOrders,
    project,
    totals,
    isLoading,
    error,
    isDirty,
    updateLinePercent,
    updateLineRetainage,
    updateLineStoredMaterials,
    saveLines,
    updatePayApp,
    downloadPDF,
    emailPayApp,
    addChangeOrder,
    updateChangeOrder,
    deleteChangeOrder,
    refresh,
  };
}
