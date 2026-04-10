import { useEffect, useState } from 'react';
import { Download, Check, AlertCircle, Loader } from 'lucide-react';

interface ZipExportButtonProps {
  projectId: number;
}

interface CloseoutStatus {
  id: number;
  zip_filename: string;
  docs_included: number;
  created_at: string;
}

export default function ZipExportButton({ projectId }: ZipExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [closeoutStatus, setCloseoutStatus] = useState<CloseoutStatus | null>(null);
  const [isEligible, setIsEligible] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/close-out/status`);
        const json = await response.json();
        if (json.data) {
          setCloseoutStatus(json.data);
        }
      } catch (err) {
        console.error('Failed to check close-out status', err);
      }
    };

    checkStatus();
  }, [projectId]);

  const handleCreateCloseout = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`/api/projects/${projectId}/close-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const json = await response.json();

      if (json.error) {
        setError(json.message || json.error);
        setIsEligible(false);
        return;
      }

      // Download the ZIP
      const downloadUrl = json.data.download_url;
      window.location.href = downloadUrl;

      setSuccess(true);
      setCloseoutStatus({
        id: Date.now(),
        zip_filename: json.data.zip_filename,
        docs_included: json.data.docs_included,
        created_at: new Date().toISOString()
      });

      // Reset success message after 5 seconds
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError('Failed to create close-out package');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const buttonVariant = isEligible
    ? 'bg-blue-600 text-white hover:bg-blue-700'
    : 'bg-gray-300 text-gray-600 cursor-not-allowed';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-e2e8f0 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Close-Out Package</h3>
            <p className="text-sm text-gray-600 mb-4">
              Requires all SOV lines 100% complete and unconditional lien waivers from all trades
            </p>
          </div>
          <button
            onClick={handleCreateCloseout}
            disabled={loading || !isEligible}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${buttonVariant}`}
          >
            {loading && <Loader className="w-4 h-4 animate-spin" />}
            {success && <Check className="w-4 h-4" />}
            {!loading && !success && <Download className="w-4 h-4" />}
            {loading ? 'Generating...' : success ? 'Ready!' : 'Generate Close-Out Package'}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-900">Cannot create package</p>
              <p className="text-sm text-red-800 mt-1">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex gap-3">
            <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-900">Package ready!</p>
              <p className="text-sm text-green-800 mt-1">Your close-out ZIP is downloading now.</p>
            </div>
          </div>
        )}

        {closeoutStatus && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900">Last close-out: {new Date(closeoutStatus.created_at).toLocaleDateString()}</p>
            <p className="text-sm text-blue-800 mt-1">{closeoutStatus.docs_included} documents included</p>
          </div>
        )}
      </div>
    </div>
  );
}
