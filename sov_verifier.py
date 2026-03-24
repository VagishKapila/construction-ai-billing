#!/usr/bin/env python3
"""
SOV Verifier Module — "Total-First" verification for parsed SOV data.

Works like a human reading a contractor estimate:
1. Find the document's grand total (the number that gets billed)
2. Find which subset of extracted rows adds up to that total
3. Flag mismatches — never silently drop rows

Two layers:
  Layer 1: Math-based subset matching (free, instant, handles 90%+ of cases)
  Layer 2: AI fallback via Claude API (only when math can't reconcile)

Usage:
  from sov_verifier import verify_sov
  result = verify_sov(rows, summary, anthropic_api_key=None)

  result = {
    'rows': [...],           # verified line items
    'removed': [...],        # rows identified as summary/rollup (moved to metadata)
    'computed_total': float, # sum of verified rows
    'reported_total': float, # document's stated total
    'match': bool,           # True if computed == reported (within tolerance)
    'method': str,           # 'exact'|'math'|'ai'|'unresolved'
    'message': str           # human-readable explanation
  }
"""
import re, json, os, logging
from itertools import combinations

logger = logging.getLogger('sov_verifier')

# Dollar tolerance for matching ($1.00 covers rounding across many line items)
TOLERANCE = 1.00

# Keywords that identify overhead/markup rows (potential double-counts)
# These are rows whose amounts may already be included in per-line totals.
# Tax is NOT here — tax is always a real additional cost.
OVERHEAD_KEYWORDS = [
    'overhead', 'markup', 'profit and overhead', 'p&o', 'p & o',
    'general conditions', 'gc fee', 'contractor fee',
    'supervision fee', 'management fee',
]

# Keywords that identify rows which are NEVER real line items
# (pure document totals / running sums)
NEVER_LINE_ITEM = [
    'subtotal', 'sub total', 'sub-total',
    'grand total', 'total amount',
    'balance due', 'amount paid', 'amount due',
]


def _is_overhead_like(desc):
    """Check if a description looks like an overhead/markup summary row."""
    d = desc.lower().strip()
    return any(kw in d for kw in OVERHEAD_KEYWORDS)


def _is_never_line_item(desc):
    """Check if a description is a pure total/subtotal — never a real line item."""
    d = desc.lower().strip()
    return any(kw in d for kw in NEVER_LINE_ITEM)


def _amounts_match(a, b, tol=TOLERANCE):
    """Check if two dollar amounts are equal within tolerance."""
    return abs(round(a, 2) - round(b, 2)) <= tol


# ─── LAYER 1: Math-based verification ────────────────────────────────────────

def _try_exact_match(rows, target):
    """Check if all rows already sum to the target."""
    total = round(sum(r['scheduled_value'] for r in rows), 2)
    if _amounts_match(total, target):
        return rows, [], 'exact', 'Line items sum matches document total exactly.'
    return None


def _try_remove_overhead(rows, target):
    """Try removing overhead/markup rows to match the target."""
    overhead_rows = []
    keep_rows = []
    for r in rows:
        if _is_overhead_like(r['description']):
            overhead_rows.append(r)
        else:
            keep_rows.append(r)

    if not overhead_rows:
        return None

    # Try removing all overhead rows
    keep_total = round(sum(r['scheduled_value'] for r in keep_rows), 2)
    if _amounts_match(keep_total, target):
        return keep_rows, overhead_rows, 'math', \
            f'Removed {len(overhead_rows)} overhead/markup row(s) — already included in per-line totals.'

    # Try removing subsets of overhead rows (in case only some are double-counted)
    for count in range(1, len(overhead_rows) + 1):
        for combo in combinations(range(len(overhead_rows)), count):
            remove_set = set(combo)
            test_rows = keep_rows + [overhead_rows[i] for i in range(len(overhead_rows)) if i not in remove_set]
            test_total = round(sum(r['scheduled_value'] for r in test_rows), 2)
            if _amounts_match(test_total, target):
                removed = [overhead_rows[i] for i in remove_set]
                return test_rows, removed, 'math', \
                    f'Removed {len(removed)} double-counted row(s) to match document total.'

    return None


