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
  Attachment,
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
  attachments: Attachment[];
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
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
          item_id: '',
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

      // Column G: Previous certificates = total earned less retainage from prior billing
      // prevAmount (B) = prev_pct/100 × scheduledValue
      // Previous retainage = retainage_pct/100 × prevAmount
      // Previous certificates (G) = prevAmount − previous retainage
      const sv = Number(sovLine.scheduled_value) || 0;
      const prevAmt = (Number(line.prev_pct) || 0) / 100 * sv;
      const prevRetainage = (Number(line.retainage_pct) || 0) / 100 * prevAmt;
      const prevCerts = prevAmt - prevRetainage;

      return computeLine(
        line,
        sovLine.scheduled_value,
        sovLine.description,
        prevCerts,
        sovLine.item_id || '',
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
        // Server returns flat: { ...payAppFields, lines: [...], change_orders: [...], attachments: [...] }
        // Each line includes sov data (item_id, description, scheduled_value) from the SQL JOIN
        const raw = response.data as Record<string, unknown>;
        const lineItems = (raw.lines || []) as PayAppLine[];
        const cos = (raw.change_orders || raw.changeOrders || []) as ChangeOrder[];
        const atts = (raw.attachments || []) as Attachment[];

        // Extract pay app fields (everything except lines/change_orders/attachments)
        const { lines: _l, change_orders: _co, attachments: _a, ...paFields } = raw;
        const pa = paFields as unknown as PayApp;

        // Build project object from the joined fields
        const proj: Project = {
          id: pa.project_id as unknown as number,
          name: (raw.project_name as string) || '',
          owner: (raw.owner as string) || '',
          contractor: (raw.contractor as string) || '',
          architect: (raw.architect as string) || '',
          contact_name: (raw.contact_name as string) || '',
          contact_phone: (raw.contact_phone as string) || '',
          contact_email: (raw.contact_email as string) || '',
          original_contract: raw.original_contract as number,
          number: (raw.project_number as string) || '',
          building_area: (raw.building_area as string) || '',
          contract_date: (raw.contract_date as string) || '',
          payment_terms: (raw.payment_terms as string) || '',
          include_architect: raw.include_architect as boolean,
          include_retainage: raw.include_retainage as boolean,
        } as Project;

        // Build SOV lines from the line items (each line has sov data from the JOIN)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sols: SOVLine[] = (lineItems as any[]).map((line) => ({
          id: line.sov_line_id as number,
          project_id: pa.project_id as unknown as number,
          item_id: (line.item_id as string) || '',
          description: (line.description as string) || '',
          scheduled_value: Number(line.scheduled_value) || 0,
          sort_order: (line.sort_order as number) || 0,
        })) as SOVLine[];

        setPayApp(pa);
        setLines(lineItems);
        setChangeOrders(cos);
        setAttachments(atts);
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
   * Auto-recompute computedLines and totals whenever lines or sovLines change.
   * This fixes the stale closure bug where "Apply to All" called updateLinePercent
   * for each line in a loop, but each call used the old `lines` from closure,
   * so only the last line's recomputation survived.
   */
  useEffect(() => {
    if (lines.length === 0 || sovLines.length === 0) return;

    const sovMap = sovLines.reduce(
      (acc, sol) => {
        acc[sol.id] = sol;
        return acc;
      },
      {} as Record<number, SOVLine>,
    );

    const computed = computePayAppLines(lines, sovMap);
    setComputedLines(computed);
    setTotals(computePayAppTotals(computed));
  }, [lines, sovLines, computePayAppLines]);

  /**
   * Update a line's this period percentage.
   * Only updates `lines` state — the useEffect auto-recomputes computedLines & totals.
   * This avoids the stale closure bug when "Apply to All" calls this in a loop.
   */
  const updateLinePercent = useCallback((sovLineId: number, thisPct: number): void => {
    setLines((prev) =>
      prev.map((line) =>
        line.sov_line_id === sovLineId
          ? { ...line, this_pct: thisPct }
          : line,
      ),
    );
    setIsDirty(true);
  }, []);

  /**
   * Update a line's retainage percentage.
   * Only updates `lines` state — the useEffect auto-recomputes computedLines & totals.
   */
  const updateLineRetainage = useCallback((sovLineId: number, retainagePct: number): void => {
    setLines((prev) =>
      prev.map((line) =>
        line.sov_line_id === sovLineId
          ? { ...line, retainage_pct: retainagePct }
          : line,
      ),
    );
    setIsDirty(true);
  }, []);

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
    attachments,
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
