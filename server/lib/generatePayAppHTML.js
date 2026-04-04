/**
 * generatePayAppHTML — Professional AIA G702/G703 HTML template
 * Shared by: PDF route (Puppeteer), HTML preview route, email PDF attachment
 */

function generatePayAppHTML(pa, lines, cos, totals, logoBase64, sigBase64, photoAttachments=[], docAttachments=[]) {
  const { tComp, tRet, tPrevCert, tCO, contract, earned, due } = totals;
  const fmtM = n => '$' + parseFloat(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

  // Build G703 rows and accumulate totals
  const showRet = pa.include_retainage !== false;
  let tSV=0, tPrev2=0, tThis2=0, tComp2=0, tRet2=0;
  const g703Rows = lines.map(r => {
    const sv   = parseFloat(r.scheduled_value);
    const prev = sv * parseFloat(r.prev_pct) / 100;
    const thisPer = sv * parseFloat(r.this_pct) / 100;
    const comp = prev + thisPer;
    const pctComp = sv > 0 ? comp / sv * 100 : 0;
    const ret  = comp * parseFloat(r.retainage_pct) / 100;
    const bal  = sv - comp;
    tSV += sv; tPrev2 += prev; tThis2 += thisPer; tComp2 += comp; tRet2 += ret;
    if (sv === 0) return `<tr style="background:#f9f9f9;color:#999">
      <td style="border:1px solid #ccc;padding:3px 5px">${r.item_id||''}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;font-style:italic">${r.description||''}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:center;font-style:italic;font-size:8pt">Included</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:center">-</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:center">-</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:center">-</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:center">-</td>
      ${showRet ? '<td style="border:1px solid #ccc;padding:3px 5px;text-align:center">-</td><td style="border:1px solid #ccc;padding:3px 5px;text-align:center">-</td>' : ''}
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:center">-</td>
    </tr>`;
    return `<tr>
      <td style="border:1px solid #ccc;padding:3px 5px">${r.item_id||''}</td>
      <td style="border:1px solid #ccc;padding:3px 5px">${r.description||''}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(sv)}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(prev)}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(thisPer)}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(comp)}</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${pctComp.toFixed(0)}%</td>
      ${showRet ? `<td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${parseFloat(r.retainage_pct).toFixed(0)}%</td>
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(ret)}</td>` : ''}
      <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(bal)}</td>
    </tr>`;
  }).join('');

  const today = new Date().toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'});
  const contractDate = pa.contract_date ? new Date(pa.contract_date).toLocaleDateString() : '—';
  const paymentTerms = pa.payment_terms || pa.default_payment_terms || 'Due on receipt';

  // Logo: show image if uploaded, otherwise show company name as dignified fallback
  const companyDisplayName = pa.company_name || pa.contractor || '';
  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" style="max-width:110px;max-height:60px;object-fit:contain;display:block"/>`
    : `<div style="width:110px;min-height:50px;border:1px solid #ddd;border-radius:3px;display:flex;align-items:center;justify-content:center;padding:4px;text-align:center;font-size:8pt;font-weight:bold;color:#333;background:#f9f9f9">${companyDisplayName || '— Your Logo —'}</div>`;

  // Signature: show uploaded image if available, otherwise a clear blank signing area
  const contactName = pa.contact_name || '';
  const sigHtml = sigBase64
    ? `<img src="${sigBase64}" style="max-height:72px;max-width:240px;object-fit:contain;display:block;margin-bottom:4px"/>`
    : `<div style="height:52px"></div>`; /* blank space for wet ink signature */

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Times New Roman',Times,serif;font-size:9pt;color:#000;background:#fff}
/* G702 header */
.aia-header{display:flex;gap:10px;align-items:flex-start;border-bottom:2.5px solid #000;padding-bottom:10px;margin-bottom:8px}
.aia-logo-box{flex:0 0 115px}
.aia-title{flex:1}
.aia-title h1{font-size:12pt;font-weight:bold;margin-bottom:2px}
.aia-title h2{font-size:9.5pt;font-weight:normal;color:#444;margin-bottom:5px}
.aia-title p{font-size:8.5pt;margin:2px 0}
.aia-appnum{flex:0 0 180px;text-align:right;font-size:8.5pt;line-height:1.5}
.aia-appnum .big{font-size:11pt;font-weight:bold}
/* Payment terms */
.aia-payment-terms{font-size:8.5pt;background:#f5f9ff;border:1px solid #c8daf5;padding:4px 9px;border-radius:3px;margin-bottom:8px}
/* Summary grid */
.aia-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:10px}
.aia-cell{border:1px solid #ccc;padding:5px 8px;display:flex;justify-content:space-between;align-items:center;font-size:8.5pt}
.aia-cell-label{flex:1}
.aia-cell-val{font-weight:bold;white-space:nowrap;margin-left:8px}
.aia-cell-H{background:#fffbe6}
.aia-cell-H .aia-cell-val{font-size:13pt;color:#2563eb}
/* Distribution */
.aia-distribution{margin-bottom:10px;font-size:8.5pt}
.aia-dist-title{font-weight:bold;margin-bottom:5px}
.aia-dist-grid{display:flex;gap:18px}
.aia-dist-item{display:flex;align-items:center;gap:5px}
.aia-checkbox{width:13px;height:13px;border:1.5px solid #2563eb;border-radius:2px;flex-shrink:0}
.aia-checkbox.checked{background:#2563eb}
/* Signature boxes */
.aia-sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.aia-sig-box{border:1px solid #ccc;padding:10px;border-radius:4px;display:flex;flex-direction:column;min-height:120px}
.aia-sig-title{font-weight:bold;font-size:9pt;margin-bottom:6px;border-bottom:1px solid #eee;padding-bottom:4px}
.aia-sig-spacer{flex:1}
.aia-sig-line{border-bottom:1px solid #333;margin:4px 0 4px}
.aia-sig-label{font-size:7.5pt;color:#555}
.aia-sig-note{font-size:7.5pt;color:#555;margin-bottom:8px;line-height:1.4}
/* G703 */
.aia-g703-section{page-break-before:always;padding-top:10px}
.g703-title{font-size:11pt;font-weight:bold;text-align:center;margin-bottom:3px}
.g703-sub{font-size:8pt;text-align:center;color:#555;margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:7.5pt}
th{background:#f0f0f0;border:1px solid #999;padding:4px 5px;font-size:7.5pt}
td{border:1px solid #ddd;padding:2px 5px}
.tfoot-row td{font-weight:bold;background:#f0f0f0;border:1px solid #ccc}
/* Branding footer */
.print-branding{text-align:center;margin-top:20px;padding-top:10px;border-top:1px solid #e0e0e0}
.brand-name{font-size:11pt;letter-spacing:0.3px;margin-bottom:3px}
.brand-tagline{font-size:8pt;color:#777;margin-bottom:3px;font-style:italic}
.brand-link{font-size:8pt;color:#2563eb;text-decoration:none}
</style></head>
<body>
<!-- G702 PAGE -->
<div class="aia-header">
  <div class="aia-logo-box">${logoHtml}</div>
  <div class="aia-title">
    <h1>Application and Certificate for Payment</h1>
    <h2>Document G702</h2>
    <p>TO OWNER: <strong>${pa.owner||'—'}</strong> &nbsp;&nbsp; PROJECT: <strong>${pa.pname||'—'}</strong></p>
    <p>FROM CONTRACTOR: <strong>${pa.contractor||'—'}</strong>${pa.include_architect !== false ? ` &nbsp;&nbsp; ARCHITECT: <strong>${pa.architect||'—'}</strong>` : ''}</p>
  </div>
  <div class="aia-appnum">
    <span class="big">#${pa.app_number}</span>
    <div>Period: ${pa.period_label||'—'}</div>
    <div>Contract date: ${contractDate}</div>
    <div>Project No: ${pa.pnum||'—'}</div>
    ${pa.po_number ? `<div style="margin-top:2px;font-size:7pt;overflow-wrap:break-word;word-break:break-word">PO #: <span style="font-weight:600">${pa.po_number}</span></div>` : ''}
  </div>
</div>

<div class="aia-payment-terms"><strong>Payment Terms:</strong> ${paymentTerms}</div>

<div class="aia-grid">
  <div class="aia-cell"><span class="aia-cell-label">A. Original Contract Sum</span><span class="aia-cell-val">${fmtM(pa.original_contract)}</span></div>
  <div class="aia-cell"><span class="aia-cell-label">F. Total Earned Less Retainage (D-E)</span><span class="aia-cell-val">${fmtM(earned)}</span></div>
  <div class="aia-cell"><span class="aia-cell-label">B. Net Change by Change Orders</span><span class="aia-cell-val">${fmtM(tCO)}</span></div>
  <div class="aia-cell"><span class="aia-cell-label">G. Less Previous Certificates for Payment</span><span class="aia-cell-val">${fmtM(tPrevCert)}</span></div>
  <div class="aia-cell"><span class="aia-cell-label">C. Contract Sum to Date (A+B)</span><span class="aia-cell-val">${fmtM(contract)}</span></div>
  <div class="aia-cell aia-cell-H"><span class="aia-cell-label">H. CURRENT PAYMENT DUE</span><span class="aia-cell-val">${fmtM(due)}</span></div>
  <div class="aia-cell"><span class="aia-cell-label">D. Total Completed &amp; Stored to Date</span><span class="aia-cell-val">${fmtM(tComp)}</span></div>
  <div class="aia-cell"><span class="aia-cell-label">I. Balance to Finish, Plus Retainage</span><span class="aia-cell-val">${fmtM(contract-tComp+tRet)}</span></div>
  <div class="aia-cell"><span class="aia-cell-label">E. Retainage to Date</span><span class="aia-cell-val">${fmtM(tRet)}</span></div>
  <div class="aia-cell"></div>
</div>

<div class="aia-distribution">
  <div class="aia-dist-title">Distribution to:</div>
  <div class="aia-dist-grid">
    <div class="aia-dist-item"><div class="aia-checkbox${pa.dist_owner !== false ? ' checked' : ''}"></div><span>Owner</span></div>
    <div class="aia-dist-item"><div class="aia-checkbox${pa.dist_architect === true ? ' checked' : ''}"></div><span>Architect</span></div>
    <div class="aia-dist-item"><div class="aia-checkbox${pa.dist_contractor === true ? ' checked' : ''}"></div><span>Contractor file</span></div>
  </div>
</div>

<div class="aia-sig-grid" ${pa.include_architect === false ? 'style="grid-template-columns:1fr"' : ''}>
  <div class="aia-sig-box">
    <div class="aia-sig-title">Contractor's Signed Certification</div>
    <p class="aia-sig-note">The undersigned Contractor certifies that to the best of the Contractor's knowledge, information and belief the Work covered by this Application for Payment has been completed in accordance with the Contract Documents.</p>
    <div class="aia-sig-spacer"></div>
    ${sigHtml}
    <div class="aia-sig-line"></div>
    <div class="aia-sig-label">Authorized Signature &nbsp;&nbsp;&nbsp; Date: ${today}</div>
    ${contactName ? `<div style="font-size:8.5pt;font-weight:bold;margin-top:5px;color:#222">${contactName}</div><div style="font-size:7.5pt;color:#666">${companyDisplayName}</div>` : (companyDisplayName ? `<div style="font-size:8.5pt;font-weight:bold;margin-top:5px;color:#222">${companyDisplayName}</div>` : '')}
  </div>
  ${pa.include_architect !== false ? `<div class="aia-sig-box">
    <div class="aia-sig-title">Architect's Certificate for Payment</div>
    <p class="aia-sig-note">In accordance with the Contract Documents, the Architect certifies to the Owner that the Work has progressed to the point indicated and the quality of the Work is in accordance with the Contract Documents.</p>
    <div style="font-size:8pt;margin-bottom:4px">Amount Certified: <strong>${pa.architect_certified ? fmtM(pa.architect_certified) : 'Pending'}</strong></div>
    <div class="aia-sig-spacer"></div>
    <div class="aia-sig-line"></div>
    <div class="aia-sig-label">Architect Signature &nbsp;&nbsp;&nbsp; Date: ${pa.architect_date ? new Date(pa.architect_date).toLocaleDateString() : ''}</div>
  </div>` : ''}
</div>

${pa.special_notes ? `<div style="margin-top:8px;padding:6px 10px;background:#fafafa;border:1px solid #ddd;border-radius:4px;font-size:8pt;color:#333"><strong>Notes:</strong> ${pa.special_notes}</div>` : ''}

<!-- G703 PAGE (page break before) -->
<div class="aia-g703-section">
  <div class="g703-title">Continuation Sheet — Document G703</div>
  <div class="g703-sub">Application #${pa.app_number} &nbsp;—&nbsp; ${pa.period_label||''} &nbsp;—&nbsp; ${pa.pname||''}</div>
  <table>
    <thead>
      <tr>
        <th style="text-align:left;width:52px">Item</th>
        <th style="text-align:left">Description of Work</th>
        <th style="text-align:right;width:78px">Scheduled Value</th>
        <th style="text-align:right;width:75px">Work Prev. Billed</th>
        <th style="text-align:right;width:72px">Work This Period</th>
        <th style="text-align:right;width:72px">Total Completed</th>
        <th style="text-align:right;width:44px">% Comp.</th>
        ${showRet ? '<th style="text-align:right;width:40px">Ret.%</th><th style="text-align:right;width:70px">Retainage $</th>' : ''}
        <th style="text-align:right;width:72px">Balance to Finish</th>
      </tr>
    </thead>
    <tbody>${g703Rows}${cos.length ? `
      <tr style="background:#fffbe6;border-top:2px solid #999">
        <td colspan="${showRet ? 10 : 8}" style="border:1px solid #ccc;padding:5px;font-weight:bold;font-size:8pt;color:#444">CHANGE ORDERS</td>
      </tr>
      ${cos.map(co => {
        const coAmt = parseFloat(co.amount || 0);
        tSV += coAmt; tComp2 += coAmt;
        return `<tr style="background:#fffbe6">
          <td style="border:1px solid #ccc;padding:3px 5px;font-style:italic">CO-${co.co_number||''}</td>
          <td style="border:1px solid #ccc;padding:3px 5px">${co.description||''} ${co.status ? '('+co.status+')' : ''}</td>
          <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(coAmt)}</td>
          <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">-</td>
          <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(coAmt)}</td>
          <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">${fmtM(coAmt)}</td>
          <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">100%</td>
          ${showRet ? '<td style="border:1px solid #ccc;padding:3px 5px;text-align:right">-</td><td style="border:1px solid #ccc;padding:3px 5px;text-align:right">-</td>' : ''}
          <td style="border:1px solid #ccc;padding:3px 5px;text-align:right">$0.00</td>
        </tr>`;
      }).join('')}` : ''}</tbody>
    <tfoot>
      <tr class="tfoot-row">
        <td></td>
        <td>GRAND TOTAL (incl. Change Orders)</td>
        <td style="text-align:right">${fmtM(tSV)}</td>
        <td style="text-align:right">${fmtM(tPrev2)}</td>
        <td style="text-align:right">${fmtM(tThis2)}</td>
        <td style="text-align:right">${fmtM(tComp2)}</td>
        <td style="text-align:right">${tSV>0?(tComp2/tSV*100).toFixed(0)+'%':'0%'}</td>
        ${showRet ? `<td></td><td style="text-align:right">${fmtM(tRet2)}</td>` : ''}
        <td style="text-align:right">${fmtM(tSV-tComp2)}</td>
      </tr>
    </tfoot>
  </table>
  ${pa.payment_link_token && due > 0 ? `
  <div style="text-align:center;margin:18px 0 10px;padding:14px 20px;background:#f0f4ff;border:1.5px solid #93c5fd;border-radius:8px">
    <div style="font-size:9pt;color:#555;margin-bottom:6px">Pay this invoice online — ACH or credit card</div>
    <a href="https://constructinv.varshyl.com/pay/${pa.payment_link_token}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:10pt">Pay Now — ${fmtM(due)}</a>
    <div style="font-size:7.5pt;color:#888;margin-top:6px">constructinv.varshyl.com/pay/${pa.payment_link_token}</div>
  </div>` : ''}
  <div class="print-branding">
    <div class="brand-name"><span style="color:#6B2FA0;font-weight:bold">Construct</span><span style="color:#E87722;font-weight:bold">Invoice</span> <span style="color:#009B8D;font-weight:bold">AI</span></div>
    <div class="brand-tagline">$0 to use — pay it forward instead: feed a child, help a neighbor</div>
    <a href="https://constructinv.varshyl.com" class="brand-link">constructinv.varshyl.com</a>
  </div>
</div>
${photoAttachments.length ? `
<div style="page-break-before:always;padding:28px 36px">
  <div style="border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:18px">
    <span style="font-size:12pt;font-weight:bold;font-family:'Times New Roman',serif">Site Photos — Attachment</span>
    <span style="font-size:9pt;color:#555;margin-left:12px">Pay App #${pa.app_number}${pa.period_label ? ' · ' + pa.period_label : ''}</span>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:16px">
    ${photoAttachments.map((p, i) => `
    <div style="break-inside:avoid;text-align:center;width:245px">
      <img src="${p.base64}" style="width:245px;max-height:200px;object-fit:contain;border:1px solid #ccc;display:block"/>
      <div style="font-size:7.5pt;color:#666;margin-top:4px;word-break:break-word">${p.name || ('Photo ' + (i+1))}</div>
    </div>`).join('')}
  </div>
</div>` : ''}
${docAttachments.length ? `
<div style="page-break-before:always;padding:28px 36px">
  <div style="border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:18px">
    <span style="font-size:12pt;font-weight:bold;font-family:'Times New Roman',serif">Supporting Documents — Attachment List</span>
    <span style="font-size:9pt;color:#555;margin-left:12px">Pay App #${pa.app_number}${pa.period_label ? ' · ' + pa.period_label : ''}</span>
  </div>
  ${docAttachments.map((d,i) => `
  <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#f7f7f7;border:1px solid #ddd;border-radius:4px;margin-bottom:8px">
    <div>
      <div style="font-size:10pt;font-weight:600">${d.name}</div>
      <div style="font-size:8pt;color:#777">Document ${i+1} of ${docAttachments.length}</div>
    </div>
  </div>`).join('')}
  <p style="font-size:8.5pt;color:#666;margin-top:16px;font-style:italic">These documents are attached as separate files in the email alongside this PDF.</p>
</div>` : ''}
</body></html>`;
}

module.exports = { generatePayAppHTML };
