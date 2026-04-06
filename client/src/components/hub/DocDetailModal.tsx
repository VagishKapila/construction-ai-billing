import { useState, useEffect } from 'react';
import { X, Download, MessageCircle } from 'lucide-react';
import type { HubUpload, HubComment } from '@/types/hub';
import {
  getUpload,
  updateUploadStatus,
  addComment,
  downloadUpload,
} from '@/api/hub';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatCurrency } from '@/lib/formatters';

interface DocDetailModalProps {
  upload: HubUpload | null;
  projectId: number;
  onClose: () => void;
  onStatusChange: (upload: HubUpload) => void;
}

export function DocDetailModal({
  upload,
  projectId,
  onClose,
  onStatusChange,
}: DocDetailModalProps) {
  const [comments, setComments] = useState<HubComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [revisionStep, setRevisionStep] = useState<0 | 1 | 2>(0); // 0=default, 1=reason input, 2=confirmed
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load upload details and comments
  useEffect(() => {
    if (!upload) return;

    const loadDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        setRevisionStep(0);
        setRejectionReason('');
        setNewComment('');

        const res = await getUpload(projectId, upload.id);
        if (res.data) {
          setComments(res.data.comments || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load upload');
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [upload, projectId]);

  if (!upload) return null;

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    try {
      setLoading(true);
      setError(null);

      const res = await addComment(projectId, upload.id, newComment);
      if (res.data) {
        setComments([...comments, res.data]);
        setNewComment('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await updateUploadStatus(projectId, upload.id, 'approve');
      if (res.data) {
        onStatusChange(res.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setError('Please provide a reason');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await updateUploadStatus(
        projectId,
        upload.id,
        'reject',
        rejectionReason,
      );
      if (res.data) {
        setRevisionStep(2);
        setTimeout(() => {
          onStatusChange(res.data);
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Modal Overlay */}
      {upload && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 transition-opacity"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Slide-over Panel */}
          <div className="fixed right-0 top-0 h-screen w-full sm:w-96 bg-white z-50 shadow-lg flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-semibold text-text-primary truncate">
                {upload.original_name}
              </h2>
              <button
                onClick={onClose}
                className="text-text-muted hover:text-text-primary p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Error Banner */}
              {error && (
                <div className="rounded-lg bg-danger-50 border border-danger-200 p-3 text-sm text-danger-700">
                  {error}
                </div>
              )}

              {/* Document Info */}
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-text-muted uppercase font-semibold">Trade</p>
                  <p className="text-sm font-medium text-text-primary">{upload.trade_name}</p>
                  {upload.company_name && (
                    <p className="text-xs text-text-muted">{upload.company_name}</p>
                  )}
                </div>

                <div>
                  <p className="text-xs text-text-muted uppercase font-semibold">Document Type</p>
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200 mt-1">
                    {upload.doc_type}
                  </Badge>
                </div>

                {upload.amount && (
                  <div>
                    <p className="text-xs text-text-muted uppercase font-semibold">Amount</p>
                    <p className="text-lg font-mono font-semibold text-text-primary">
                      {formatCurrency(Number(upload.amount))}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-text-muted uppercase font-semibold">Status</p>
                  <Badge
                    variant={
                      upload.status === 'approved'
                        ? 'success'
                        : upload.status === 'rejected'
                          ? 'destructive'
                          : 'warning'
                    }
                    className="mt-1"
                  >
                    {upload.status}
                  </Badge>
                </div>

                <div>
                  <p className="text-xs text-text-muted uppercase font-semibold">Uploaded</p>
                  <p className="text-sm text-text-primary">{formatDate(upload.created_at)}</p>
                </div>

                {upload.notes && (
                  <div>
                    <p className="text-xs text-text-muted uppercase font-semibold">Notes</p>
                    <p className="text-sm text-text-primary bg-gray-50 p-2 rounded border border-border">
                      {upload.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Download Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadUpload(projectId, upload.id)}
                className="w-full"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>

              {/* Comments Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MessageCircle className="w-4 h-4 text-text-muted" />
                  <h3 className="font-semibold text-text-primary text-sm">
                    Comments ({comments.length})
                  </h3>
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {comments.length === 0 ? (
                    <p className="text-xs text-text-muted italic">No comments yet</p>
                  ) : (
                    comments.map(comment => (
                      <div
                        key={comment.id}
                        className="bg-gray-50 rounded-lg p-3 border border-border"
                      >
                        <div className="flex items-start justify-between">
                          <p className="text-xs font-semibold text-text-primary">
                            {comment.author_name}
                          </p>
                          <p className="text-xs text-text-muted">
                            {formatDate(comment.created_at)}
                          </p>
                        </div>
                        <p className="text-sm text-text-primary mt-1">{comment.text}</p>
                        {comment.is_rfi_reply && (
                          <Badge className="mt-2 text-xs bg-purple-100 text-purple-800 border-purple-200">
                            RFI Reply
                          </Badge>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Add Comment */}
                {upload.status === 'pending' && (
                  <div className="mt-4 space-y-2">
                    <textarea
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E8622A]"
                      rows={3}
                    />
                    <Button
                      size="sm"
                      onClick={handleAddComment}
                      disabled={loading || !newComment.trim()}
                      className="w-full bg-[#E8622A] hover:bg-[#d4501f]"
                    >
                      Add Comment
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            {upload.status === 'pending' && (
              <div className="border-t border-border p-4 space-y-3">
                {revisionStep === 0 && (
                  <>
                    <Button
                      onClick={handleApprove}
                      disabled={loading}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {loading ? 'Approving...' : 'Approve'}
                    </Button>

                    <Button
                      onClick={() => setRevisionStep(1)}
                      disabled={loading}
                      variant="outline"
                      className="w-full text-[#E8622A] border-[#E8622A] hover:bg-orange-50"
                    >
                      Request Revision
                    </Button>
                  </>
                )}

                {revisionStep === 1 && (
                  <>
                    <textarea
                      value={rejectionReason}
                      onChange={e => setRejectionReason(e.target.value)}
                      placeholder="Reason for revision request *"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E8622A]"
                      rows={4}
                    />
                    <Button
                      onClick={handleReject}
                      disabled={loading || !rejectionReason.trim()}
                      className="w-full bg-[#E8622A] hover:bg-[#d4501f]"
                    >
                      {loading ? 'Sending...' : 'Send to Sub'}
                    </Button>
                    <Button
                      onClick={() => setRevisionStep(0)}
                      variant="outline"
                      className="w-full"
                    >
                      Cancel
                    </Button>
                  </>
                )}

                {revisionStep === 2 && (
                  <div className="text-center py-4">
                    <p className="text-emerald-600 font-semibold text-sm">
                      ✓ Revision requested. Sub notified.
                    </p>
                    <p className="text-xs text-text-muted mt-2">
                      Waiting for re-upload...
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
