#!/usr/bin/env python3
"""
Smart SOV parser for Construction AI Billing.
Accepts PDF (.pdf) and Word (.docx/.doc) contractor estimates.
Extracts: item_id, description, scheduled_value
Returns JSON to stdout.
"""
import sys, json, re, os

# ── Patterns to skip (headers, footers, metadata, sub-bullets) ────────────────
SKIP_RE = re.compile(
    r'^(\*|•|·|–|—|-{2,})'               # bullet / sub-item lines
    r'|^(subtotal|total|tax|overhead|company overhead|balance due|amount paid'
    r'|terms|signature|page \d|files\+|materials\n|note[:\s]|excludes'
    r'|it is an honor|we thank|sincerely|dear |http|www\.|all demolition'
    r'|material and|item\s+labor|labor\s+overhead|rental equipment\s*$)',
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
    counter = [1000]
    seen = set()

    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ''
            for line in text.split('\n'):
                line = line.strip()
                if len(line) < 5:
                    continue
                if SKIP_RE.search(line):
                    continue

                amounts = extract_amounts(line)
                if not amounts:
                    continue

                # Last dollar amount = Total column (Material + Labor + Overhead)
                total = amounts[-1]
                if total <= 0:
                    continue

                # Description = everything before the first dollar sign
                desc = re.sub(r'\s*\$[\d,]+(?:\.\d{1,2})?.*$', '', line).strip()
                desc = clean_desc(desc)

                # Skip very short or numeric-only descriptions
                if len(desc) < 4 or re.match(r'^[\d\s\.\-]+$', desc):
                    continue
                if SKIP_RE.search(desc):
                    continue

                key = desc.lower()
                if key in seen:
                    continue
                seen.add(key)

                rows.append({
                    'item_id': assign_id(counter),
                    'description': desc,
                    'scheduled_value': round(total, 2)
                })

    return rows

# ── DOCX parser ────────────────────────────────────────────────────────────────
def parse_docx(filepath):
    import docx as python_docx
    doc = python_docx.Document(filepath)
    rows = []
    counter = [1000]
    seen = set()

    def add_row(item_id, desc, amt):
        desc = clean_desc(desc)
        if len(desc) < 4 or SKIP_RE.search(desc):
            return
        key = desc.lower()
        if key in seen or amt <= 0:
            return
        seen.add(key)
        rows.append({
            'item_id': assign_id(counter, item_id),
            'description': desc,
            'scheduled_value': round(amt, 2)
        })

    # Tables first (most structured)
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells]
            if not any(cells):
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
            if not text or SKIP_RE.search(text):
                continue
            amts = extract_amounts(text)
            if not amts:
                continue
            total = amts[-1]
            desc = re.sub(r'\s*\$[\d,]+(?:\.\d{1,2})?.*$', '', text).strip()
            add_row('', desc, total)

    return rows

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No file path provided'}))
        sys.exit(1)

    filepath = sys.argv[1]
    ext = os.path.splitext(filepath)[1].lower()

    try:
        if ext == '.pdf':
            rows = parse_pdf(filepath)
        elif ext in ('.docx', '.doc'):
            rows = parse_docx(filepath)
        else:
            print(json.dumps({'error': f'Unsupported format: {ext}. Use PDF or DOCX.'}))
            sys.exit(1)

        if not rows:
            print(json.dumps({'error': 'No line items with dollar amounts found in this file.'}))
            sys.exit(1)

        print(json.dumps({
            'rows':       rows,
            'all_rows':   rows,
            'row_count':  len(rows),
            'total_rows': len(rows),
            'sheet_used': ext.lstrip('.').upper(),
            'filename':   os.path.basename(filepath)
        }))

    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main()
