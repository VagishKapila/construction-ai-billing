import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface Suggestion {
  sov_line_id: number;
  description: string;
  suggested_vendors: Array<{ id: number; company_name: string; trade_type?: string }>;
}

interface SOVSuggestPanelProps {
  projectId: number;
  token: string;
}

const SOVSuggestPanel: React.FC<SOVSuggestPanelProps> = ({ projectId, token }) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const response = await fetch(`/api/vendor-book/sov-suggestions/${projectId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await response.json();
        if (json.data) {
          setSuggestions(json.data);
        }
      } catch (err) {
        console.error('Failed to fetch vendor suggestions:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSuggestions();
  }, [projectId, token]);

  if (loading || suggestions.length === 0 || dismissed) return null;

  return (
    <div style={{
      background: '#eff6ff',
      border: '1.5px solid #bfdbfe',
      borderRadius: 12,
      padding: 16,
      marginTop: 16
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12
      }}>
        <div style={{
          fontWeight: 600,
          fontSize: 14,
          color: '#1d4ed8',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          💡 ARIA found vendor matches from your address book
        </div>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'none',
            border: 'none',
            color: '#93c5fd',
            cursor: 'pointer',
            fontSize: 16,
            padding: 0
          }}
        >
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      <div>
        {suggestions.slice(0, 3).map((s) => (
          <div
            key={s.sov_line_id}
            style={{
              background: '#fff',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 8
            }}
          >
            <div style={{
              fontSize: 13,
              fontWeight: 500,
              color: '#1a1a1a',
              marginBottom: 6
            }}>
              {s.description}
            </div>
            <div style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap' as const
            }}>
              {s.suggested_vendors.map((v) => (
                <span
                  key={v.id}
                  style={{
                    fontSize: 12,
                    padding: '4px 10px',
                    background: '#dbeafe',
                    color: '#1d4ed8',
                    borderRadius: 20,
                    fontWeight: 500
                  }}
                >
                  {v.company_name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {suggestions.length > 3 && (
        <div style={{
          fontSize: 12,
          color: '#93c5fd',
          marginTop: 10,
          fontStyle: 'italic'
        }}>
          + {suggestions.length - 3} more matches
        </div>
      )}
    </div>
  );
};

export default SOVSuggestPanel;
