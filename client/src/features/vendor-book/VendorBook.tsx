import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Upload, AlertCircle, CheckCircle, Search } from 'lucide-react';

// Types
interface Vendor {
  id: number;
  owner_id: number;
  company_name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  trade_type?: string;
  address?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  import_source?: string;
}

interface VendorBookProps {
  token: string;
}

interface ColumnMapping {
  [headerName: string]: string | null;
}

interface BulkImportState {
  isOpen: boolean;
  file?: File;
  headers: string[];
  sampleRows: string[][];
  mapping: ColumnMapping;
  uncertain: string[];
  mappingMethod: 'keyword' | 'ai';
  isProcessing: boolean;
  step: 'upload' | 'mapping' | 'confirm';
}

interface ConfirmRow {
  company_name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  trade_type?: string;
}

const TRADE_TYPES = [
  'Excavation', 'Framing', 'Roofing', 'Plumbing', 'Electrical',
  'HVAC', 'Drywall', 'Flooring', 'Painting', 'Masonry',
  'Carpentry', 'Concrete', 'Landscaping', 'General Labor', 'Other'
];

const tradeColors: Record<string, { bg: string; text: string; border: string }> = {
  'Excavation': { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  'Framing': { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  'Roofing': { bg: '#fecaca', text: '#991b1b', border: '#f87171' },
  'Plumbing': { bg: '#c7d2fe', text: '#3730a3', border: '#a5b4fc' },
  'Electrical': { bg: '#d1d5db', text: '#374151', border: '#9ca3af' },
  'HVAC': { bg: '#e0e7ff', text: '#4f46e5', border: '#c7d2fe' },
  'Drywall': { bg: '#f3e8ff', text: '#6b21a8', border: '#e9d5ff' },
  'Flooring': { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  'Painting': { bg: '#fae8ff', text: '#831843', border: '#f0abfc' },
  'Masonry': { bg: '#fed7aa', text: '#92400e', border: '#fdba74' },
  'Carpentry': { bg: '#f5f3ff', text: '#6d28d9', border: '#ede9fe' },
  'Concrete': { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
  'Landscaping': { bg: '#f0fdfa', text: '#134e4a', border: '#99f6e4' },
  'General Labor': { bg: '#fef2f2', text: '#7c2d12', border: '#fed7aa' },
  'Other': { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' }
};

// CSV Parser
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split('\n');
  const headers = lines[0]?.split(',').map(h => h.trim()) || [];
  const rows = lines.slice(1).map(line => line.split(',').map(cell => cell.trim()));
  return { headers, rows: rows.slice(0, 100) };
}

// Main Component
const VendorBook: React.FC<VendorBookProps> = ({ token }) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTrade, setFilterTrade] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Add form state
  const [addForm, setAddForm] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    trade_type: '',
    address: '',
    notes: ''
  });

  // Bulk import modal
  const [bulkImport, setBulkImport] = useState<BulkImportState>({
    isOpen: false,
    headers: [],
    sampleRows: [],
    mapping: {},
    uncertain: [],
    mappingMethod: 'keyword',
    isProcessing: false,
    step: 'upload'
  });

  const [confirmRows, setConfirmRows] = useState<ConfirmRow[]>([]);
  const [importMessage, setImportMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch vendors on mount and when search changes
  useEffect(() => {
    const fetchVendors = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (filterTrade) params.append('trade', filterTrade);
        const response = await fetch(`/api/vendor-book?${params}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await response.json();
        if (json.data) {
          setVendors(json.data);
          setError(null);
        } else {
          setError(json.error || 'Failed to load vendors');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      } finally {
        setLoading(false);
      }
    };
    fetchVendors();
  }, [search, filterTrade, token]);

  // Add vendor
  const handleAddVendor = async () => {
    if (!addForm.company_name.trim()) {
      setError('Company name is required');
      return;
    }
    try {
      const response = await fetch('/api/vendor-book', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(addForm)
      });
      const json = await response.json();
      if (json.data) {
        setVendors([...vendors, json.data]);
        setAddForm({
          company_name: '', contact_name: '', email: '', phone: '', trade_type: '', address: '', notes: ''
        });
        setError(null);
      } else {
        setError(json.error || 'Failed to add vendor');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  };

  // Delete vendor
  const handleDeleteVendor = async (id: number) => {
    try {
      const response = await fetch(`/api/vendor-book/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await response.json();
      if (json.data?.deleted) {
        setVendors(vendors.filter(v => v.id !== id));
        setDeleteConfirm(null);
        setError(null);
      } else {
        setError(json.error || 'Failed to delete vendor');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  };

  // Handle file upload for bulk import
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const { headers, rows } = parseCSV(text);

    if (headers.length === 0) {
      setError('CSV file is empty or invalid');
      return;
    }

    setBulkImport(prev => ({
      ...prev,
      file,
      headers,
      sampleRows: rows,
      step: 'mapping',
      isProcessing: true
    }));

    // Request AI mapping
    try {
      const response = await fetch('/api/vendor-book/ai-map', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ headers, sample_rows: rows.slice(0, 3) })
      });
      const json = await response.json();
      if (json.data) {
        setBulkImport(prev => ({
          ...prev,
          mapping: json.data.mapping || {},
          uncertain: json.data.uncertain || [],
          mappingMethod: json.data.method || 'keyword',
          isProcessing: false
        }));
      } else {
        setError(json.error || 'AI mapping failed');
        setBulkImport(prev => ({ ...prev, isProcessing: false }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setBulkImport(prev => ({ ...prev, isProcessing: false }));
    }
  };

  // Build confirm table from mapped data
  const buildConfirmRows = () => {
    const rows: ConfirmRow[] = bulkImport.sampleRows.map((row) => {
      const record: ConfirmRow = {
        company_name: '',
        contact_name: undefined,
        email: undefined,
        phone: undefined,
        trade_type: undefined
      };

      bulkImport.headers.forEach((header, colIdx) => {
        const field = bulkImport.mapping[header];
        const value = row[colIdx]?.trim();
        if (field && value) {
          record[field as keyof ConfirmRow] = value;
        }
      });

      return record;
    }).filter(r => r.company_name);

    setConfirmRows(rows);
    setBulkImport(prev => ({ ...prev, step: 'confirm' }));
  };

  // Perform bulk import
  const handleBulkImport = async () => {
    if (confirmRows.length === 0) {
      setError('No vendors to import');
      return;
    }

    try {
      setBulkImport(prev => ({ ...prev, isProcessing: true }));
      const response = await fetch('/api/vendor-book/import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ vendors: confirmRows })
      });
      const json = await response.json();
      if (json.data?.imported) {
        setImportMessage(`✓ Successfully imported ${json.data.imported} vendors`);
        setBulkImport({
          isOpen: false, headers: [], sampleRows: [], mapping: {}, uncertain: [],
          mappingMethod: 'keyword', isProcessing: false, step: 'upload'
        });
        setConfirmRows([]);
        // Refetch vendors
        const refreshResponse = await fetch('/api/vendor-book', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const refreshJson = await refreshResponse.json();
        if (refreshJson.data) setVendors(refreshJson.data);

        setTimeout(() => setImportMessage(''), 5000);
      } else {
        setError(json.error || 'Import failed');
      }
      setBulkImport(prev => ({ ...prev, isProcessing: false }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setBulkImport(prev => ({ ...prev, isProcessing: false }));
    }
  };

  // Render bulk import modal
  const renderBulkImportModal = () => {
    if (!bulkImport.isOpen) return null;

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
        <div style={{ background: '#fff', borderRadius: 12, maxWidth: 900, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.15)' }}>
          <div style={{ padding: 24, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#1a1a1a' }}>Bulk Import Vendors</h2>
            <button
              onClick={() => setBulkImport({ ...bulkImport, isOpen: false, step: 'upload' })}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 24 }}
            >
              ×
            </button>
          </div>

          <div style={{ padding: 24 }}>
            {bulkImport.step === 'upload' && (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) {
                    const input = fileInputRef.current;
                    if (input) {
                      const dataTransfer = new DataTransfer();
                      dataTransfer.items.add(file);
                      input.files = dataTransfer.files;
                      handleFileSelect({ target: input } as any);
                    }
                  }
                }}
                style={{
                  border: '2px dashed #bfdbfe',
                  borderRadius: 8,
                  padding: 48,
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: '#f0f9ff',
                  transition: 'all 0.2s'
                }}
              >
                <Upload style={{ width: 48, height: 48, color: '#0284c7', margin: '0 auto 16px' }} />
                <div style={{ fontSize: 16, fontWeight: 500, color: '#1a1a1a', marginBottom: 8 }}>
                  Drop CSV file here or click to select
                </div>
                <div style={{ fontSize: 13, color: '#666' }}>
                  Columns: Company, Contact, Email, Trade, Phone (auto-detected by ARIA)
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    marginTop: 16,
                    padding: '10px 20px',
                    background: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 500
                  }}
                >
                  Select File
                </button>
              </div>
            )}

            {bulkImport.step === 'mapping' && bulkImport.isProcessing && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 14, color: '#666' }}>
                  🤖 ARIA is mapping your columns...
                </div>
                <div style={{ marginTop: 12, fontSize: 12, color: '#999' }}>
                  Found {bulkImport.headers.length} columns, analyzing {bulkImport.sampleRows.length} rows
                </div>
              </div>
            )}

            {bulkImport.step === 'mapping' && !bulkImport.isProcessing && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: '#1a1a1a' }}>
                  {bulkImport.mappingMethod === 'ai' ? '✓ AI Mapping Complete' : '⚠️ Keyword Mapping (uncertain)'}
                </div>
                <div style={{ marginBottom: 24 }}>
                  {Object.entries(bulkImport.mapping).map(([header, field]) => {
                    const isUncertain = bulkImport.uncertain.includes(header);
                    return (
                      <div
                        key={header}
                        style={{
                          padding: 12,
                          marginBottom: 8,
                          background: isUncertain ? '#fffbeb' : '#f8fafc',
                          border: isUncertain ? '1px solid #fcd34d' : '1px solid #e2e8f0',
                          borderRadius: 6,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{header}</div>
                          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                            → {field || '(skip)'}
                          </div>
                        </div>
                        {isUncertain && <AlertCircle style={{ width: 16, height: 16, color: '#f59e0b' }} />}
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={buildConfirmRows}
                  style={{
                    padding: '12px 24px',
                    background: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 500,
                    width: '100%'
                  }}
                >
                  Review & Import →
                </button>
              </div>
            )}

            {bulkImport.step === 'confirm' && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: '#1a1a1a' }}>
                  Review {confirmRows.length} Vendors
                </div>
                <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Company</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Contact</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Email</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Trade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {confirmRows.map((row) => (
                        <tr key={row.company_name} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '10px 8px', color: '#1a1a1a' }}>{row.company_name}</td>
                          <td style={{ padding: '10px 8px', color: '#666' }}>{row.contact_name || '—'}</td>
                          <td style={{ padding: '10px 8px', color: '#666' }}>{row.email || '—'}</td>
                          <td style={{ padding: '10px 8px' }}>
                            {row.trade_type ? (
                              <span style={{
                                display: 'inline-block',
                                padding: '4px 10px',
                                background: tradeColors[row.trade_type]?.bg || '#f0f0f0',
                                color: tradeColors[row.trade_type]?.text || '#333',
                                borderRadius: 4,
                                fontSize: 11
                              }}>
                                {row.trade_type}
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => setBulkImport(prev => ({ ...prev, step: 'mapping' }))}
                    style={{
                      flex: 1,
                      padding: '12px 24px',
                      background: '#f0f0f0',
                      color: '#333',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 500
                    }}
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleBulkImport}
                    disabled={bulkImport.isProcessing}
                    style={{
                      flex: 1,
                      padding: '12px 24px',
                      background: bulkImport.isProcessing ? '#d1d5db' : '#059669',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      cursor: bulkImport.isProcessing ? 'not-allowed' : 'pointer',
                      fontSize: 14,
                      fontWeight: 500
                    }}
                  >
                    {bulkImport.isProcessing ? 'Importing...' : `Import ${confirmRows.length} Vendors`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', padding: '24px 0' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#1a1a1a', margin: '0 0 8px 0' }}>
            Vendor Address Book
          </h1>
          <p style={{ fontSize: 15, color: '#666', margin: 0 }}>
            Save your trade partners, subs, and suppliers. ARIA matches them to your projects.
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div style={{
            background: '#fee2e2',
            border: '1px solid #fca5a5',
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start'
          }}>
            <AlertCircle style={{ width: 20, height: 20, color: '#dc2626', flexShrink: 0 }} />
            <div style={{ color: '#991b1b', fontSize: 14 }}>{error}</div>
            <button
              onClick={() => setError(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
        )}

        {importMessage && (
          <div style={{
            background: '#dcfce7',
            border: '1px solid #86efac',
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
            display: 'flex',
            gap: 12,
            alignItems: 'center'
          }}>
            <CheckCircle style={{ width: 20, height: 20, color: '#16a34a' }} />
            <div style={{ color: '#15803d', fontSize: 14 }}>{importMessage}</div>
          </div>
        )}

        {/* Action bar */}
        <div style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <input
            type="text"
            placeholder="Search by company or contact..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              minWidth: 200,
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              fontFamily: 'Inter, sans-serif'
            }}
          />
          <select
            value={filterTrade}
            onChange={(e) => setFilterTrade(e.target.value)}
            style={{
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              fontFamily: 'Inter, sans-serif',
              background: '#fff'
            }}
          >
            <option value="">All Trades</option>
            {TRADE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            onClick={() => setBulkImport({ ...bulkImport, isOpen: true, step: 'upload' })}
            style={{
              padding: '10px 16px',
              background: '#f0f0f0',
              color: '#333',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Upload style={{ width: 16, height: 16 }} /> Import CSV
          </button>
        </div>

        {/* Add vendor form */}
        <div style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 20,
          marginBottom: 24
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', margin: '0 0 16px 0' }}>
            Add Vendor
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Company Name *"
              value={addForm.company_name}
              onChange={(e) => setAddForm({ ...addForm, company_name: e.target.value })}
              style={{
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
                fontFamily: 'Inter, sans-serif'
              }}
            />
            <input
              type="text"
              placeholder="Contact Name"
              value={addForm.contact_name}
              onChange={(e) => setAddForm({ ...addForm, contact_name: e.target.value })}
              style={{
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
                fontFamily: 'Inter, sans-serif'
              }}
            />
            <input
              type="email"
              placeholder="Email"
              value={addForm.email}
              onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
              style={{
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
                fontFamily: 'Inter, sans-serif'
              }}
            />
            <input
              type="tel"
              placeholder="Phone"
              value={addForm.phone}
              onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
              style={{
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
                fontFamily: 'Inter, sans-serif'
              }}
            />
            <select
              value={addForm.trade_type}
              onChange={(e) => setAddForm({ ...addForm, trade_type: e.target.value })}
              style={{
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
                fontFamily: 'Inter, sans-serif',
                background: '#fff'
              }}
            >
              <option value="">Select Trade</option>
              {TRADE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              type="text"
              placeholder="Address"
              value={addForm.address}
              onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
              style={{
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
                fontFamily: 'Inter, sans-serif'
              }}
            />
          </div>
          <textarea
            placeholder="Notes"
            value={addForm.notes}
            onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              fontFamily: 'Inter, sans-serif',
              minHeight: 60,
              marginBottom: 12,
              boxSizing: 'border-box'
            }}
          />
          <button
            onClick={handleAddVendor}
            style={{
              padding: '10px 20px',
              background: '#0284c7',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Plus style={{ width: 16, height: 16 }} /> Add Vendor
          </button>
        </div>

        {/* Vendors list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#666' }}>
            Loading vendors...
          </div>
        ) : vendors.length === 0 ? (
          <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: 40,
            textAlign: 'center'
          }}>
            <Search style={{ width: 48, height: 48, color: '#ccc', margin: '0 auto 16px' }} />
            <div style={{ fontSize: 15, fontWeight: 500, color: '#666', marginBottom: 8 }}>
              No vendors yet
            </div>
            <div style={{ fontSize: 13, color: '#999' }}>
              Add your first vendor above or import a CSV file
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16
          }}>
            {vendors.map(vendor => (
              <div
                key={vendor.id}
                style={{
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 16,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', margin: '0 0 4px 0' }}>
                      {vendor.company_name}
                    </h4>
                    {vendor.contact_name && (
                      <div style={{ fontSize: 13, color: '#666' }}>{vendor.contact_name}</div>
                    )}
                  </div>
                  {deleteConfirm === vendor.id ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handleDeleteVendor(vendor.id)}
                        style={{
                          padding: '4px 8px',
                          background: '#dc2626',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 500
                        }}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        style={{
                          padding: '4px 8px',
                          background: '#e5e7eb',
                          color: '#333',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 12
                        }}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(vendor.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#dc2626',
                        cursor: 'pointer',
                        padding: 4
                      }}
                    >
                      <Trash2 style={{ width: 16, height: 16 }} />
                    </button>
                  )}
                </div>

                {vendor.trade_type && (
                  <div style={{ marginBottom: 12 }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      background: tradeColors[vendor.trade_type]?.bg || '#f0f0f0',
                      color: tradeColors[vendor.trade_type]?.text || '#333',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 500
                    }}>
                      {vendor.trade_type}
                    </span>
                  </div>
                )}

                <div style={{ fontSize: 12, color: '#666', lineHeight: 1.6, marginBottom: 12 }}>
                  {vendor.email && <div>📧 {vendor.email}</div>}
                  {vendor.phone && <div>📱 {vendor.phone}</div>}
                  {vendor.address && <div>📍 {vendor.address}</div>}
                </div>

                {vendor.notes && (
                  <div style={{
                    background: '#f8fafc',
                    padding: 8,
                    borderRadius: 4,
                    fontSize: 12,
                    color: '#475569',
                    marginTop: 12
                  }}>
                    {vendor.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {renderBulkImportModal()}
    </div>
  );
};

export default VendorBook;
