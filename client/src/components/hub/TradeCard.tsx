import { useState } from 'react';
import { Link2, Mail } from 'lucide-react';
import type { Trade } from '@/types/hub';
import { inviteTrade } from '@/api/hub';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface TradeCardProps {
  trade: Trade;
  projectId: number;
  onTradeUpdated: () => void;
}

export function TradeCard({ trade, projectId, onTradeUpdated }: TradeCardProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const magicLinkUrl = `${window.location.origin}/hub/${trade.magic_link_token}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(magicLinkUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleResendInvite = async () => {
    try {
      setLoading(true);
      setError(null);

      await inviteTrade(projectId, trade.id);
      onTradeUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-text-primary">{trade.name}</h3>
        {trade.company_name && (
          <p className="text-sm text-text-muted">{trade.company_name}</p>
        )}
      </div>

      {trade.contact_name && (
        <div className="text-sm">
          <p className="text-text-muted">Contact: {trade.contact_name}</p>
          {trade.contact_email && (
            <p className="text-text-secondary">{trade.contact_email}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Badge
          className={`text-xs ${
            trade.status === 'active'
              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
              : 'bg-gray-100 text-gray-800 border-gray-200'
          }`}
        >
          {trade.status}
        </Badge>

        {trade.pending_count && trade.pending_count > 0 && (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
            {trade.pending_count} pending
          </Badge>
        )}
      </div>

      {error && (
        <div className="text-xs text-danger-600 bg-danger-50 p-2 rounded border border-danger-200">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyLink}
          className="w-full text-xs"
        >
          <Link2 className="w-3 h-3 mr-1.5" />
          {copied ? 'Copied!' : 'Copy Magic Link'}
        </Button>

        <Button
          size="sm"
          onClick={handleResendInvite}
          disabled={loading}
          className="w-full text-xs bg-[#E8622A] hover:bg-[#d4501f]"
        >
          <Mail className="w-3 h-3 mr-1.5" />
          {loading ? 'Sending...' : 'Resend Invite'}
        </Button>
      </div>
    </Card>
  );
}
