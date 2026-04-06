import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Upload as UploadIcon, AlertCircle, CheckCircle2, Loader } from 'lucide-react';
import type { HubUpload, DocType } from '@/types/hub';
import { getMagicLinkInfo, magicLinkUpload } from '@/api/hub';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/formatters';

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

export function MagicLinkHub() {
  const { token } = useParams<{ token: string }>();
  const [projectName, setProjectName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [uploads, setUploads] = useState<HubUpload[]>([]);
  const [docType, setDocType] = useState<DocType>('invoice');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load magic link info
  useEffect(() => {
    if (!token) {
      setError('Invalid magic link');
      setLoading(false);
      return;
    }

    const loadInfo = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await getMagicLinkInfo(token);
        if (res.data) {
          setProjectName(res.data.project_name);
          setTradeName(res.data.trade_name);
          setCompanyName(res.data.company_name || '');
          setUploads(res.data.uploads || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project');
      } finally {
        setLoading(false);
      }
    };

    loadInfo();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setError('Please select a file');
      return;
    }

    if (!token) {
      setError('Invalid magic link');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setSuccess(null);

      const formData = new FormData();
      formData.append('doc_type', docType);
      formData.append('file', file);
      if (amount) {
        formData.append('amount', amount);
      }
      if (notes) {
        formData.append('notes', notes);
      }

      const res = await magicLinkUpload(token, formData);
      if (res.data) {
        setUploads([res.data, ...uploads]);
        setSuccess('Document uploaded successfully!');
        // Reset form
        setDocType('invoice');
        setAmount('');
        setNotes('');
        setFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const showAmountField = ['invoice', 'change_order'].includes(docType);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafe] flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-[#E8622A] mx-auto mb-3" />
          <p className="text-text-primary font-medium">Loading project...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafe]">
      {/* Header */}
      <div className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-4">
            <img
              src="/varshyl-logo.png"
              alt="ConstructInvoice AI"
              className="h-10"
            />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">
            Upload Document
          </h1>
          <p className="text-text-muted mt-1">
            For <strong>{projectName}</strong>
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Trade Info */}
        <Card className="p-6">
          <h2 className="font-semibold text-text-primary mb-3">Project Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-text-muted uppercase font-semibold">Trade</p>
              <p className="text-base font-medium text-text-primary mt-1">{tradeName}</p>
            </div>
            {companyName && (
              <div>
                <p className="text-xs text-text-muted uppercase font-semibold">Company</p>
                <p className="text-base font-medium text-text-primary mt-1">{companyName}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Error Banner */}
        {error && (
          <div className="rounded-lg bg-danger-50 border border-danger-200 p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-danger-700">{error}</p>
          </div>
        )}

        {/* Success Banner */}
        {success && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-700">{success}</p>
          </div>
        )}

        {/* Upload Form */}
        <Card className="p-6">
          <h2 className="font-semibold text-text-primary mb-6">Upload Document</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                placeholder="Optional additional information"
                rows={3}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E8622A]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                File *
              </label>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  file
                    ? 'border-[#E8622A] bg-orange-50'
                    : 'border-border hover:border-[#E8622A] hover:bg-orange-50'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadIcon className="w-10 h-10 mx-auto mb-3 text-text-muted" />
                <p className="text-base font-medium text-text-primary">
                  {file ? file.name : 'Click to select file'}
                </p>
                <p className="text-sm text-text-muted mt-2">
                  Supported formats: PDF, Images, Excel, Word, and more
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

            <Button
              type="submit"
              disabled={uploading || !file}
              className="w-full bg-[#E8622A] hover:bg-[#d4501f] text-white font-medium py-2.5"
            >
              {uploading ? 'Uploading...' : 'Upload Document'}
            </Button>
          </form>
        </Card>

        {/* Previous Uploads */}
        {uploads.length > 0 && (
          <Card className="p-6">
            <h2 className="font-semibold text-text-primary mb-4">
              Previous Uploads ({uploads.length})
            </h2>

            <div className="space-y-3">
              {uploads.map(upload => (
                <div
                  key={upload.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {upload.original_name}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge className="text-xs bg-blue-100 text-blue-800 border-blue-200">
                        {upload.doc_type}
                      </Badge>
                      <Badge
                        variant={
                          upload.status === 'approved'
                            ? 'success'
                            : upload.status === 'rejected'
                              ? 'danger'
                              : 'warning'
                        }
                        className="text-xs"
                      >
                        {upload.status}
                      </Badge>
                      <span className="text-xs text-text-muted">
                        {formatDate(upload.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center py-8">
          <p className="text-sm text-text-muted">
            Questions? Contact the project manager
          </p>
        </div>
      </div>
    </div>
  );
}
