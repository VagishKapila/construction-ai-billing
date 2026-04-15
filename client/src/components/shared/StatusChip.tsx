import React from 'react'
import { Badge } from './Badge'

interface StatusChipProps {
  status: string
}

const statusVariantMap: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'teal' | 'gray' | 'orange'> = {
  paid: 'green',
  'payment_received': 'green',
  submitted: 'blue',
  'submitted_for_approval': 'blue',
  approved: 'green',
  draft: 'gray',
  overdue: 'red',
  pending: 'amber',
  processing: 'amber',
  'payment_processing': 'amber',
  rejected: 'red',
  active: 'teal',
  urgent: 'red',
  partial: 'amber',
  completed: 'green',
  cancelled: 'gray',
  invited: 'gray',
}

const statusLabelMap: Record<string, string> = {
  paid: 'Paid',
  'payment_received': 'Paid',
  submitted: 'Submitted',
  'submitted_for_approval': 'Submitted',
  approved: 'Approved',
  draft: 'Draft',
  overdue: 'Overdue',
  pending: 'Pending',
  processing: 'Processing',
  'payment_processing': 'Processing',
  rejected: 'Rejected',
  active: 'Active',
  urgent: 'Urgent',
  partial: 'Partial',
  completed: 'Completed',
  cancelled: 'Cancelled',
  invited: 'Invited',
}

export function StatusChip({ status }: StatusChipProps) {
  const normalizedStatus = status?.toLowerCase() || 'draft'
  const variant = statusVariantMap[normalizedStatus] || 'gray'
  const label = statusLabelMap[normalizedStatus] || status

  return <Badge variant={variant}>{label}</Badge>
}
