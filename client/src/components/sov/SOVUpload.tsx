import { useState, useRef } from 'react'
import { Upload, Trash2, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { formatCurrency } from '@/lib/formatters'
import { parseSOV } from '@/api/projects'
import type { SOVLine } from '@/types'

export interface SOVRow {
  item_id?: string
  description: string
  scheduled_value: number
}

export interface SOVUploadProps {
  onParsed: (rows: SOVRow[]) => void
  initialRows?: SOVRow[]
}

/**
 * SOV Upload component — Drag-and-drop file upload + editable table
 * Accepts: .xlsx, .xls, .csv, .pdf, .docx, .doc
 */
export function SOVUpload({ onParsed, initialRows = [] }: SOVUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<SOVRow[]>(initialRows)
  const [fileName, setFileName] = useState<string>('')
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFileSelect = async (file: File) => {
    setError(null)
    setIsLoading(true)

    try {
      // Validate file type
      const ext = `.${file.name.split('.').pop()?.toLowerCase()}`
      const validTypes = ['.xlsx', '.xls', '.csv', '.pdf', '.docx', '.doc']
      if (!validTypes.includes(ext)) {
        throw new Error(`Unsupported file type: ${ext}. Supported: ${validTypes.join(', ')}`)
      }

      // Parse the file
      const response = await parseSOV(file)

      if (response.error) {
        throw new Error(response.error)
      }

      if (!response.data?.rows) {
        throw new Error('No data found in file')
      }

      const parsedRows: SOVRow[] = response.data.rows.map((line: SOVLine) => ({
        item_id: line.item_id || '',
        description: line.description,
        scheduled_value: line.scheduled_value,
      }))

      setRows(parsedRows)
      setFileName(file.name)
      onParsed(parsedRows)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse SOV file'
      setError(message)
      setRows([])
      setFileName('')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files
    if (files && files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const handleRowUpdate = (index: number, field: keyof SOVRow, value: string | number) => {
    const newRows = [...rows]
    if (field === 'scheduled_value') {
      newRows[index][field] = typeof value === 'string' ? parseFloat(value) || 0 : value
    } else {
      newRows[index][field as 'item_id' | 'description'] = String(value)
    }
    setRows(newRows)
    onParsed(newRows)
  }

  const handleDeleteRow = (index: number) => {
    const newRows = rows.filter((_, i) => i !== index)
    setRows(newRows)
    onParsed(newRows)
  }

  const handleAddRow = () => {
    const newRows = [
      ...rows,
      {
        item_id: '',
        description: '',
        scheduled_value: 0,
      },
    ]
    setRows(newRows)
  }

  const totalAmount = rows.reduce((sum, row) => sum + (row.scheduled_value || 0), 0)

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <Card className="p-8">
        {!fileName ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors',
              isDragOver
                ? 'border-primary-500 bg-primary-50'
                : 'border-border bg-gray-50 hover:border-primary-400'
            )}
          >
            <Upload className="mx-auto h-12 w-12 text-primary-500 mb-4" />
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              Upload Schedule of Values
            </h3>
            <p className="text-text-secondary mb-4">
              Drag and drop your SOV file here, or click to select
            </p>
            <p className="text-sm text-text-muted">
              Supported formats: Excel (.xlsx, .xls), CSV, PDF, Word (.docx, .doc)
            </p>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv,.pdf,.docx,.doc"
              onChange={handleInputChange}
            />
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 bg-primary-50 rounded-lg border border-primary-200">
            <div>
              <p className="font-medium text-text-primary">{fileName}</p>
              <p className="text-sm text-text-secondary">{rows.length} line items</p>
            </div>
            <button
              onClick={() => {
                setFileName('')
                setRows([])
                onParsed([])
              }}
              className="text-primary-600 hover:text-primary-700 font-medium text-sm"
            >
              Change file
            </button>
          </div>
        )}
      </Card>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      )}

      {/* SOV Table (only show if we have rows) */}
      {!isLoading && rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-text-primary w-12">
                    #
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-text-primary">
                    Description
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-text-primary w-32">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-text-primary w-12">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      <Input
                        type="text"
                        value={row.item_id || ''}
                        onChange={(e) => handleRowUpdate(idx, 'item_id', e.target.value)}
                        placeholder="e.g., 1.0"
                        className="h-8"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-text-primary">
                      <Input
                        type="text"
                        value={row.description}
                        onChange={(e) => handleRowUpdate(idx, 'description', e.target.value)}
                        placeholder="Description"
                        className="h-8"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <Input
                        type="number"
                        value={row.scheduled_value || ''}
                        onChange={(e) => handleRowUpdate(idx, 'scheduled_value', e.target.value)}
                        placeholder="0.00"
                        className="h-8 text-right"
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleDeleteRow(idx)}
                        className="inline-flex items-center justify-center h-8 w-8 rounded text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-border">
                <tr>
                  <td colSpan={2} className="px-6 py-4 text-right text-sm font-semibold text-text-primary">
                    Total
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-semibold text-primary-600">
                    {formatCurrency(totalAmount)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Add row button */}
          <div className="p-4 border-t border-border bg-gray-50">
            <button
              onClick={handleAddRow}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded"
            >
              <Plus className="h-4 w-4" />
              Add Row
            </button>
          </div>
        </Card>
      )}

      {/* Skip upload link */}
      {!fileName && !isLoading && (
        <div className="text-center">
          <button
            onClick={() => onParsed([])}
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            I'll add this later
          </button>
        </div>
      )}
    </div>
  )
}
