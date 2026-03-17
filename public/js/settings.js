let companySettings = {};

async function loadSettings() {
  try {
    companySettings = await api('GET', '/settings') || {};
    var cn = document.getElementById('set-company-name');
    var pt = document.getElementById('set-payment-terms');
    var dr = document.getElementById('set-default-ret');
    if (cn) cn.value = companySettings.company_name || '';
    if (pt) pt.value = companySettings.default_payment_terms || 'Due on receipt';
    if (dr) dr.value = companySettings.default_retainage || 10;
    if (companySettings.logo_filename) loadLogoPreview();
    if (companySettings.signature_filename) loadSigPreview();
  } catch(e) { console.log('No settings yet'); }
}

async function saveSettings() {
  var cn = document.getElementById('set-company-name');
  var pt = document.getElementById('set-payment-terms');
  var dr = document.getElementById('set-default-ret');
  try {
    companySettings = await api('POST', '/settings', {
      company_name: cn ? cn.value : '',
      default_payment_terms: pt ? pt.value : 'Due on receipt',
      default_retainage: dr ? parseFloat(dr.value) || 10 : 10
    });
    showSettingsMsg('Settings saved!');
  } catch(e) { alert('Error: ' + e.message); }
}

async function uploadLogo(input) {
  var file = input.files[0]; if (!file) return;
  var fd = new FormData(); fd.append('file', file);
  try {
    var r = await fetch('/api/settings/logo', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: fd });
    var data = await r.json();
    if (data.error) throw new Error(data.error);
    companySettings.logo_filename = data.logo_filename;
    loadLogoPreview();
    showSettingsMsg('Logo saved!');
  } catch(e) { alert('Logo error: ' + e.message); }
}

async function uploadSignature(input) {
  var file = input.files[0]; if (!file) return;
  var fd = new FormData(); fd.append('file', file);
  try {
    var r = await fetch('/api/settings/signature', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: fd });
    var data = await r.json();
    if (data.error) throw new Error(data.error);
    companySettings.signature_filename = data.signature_filename;
    loadSigPreview();
    showSettingsMsg('Signature saved!');
  } catch(e) { alert('Signature error: ' + e.message); }
}

function loadLogoPreview() {
  var url = '/api/settings/logo?token=' + token + '&t=' + Date.now();
  document.querySelectorAll('.logo-preview-img').forEach(function(el) { el.src = url; el.style.display = 'block'; });
  var aiaLogo = document.getElementById('aia-preview-logo');
  if (aiaLogo) aiaLogo.innerHTML = '<img src="' + url + '" style="width:100%;height:100%;object-fit:contain"/>';
}

function loadSigPreview() {
  var url = '/api/settings/signature?token=' + token + '&t=' + Date.now();
  document.querySelectorAll('.sig-preview-img').forEach(function(el) { el.src = url; el.style.display = 'block'; });
  var area = document.getElementById('sig-contractor-area');
  if (area) area.innerHTML = '<img src="' + url + '" style="max-height:40px;max-width:160px;display:block;margin:4px 0"/>';
}

function showSettingsMsg(msg) {
  var el = document.getElementById('settings-msg');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(function() { el.classList.add('hidden'); }, 3000);
}