def _try_subset_match(rows, target):
    """
    Try to find which subset of rows sums to the target.
    Only attempts this for reasonable row counts (≤20 rows).
    Tries removing 1, then 2, then 3 rows max.
    """
    n = len(rows)
    if n > 20:
        return None  # too many combinations

    full_total = round(sum(r['scheduled_value'] for r in rows), 2)

    # Only try if we're overshooting (rows include extra summary items)
    if full_total <= target:
        return None

    # Try removing 1 row, then 2, then 3
    for remove_count in range(1, min(4, n)):
        for combo in combinations(range(n), remove_count):
            remove_set = set(combo)
            test_rows = [rows[i] for i in range(n) if i not in remove_set]
            test_total = round(sum(r['scheduled_value'] for r in test_rows), 2)
            if _amounts_match(test_total, target):
                removed = [rows[i] for i in combo]
                # Prefer removing rows that look like summaries over real scope items
                desc_summary_score = sum(
                    1 for r in removed
                    if _is_overhead_like(r['description']) or _is_never_line_item(r['description'])
                )
                if desc_summary_score == len(removed):
                    return test_rows, removed, 'math', \
                        f'Removed {len(removed)} summary row(s) to match document total.'
                # If we'd be removing real scope items, skip this combo
                # (there might be a better combo)

    # Second pass: accept removing non-summary rows as last resort
    for remove_count in range(1, min(4, n)):
        for combo in combinations(range(n), remove_count):
            remove_set = set(combo)
            test_rows = [rows[i] for i in range(n) if i not in remove_set]
            test_total = round(sum(r['scheduled_value'] for r in test_rows), 2)
            if _amounts_match(test_total, target):
                removed = [rows[i] for i in combo]
                return test_rows, removed, 'math', \
                    f'Removed {len(removed)} row(s) to match document total. Please verify these were not real scope items: {", ".join(r["description"] for r in removed)}'

    return None


# ─── LAYER 2: AI fallback via Claude API ──────────────────────────────────────

def _try_ai_verification(rows, summary, target, api_key):
    """
    Send parsed data to Claude API for intelligent verification.
    Only called when math-based methods can't reconcile the total.
    """
    if not api_key:
        return None

    try:
        import urllib.request
        import urllib.error

        rows_text = '\n'.join(
            f'  Row {i+1}: "{r["description"]}" = ${r["scheduled_value"]:,.2f}'
            for i, r in enumerate(rows)
        )
        summary_text = '\n'.join(
            f'  {k}: ${v:,.2f}' for k, v in summary.items() if v
        )
        computed = round(sum(r['scheduled_value'] for r in rows), 2)

        prompt = f"""You are verifying a parsed construction SOV (Schedule of Values) document.

The document's reported total is: ${target:,.2f}
The extracted line items sum to: ${computed:,.2f}
Difference: ${abs(computed - target):,.2f}

Document financial summary:
{summary_text}

Extracted rows:
{rows_text}

TASK: Identify which rows are REAL billable line items and which are summary/rollup rows
that should be excluded (because their amounts are already included in other line items).

Rules:
- The final line items MUST sum to the document total (${target:,.2f}) within $1.00
- Tax is ALWAYS a real line item — never exclude tax
- Overhead/markup rows are often double-counted (already in per-line totals)
- Subtotal/total rows are never line items

Return ONLY a JSON object with:
{{
  "keep_indices": [0, 1, 2, ...],  // 0-based indices of rows to KEEP
  "remove_indices": [3, 5, ...],   // 0-based indices of rows to REMOVE
  "reason": "brief explanation"
}}"""

        payload = json.dumps({
            'model': 'claude-haiku-4-5-20251001',
            'max_tokens': 500,
            'messages': [{'role': 'user', 'content': prompt}]
        }).encode('utf-8')

        req = urllib.request.Request(
            'https://api.anthropic.com/v1/messages',
            data=payload,
            headers={
                'Content-Type': 'application/json',
                'x-api-key': api_key,
                'anthropic-version': '2023-06-01'
            }
        )

        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode('utf-8'))

        # Extract JSON from Claude's response
        text = result.get('content', [{}])[0].get('text', '')
        # Find JSON object in response
        match = re.search(r'\{[\s\S]*\}', text)
        if not match:
            return None

        ai_result = json.loads(match.group())
        keep_indices = set(ai_result.get('keep_indices', []))
        remove_indices = set(ai_result.get('remove_indices', []))
        reason = ai_result.get('reason', 'AI verification')

        if not keep_indices and not remove_indices:
            return None

        keep_rows = [rows[i] for i in range(len(rows)) if i in keep_indices]
        removed_rows = [rows[i] for i in range(len(rows)) if i in remove_indices]

        # Verify the AI's suggestion actually matches the total
        keep_total = round(sum(r['scheduled_value'] for r in keep_rows), 2)
        if _amounts_match(keep_total, target):
            return keep_rows, removed_rows, 'ai', f'AI verification: {reason}'

        # AI suggestion didn't match — don't trust it
        logger.warning(f'AI suggestion total ${keep_total:,.2f} != target ${target:,.2f}, ignoring')
        return None

    except Exception as e:
        logger.warning(f'AI verification failed: {e}')
        return None


