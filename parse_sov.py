#!/usr/bin/env python3
"""
Smart SOV parser for Construction AI Billing.
Accepts PDF (.pdf) and Word (.docx/.doc) contractor estimates.
Extracts: item_id, description, scheduled_value (line items)
Also extracts: summary (subtotal, overhead, tax, total, etc.)
Returns JSON to stdout.
"""
import sys, json, re, os, logging
# Suppress pdfminer/pdfplumber warnings so only our JSON goes to stdout
logging.getLogger('pdfminer').setLevel(logging.ERROR)
logging.getLogger('pdfplumber').setLevel(logging.ERROR)

# ── Lines to skip entirely (document boilerplate, not scope or money) ─────────
SKIP_RE = re.compile(
    r'^(\*|•|·|–|—|-{2,})'               # bullet / sub-item lines
    r'|^(terms\s+and\s+conditions|signature|page \d+\s*/|files\+|note[:\s]|excludes'
    r'|it is an honor|we thank|sincerely|dear |http|www\.'
    r'|material and\s+labor|item\s+labor|labor\s+overhead)',
    re.IGNORECASE
)

# ── Financial summary rows: captured as metadata, NOT added as line items ──────
# These are document totals / running sums, not individual billable scope items.
# IMPORTANT: Tax IS a real billable line item — do NOT exclude it here.
# Only exclude rows that are pure totals/subtotals or overhead that is already
# baked into per-line totals (double-counting).
SUMMARY_RE = re.compile(
    r'^(subtotal|sub[\s\-]total|grand[\s\-]total|total[\s\-]amount|'
    r'balance[\s\-]due|amount[\s\-]paid|amount[\s\-]due|'
    r'total[\s\(\$\-]|total\s*$'          # "total", "total (...)", "total -", "total $"
    r')',
    re.IGNORECASE
)

def clean_desc(s):
    s = re.sub(r'^[\*\•\-–—·]+\s*', '', s.strip())   # remove leading bullets
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def extract_amounts(text):
    """Return list of floats from all $X,XXX.XX patterns in text."""
    return [float(m.replace('$','').replace(',',''))
            for m in re.findall(r'\$[\d,]+(?:\.\d{1,2})?', text)]

def extract_bare_amounts(text):
    """Return floats from bare large numbers (no $ sign).
    Used for summary lines that sometimes drop the $ due to PDF encoding."""
    return [float(m.replace(',',''))
            for m in re.findall(r'(?<!\d)(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)(?!\d)', text)
            if float(m.replace(',','')) > 100]

def extract_summary_label(line):
    """Normalize a summary line description to a standard key."""
    s = re.sub(r'\s*\$[\d,]+(?:\.\d{1,2})?.*$', '', line).strip().lower()
    s = re.sub(r'\s+', ' ', s)
    if re.search(r'sub[\s\-]?total', s):    return 'subtotal'
    if re.search(r'balance[\s\-]?due', s):  return 'balance_due'
    if re.search(r'amount[\s\-]?paid', s):  return 'amount_paid'
    if re.search(r'amount[\s\-]?due', s):   return 'amount_due'
    if re.search(r'grand[\s\-]?total', s):  return 'total'
    if re.search(r'^total', s):             return 'total'
    return re.sub(r'[^a-z0-9_]', '_', s)[:30]

def assign_id(counter, existing_id=''):
    """Return existing_id if it looks like a real cost code, else auto-assign."""
    if re.match(r'^\d{3,6}$', str(existing_id).strip()):
        return str(existing_id).strip()
    val = str(counter[0])
    counter[0] += 1000
    return val

# ── PDF parser ─────────────────────────────────────────────────────────────────
def parse_pdf(filepath):
    import pdfplumber
    rows = []
    summary = {}
    counter = [1000]
    seen = set()

    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ''
            pending_desc = None  # holds a description-only line waiting for its amount line
            for line in text.split('\n'):
                line = line.strip()
                if len(line) < 5:
                    pending_desc = None
                    continue

                # Check for financial summary rows first (subtotal, total, balance due, etc.)
                if SUMMARY_RE.search(line):
                    amounts = extract_amounts(line)
                    if not amounts:
                        # Some PDFs strip the $ sign — try bare number extraction
                        amounts = extract_bare_amounts(line)
                    if amounts:
                        key = extract_summary_label(line)
                        summary[key] = round(amounts[-1], 2)
                    pending_desc = None
                    continue

                # Skip boilerplate lines
                if SKIP_RE.search(line):
                    pending_desc = None
                    continue

                amounts = extract_amounts(line)
                if not amounts:
                    # No dollar amounts — this might be a description-only line
                    # Save it as pending in case the next line has the amount
                    candidate = clean_desc(line)
                    if len(candidate) >= 4 and not re.match(r'^[\d\s\.\-]+$', candidate) and not SKIP_RE.search(candidate):
                        pending_desc = candidate
                    else:
                        pending_desc = None
                    continue

                # Last dollar amount = Total column (Material + Labor + Overhead)
                total = amounts[-1]
                if total <= 0:
                    pending_desc = None
                    continue

                # Description = everything before the first dollar sign
                desc = re.sub(r'\s*\$[\d,]+(?:\.\d{1,2})?.*$', '', line).strip()
                desc = clean_desc(desc)

                # If description is numeric-only (e.g. "23000") or too short, try pending_desc
                if len(desc) < 4 or re.match(r'^[\d\s\.\-]+$', desc):
                    if pending_desc:
                        desc = pending_desc
                    else:
                        pending_desc = None
                        continue

                pending_desc = None  # consumed or reset

                if SKIP_RE.search(desc):
                    continue

                # ── Smart dedup: aggregate repeated descriptions ──
                # If the same description appears multiple times (e.g. "Event Beer" ×20),
                # sum their amounts into one row instead of keeping only the first.
                # This handles invoices, bar tabs, and any doc with repeated line items.
                key = desc.lower()
                if key in seen:
                    # Find existing row and add to it
                    for existing in rows:
                        if existing['description'].lower() == key:
                            existing['scheduled_value'] = round(existing['scheduled_value'] + total, 2)
                            break
                    continue
                seen.add(key)

                rows.append({
                    'item_id': assign_id(counter),
                    'description': desc,
                    'scheduled_value': round(total, 2)
                })

    return rows, summary

