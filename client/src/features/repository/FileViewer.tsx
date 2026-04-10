import { useEffect, useState } from 'react';
import { Download, FileText, Image, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

interface Upload {
  id: number;
  filename: string;
  original_name: string;
  doc_type: string;
  status: string;
  source: string;
  trade_name: string;
  uploaded_by: string;
  created_at: string;
}

interface FileViewerProps {
  projectId: number;
}

const DocTypeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'invoice': return <FileText className="w-4 h-4 text-blue-600" />;
    case 'photo': return <Image className="w-4 h-4 text-green-600" />;
    case 'lien_waiver': return <FileText className="w-4 h-4 text-purple-600" />;
    case 'rfi': return <FileText className="w-4 h-4 text-orange-600" />;
    default: return <FileText className="w-4 h-4 text-gray-600" />;
  }
};

const StatusBadge = ({ status }: { status: string }) => {
  if (status === 'approved') {
    return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Approved</span>;
  }
  if (status === 'pending') {
    return <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded-full flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>;
  }
  if (status === 'rejected') {
    return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Rejected</span>;
  }
  return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">{status}</span>;
};

const SourceBadge = ({ source }: { source: string }) => {
  let bgColor = 'bg-blue-50 text-blue-700 border-blue-200';
  let label = 'Web';

  if (source === 'email_ingest') {
    bgColor = 'bg-purple-50 text-purple-700 border-purple-200';
    label = 'Email';
  } else if (source === 'magic_link') {
    bgColor = 'bg-cyan-50 text-cyan-700 border-cyan-200';
    label = 'Magic Link';
  }

  return <span className={`px-2 py-0.5 text-xs rounded border ${bgColor}`}>{label}</span>;
};

export default function FileViewer({ projectId }: FileViewerProps) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [grouped, setGrouped] = useState<Record<string, Upload[]>>({});
  const [summary, setSummary] = useState({ total: 0, approved: 0, pending: 0, rejected: 0, by_type: {} });
  const [activeTab, setActiveTab] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRepository = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/repository`);
        const json = await response.json();

        if (json.error) {
          return;
        }

        setUploads(json.data.uploads || []);
        setGrouped(json.data.grouped || {});
        setSummary(json.data.summary);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchRepository();
  }, [projectId]);

  const handleDownload = (uploadId: number) => {
    window.location.href = `/api/projects/${projectId}/repository/download/${uploadId}`;
  };

  const docTypes = Object.keys(grouped).sort();
  const tabs = ['All', ...docTypes];

  const currentFiles = activeTab === 'All' ? uploads : grouped[activeTab] || [];

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-e2e8f0 p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading files...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-e2e8f0 p-4">
          <div className="text-sm text-gray-600">Total Files</div>
          <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
        </div>
        <div className="bg-white rounded-xl border border-e2e8f0 p-4">
          <div className="text-sm text-gray-600">Approved</div>
          <div className="text-2xl font-bold text-green-600">{summary.approved}</div>
        </div>
        <div className="bg-white rounded-xl border border-e2e8f0 p-4">
          <div className="text-sm text-gray-600">Pending</div>
          <div className="text-2xl font-bold text-amber-600">{summary.pending}</div>
        </div>
        <div className="bg-white rounded-xl border border-e2e8f0 p-4">
          <div className="text-sm text-gray-600">Rejected</div>
          <div className="text-2xl font-bold text-red-600">{summary.rejected}</div>
        </div>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-xl border border-e2e8f0 p-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-e2e8f0 mb-6 overflow-x-auto pb-4">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab} ({activeTab === tab ? currentFiles.length : (tab === 'All' ? summary.total : (summary.by_type as any)[tab] || 0)})
            </button>
          ))}
        </div>

        {/* File List */}
        {currentFiles.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">No files uploaded to {activeTab === 'All' ? 'this project' : activeTab}</p>
            <p className="text-sm text-gray-400">Trades can upload documents from the Hub or via email</p>
          </div>
        ) : (
          <div className="space-y-3">
            {currentFiles.map(file => (
              <div key={file.id} className="flex items-center justify-between p-4 bg-f8fafc rounded-lg border border-e2e8f0 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4 flex-1">
                  <DocTypeIcon type={file.doc_type} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{file.original_name || file.filename}</p>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-gray-500">{file.trade_name || 'General'}</span>
                      <SourceBadge source={file.source} />
                      <span className="text-xs text-gray-400">
                        {new Date(file.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={file.status} />
                  <button
                    onClick={() => handleDownload(file.id)}
                    className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
