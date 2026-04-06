import { useState, useRef } from 'react';
import { X, Upload as UploadIcon } from 'lucide-react';
import type { Trade, DocType } from '@/types/hub';
import { uploadDocument } from '@/api/hub';
import { Button } from '@/components/ui/button';

interface UploadDocumentModalProps {
  projectId: number;
  trades: Trade[];
  onClose: () => void;
  onUploaded: () => void;
  open: boolean;
}

const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: 'invoice', label: 'Invoice' },
  { value: 'lien_waiver', label: 'Lien Waiver' },
  { value: 'rfi', label: 'RFI' },
  { value: 'photo', label: 'Photo' },
  { value: 'submittal', label: 'Submittal' },
  { value: 'daily_report', label: 'Daily Report' },
  { value: 'change_order', label: 'Change Order' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'drawing', label: 'Drawing' },
  { value: 'other', label: 'Other' },
];

export function UploadDocumentModal({
  projectId,
  trades,
  onClose,
  onUploaded,
  open,
}: UploadDocumentModalProps) {
  const [tradeId, setTradeId] = useState<number | ''>('');
  const [docType, setDocType] = useState<DocType>('invoice');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const showAmountField = ['invoice', 'change_order'].includes(docType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tradeId) {
      setError('Please select a trade');
      return;
    }

    if (!file) {
      setError('Please select a file');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const formData = new FormData();
      formData.append('trade_id', String(tradeId));
      formData.append('doc_type', docType);
      formData.append('file', file);
      if (amount && showAmountField) {
        formData.append('amount', amount);
      }
      if (notes) {
        formData.append('notes', notes);
      }

      await uploadDocument(projectId, formData);

      onUploaded();
      // Reset form
      setTradeId('');
      setDocType('invoice');
      setAmount('');
      setNotes('');
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Modal Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Panel */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg max-w-md w-full mx-4 z-50 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-6 border-b border-border bg-white">
          <h2 className="font-semibold text-lg text-text-primary">Upload Document</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-danger-50 border border-danger-200 p-3 text-sm text-danger-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Trade *
            </label>
            <select
              value={tradeId}
              onChange={e => setTradeId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E8622A]"
            >
              <option value="">Select a trade...</option>
              {trades.map(trade => (
                <option key={trade.id} value={trade.id}>
                  {trade.name} {trade.company_name ? `(${trade.company_name})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Document Type *
            </label>
            <select
              value={docType}
              onChange={e => setDocType(e.target.value as DocType)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E8622A]"
            >
              {DOC_TYPES.map(dt => (
                <option key={dt.value} value={dt.value}>
                  {dt.label}
                </option>
              ))}
            </select>
          </div>

          {showAmountField && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Amount
              </label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E8622A]"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional"
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E8622A]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              File *
            </label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                file
                  ? 'border-[#E8622A] bg-orange-50'
                  : 'border-border hover:border-[#E8622A] hover:bg-orange-50'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon className="w-8 h-8 mx-auto mb-2 text-text-muted" />
              <p className="text-sm font-medium text-text-primary">
                {file ? file.name : 'Click to select file'}
              </p>
              <p className="text-xs text-text-muted mt-1">
                PDF, images, Excel, Word, or other formats
              </p>
              <input
                ref={fileInputRef}
                type="file"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc,.gif,.webp"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#E8622A] hover:bg-[#d4501f]"
              disabled={loading || !tradeId || !file}
            >
              {loading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
