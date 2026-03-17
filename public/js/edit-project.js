var editingProjectId = null;

function showEditProject(id) {
  editingProjectId = id;
  showPage('edit-project');
  loadEditProjectForm(id);
}

async function loadEditProjectForm(id) {
  try {
    var projects = await api('GET', '/projects');
    var p = projects.find(function(x) { return x.id === id; }) || {};
    document.getElementById('ep-name').value = p.name || '';
    document.getElementById('ep-number').value = p.number || '';
    document.getElementById('ep-owner').value = p.owner || '';
    document.getElementById('ep-contractor').value = p.contractor || '';
    document.getElementById('ep-architect').value = p.architect || '';
    document.getElementById('ep-contact-name').value = p.contact_name || '';
    document.getElementById('ep-contact-phone').value = p.contact_phone || '';
    document.getElementById('ep-contact-email').value = p.contact_email || '';
    document.getElementById('ep-area').value = p.building_area || '';
    document.getElementById('ep-contract').value = p.original_contract || '';
    document.getElementById('ep-contract-date').value = p.contract_date ? p.contract_date.split('T')[0] : '';
    document.getElementById('ep-est-date').value = p.est_date ? p.est_date.split('T')[0] : '';
    document.getElementById('ep-err').classList.add('hidden');
    document.getElementById('ep-success').classList.add('hidden');
  } catch(e) { alert('Error loading project: ' + e.message); }
}

async function saveEditProject() {
  if (!editingProjectId) return;
  var name = document.getElementById('ep-name').value.trim();
  var contract = document.getElementById('ep-contract').value.replace(/,/g, '');
  if (!name) { showErr('ep-err','Project name is required'); return; }
  if (!contract || isNaN(parseFloat(contract))) { showErr('ep-err','Valid contract amount is required'); return; }
  var contactName = document.getElementById('ep-contact-name').value;
  var contactPhone = document.getElementById('ep-contact-phone').value;
  var contactEmail = document.getElementById('ep-contact-email').value;
  var contact = [contactName, contactPhone, contactEmail].filter(Boolean).join(' - ');
  try {
    await api('PUT', '/projects/' + editingProjectId + '/full', {
      name: name,
      number: document.getElementById('ep-number').value,
      owner: document.getElementById('ep-owner').value,
      contractor: document.getElementById('ep-contractor').value,
      architect: document.getElementById('ep-architect').value,
      contact: contact,
      contact_name: contactName,
      contact_phone: contactPhone,
      contact_email: contactEmail,
      building_area: document.getElementById('ep-area').value,
      original_contract: parseFloat(contract),
      contract_date: document.getElementById('ep-contract-date').value || null,
      est_date: document.getElementById('ep-est-date').value || null
    });
    document.getElementById('ep-err').classList.add('hidden');
    document.getElementById('ep-success').classList.remove('hidden');
    setTimeout(function() { loadProject(editingProjectId); }, 1200);
  } catch(e) { showErr('ep-err', e.message); }
}
