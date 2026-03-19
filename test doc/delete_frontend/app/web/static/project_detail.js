document.addEventListener("DOMContentLoaded", () => {

const ORG_ID = localStorage.getItem("org_id") || prompt("Enter Org ID");
if (ORG_ID) localStorage.setItem("org_id", ORG_ID);

/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */

function getProjectIdFromUrl() {
  const parts = window.location.pathname.split("/");
  return parts[2];
}

function money(v) {
  const num = Number(v || 0);
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

async function api(path, opts = {}) {

  const res = await fetch(path, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      "X-Org-Id": ORG_ID
    }
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(data.detail || "API error");

  return data;
}


/* -------------------------------------------------------
   Load SOV
------------------------------------------------------- */

async function loadSov() {

  const projectId = getProjectIdFromUrl();
  const list = document.getElementById("sovList");
  const totalEl = document.getElementById("sovTotal");
  const invoiceBtn = document.getElementById("createInvoiceBtn");

  if (!list) return;

  list.innerHTML = "Loading...";
  totalEl.innerHTML = "";

  try {

    const data = await api(`/api/sov/${projectId}`);

    if (!data.items || !data.items.length) {

      list.innerHTML = "No SOV uploaded yet.";
      return;
    }

    list.innerHTML = "";

    let runningTotal = 0;

    data.items.forEach((it) => {

      const val = Number(it.scheduled_value || 0);
      runningTotal += val;

      const row = document.createElement("div");

      row.className =
        "flex items-center justify-between bg-slate-50 border rounded p-2";

      row.innerHTML = `
        <div class="font-semibold text-slate-800">
          ${it.line_code || ""} ${it.description}
        </div>

        <div class="text-slate-700 font-semibold">
          ${money(val)}
        </div>
      `;

      list.appendChild(row);
    });

    const totalValue = Number(data.total || runningTotal);

    totalEl.innerHTML = `
      <div class="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3">
        <div class="text-xs uppercase text-emerald-700 font-semibold">
          Total Contract Value
        </div>

        <div class="text-xl font-bold text-emerald-900">
          ${money(totalValue)}
        </div>
      </div>
    `;

    if (invoiceBtn) invoiceBtn.style.display = "block";

  } catch (e) {

    list.innerHTML = `<div class="text-red-600">${e.message}</div>`;

  }
}


/* -------------------------------------------------------
   Preview Import
------------------------------------------------------- */

async function previewSovUpload() {

  const projectId = getProjectIdFromUrl();

  const fileEl = document.getElementById("sovFile");
  const previewEl = document.getElementById("sovPreview");

  if (!fileEl.files.length) {

    alert("Choose a file first");
    return;
  }

  const fd = new FormData();
  fd.append("file", fileEl.files[0]);

  previewEl.innerHTML = "Analyzing spreadsheet...";

  try {

    const res = await fetch(`/api/sov/preview-upload/${projectId}`, {
      method: "POST",
      headers: { "X-Org-Id": ORG_ID },
      body: fd
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || "Preview failed");

    const rows = (data.preview_items || [])
      .map(r => `
        <div class="flex justify-between border-b py-1 text-sm">
          <div>${r.line_code || ""} ${r.description}</div>
          <div>${money(r.scheduled_value)}</div>
        </div>
      `)
      .join("");

    previewEl.innerHTML = `
      <div class="border rounded p-3 bg-white">

        <div class="font-semibold text-slate-800">
          Import Preview
        </div>

        <div class="text-xs text-slate-500">
          Sheet: ${data.detected_sheet || "Unknown"} •
          Lines: ${data.items_count}
        </div>

        <div class="mt-2 font-bold">
          Parsed Total: ${money(data.parsed_total)}
        </div>

        <div class="text-xs ${
          data.checksum_ok ? "text-green-700" : "text-orange-700"
        }">
          ${data.checksum_ok ? "Checksum OK" : "Checksum mismatch"}
        </div>

        <div class="mt-3 max-h-60 overflow-auto">
          ${rows}
        </div>

      </div>
    `;

  } catch (e) {

    previewEl.innerHTML = `<div class="text-red-600">${e.message}</div>`;

  }
}


/* -------------------------------------------------------
   Upload SOV
------------------------------------------------------- */

async function uploadSov() {

  const projectId = getProjectIdFromUrl();

  const fileEl = document.getElementById("sovFile");
  const resultEl = document.getElementById("sovUploadResult");

  if (!fileEl.files.length) {

    alert("Choose a file first");
    return;
  }

  const fd = new FormData();
  fd.append("file", fileEl.files[0]);

  resultEl.innerHTML = "Uploading...";

  try {

    const res = await fetch(`/api/sov/upload/${projectId}`, {
      method: "POST",
      headers: { "X-Org-Id": ORG_ID },
      body: fd
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || "Upload failed");

    resultEl.innerHTML = `
      <div class="text-green-700 font-semibold">
        Parsed ${data.items_count} lines
      </div>

      <div>Parsed Total: ${money(data.parsed_total)}</div>
    `;

    await loadSov();

  } catch (e) {

    resultEl.innerHTML = `<div class="text-red-600">${e.message}</div>`;

  }
}


/* -------------------------------------------------------
   Create Pay Application
------------------------------------------------------- */

function createInvoice() {

  const projectId = getProjectIdFromUrl();

  window.location =
    `/projects/${projectId}/pay-apps/new`;

}


/* -------------------------------------------------------
   Button Bindings
------------------------------------------------------- */

const previewBtn = document.getElementById("previewSovBtn");
const uploadBtn = document.getElementById("uploadSovBtn");
const invoiceBtn = document.getElementById("createInvoiceBtn");

if (previewBtn) previewBtn.onclick = previewSovUpload;
if (uploadBtn) uploadBtn.onclick = uploadSov;
if (invoiceBtn) invoiceBtn.onclick = createInvoice;


/* -------------------------------------------------------
   Initial Load
------------------------------------------------------- */

loadSov();

});