# ─── Main verify function ─────────────────────────────────────────────────────

def verify_sov(rows, summary, anthropic_api_key=None):
    """
    Verify parsed SOV rows against the document's reported total.

    Works like a human: find the total first, then verify line items match.

    Args:
        rows: list of dicts with 'description' and 'scheduled_value'
        summary: dict of financial summary values (subtotal, total, etc.)
        anthropic_api_key: optional API key for AI fallback

    Returns:
        dict with verified rows, removed rows, match status, and method used
    """
    reported_total = summary.get('total') or summary.get('balance_due')

    # If no reported total, we can't verify — return as-is
    if not reported_total or reported_total <= 0:
        computed = round(sum(r['scheduled_value'] for r in rows), 2)
        return {
            'rows': rows,
            'removed': [],
            'computed_total': computed,
            'reported_total': None,
            'match': False,
            'method': 'none',
            'message': 'No document total found — cannot verify. Please review line items manually.'
        }

    target = round(reported_total, 2)

    # First, remove any rows that are NEVER line items (subtotal, total, etc.)
    clean_rows = []
    auto_removed = []
    for r in rows:
        if _is_never_line_item(r['description']):
            auto_removed.append(r)
        else:
            clean_rows.append(r)
    rows = clean_rows

    # Layer 1a: Check if rows already match
    result = _try_exact_match(rows, target)
    if result:
        keep, removed, method, msg = result
        return _build_result(keep, removed + auto_removed, target, method, msg)

    # Layer 1b: Try removing overhead/markup rows
    result = _try_remove_overhead(rows, target)
    if result:
        keep, removed, method, msg = result
        return _build_result(keep, removed + auto_removed, target, method, msg)

    # Layer 1c: Try subset matching (brute force for small row counts)
    result = _try_subset_match(rows, target)
    if result:
        keep, removed, method, msg = result
        return _build_result(keep, removed + auto_removed, target, method, msg)

    # Layer 2: AI fallback
    if anthropic_api_key:
        result = _try_ai_verification(rows, summary, target, anthropic_api_key)
        if result:
            keep, removed, method, msg = result
            return _build_result(keep, removed + auto_removed, target, method, msg)

    # Nothing worked — return all rows with a warning
    computed = round(sum(r['scheduled_value'] for r in rows), 2)
    diff = round(abs(computed - target), 2)
    return {
        'rows': rows,
        'removed': auto_removed,
        'computed_total': computed,
        'reported_total': target,
        'match': False,
        'method': 'unresolved',
        'message': f'Line items (${computed:,.2f}) differ from document total (${target:,.2f}) by ${diff:,.2f}. Please review and adjust manually.'
    }


def _build_result(keep, removed, target, method, message):
    """Build a standardized result dict."""
    computed = round(sum(r['scheduled_value'] for r in keep), 2)
    return {
        'rows': keep,
        'removed': removed,
        'computed_total': computed,
        'reported_total': target,
        'match': _amounts_match(computed, target),
        'method': method,
        'message': message
    }


# ─── CLI for testing ──────────────────────────────────────────────────────────

if __name__ == '__main__':
    """Run standalone: python3 sov_verifier.py <parsed_json_file_or_stdin>"""
    import sys

    if len(sys.argv) > 1 and sys.argv[1] != '-':
        with open(sys.argv[1]) as f:
            data = json.load(f)
    else:
        data = json.load(sys.stdin)

    rows = data.get('rows', [])
    summary = data.get('summary', {})
    api_key = os.environ.get('ANTHROPIC_API_KEY')

    result = verify_sov(rows, summary, anthropic_api_key=api_key)

    print(f'\n{"="*60}')
    print(f'  SOV Verification Result')
    print(f'{"="*60}')
    print(f'  Method:    {result["method"]}')
    print(f'  Match:     {"✅ YES" if result["match"] else "❌ NO"}')
    print(f'  Computed:  ${result["computed_total"]:,.2f}')
    print(f'  Reported:  ${result["reported_total"]:,.2f}' if result["reported_total"] else '  Reported:  N/A')
    print(f'  Message:   {result["message"]}')
    print(f'\n  Kept {len(result["rows"])} rows:')
    for r in result['rows']:
        print(f'    {r["item_id"]:>5}  {r["description"]:<50} ${r["scheduled_value"]:>12,.2f}')
    if result['removed']:
        print(f'\n  Removed {len(result["removed"])} rows:')
        for r in result['removed']:
            print(f'    {r.get("item_id",""):>5}  {r["description"]:<50} ${r["scheduled_value"]:>12,.2f}')
    print(f'{"="*60}\n')
