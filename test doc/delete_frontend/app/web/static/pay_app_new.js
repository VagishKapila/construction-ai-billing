const ORG_ID = localStorage.getItem("org_id") || prompt("Enter Org ID");
if (ORG_ID) localStorage.setItem("org_id", ORG_ID);

function getProjectIdFromUrl() {
  const parts = window.location.pathname.split("/");
  return parts[2];
}

function getPayAppIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("pay_app_id");

  if (!id || id === "null" || id === "undefined") {
    return null;
  }

  return id;
}

const projectId = getProjectIdFromUrl();
let payAppId = getPayAppIdFromQuery();

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      "Content-Type": "application/json",
      "X-Org-Id": ORG_ID,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.detail || "API error");
  }

  return data;
}

function money(x) {
  return "$" + Number(x || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function ensurePayAppExists() {
  if (payAppId) return;

  console.log("Creating Pay App draft...");

  const created = await api(`/api/pay-apps/create/${projectId}`, {
    method: "POST",
    body: JSON.stringify({
      billing_type: "AIA",
      retainage_enabled: true,
      retainage_percent: 10
    })
  });

  payAppId = created.id;

  const url = `/projects/${projectId}/pay-apps/new?pay_app_id=${payAppId}`;
  window.history.replaceState({}, "", url);
}

async function loadPayApp() {
  if (!payAppId) return;

  const data = await api(`/api/pay-apps/${payAppId}`);

  document.getElementById("appNumber").innerText =
    `Pay App #${data.application_number}`;

  const tbody = document.getElementById("rows");
  tbody.innerHTML = "";

  data.lines.forEach(l => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td class="p-2">${l.code || ""}</td>
      <td class="p-2">${l.description}</td>
      <td class="p-2 text-right">${money(l.scheduled_value)}</td>
      <td class="p-2 text-right">${money(l.previous_completed)}</td>
      <td class="p-2 text-right">${money(l.this_period_completed)}</td>
      <td class="p-2 text-right">${money(l.stored_materials)}</td>
      <td class="p-2 text-right">${money(l.total_completed)}</td>
      <td class="p-2 text-right">${money(l.retainage)}</td>
      <td class="p-2 text-right">${money(l.balance_remaining)}</td>
    `;

    tbody.appendChild(tr);
  });

  document.getElementById("totalDue").innerText =
    money(data.totals.total_due_this_period);
}

async function init() {
  try {
    await ensurePayAppExists();
    await loadPayApp();
  } catch (e) {
    alert(e.message);
  }
}

init();