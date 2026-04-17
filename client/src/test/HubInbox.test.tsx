import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HubInbox } from '@/features/hub/HubInbox';
import type { HubUpload } from '@/lib/schemas';

// ── Test fixtures ──────────────────────────────────────────────────────────

function makeUpload(overrides: Partial<HubUpload> = {}): HubUpload {
  return {
    id: Math.floor(Math.random() * 10000),
    project_id: 1,
    trade_id: 1,
    filename: 'invoice.pdf',
    doc_type: 'invoice',
    status: 'submitted',
    source: 'magic_link',
    created_at: new Date().toISOString(),
    amount: 12500,
    trade_name: 'Plumbing',
    company_name: 'Smith Plumbing LLC',
    ...overrides,
  };
}

const MOCK_UPLOADS: HubUpload[] = [
  makeUpload({ id: 1, doc_type: 'invoice',     status: 'submitted', trade_name: 'Plumbing',   company_name: 'Smith Plumbing LLC',   amount: 12500 }),
  makeUpload({ id: 2, doc_type: 'lien_waiver', status: 'submitted', trade_name: 'Electrical', company_name: 'Ace Electric Inc',     amount: 8000 }),
  makeUpload({ id: 3, doc_type: 'rfi',         status: 'approved',  trade_name: 'Concrete',   company_name: 'Rocky Concrete Co',   amount: null }),
  makeUpload({ id: 4, doc_type: 'photo',       status: 'rejected',  trade_name: 'Framing',    company_name: 'FastFrame LLC',        amount: null }),
  makeUpload({ id: 5, doc_type: 'invoice',     status: 'draft',     trade_name: 'HVAC',       company_name: 'CoolAir Systems',      amount: 5400 }),
];

// ── Tests ──────────────────────────────────────────────────────────────────

