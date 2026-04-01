import { useState } from 'react'
import { ArrowUpDown } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { formatCurrency } from '@/lib/formatters'
import type { SOVLine } from '@/types'

export interface SOVTableProps {
  lines: SOVLine[]
  isLoading?: boolean
}

type SortField = 'item_id' | 'description' | 'scheduled_value'
type SortOrder = 'asc' | 'desc'

/**
 * SOVTable — Read-only SOV preview table
 * Used in ProjectDetail and Review step of NewProject wizard
 */
export function SOVTable({ lines, isLoading = false }: SOVTableProps) {
  const [sortField, setSortField] = useState<SortField>('item_id')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const sortedLines = [...lines].sort((a, b) => {
    let aVal: string | number = ''
    let bVal: string | number = ''

    switch (sortField) {
      case 'item_id':
        aVal = a.item_id || ''
        bVal = b.item_id || ''
        break
      case 'description':
        aVal = a.description
        bVal = b.description
        break
      case 'scheduled_value':
        aVal = a.scheduled_value
        bVal = b.scheduled_value
        break
    }

    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase()
      bVal = (bVal as string).toLowerCase()
      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    } else {
      return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    }
  })

  const totalValue = lines.reduce((sum, line) => sum + line.scheduled_value, 0)

  if (isLoading) {
    return (
      <Card className="p-8 text-center">
        <p className="text-text-secondary">Loading schedule of values...</p>
      </Card>
    )
  }

  if (lines.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-text-secondary">No schedule of values uploaded yet</p>
      </Card>
    )
  }

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 opacity-40" />
    }
    return (
      <ArrowUpDown
        className={`h-4 w-4 ${sortOrder === 'asc' ? 'rotate-0' : 'rotate-180'}`}
        style={{ transform: sortOrder === 'desc' ? 'rotate(180deg)' : 'none' }}
      />
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-border">
            <tr>
              <th className="px-6 py-3 text-left">
                <button
                  onClick={() => handleSort('item_id')}
                  className="flex items-center gap-2 text-sm font-semibold text-text-primary hover:text-primary-600 transition-colors"
                >
                  Item # {renderSortIcon('item_id')}
                </button>
              </th>
              <th className="px-6 py-3 text-left">
                <button
                  onClick={() => handleSort('description')}
                  className="flex items-center gap-2 text-sm font-semibold text-text-primary hover:text-primary-600 transition-colors"
                >
                  Description {renderSortIcon('description')}
                </button>
              </th>
              <th className="px-6 py-3 text-right">
                <button
                  onClick={() => handleSort('scheduled_value')}
                  className="flex items-center justify-end gap-2 text-sm font-semibold text-text-primary hover:text-primary-600 transition-colors ml-auto"
                >
                  Scheduled Value {renderSortIcon('scheduled_value')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedLines.map((line, idx) => (
              <tr key={line.id || idx} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 text-sm text-text-secondary">
                  {line.item_id || '—'}
                </td>
                <td className="px-6 py-4 text-sm text-text-primary">
                  {line.description}
                </td>
                <td className="px-6 py-4 text-sm text-right text-text-primary font-mono">
                  {formatCurrency(line.scheduled_value)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-border">
            <tr>
              <td colSpan={2} className="px-6 py-4 text-right text-sm font-semibold text-text-primary">
                Total
              </td>
              <td className="px-6 py-4 text-right text-sm font-semibold text-primary-600 font-mono">
                {formatCurrency(totalValue)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}
