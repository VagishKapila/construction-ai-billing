# Vendor Dashboard — Orange Universe

Complete vendor/sub experience for ConstructInvoice AI. This is the orange-themed counterpart to the blue contractor experience.

## Components

### VendorDashboard (`pages/VendorDashboard.tsx`)

The main vendor portal page. Displays:

- **Orange gradient header** with trust score in top-right
- **Purple trust score banner** (if score < 687 Platinum)
- **Filter chips** to show: All, Needs Upload, Pending, Approved, Rejected, Paid
- **Project cards grid** with status variants
- **Document history table** with all submitted docs
- **Floating upload button** (FAB) for quick document submission

**Features:**
- Fetches vendor's projects from `/api/hub/my-projects`
- Fetches vendor's documents from `/api/hub/my-documents`
- Fetches trust score from `/api/hub/trust-score`
- Real-time status filtering
- Responsive mobile-first design

### VendorProjectCard (`VendorProjectCard.tsx`)

Individual project card with 5 status variants:

```
Status          | Left Stripe | Icon             | Action Button    | CTA
needs_upload    | Red #dc2626 | ⚠️ AlertCircle   | Upload Invoice   | Primary (red)
pending         | Amber       | ⏳ Clock         | View Status      | Amber
approved        | Green       | ✅ CheckCircle2  | Early Pay        | Teal
rejected        | Red         | ❌ XCircle       | Fix & Resubmit   | Orange
paid            | Green       | 💰 DollarSign   | View Details     | Green
```

**Features:**
- Colored left stripe matching urgency
- Shows contract value + submission amount
- Displays rejection reason if rejected
- Shows early pay option for approved items
- Framer Motion hover/tap animations
- Accessible status badges

### VendorUploadModal (`VendorUploadModal.tsx`)

Multi-step document upload modal with 4 steps:

1. **Select Document Type** — Choose from: Invoice, Lien Waiver, RFI, Photo, Daily Report, Other
2. **Enter Amount** — For invoices only (optional for other doc types)
3. **Upload File** — Drag-and-drop or click to select (PDF, JPG, PNG, DOC up to 50 MB)
4. **Success** — Confirmation screen

**Features:**
- Orange gradient header
- Step-by-step Framer Motion transitions
- Drag-and-drop file zone with visual feedback
- Optional notes field
- File size display
- Error handling with friendly messages
- Form validation before submit
- Auto-closes on success

**Posting:**
```
POST /api/hub/upload-document
FormData:
  - file: File
  - doc_type: string
  - project_id?: number
  - amount?: string
  - notes?: string
```

### VendorTrustScore (`VendorTrustScore.tsx`)

Purple card showing trust score metrics:

**Display:**
- Large score (e.g., "687/763")
- Tier badge (Platinum/Gold/Silver/Bronze/Under Review)
- Progress ring (animated)
- Tier explanation text
- Score ranges for all tiers
- Recent activity events (if provided)

**Tiers:**
```
Platinum:    687-763  → "You are an exceptional vendor!"
Gold:        534-686  → "You have a strong record."
Silver:      381-533  → "You are a reliable vendor."
Bronze:      229-380  → "You are building your record."
Under Review: 0-228   → "Your submissions are under review."
```

## Color System

### Orange Theme (Vendor Universe)

```
Primary:      #ea6c00  (orange-500)
Dark Primary: #c2410c  (orange-700)
Light Accent: #fff7ed  (orange-50)
Page BG:      #fef9f5  (warm white, NOT blue)
```

### Status Colors

```
Needs Upload:  #dc2626  (red-600)
Pending:       #f59e0b  (amber-500)
Approved:      #22c55e  (green-500)
Rejected:      #dc2626  (red-600)
Paid:          #22c55e  (green-500)
Early Pay:     #14b8a6  (teal-500)
```

### Purple Trust Score

```
Background:    #f5f3ff  (purple-50)
Accent:        #7c3aed  (purple-600)
```

## Typography