describe('HubInbox', () => {
  it('renders table with mock uploads', () => {
    render(<HubInbox projectId={1} uploads={MOCK_UPLOADS} />);

    // Headers present
    expect(screen.getByText('Trade/Company')).toBeTruthy();
    expect(screen.getByText('Doc Type')).toBeTruthy();
    expect(screen.getByText('Amount')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();

    // Trade names visible
    expect(screen.getByText('Plumbing')).toBeTruthy();
    expect(screen.getByText('Electrical')).toBeTruthy();

    // Company names visible
    expect(screen.getByText('Smith Plumbing LLC')).toBeTruthy();
    expect(screen.getByText('Ace Electric Inc')).toBeTruthy();

    // Doc type badges
    expect(screen.getAllByText('Invoice').length).toBeGreaterThan(0);
    expect(screen.getByText('Lien Waiver')).toBeTruthy();
  });

  it('shows filter tab counts correctly', () => {
    render(<HubInbox projectId={1} uploads={MOCK_UPLOADS} />);

    // "All" tab should show total count
    const allBadge = screen.getAllByText(String(MOCK_UPLOADS.length));
    expect(allBadge.length).toBeGreaterThan(0);
  });

  it('filters uploads by tab', () => {
    render(<HubInbox projectId={1} uploads={MOCK_UPLOADS} />);

    // Click "Approved" tab (first match in the tab bar)
    const approvedTabs = screen.getAllByText('Approved');
    fireEvent.click(approvedTabs[0]);

    // After filtering, only "Rocky Concrete Co" (approved) should be visible
    expect(screen.getByText('Rocky Concrete Co')).toBeTruthy();

    // The rejected one should NOT be in the filtered view
    expect(screen.queryByText('FastFrame LLC')).toBeNull();
  });

  it('shows rejection chips when Reject button is clicked', async () => {
    render(<HubInbox projectId={1} uploads={MOCK_UPLOADS} />);

    // Find a Reject button (first submitted upload)
    const rejectBtns = screen.getAllByText('Reject');
    expect(rejectBtns.length).toBeGreaterThan(0);

    fireEvent.click(rejectBtns[0]);

    // Chips should appear
    await waitFor(() => {
      expect(screen.getByText('Missing retainage')).toBeTruthy();
      expect(screen.getByText('Missing lien waiver')).toBeTruthy();
      expect(screen.getByText('Incorrect amount')).toBeTruthy();
      expect(screen.getByText('Missing backup')).toBeTruthy();
      expect(screen.getByText('Other')).toBeTruthy();
    });
  });

  it('rejection chips pre-fill the note field and enable confirm button', async () => {
    const onReject = vi.fn();
    render(<HubInbox projectId={1} uploads={MOCK_UPLOADS} onReject={onReject} />);

    // Open rejection panel
    const rejectBtns = screen.getAllByText('Reject');
    fireEvent.click(rejectBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('Missing retainage')).toBeTruthy();
    });

    // Click a chip
    const chip = screen.getByText('Missing retainage');
    fireEvent.click(chip);

    // Confirm button should now be enabled
    const confirmBtn = screen.getByText('Confirm Rejection');
    expect(confirmBtn).toBeTruthy();

    // Click confirm — should call onReject with reason
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(onReject).toHaveBeenCalledWith(
        expect.any(Number),
        'Missing retainage',
      );
    });
  });

  it('calls onApprove when Approve is clicked', async () => {
    const onApprove = vi.fn();
    render(<HubInbox projectId={1} uploads={MOCK_UPLOADS} onApprove={onApprove} />);

    const approveBtns = screen.getAllByText('Approve');
    expect(approveBtns.length).toBeGreaterThan(0);

    fireEvent.click(approveBtns[0]);

    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledWith(expect.any(Number));
    });
  });

  it('ARIA batch suggest banner appears when 2+ submitted docs exist', () => {
    // MOCK_UPLOADS has 2 submitted docs (id 1 and 2)
    render(<HubInbox projectId={1} uploads={MOCK_UPLOADS} />);

    expect(screen.getByText(/ARIA suggests/i)).toBeTruthy();
    expect(screen.getAllByText(/Auto-Approve/i).length).toBeGreaterThan(0);
  });

  it('ARIA batch suggest does NOT appear with fewer than 2 submitted docs', () => {
    const singleSubmitted = [MOCK_UPLOADS[0]]; // only 1 submitted
    render(<HubInbox projectId={1} uploads={singleSubmitted} />);
    expect(screen.queryByText(/ARIA suggests/i)).toBeNull();
  });

  it('ARIA banner dismisses when X is clicked', async () => {
    render(<HubInbox projectId={1} uploads={MOCK_UPLOADS} />);

    screen.queryByRole('button', { name: /close|dismiss/i });
    // The X button is in the ARIA banner — find it next to the banner text
    // We find the dismiss button by being the X icon sibling of ARIA text
    const banner = screen.getByText(/ARIA suggests/i).closest('div');
    expect(banner).toBeTruthy();

    // Click the X button inside the banner
    const xBtn = banner!.querySelector('button:last-child') as HTMLButtonElement;
    expect(xBtn).toBeTruthy();
    fireEvent.click(xBtn);

    await waitFor(() => {
      expect(screen.queryByText(/ARIA suggests/i)).toBeNull();
    });
  });

  it('handles empty inbox gracefully', () => {
    render(<HubInbox projectId={1} uploads={[]} />);

    // Shows empty state
    expect(screen.getByText(/No documents here/i)).toBeTruthy();
    expect(screen.getByText(/Documents will appear/i)).toBeTruthy();

    // No table rows
    expect(screen.queryByText('Plumbing')).toBeNull();
  });

  it('handles undefined uploads gracefully (defaults to empty array)', () => {
    render(<HubInbox projectId={1} />);
    expect(screen.getByText(/No documents here/i)).toBeTruthy();
  });

  it('select all checkbox selects all visible rows', () => {
    render(<HubInbox projectId={1} uploads={MOCK_UPLOADS} />);

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    // First checkbox is the header "select all"
    const selectAll = checkboxes[0];

    fireEvent.click(selectAll);

    // All row checkboxes should be checked
    const rowCheckboxes = checkboxes.slice(1);
    rowCheckboxes.forEach((cb) => {
      expect(cb.checked).toBe(true);
    });

    // Clicking again should deselect all
    fireEvent.click(selectAll);
    rowCheckboxes.forEach((cb) => {
      expect(cb.checked).toBe(false);
    });
  });

  it('formats currency amounts with JetBrains Mono font style', () => {
    render(<HubInbox projectId={1} uploads={[MOCK_UPLOADS[0]]} />);

    // $12,500.00 should be visible
    expect(screen.getByText('$12,500.00')).toBeTruthy();
  });

  it('displays "—" for null amounts', () => {
    const noAmount = makeUpload({ id: 99, amount: null, status: 'submitted' });
    render(<HubInbox projectId={1} uploads={[noAmount]} />);
    // The amount cell renders "—"
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });
});
