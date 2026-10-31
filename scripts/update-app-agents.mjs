import fs from 'node:fs';

let code = fs.readFileSync('public/app.js', 'utf8');

// 1. Add agents state variables
if (!code.includes('let customAgents = [];')) {
  code = code.replace(
    'let attachedFile = null;\nlet selectedProjectFilter = null;',
    'let attachedFile = null;\nlet selectedProjectFilter = null;\nlet customAgents = [];\nlet activeAgentId = "core";'
  );
  console.log('✓ Added customAgents & activeAgentId variables');
}

// 2. Pass agent_id in api('/api/chat') call
if (!code.includes('agent_id: activeAgentId')) {
  code = code.replace(
    "body:JSON.stringify({messages,conversation_id:conversation})",
    "body:JSON.stringify({messages,conversation_id:conversation,agent_id:activeAgentId})"
  );
  console.log('✓ Passed agent_id in /api/chat payload');
}

// 3. Add loadAgents call in health()
if (!code.includes('await loadAgents();')) {
  code = code.replace(
    'await loadProjects();',
    'await loadProjects(); await loadAgents();'
  );
  console.log('✓ Added loadAgents() call in health()');
}

// 4. Append Agent Manager & Selector logic
const agentClientLogic = `
// ==========================================
// FEATURE MODULE: AGENTEN-MANAGER & SQUAD
// ==========================================
async function loadAgents() {
  if (!connected) return;
  try {
    const data = await api('/api/agents');
    if (data?.agents) {
      customAgents = data.agents;
      renderAgentsGrid();
      renderAgentDropdown();
      const active = customAgents.find(a => a.id === activeAgentId);
      if (active) updateActiveAgentUI(active);
    }
  } catch (err) {
    console.warn('Could not load agents:', err);
  }
}

function updateActiveAgentUI(agent) {
  if (!agent) return;
  activeAgentId = agent.id;
  if ($('chatActiveAvatar')) $('chatActiveAvatar').textContent = agent.avatar || '🤖';
  if ($('chatActiveName')) $('chatActiveName').textContent = agent.name || 'Philipps AI';
  if ($('chatActiveRole')) $('chatActiveRole').textContent = agent.role || 'Spezialist';
  if ($('input')) $('input').placeholder = \`Nachricht an \${agent.name} …\`;
}

function renderAgentDropdown() {
  const dropdown = $('agentPickerDropdown');
  if (!dropdown) return;
  dropdown.innerHTML = customAgents.map(a => \`
    <button type="button" class="agent-dropdown-item \${a.id === activeAgentId ? 'active' : ''}" data-agent-pick="\${esc(a.id)}">
      <span class="agent-dropdown-avatar">\${esc(a.avatar || '🤖')}</span>
      <div class="agent-dropdown-meta">
        <span class="agent-dropdown-name">\${esc(a.name)}</span>
        <span class="agent-dropdown-role">\${esc(a.role)}</span>
      </div>
    </button>
  \`).join('');

  dropdown.querySelectorAll('[data-agent-pick]').forEach(btn => {
    btn.onclick = () => {
      const found = customAgents.find(a => a.id === btn.dataset.agentPick);
      if (found) updateActiveAgentUI(found);
      dropdown.hidden = true;
    };
  });
}

function initAgentPicker() {
  const toggleBtn = $('agentSelectorBtn');
  const dropdown = $('agentPickerDropdown');
  if (!toggleBtn || !dropdown) return;

  toggleBtn.onclick = (e) => {
    e.stopPropagation();
    dropdown.hidden = !dropdown.hidden;
  };

  document.addEventListener('click', (e) => {
    if (!toggleBtn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.hidden = true;
    }
  });
}

function renderAgentsGrid() {
  const grid = $('agentsGrid');
  if (!grid) return;
  if (!customAgents.length) {
    grid.innerHTML = '<p class="muted">Keine Agenten geladen.</p>';
    return;
  }
  grid.innerHTML = customAgents.map(agent => \`
    <div class="agent-module-card glass">
      <div class="agent-module-top">
        <span class="agent-module-avatar">\${esc(agent.avatar || '🤖')}</span>
        <span class="agent-status-pill \${agent.status === 'active' ? 'active' : 'paused'}">
          \${agent.status === 'active' ? 'Aktiv' : 'Standby'}
        </span>
      </div>
      <h4 class="agent-module-name">\${esc(agent.name)}</h4>
      <p class="agent-module-role">\${esc(agent.role)}</p>
      <p class="agent-module-prompt">\${esc(agent.system_prompt)}</p>
      <div class="agent-module-actions">
        <button class="btn compact" type="button" data-agent-chat="\${esc(agent.id)}">
          <svg class="mini-icon" aria-hidden="true"><use href="#i-chat"></use></svg>
          <span>Chatten</span>
        </button>
        \${agent.is_default ? '' : \`
          <button class="secondary compact" type="button" data-agent-toggle="\${esc(agent.id)}">
            \${agent.status === 'active' ? 'Pausieren' : 'Aktivieren'}
          </button>
          <button class="icon-button danger-subtle" type="button" data-agent-del="\${esc(agent.id)}" title="Löschen">
            <svg aria-hidden="true" focusable="false"><use href="#i-trash"></use></svg>
          </button>
        \`}
      </div>
    </div>
  \`).join('');

  grid.querySelectorAll('[data-agent-chat]').forEach(btn => {
    btn.onclick = () => {
      const found = customAgents.find(a => a.id === btn.dataset.agentChat);
      if (found) {
        updateActiveAgentUI(found);
        go('chat');
      }
    };
  });

  grid.querySelectorAll('[data-agent-toggle]').forEach(btn => {
    btn.onclick = async () => {
      const found = customAgents.find(a => a.id === btn.dataset.agentToggle);
      if (!found) return;
      found.status = found.status === 'active' ? 'paused' : 'active';
      renderAgentsGrid();
      if (connected) {
        api('/api/agents', { method: 'POST', body: JSON.stringify(found) }).catch(console.warn);
      }
    };
  });

  grid.querySelectorAll('[data-agent-del]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.agentDel;
      if (!confirm('Diesen Agenten wirklich unwiderruflich löschen?')) return;
      customAgents = customAgents.filter(a => a.id !== id);
      renderAgentsGrid();
      renderAgentDropdown();
      if (connected) {
        api('/api/agents?id=' + encodeURIComponent(id), { method: 'DELETE' }).catch(console.warn);
      }
    };
  });
}

function initAgentDialog() {
  const openBtn = $('openCreateAgentBtn');
  const dialog = $('agentDialog');
  const cancelBtn = $('agentCancelBtn');
  const form = $('agentForm');
  if (!openBtn || !dialog || !form) return;

  openBtn.onclick = () => {
    $('agentNameInput').value = '';
    $('agentAvatarInput').value = '🤖';
    $('agentRoleInput').value = '';
    $('agentPromptInput').value = '';
    dialog.showModal();
  };

  cancelBtn.onclick = () => dialog.close();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = $('agentNameInput').value.trim();
    const avatar = $('agentAvatarInput').value.trim() || '🤖';
    const role = $('agentRoleInput').value.trim() || 'Spezialist';
    const prompt = $('agentPromptInput').value.trim();
    if (!name || !prompt) return;

    const newAgent = {
      id: crypto.randomUUID(),
      name,
      avatar,
      role,
      system_prompt: prompt,
      status: 'active',
      is_default: false
    };

    customAgents.push(newAgent);
    renderAgentsGrid();
    renderAgentDropdown();
    dialog.close();

    if (connected) {
      try {
        await api('/api/agents', { method: 'POST', body: JSON.stringify(newAgent) });
        await loadAgents();
      } catch (err) {
        alert('Fehler beim Speichern: ' + err.message);
      }
    }
  };
}

// Initialize Agent Manager & Selector on startup
initAgentPicker();
initAgentDialog();
renderAgentDropdown();
renderAgentsGrid();
`;

code += agentClientLogic;

fs.writeFileSync('public/app.js', code, 'utf8');
console.log('✓ Successfully added Agent Manager & Selector logic to public/app.js');