- **Headings** (H1-H3): `font-display` (DM Serif Display)
- **Body**: `font-sans` (DM Sans)
- **Amounts**: `font-mono` (JetBrains Mono)
- **Font weights**: 600 (semibold), 700 (bold), 900 (heavy)

## API Endpoints Required

```
GET /api/hub/my-projects
  Returns: { data: Project[] }
  Filters to projects where user is invited vendor

GET /api/hub/my-documents
  Returns: { data: VendorDocument[] }
  All documents submitted by vendor

GET /api/hub/trust-score
  Returns: { score: number }
  Vendor's current trust score (0-763)

POST /api/hub/upload-document
  FormData: { file, doc_type, project_id, amount, notes }
  Returns: { success: true, document_id: number }
```

## Data Types

### VendorProject

```typescript
interface VendorProject extends Project {
  status_badge?: 'needs_upload' | 'pending' | 'approved' | 'rejected' | 'paid'
  last_submission_date?: string
  last_submission_amount?: number
  rejection_reason?: string
  payment_date?: string
  trust_score?: number
}
```

### VendorDocument

```typescript
interface VendorDocument {
  id: number
  project_id: number
  project_name: string
  doc_type: string
  amount?: number
  submitted_at: string
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'paid'
  rejection_reason?: string
}
```

## Usage Examples

### In a page or component:

```tsx
import { VendorDashboard } from '@/pages/VendorDashboard'
import { VendorProjectCard, VendorUploadModal, VendorTrustScore } from '@/features/vendor'

// Full dashboard
<VendorDashboard />

// Individual components
<VendorProjectCard
  project={project}
  status="needs_upload"
  onUpload={() => setUploadOpen(true)}
/>

<VendorUploadModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  onSuccess={(docType, amount) => { /* refresh */ }}
  projectId={projectId}
/>

<VendorTrustScore
  score={687}
  vendorName="Apex Electrical"
  events={[
    {
      type: 'approval',
      description: 'Invoice approved',
      points: 25,
      date: '2026-04-15',
    },
  ]}
/>
```

## Animations

All components use Framer Motion:

- **Entrance**: Fade + scale/slide-in (200-400ms)
- **Hover**: Subtle lift (y: -4px)
- **Click**: Scale tap (0.98)
- **Progress**: Smooth width change (1s easeOut)
- **Modal**: Scale + fade backdrop

## Mobile Responsive

- **Mobile (< 768px)**: 1-column layout, stack cards
- **Tablet (768px)**: 2-column grid for projects
- **Desktop (> 1024px)**: 3-column grid for projects
- **Floating button**: 52px circle on mobile, pill shape on desktop with text

## Testing

See `test/vendor.test.tsx` for comprehensive test coverage:

- Orange theme verification
- Status variant rendering
- Button action callbacks
- Upload modal steps
- Trust score tier display
- Empty state handling

Run tests:

```bash
npm test vendor.test.tsx
```

## Known Limitations / Future Enhancements

1. **Magic link integration** — Vendors accessing via magic link should see partial dashboard (no trust score, limited actions)
2. **Real-time updates** — Document status could poll API for live updates
3. **Bulk uploads** — CSV/ZIP batch upload for multiple documents
4. **Invoice-to-project matching** — AI auto-match invoices to SOV line items
5. **Payment method selection** — Early pay, check, ACH options in early pay CTA
6. **Vendor chat/support** — Integrated messaging with contractor (for feedback/revisions)
7. **Email notifications** — Approval/rejection/payment status via email
8. **PDF invoice preview** — Show PDF preview before submit

## Accessibility

- All buttons/links have proper `aria-label`
- Color is never the only indicator (text + icon)
- Focus states visible (orange outline)
- Tab order follows visual flow
- Alt text for all icons
- Semantic HTML (button, link, form)

## Performance

- Lazy-load modals (not rendered until opened)
- Document table pagination (virtualized for large lists)
- Image optimization (dropzone preview)
- CSS-in-JS minimized (Tailwind only)
- No unnecessary re-renders (React.memo on cards)

---

**Last Updated:** April 15, 2026  
**Status:** Production Ready ✅