# ── DOCX parser ────────────────────────────────────────────────────────────────
def parse_docx(filepath):
    import docx as python_docx
    doc = python_docx.Document(filepath)
    rows = []
    summary = {}
    counter = [1000]
    seen = set()

    def add_row(item_id, desc, amt):
        desc = clean_desc(desc)
        if len(desc) < 4 or SKIP_RE.search(desc):
            return
        if amt <= 0:
            return
        key = desc.lower()
        if key in seen:
            # Smart dedup: aggregate repeated descriptions
            for existing in rows:
                if existing['description'].lower() == key:
                    existing['scheduled_value'] = round(existing['scheduled_value'] + amt, 2)
                    break
            return
        seen.add(key)
        rows.append({
            'item_id': assign_id(counter, item_id),
            'description': desc,
            'scheduled_value': round(amt, 2)
        })

    def maybe_summary(cells):
        """If any cell matches SUMMARY_RE, capture as metadata and return True."""
        text = ' '.join(cells)
        if SUMMARY_RE.search(text):
            amounts = extract_amounts(text)
            if amounts:
                key = extract_summary_label(text)
                summary[key] = round(amounts[-1], 2)
            return True
        return False

    # Tables first (most structured)
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells]
            if not any(cells):
                continue
            if maybe_summary(cells):
                continue
            # Find rightmost numeric cell as amount; leftmost text as desc
            amt_idx = -1
            for ci in range(len(cells) - 1, -1, -1):
                amts = extract_amounts(cells[ci])
                if amts and amts[-1] > 0:
                    amt_idx = ci
                    break
            if amt_idx < 0:
                continue
            # Description = longest non-numeric cell to the left of amount
            desc_candidates = [c for c in cells[:amt_idx] if len(c) > 3 and not extract_amounts(c)]
            if not desc_candidates:
                continue
            desc = max(desc_candidates, key=len)
            item_id = cells[0] if re.match(r'^\d{3,6}$', cells[0]) else ''
            add_row(item_id, desc, extract_amounts(cells[amt_idx])[-1])

    # Fallback: paragraphs
    if not rows:
        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue
            if SUMMARY_RE.search(text):
                amts = extract_amounts(text)
                if amts:
                    summary[extract_summary_label(text)] = round(amts[-1], 2)
                continue
            if SKIP_RE.search(text):
                continue
            amts = extract_amounts(text)
            if not amts:
                continue
            total = amts[-1]
            desc = re.sub(r'\s*\$[\d,]+(?:\.\d{1,2})?.*$', '', text).strip()
            add_row('', desc, total)

    return rows, summary

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No file path provided'}))
        sys.exit(1)

    filepath = sys.argv[1]
    ext = os.path.splitext(filepath)[1].lower()

    try:
        if ext == '.pdf':
            rows, summary = parse_pdf(filepath)
        elif ext in ('.docx', '.doc'):
            rows, summary = parse_docx(filepath)
        else:
            print(json.dumps({'error': f'Unsupported format: {ext}. Use PDF or DOCX.'}))
            sys.exit(1)

        if not rows:
            print(json.dumps({'error': 'No line items with dollar amounts found in this file.'}))
            sys.exit(1)

        # ── Total-First Verification ──────────────────────────────────────────────
        # Works like a human: trust the document total, verify line items match.
        # Uses sov_verifier module (math-first, AI fallback if needed).
        try:
            from sov_verifier import verify_sov
            api_key = os.environ.get('ANTHROPIC_API_KEY')
            vr = verify_sov(rows, summary, anthropic_api_key=api_key)
            rows = vr['rows']
            # Move removed rows into summary metadata
            for r in vr.get('removed', []):
                key = re.sub(r'[^a-z0-9_]', '_', r['description'].lower())[:30]
                if key not in summary:
                    summary[key] = round(r['scheduled_value'], 2)
            # Log verification result for debugging
            method = vr.get('method', '?')
            match = '✓' if vr.get('match') else '✗'
            sys.stderr.write(f'[SOV Verifier] {match} method={method} computed=${vr["computed_total"]:,.2f} reported=${vr.get("reported_total","N/A")}\n')
        except ImportError:
            sys.stderr.write('[SOV Verifier] Module not found, skipping verification\n')
        except Exception as ve:
            sys.stderr.write(f'[SOV Verifier] Error: {ve}\n')

        computed_total = round(sum(r['scheduled_value'] for r in rows), 2)
        reported_total = summary.get('total') or summary.get('balance_due')

        sys.stdout.write(json.dumps({
            'rows':           rows,
            'all_rows':       rows,
            'row_count':      len(rows),
            'total_rows':     len(rows),
            'summary':        summary,
            'computed_total': computed_total,
            'reported_total': reported_total,
            'sheet_used':     ext.lstrip('.').upper(),
            'filename':       os.path.basename(filepath)
        }) + '\n')
        sys.stdout.flush()

    except Exception as e:
        sys.stdout.write(json.dumps({'error': str(e)}) + '\n')
        sys.stdout.flush()
        sys.exit(1)

if __name__ == '__main__':
    main()
