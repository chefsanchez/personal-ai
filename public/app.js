const $ = id => document.getElementById(id);
let isAdmin = false, connected = false, busy = false, accessVerified = false;
const names = {overview:'Übersicht',chat:'KI-Chat',learn:'Lernen & Wissen',help:'Hilfe & Installation',projects:'Projekte & Aufgaben',agents:'Agenten & Tools',memory:'Langzeitgedächtnis',files:'Dateien',automations:'Automatisierungen',usage:'Nutzung & Kosten',settings:'Einstellungen',users:'Benutzerverwaltung',profile:'Persönliches Profil & Privatsphäre',admin:'Betreiberverwaltung'};
const icons = {overview:'home',chat:'chat',learn:'spark',help:'phone',projects:'projects',memory:'memory',settings:'settings'};
function makeNav(id, short = false) {
  const keys = short 
    ? ['overview','chat','memory','projects','settings']
    : (isAdmin ? ['overview','chat','learn','memory','projects','help','settings'] : ['overview','chat','memory','projects','help','settings']);
  const labels = {overview:'Home',chat:'Chat',learn:'Lernen',memory:'Gedächtnis',projects:'Projekte',help:'Hilfe',settings:'Einstellungen'};
  $(id).innerHTML = keys.map(k => `<button data-view="${k}" aria-label="${names[k]}"><svg class="nav-icon" aria-hidden="true"><use href="#i-${icons[k]}"></use></svg><span class="nav-label">${labels[k]}</span></button>`).join('');
}
makeNav('nav'); makeNav('mobile', true);

function go(k) {
  if (!names[k]) return;
  if ((k === 'admin' || k === 'learn') && (!connected || !isAdmin)) return;
  document.body.dataset.view = k;
  document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x.id === k));
  document.querySelectorAll('button[data-view]').forEach(x => { x.classList.toggle('active', x.dataset.view === k); if (x.dataset.view === k) x.setAttribute('aria-current','page'); else x.removeAttribute('aria-current'); });
  $('title').textContent = names[k]; window.scrollTo({top:0,behavior:'smooth'});
  if (k === 'profile') loadProfile();
  if (k === 'admin') loadAdmin();
  if (k === 'memory' && isAdmin && $('masterMemoriesPanel') && !$('masterMemoriesPanel').hidden) loadMasterMemories();
}
document.addEventListener('click', e => { const button = e.target.closest('[data-view],[data-go]'); if (button) go(button.dataset.view || button.dataset.go); });
const get = key => { try { const value = JSON.parse(localStorage.getItem('pai_' + key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
const put = (key, value) => localStorage.setItem('pai_' + key, JSON.stringify(value));
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let projects = get('projects'), tasks = get('tasks'), memories = [], history = [];
let attachedFile = null;
let selectedProjectFilter = null;
let customAgents = [];
let activeAgentId = "core";
const legacy = get('memories');
let token = localStorage.getItem('pai_token') || '', termsVersion = '', currentUserId = '';
let adminSelectedUser = null, adminSelectionEpoch = 0;
let authEpoch = 0;
let conversations = [];
let conversation = localStorage.getItem('pai_conversation') || crypto.randomUUID();
localStorage.setItem('pai_conversation', conversation);
if ($('url')) $('url').value = window.location.origin;

function controls() {
  $('send').disabled = !connected || busy || !navigator.onLine;
  $('addMemory').disabled = !connected || busy || !navigator.onLine;
  if ($('quickMemorySubmit')) $('quickMemorySubmit').disabled = !connected || busy || !navigator.onLine;
  for (const id of ['save','logout','newChat','sideNewChat','deleteChat','check','reloadMemory','reloadMasterMemories','forgetToken']) {
    if ($(id)) $(id).disabled = busy;
  }
  if ($('saveProfileConsent')) $('saveProfileConsent').disabled = busy || !connected || !accessVerified || !navigator.onLine;
  if ($('profileConsent')) $('profileConsent').disabled = busy || !connected || !accessVerified;
  if ($('adminBlock')) $('adminBlock').disabled = busy || !connected || !isAdmin || !adminSelectedUser || adminSelectedUser.isAdmin || adminSelectedUser.status === 'blocked';
  if ($('adminUnblock')) $('adminUnblock').disabled = busy || !connected || !isAdmin || !adminSelectedUser || adminSelectedUser.status === 'active';
  document.querySelectorAll('[data-rm],[data-conversation],[data-admin-user],[data-admin-conv],[data-admin-delete],[data-master-del]').forEach(button => { button.disabled = busy; });
}

function updateProfileDisplay(status) {
  if ($('sideUserName')) $('sideUserName').textContent = status?.email || (status?.isAdmin ? 'Philipp (Betreiber)' : 'Philipps AI');
  if ($('sideUserRole')) $('sideUserRole').textContent = status?.isAdmin ? '👑 Master Admin' : (status?.email ? 'Angemeldeter Nutzer' : 'Dein persönlicher Raum');
  if ($('sideAvatar')) $('sideAvatar').textContent = status?.isAdmin ? '👑' : (status?.email ? status.email.charAt(0).toUpperCase() : 'P');
}

function clearPrivateViews() {
  memories = []; history = []; conversations = []; isAdmin = false;
  adminSelectedUser = null; adminSelectionEpoch++;
  render(); renderConversations(); $('messages').replaceChildren();
  if ($('adminNav')) $('adminNav').hidden = true;
  if ($('adminMasterWrap')) $('adminMasterWrap').hidden = true;
  if ($('masterMemoriesPanel')) $('masterMemoriesPanel').hidden = true;
  if ($('profileConsent')) $('profileConsent').checked = false;
  for (const id of ['profileContent','dailySummaries','adminUsers','adminConversations','adminMessages','adminMemories','masterMemoriesList']) {
    if ($(id)) { $(id).replaceChildren(); $(id).classList.add('empty'); }
  }
  if ($('adminUserTitle')) $('adminUserTitle').textContent = 'Noch kein Konto ausgewählt';
  if ($('adminStatus')) $('adminStatus').textContent = 'Betreiberanmeldung erforderlich.';
  if ($('profileStatus')) $('profileStatus').textContent = 'Persönliche Anmeldung erforderlich.';
  updateProfileDisplay(null);
  controls();
}

function renderFormattedText(container, text) {
  if (!text.includes('```') && !text.includes('`') && !text.includes('**')) {
    container.textContent = text;
    return;
  }
  const parts = text.split(/(```[\s\S]*?```)/g);
  for (const part of parts) {
    if (part.startsWith('```') && part.endsWith('```')) {
      const firstLineEnd = part.indexOf('\n');
      const lang = firstLineEnd > 3 ? part.slice(3, firstLineEnd).trim() : '';
      const code = firstLineEnd > 3 ? part.slice(firstLineEnd + 1, -3) : part.slice(3, -3);
      const wrap = document.createElement('div'); wrap.className = 'code-wrap';
      if (lang) {
        const langBadge = document.createElement('span'); langBadge.className = 'code-lang'; langBadge.textContent = lang;
        wrap.appendChild(langBadge);
      }
      const isRunnable = ['html', 'svg', 'xml'].includes((lang || '').toLowerCase()) || 
        (code.includes('<html') || code.includes('<!DOCTYPE') || (code.includes('<div') && code.includes('</')));
      if (isRunnable) {
        const previewBtn = document.createElement('button');
        previewBtn.className = 'preview-code-btn';
        previewBtn.type = 'button';
        previewBtn.textContent = '▶ Vorschau';
        previewBtn.onclick = () => openCodeSandbox(code);
        wrap.appendChild(previewBtn);
      }
      const copyBtn = document.createElement('button'); copyBtn.className = 'copy-code-btn'; copyBtn.type = 'button'; copyBtn.textContent = 'Kopieren';
      copyBtn.onclick = async () => {
        try {
          if (!navigator.clipboard) throw Error('Clipboard unavailable');
          await navigator.clipboard.writeText(code);
          copyBtn.textContent = '✓ Kopiert!';
          setTimeout(() => { copyBtn.textContent = 'Kopieren'; }, 2000);
        } catch { copyBtn.textContent = 'Kopieren nicht verfügbar'; }
      };
      wrap.appendChild(copyBtn);
      const pre = document.createElement('pre'); const codeElem = document.createElement('code');
      codeElem.textContent = code;
      pre.appendChild(codeElem);
      wrap.appendChild(pre);
      container.appendChild(wrap);
    } else if (part) {
      const span = document.createElement('span');
      span.innerHTML = esc(part)
        .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      container.appendChild(span);
    }
  }
}

let loadingNode = null;
function showLoading() {
  hideLoading();
  loadingNode = document.createElement('div'); loadingNode.className = 'msg loading-msg';
  loadingNode.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span><span class="loading-label">KI denkt nach …</span>';
  $('messages').appendChild(loadingNode); loadingNode.scrollIntoView({block:'nearest'});
}
function hideLoading() {
  if (loadingNode) { loadingNode.remove(); loadingNode = null; }
}

function extractChoices(text) {
  const choices = [];
  // Pattern 1: [1] Option or [A] Option or [Option text]
  const bracketMatches = [...text.matchAll(/\[([0-9A-Za-z]|.+?)\]\s*([^ \n\r][^\n\r]{1,80})/g)];
  if (bracketMatches.length >= 2) {
    for (const m of bracketMatches.slice(0, 6)) {
      const opt = (m[2] || m[1]).trim();
      if (opt && opt.length < 90 && !choices.includes(opt)) choices.push(opt);
    }
  }
  // Pattern 2: Numbered list items like "1. Option" or "1) Option"
  if (choices.length < 2) {
    const numMatches = [...text.matchAll(/(?:^|\n)\s*(?:[1-9]\.|\b[1-9]\))\s+([^\n\r]{2,80})/g)];
    if (numMatches.length >= 2) {
      for (const m of numMatches.slice(0, 5)) {
        const opt = m[1].trim();
        if (opt && opt.length < 80 && !choices.includes(opt)) choices.push(opt);
      }
    }
  }
  // Pattern 3: Letter list items like "A) Option" or "a. Option"
  if (choices.length < 2) {
    const letterMatches = [...text.matchAll(/(?:^|\n)\s*(?:[A-D]\)|\b[A-D]\.)\s+([^\n\r]{2,80})/g)];
    if (letterMatches.length >= 2) {
      for (const m of letterMatches.slice(0, 4)) {
        const opt = m[1].trim();
        if (opt && opt.length < 80 && !choices.includes(opt)) choices.push(opt);
      }
    }
  }
  return choices;
}

function getFollowUpSuggestions(content) {
  const lower = content.toLowerCase();
  if (lower.includes('code') || lower.includes('funktion') || lower.includes('const') || lower.includes('def ')) {
    return ['⚡ Code erklären', '🧪 Tests schreiben', '🚀 Code optimieren'];
  }
  if (lower.includes('schritt') || lower.includes('tipp') || lower.includes('anleitung')) {
    return ['💡 Nächster Schritt', '⚡ Zusammenfassen', '❓ Fragen klären'];
  }
  return ['💡 Mehr Details', '⚡ Schneller zusammenfassen', '🎯 Konkretes Beispiel'];
}

function message(content, role = 'assistant', isHistoryItem = false) {
  const msgRow = document.createElement('div');
  msgRow.className = 'msg-row ' + (role === 'user' ? 'user-row' : 'bot-row');

  if (role === 'assistant') {
    const avatar = document.createElement('div');
    avatar.className = 'bot-avatar';
    avatar.innerHTML = '<span class="avatar-spark">✦</span>';
    msgRow.appendChild(avatar);
  }

  const node = document.createElement('div');
  node.className = 'msg' + (role === 'user' ? ' user' : '');

  const thinkMatch = role === 'assistant' ? String(content).match(/^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/) : null;
  const mainContent = thinkMatch ? thinkMatch[2].trim() : content;

  if (thinkMatch) {
    const details = document.createElement('details'); details.className = 'think-bubble';
    const summary = document.createElement('summary'); summary.textContent = 'Gedankengang des Modells';
    const thinkText = document.createElement('div'); thinkText.className = 'think-text'; thinkText.textContent = thinkMatch[1].trim();
    details.append(summary, thinkText); node.appendChild(details);
    const textNode = document.createElement('div');
    renderFormattedText(textNode, mainContent);
    node.appendChild(textNode);
  } else if (role === 'assistant') {
    renderFormattedText(node, mainContent);
  } else {
    node.textContent = content;
  }

  // Interactive Multiple Choice Pills & Quick Reply Buttons for bot
  if (role === 'assistant') {
    const choices = extractChoices(mainContent);
    if (choices.length >= 2) {
      const choicesWrap = document.createElement('div');
      choicesWrap.className = 'choice-pills-row';
      const heading = document.createElement('span');
      heading.className = 'choice-kicker';
      heading.textContent = '🎯 Schnellauswahl:';
      choicesWrap.appendChild(heading);

      for (const choice of choices) {
        const pill = document.createElement('button');
        pill.className = 'choice-pill glass';
        pill.type = 'button';
        pill.innerHTML = `<span>${esc(choice)}</span><span class="pill-arrow">→</span>`;
        pill.onclick = () => {
          if (busy || !connected) return;
          $('input').value = choice;
          $('form').requestSubmit();
        };
        choicesWrap.appendChild(pill);
      }
      node.appendChild(choicesWrap);
    }

    // Message Actions Bar (1-Click Copy & Regenerate)
    const actionRow = document.createElement('div');
    actionRow.className = 'msg-actions-row';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action-btn';
    copyBtn.type = 'button';
    copyBtn.title = 'Nachricht kopieren';
    copyBtn.innerHTML = '<svg class="mini-icon" aria-hidden="true"><use href="#i-projects"></use></svg><span>Kopieren</span>';
    copyBtn.onclick = async () => {
      try {
        if (!navigator.clipboard) throw Error('Clipboard unavailable');
        await navigator.clipboard.writeText(mainContent);
        copyBtn.innerHTML = '<span class="check-mark">✓</span><span>Kopiert!</span>';
        setTimeout(() => {
          copyBtn.innerHTML = '<svg class="mini-icon" aria-hidden="true"><use href="#i-projects"></use></svg><span>Kopieren</span>';
        }, 2000);
      } catch {
        copyBtn.textContent = 'Kopieren nicht verfügbar';
      }
    };
    actionRow.appendChild(copyBtn);

    const regenBtn = document.createElement('button');
    regenBtn.className = 'msg-action-btn regen-btn';
    regenBtn.type = 'button';
    regenBtn.title = 'Antwort neu generieren';
    regenBtn.innerHTML = '<svg class="mini-icon" aria-hidden="true"><use href="#i-refresh"></use></svg><span>Neu generieren</span>';
    regenBtn.onclick = async () => {
      if (busy || !connected) return;
      const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
      if (!lastUserMsg) return;
      if (history.length && history[history.length - 1].role === 'assistant') {
        history.pop();
      }
      $('input').value = lastUserMsg.content;
      $('form').requestSubmit();
    };
    actionRow.appendChild(regenBtn);

    const speakBtn = document.createElement('button');
    speakBtn.className = 'msg-action-btn speak-btn';
    speakBtn.type = 'button';
    speakBtn.title = 'Antwort vorlesen';
    speakBtn.innerHTML = '<svg class="mini-icon" aria-hidden="true"><use href="#i-speaker"></use></svg><span>Vorlesen</span>';
    speakBtn.onclick = () => toggleSpeech(mainContent, speakBtn);
    actionRow.appendChild(speakBtn);
    node.appendChild(actionRow);

    // Smart Follow-up Suggestions
    const followUps = getFollowUpSuggestions(mainContent);
    const followUpWrap = document.createElement('div');
    followUpWrap.className = 'followup-chips-row';
    for (const f of followUps) {
      const chip = document.createElement('button');
      chip.className = 'followup-chip glass';
      chip.type = 'button';
      chip.textContent = f;
      chip.onclick = () => {
        if (busy || !connected) return;
        $('input').value = f.replace(/^[^\w\s]+\s*/, '');
        $('form').requestSubmit();
      };
      followUpWrap.appendChild(chip);
    }
    node.appendChild(followUpWrap);
  }

  msgRow.appendChild(node);
  $('messages').appendChild(msgRow);
  msgRow.scrollIntoView({ behavior: isHistoryItem ? 'auto' : 'smooth', block: 'nearest' });
}

function renderEmptyChatState() {
  const welcome = document.createElement('div');
  welcome.className = 'chat-welcome';
  welcome.innerHTML = `
    <span class="welcome-orb"></span>
    <h2>Ein Gedanke genügt.</h2>
    <p>Frag mich alles oder beginne ein neues Thema:</p>
    <div class="starter-chips-grid">
      <button class="starter-chip glass" type="button" data-starter="💡 Brainstorme 3 spannende Ideen für mich">
        <span class="starter-icon">💡</span>
        <span class="starter-label">Ideen brainstormen</span>
      </button>
      <button class="starter-chip glass" type="button" data-starter="📝 Formuliere diesen Gedanken prägnant und professionell: ">
        <span class="starter-icon">📝</span>
        <span class="starter-label">Text verbessern</span>
      </button>
      <button class="starter-chip glass" type="button" data-starter="⚡ Erkläre mir komplexen Code einfach und sauber">
        <span class="starter-icon">⚡</span>
        <span class="starter-label">Code erklären</span>
      </button>
      <button class="starter-chip glass" type="button" data-starter="🎯 Was sind heute die wichtigsten Prioritäten?">
        <span class="starter-icon">🎯</span>
        <span class="starter-label">Prioritäten setzen</span>
      </button>
    </div>
  `;
  welcome.querySelectorAll('[data-starter]').forEach(b => {
    b.onclick = () => {
      $('input').value = b.dataset.starter;
      $('input').focus();
      $('input').dispatchEvent(new Event('input'));
    };
  });
  $('messages').appendChild(welcome);
}

function renderHistory() {
  $('messages').replaceChildren();
  for (const item of history) message(item.content, item.role, true);
  if (!history.length) renderEmptyChatState();
}

function render() {
  $('pc').textContent = projects.length; $('tc').textContent = tasks.filter(t => !t.done).length;
  $('projectList').innerHTML = [...projects.map((p,i) => `<div class="panel"><b>Projekt:</b> ${esc(p)} <button class="secondary" data-rp="${i}">Löschen</button></div>`), ...tasks.map((t,i) => `<div class="panel"><label><input type="checkbox" data-task="${i}" ${t.done ? 'checked' : ''}> ${esc(t.name)}</label> <button class="secondary" data-rt="${i}">Löschen</button></div>`)].join('') || 'Noch keine Projekte oder Aufgaben.';
  document.querySelectorAll('[data-rp]').forEach(b => b.onclick = () => { projects.splice(+b.dataset.rp,1); put('projects',projects); render(); });
  document.querySelectorAll('[data-rt]').forEach(b => b.onclick = () => { tasks.splice(+b.dataset.rt,1); put('tasks',tasks); render(); });
  document.querySelectorAll('[data-task]').forEach(b => b.onchange = () => { tasks[+b.dataset.task].done = b.checked; put('tasks',tasks); render(); });
  $('memoryList').innerHTML = memories.map(m => `<div class="panel">${esc(m.content)} <button class="secondary" data-rm="${esc(m.id)}">Dauerhaft löschen</button></div>`).join('') || 'Keine D1-Erinnerungen geladen.';
  document.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
    if (busy || !connected) return;
    if (!confirm('Diese Erinnerung dauerhaft aus D1 löschen?')) return;
    busy = true; controls();
    try { await api('/api/memories', {method:'DELETE',body:JSON.stringify({id:b.dataset.rm})}); await loadMemories(); }
    catch (error) { $('memoryStatus').textContent = error.message; }
    finally { busy = false; controls(); }
  });
}

function renderConversations() {
  const list = $('conversationList');
  const sideList = $('sideThreadList');
  if (list) list.replaceChildren();
  if (sideList) sideList.replaceChildren();

  for (const item of conversations) {
    if (list) {
      const button = document.createElement('button'); button.className = 'conversation-row'; button.dataset.conversation = item.id;
      const title = document.createElement('strong'); title.textContent = item.title || 'Gespräch';
      const detail = document.createElement('span'); detail.textContent = `${item.message_count || 0} Nachrichten`;
      button.append(title,detail); button.disabled = busy;
      button.onclick = () => switchConversation(item.id); list.appendChild(button);
    }
    if (sideList) {
      const threadWrap = document.createElement('div');
      threadWrap.className = 'side-thread-item' + (item.id === conversation ? ' active' : '');
      threadWrap.dataset.conversation = item.id;

      const clickBtn = document.createElement('button');
      clickBtn.type = 'button';
      clickBtn.className = 'side-thread-btn';
      clickBtn.innerHTML = `<svg class="thread-icon" aria-hidden="true"><use href="#i-chat"></use></svg><span class="thread-title">${esc(item.title || 'Neuer Chat')}</span>`;
      clickBtn.disabled = busy;
      clickBtn.onclick = () => switchConversation(item.id);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'side-thread-del';
      delBtn.title = 'Chat dauerhaft löschen';
      delBtn.innerHTML = '<svg aria-hidden="true"><use href="#i-trash"></use></svg>';
      delBtn.disabled = busy;
      delBtn.onclick = async e => {
        e.stopPropagation();
        if (busy || !connected) return;
        if (!confirm('Diesen Chatverlauf dauerhaft aus D1 löschen?')) return;
        busy = true; controls();
        try {
          await api('/api/history?conversation_id=' + encodeURIComponent(item.id), { method: 'DELETE' });
          if (conversation === item.id) {
            conversation = crypto.randomUUID();
            localStorage.setItem('pai_conversation', conversation);
            history = [];
            renderHistory();
          }
          await loadConversations();
        } catch (err) {
          $('chatNotice').textContent = err.message;
        } finally {
          busy = false; controls();
        }
      };

      threadWrap.append(clickBtn, delBtn);
      sideList.appendChild(threadWrap);
    }
  }

  if (list && !conversations.length) {
    const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = connected ? 'Deine gespeicherten Gespräche erscheinen hier.' : 'Melde dich an, um deine Gespräche zu sehen.'; list.appendChild(empty);
  }
  if (sideList && !conversations.length) {
    const emptySide = document.createElement('div'); emptySide.className = 'side-threads-empty muted'; emptySide.textContent = 'Noch keine Chats gespeichert.'; sideList.appendChild(emptySide);
  }
}

async function loadConversations() { const data = await api('/api/conversations'); conversations = data.conversations; renderConversations(); }
async function switchConversation(id) {
  if (busy || !connected) return;
  busy = true; controls();
  try { const data = await api('/api/history?conversation_id=' + encodeURIComponent(id)); conversation = id; localStorage.setItem('pai_conversation',id); history = data.messages; renderHistory(); renderConversations(); go('chat'); }
  catch (error) { $('chatNotice').textContent = error.message; }
  finally { busy = false; controls(); }
}

async function api(path, options = {}) {
  const epoch = authEpoch;
  let response;
  try {
    response = await fetch(path, {...options, credentials:'same-origin', headers:{'Content-Type':'application/json', ...(token ? {Authorization:'Bearer ' + token} : {})}, signal:AbortSignal.timeout(70000)});
  } catch { throw Error('Verbindung unterbrochen oder Zeitlimit erreicht. Status prüfen, bevor du die Anfrage wiederholst.'); }
  if (!response.headers.get('Content-Type')?.includes('application/json')) throw Error('Anmeldung möglicherweise abgelaufen. Seite neu laden und erneut anmelden.');
  const data = await response.json();
  if (epoch !== authEpoch) throw Error('Anmeldung wurde geändert. Veraltete Antwort verworfen.');
  if (!response.ok) {
    if (response.status === 401 || data.code === 'ACCOUNT_BLOCKED' || data.code === 'TERMS_REQUIRED') {
      authEpoch++; connected = false; clearPrivateViews();
      if (data.code === 'TERMS_REQUIRED') { termsVersion = data.termsVersion; showTerms(); }
    }
    throw Object.assign(Error(data.error || 'HTTP ' + response.status), { code: data.code, status: response.status });
  }
  return data;
}

async function loadMemories() {
  const data = await api('/api/memories'); memories = data.memories; render();
  $('memoryStatus').textContent = `${memories.length} D1-Erinnerung(en) geladen (Anzeige maximal 100).`;
}

async function loadMasterMemories() {
  if (!connected || !isAdmin) return;
  const list = $('masterMemoriesList');
  const countLabel = $('masterMemoryCount');
  if (countLabel) countLabel.textContent = 'Lade alle Nutzer-Erinnerungen …';
  try {
    const data = await api('/api/admin/all-memories');
    const all = data.memories || [];
    if (countLabel) countLabel.textContent = `${all.length} globale Erinnerung(en) über alle Konten gefunden`;
    if (list) {
      if (!all.length) {
        list.innerHTML = '<div class="empty">Keine Erinnerungen in D1 vorhanden.</div>';
        return;
      }
      list.innerHTML = all.map(m => `
        <div class="master-memory-card glass">
          <div class="master-card-top">
            <span class="master-user-pill">👤 ${esc(m.user_label || m.session_id)}</span>
            <span class="master-time">${esc(m.created_at ? new Date(m.created_at).toLocaleString('de-DE') : '')}</span>
          </div>
          <p class="master-card-content">${esc(m.content)}</p>
          <div class="master-card-actions">
            <button type="button" class="danger-btn compact" data-master-del="${esc(m.id)}">
              <svg aria-hidden="true" focusable="false"><use href="#i-trash"/></svg>
              <span>1-Klick Löschen</span>
            </button>
          </div>
        </div>
      `).join('');
      list.querySelectorAll('[data-master-del]').forEach(btn => {
        btn.onclick = async () => {
          if (busy || !confirm('Diese Erinnerung wirklich unwiderruflich aus D1 löschen?')) return;
          busy = true; controls();
          try {
            await api('/api/admin/all-memories', { method: 'DELETE', body: JSON.stringify({ id: btn.dataset.masterDel }) });
            await loadMasterMemories();
            await loadMemories();
          } catch (err) {
            alert('Fehler beim Löschen: ' + err.message);
          } finally {
            busy = false; controls();
          }
        };
      });
    }
  } catch (err) {
    if (countLabel) countLabel.textContent = 'Fehler: ' + err.message;
  }
}

async function health() {
  busy = true; controls();
  $('health').textContent = 'Prüfe Worker und Verbindung …';
  try {
    // 1. Fetch token from localStorage or automatically from /api/auth/session
    if (!token) {
      token = localStorage.getItem('pai_token') || '';
    }
    if (!token && sessionStorage.getItem('pai_logged_out') !== 'true') {
      try {
        const sessionRes = await fetch('/api/auth/session', { credentials: 'same-origin' });
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          if (sessionData.token) {
            token = sessionData.token;
            localStorage.setItem('pai_token', token);
          }
        }
      } catch {}
    }
    const h = await api('/api/health');
    $('api').textContent = 'Erreichbar';
    const status = await api('/api/status');
    accessVerified = status.authMode === 'access';
    currentUserId = status.userId || '';
    termsVersion = status.termsVersion || '';
    if (accessVerified && status.termsAccepted === false) {
      clearPrivateViews(); $('manualConnection').hidden = true;
      $('connectionStatus').textContent = 'Angemeldet. Bitte lies zuerst die Nutzungsbedingungen.';
      $('chatNotice').textContent = 'Zustimmung zu den Nutzungsbedingungen erforderlich.';
      showTerms(); return;
    }
    isAdmin = Boolean(status.isAdmin);
    makeNav('nav'); makeNav('mobile', true);
    if ($('adminNav')) $('adminNav').hidden = !isAdmin;
    if ($('adminMasterWrap')) $('adminMasterWrap').hidden = !isAdmin;
    if ($('profileConsent')) $('profileConsent').checked = Boolean(status.profileConsent);
    $('manualConnection').hidden = true;
    connected = true;
    sessionStorage.removeItem('pai_logged_out');
    autoDetectTheme(status);
    updateProfileDisplay(status);
    $('connectionStatus').textContent = accessVerified ? 'Cloudflare Access geprüft. Automatische Verbindung aktiv.' : 'Automatisch verbunden. Dein persönlicher Raum ist bereit.';
    $('health').textContent = `${h.name} · Version ${h.version} · D1 erreichbar · OpenRouter (Qwen 2.5 72B) Online`;
    $('modelStatus').textContent = status.modelConfigured ? 'KI Online' : 'KI nicht konfiguriert';
    $('gpuStatus').textContent = status.modelConfigured ? 'Online (Qwen 2.5 72B)' : 'Nicht konfiguriert';
    $('systemStatus').textContent = 'SYSTEM BEREIT · CLOUDFLARE D1 & OPENROUTER AKTIV';
    $('sideStatus').textContent = 'D1 verbunden · KI Online';
    document.querySelectorAll('.status-dot').forEach(dot => dot.classList.add('active'));
    document.querySelectorAll('.connection-pill').forEach(pill => pill.classList.add('online'));
    $('chatNotice').textContent = 'Verbunden. Bereit für deine Gedanken.';
    await loadMemories(); await loadConversations(); await loadProjects(); await loadAgents();
    const data = await api('/api/history?conversation_id=' + encodeURIComponent(conversation)); history = data.messages; renderHistory();
  } catch (error) {
    connected = false; accessVerified = false; $('manualConnection').hidden = false;
    if ($('adminNav')) $('adminNav').hidden = true;
    if ($('adminMasterWrap')) $('adminMasterWrap').hidden = true;
    clearPrivateViews();
    $('health').textContent = error.message; $('connectionStatus').textContent = error.message;
    $('memoryStatus').textContent = 'D1-Erinnerungen konnten nicht geladen werden: ' + error.message;
    $('systemStatus').textContent = 'ANMELDUNG ODER VERBINDUNG PRÜFEN';
    $('sideStatus').textContent = 'Anmeldung oder Verbindung prüfen';
    $('chatNotice').textContent = error.message;
  } finally { busy = false; controls(); }
}

$('save').onclick = async () => {
  try {
    const target = new URL($('url').value.trim());
    if (target.origin !== window.location.origin) throw Error('Öffne die App direkt unter der Worker-URL. Tokens werden nur an dieselbe Website gesendet.');
    sessionStorage.removeItem('pai_logged_out');
    authEpoch++; connected = false; clearPrivateViews();
    token = $('app-token').value.trim();
    $('app-token').value = '';
    if (token) localStorage.setItem('pai_token', token);
    await health();
  } catch (error) { $('connectionStatus').textContent = error.message; }
};

$('forgetToken').onclick = () => {
  localStorage.removeItem('pai_token');
  token = '';
  $('connectionStatus').textContent = 'Browser-Token entfernt. Bitte Seite neu laden oder manuell verbinden.';
};

$('logout').onclick = () => {
  const accessLogout = accessVerified;
  authEpoch++; token = ''; connected = false; accessVerified = false; currentUserId = '';
  localStorage.removeItem('pai_token');
  sessionStorage.setItem('pai_logged_out', 'true');
  clearPrivateViews();
  $('manualConnection').hidden = false;
  if (accessLogout) window.location.assign('/cdn-cgi/access/logout');
  else {
    $('connectionStatus').textContent = 'Abgemeldet. Token aus dem Arbeitsspeicher entfernt.';
    $('chatNotice').textContent = 'Abgemeldet.';
  }
};

$('check').onclick = health;
$('reloadMemory').onclick = () => loadMemories().catch(error => { $('memoryStatus').textContent = error.message; });

if ($('quickMemoryForm')) {
  $('quickMemoryForm').onsubmit = async event => {
    event.preventDefault();
    const val = $('quickMemoryInput').value.trim();
    if (!val || busy || !connected) return;
    busy = true; controls();
    try {
      await api('/api/memories', { method: 'POST', body: JSON.stringify({ content: val }) });
      $('quickMemoryInput').value = '';
      await loadMemories();
    } catch (error) {
      $('memoryStatus').textContent = 'Nicht als gespeichert bestätigt: ' + error.message;
    } finally {
      busy = false; controls();
    }
  };
}

if ($('toggleMasterMemories')) {
  $('toggleMasterMemories').onclick = () => {
    const panel = $('masterMemoriesPanel');
    if (!panel) return;
    const willShow = panel.hidden;
    panel.hidden = !willShow;
    if (willShow) loadMasterMemories();
  };
}

if ($('reloadMasterMemories')) {
  $('reloadMasterMemories').onclick = () => loadMasterMemories();
}

$('addProject').onclick = async () => { const value = await ask('Neues Projekt','Projektname',200); if(value?.trim()) { projects.push(value.trim()); put('projects',projects); render(); } };
$('addTask').onclick = async () => { const value = await ask('Neue Aufgabe','Was möchtest du erledigen?',500); if(value?.trim()) { tasks.push({name:value.trim(),done:false}); put('tasks',tasks); render(); } };
$('addMemory').onclick = async () => {
  if (busy || !connected) return;
  const value = await ask('Erinnerung speichern','Was soll sich deine KI dauerhaft merken?',4000); if (!value?.trim() || busy || !connected) return;
  busy = true; controls();
  try { await api('/api/memories', {method:'POST',body:JSON.stringify({content:value.trim()})}); await loadMemories(); }
  catch (error) { $('memoryStatus').textContent = 'Nicht als gespeichert bestätigt: ' + error.message; }
  finally { busy = false; controls(); }
};

async function ask(title, label, limit) {
  const dialog = $('entryDialog');
  if (!dialog) return prompt(label);
  $('entryTitle').textContent = title;
  const field = $('entryValue'); field.value = ''; field.maxLength = limit;
  dialog.querySelector('label[for="entryValue"]').textContent = label;
  return new Promise(resolve => {
    const close = () => { resolve(dialog.returnValue === 'save' ? field.value : null); dialog.removeEventListener('close',close); };
    dialog.addEventListener('close',close); dialog.returnValue = ''; dialog.showModal(); field.focus();
  });
}

function download(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)], {type:'application/json'}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}
$('exportMemory').onclick = () => download('philipps-ai-erinnerungen.json', memories);
$('legacyMemory').textContent = legacy.length ? `${legacy.length} alte Erinnerung(en) liegen nur in diesem Browser. Sie bleiben erhalten und werden nicht automatisch hochgeladen. Exportieren und gewünschte Fakten einzeln in D1 übernehmen.` : '';
$('exportLegacy').hidden = !legacy.length;
$('exportLegacy').onclick = () => download('philipps-ai-alte-browser-erinnerungen.json', legacy);

function startNewChat() {
  conversation = crypto.randomUUID();
  localStorage.setItem('pai_conversation', conversation);
  history = [];
  renderHistory();
  renderConversations();
  go('chat');
  if ($('input')) $('input').focus();
}

$('newChat').onclick = startNewChat;
if ($('sideNewChat')) $('sideNewChat').onclick = startNewChat;

$('deleteChat').onclick = async () => {
  if (busy || !connected || !confirm('Diesen Chatverlauf dauerhaft aus D1 löschen? Erinnerungen bleiben erhalten.')) return;
  busy = true; controls();
  try { await api('/api/history?conversation_id=' + encodeURIComponent(conversation), {method:'DELETE'}); history = []; renderHistory(); await loadConversations(); }
  catch (error) { $('chatNotice').textContent = error.message; }
  finally { busy = false; controls(); }
};

$('form').onsubmit = async event => {
  event.preventDefault(); const text = $('input').value.trim(); if (!text || busy || !connected) return;
  let fullText = text;
  if (attachedFile) {
    fullText = `[Angehängtes Dokument: ${attachedFile.name}]` + '\n```\n' + attachedFile.content.slice(0, 15000) + '\n```\n\n' + text;
    clearAttachment();
  }
  busy = true; controls(); message(fullText,'user'); $('input').value = ''; $('input').style.height = 'auto';
  if ($('send')) $('send').classList.remove('has-text');
  showLoading();
  try {
    const messages = [...history.map(({role,content}) => ({role,content})).slice(-28),{role:'user',content:fullText || text}];
    while (messages.length > 1 && messages.reduce((n,m) => n + m.content.length,0) > 48000) messages.splice(0,Math.min(2,messages.length-1));
    const data = await api('/api/chat', {method:'POST',body:JSON.stringify({messages,conversation_id:conversation,agent_id:activeAgentId})});
    const answer = data.choices[0].message.content;
    hideLoading();
    history = [...messages,{role:'assistant',content:answer}]; message(answer);
    $('modelStatus').textContent = 'KI Online'; $('gpuStatus').textContent = 'Online (Qwen 2.5 72B)';
    $('chatNotice').textContent = data.warning || 'Antwort erhalten. Chatverlauf in D1 gespeichert.';
    if (data.historySaved) loadConversations().catch(() => {});
  } catch (error) {
    hideLoading();
    message('Keine bestätigte KI-Antwort: ' + error.message);
    $('input').value = text; $('modelStatus').textContent = 'KI-Anfrage fehlgeschlagen';
    $('chatNotice').textContent = 'Anfrage fehlgeschlagen: ' + error.message;
  } finally { hideLoading(); busy = false; controls(); }
};

$('input').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (!busy && connected && $('input').value.trim()) $('form').requestSubmit();
  }
});

$('input').addEventListener('input', () => {
  $('input').style.height = 'auto';
  $('input').style.height = Math.min($('input').scrollHeight, 140) + 'px';
  const hasContent = Boolean($('input').value.trim());
  if ($('send')) $('send').classList.toggle('has-text', hasContent);
});

if ($('file')) $('file').onchange = event => { $('fileStatus').textContent = `${event.target.files.length} Datei(en) ausgewählt – nicht hochgeladen.`; };
document.querySelectorAll('[data-color]').forEach(button => button.onclick = () => { document.documentElement.style.setProperty('--accent',button.dataset.color); localStorage.setItem('pai_color',button.dataset.color); });
if (localStorage.getItem('pai_color')) document.documentElement.style.setProperty('--accent',localStorage.getItem('pai_color'));

const applyTheme = (theme, manual = false) => {
  if (!['default','stealth-carbon','m-power','syndicate-emerald','cyberpunk-amber','bmw-520i','ultra-workstation',''].includes(theme || '')) theme = 'default';
  const activeTheme = (!theme || theme === 'default') ? '' : theme;
  if (!activeTheme) {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem('pai_theme');
  } else {
    document.documentElement.dataset.theme = activeTheme;
    localStorage.setItem('pai_theme', activeTheme);
  }
  if (manual) localStorage.setItem('pai_theme_manual', 'true');
  const badge = $('themeBadge');
  if (badge) {
    if (activeTheme === 'bmw-520i') {
      badge.textContent = '520i HYBRID';
      badge.title = 'BMW 520i Hybrid Cockpit';
      badge.hidden = false;
    } else if (activeTheme === 'ultra-workstation') {
      badge.textContent = 'WORKSTATION';
      badge.title = 'Owner Ultra Workstation PC';
      badge.hidden = false;
    } else if (activeTheme === 'stealth-carbon') {
      badge.textContent = 'STEALTH';
      badge.title = 'Stealth Carbon OLED Cockpit';
      badge.hidden = false;
    } else if (activeTheme === 'm-power') {
      badge.textContent = 'M-POWER';
      badge.title = 'M-Performance Motorsport Cockpit';
      badge.hidden = false;
    } else if (activeTheme === 'syndicate-emerald') {
      badge.textContent = 'CASH VAULT';
      badge.title = 'Syndicate Emerald Vault Cockpit';
      badge.hidden = false;
    } else if (activeTheme === 'cyberpunk-amber') {
      badge.textContent = 'AMBER';
      badge.title = 'Cyberpunk Amber Terminal Cockpit';
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }
  document.querySelectorAll('[data-theme-btn]').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.themeBtn || 'default') === (activeTheme || 'default'));
  });
};

const autoDetectTheme = (status) => {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const forcedTheme = urlParams.get('theme');
    if (forcedTheme) {
      applyTheme(forcedTheme, true);
      return;
    }
    if (localStorage.getItem('pai_theme_manual') === 'true') {
      applyTheme(localStorage.getItem('pai_theme') || 'default', false);
      return;
    }
    const email = (status?.email || '').toLowerCase();
    const userId = (status?.userId || '').toLowerCase();
    const queryUser = (urlParams.get('user') || '').toLowerCase();
    if (email.includes('erik') || userId.includes('erik') || queryUser.includes('erik')) {
      applyTheme('bmw-520i', false);
    } else if (status?.isAdmin) {
      applyTheme('ultra-workstation', false);
    } else {
      applyTheme('default', false);
    }
  } catch {
    applyTheme(localStorage.getItem('pai_theme') || 'default', false);
  }
};

document.querySelectorAll('[data-theme-btn]').forEach(btn => {
  btn.onclick = () => applyTheme(btn.dataset.themeBtn, true);
});
autoDetectTheme();

window.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
    event.preventDefault();
    const themes = ['default', 'stealth-carbon', 'm-power', 'syndicate-emerald', 'cyberpunk-amber', 'bmw-520i', 'ultra-workstation'];
    const current = document.documentElement.dataset.theme || 'default';
    const next = themes[(themes.indexOf(current) + 1) % themes.length];
    applyTheme(next, true);
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    go('chat'); if ($('input')) $('input').focus();
  }
});

if ($('entryCancel')) $('entryCancel').onclick = () => $('entryDialog').close('cancel');
if ($('entryForm')) $('entryForm').onsubmit = event => { event.preventDefault(); $('entryDialog').close('save'); };
if ($('exportChat')) $('exportChat').onclick = () => download('philipps-ai-chat.json', {conversation_id:conversation,messages:history});

// --- Gerätedetektion & Gamified PWA Install Quest ---
function detectDevice() {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  
  const urlParam = new URLSearchParams(window.location.search).get('device')?.toLowerCase();
  if (urlParam === 'iphone') return { type: 'ios', model: 'iphone', label: '📱 iPhone erkannt', isMobile: true };
  if (urlParam === 'ipad') return { type: 'ios', model: 'ipad', label: '📱 iPad erkannt', isMobile: true };
  if (urlParam === 'samsung') return { type: 'android', model: 'samsung', label: '📱 Samsung erkannt', isMobile: true };
  if (urlParam === 'pixel') return { type: 'android', model: 'pixel', label: '📱 Pixel erkannt', isMobile: true };
  if (urlParam === 'mac') return { type: 'desktop', model: 'mac', label: '🖥️ Mac/PC Studio', isMobile: false };
  if (urlParam === 'pc' || urlParam === 'desktop') return { type: 'desktop', model: 'pc', label: '🖥️ Mac/PC Studio', isMobile: false };

  const isIPad = /iPad/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const isIPhone = /iPhone|iPod/i.test(ua);
  if (isIPhone) return { type: 'ios', model: 'iphone', label: '📱 iPhone erkannt', isMobile: true };
  if (isIPad) return { type: 'ios', model: 'ipad', label: '📱 iPad erkannt', isMobile: true };

  if (/Android/i.test(ua)) {
    if (/Samsung|SM-[A-Z0-9]+/i.test(ua)) return { type: 'android', model: 'samsung', label: '📱 Samsung erkannt', isMobile: true };
    if (/Pixel/i.test(ua)) return { type: 'android', model: 'pixel', label: '📱 Pixel erkannt', isMobile: true };
    return { type: 'android', model: 'android', label: '📱 Samsung erkannt', isMobile: true };
  }

  if (/Macintosh|Mac OS X/i.test(ua)) return { type: 'desktop', model: 'mac', label: '🖥️ Mac/PC Studio', isMobile: false };
  if (/Windows|Win32|Win64|Linux|X11/i.test(ua)) return { type: 'desktop', model: 'pc', label: '🖥️ Mac/PC Studio', isMobile: false };

  if (window.innerWidth <= 800 && maxTouchPoints > 0) return { type: 'mobile', model: 'mobile', label: '📱 iPhone erkannt', isMobile: true };
  return { type: 'desktop', model: 'pc', label: '🖥️ Mac/PC Studio', isMobile: false };
}

const currentDevice = detectDevice();
const isStandaloneMode = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true || document.referrer.includes('android-app://');

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if ($('questNativeWrap')) $('questNativeWrap').hidden = false;
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  if ($('questNativeWrap')) $('questNativeWrap').hidden = true;
  completeQuest(true);
});

let questSteps = [true, true, false];
try {
  const saved = localStorage.getItem('pai_quest_steps');
  if (saved) questSteps = JSON.parse(saved);
} catch {}
if (localStorage.getItem('pai_quest_completed') === 'true') {
  questSteps = [true, true, true];
}

function updateQuestProgressUI() {
  const doneCount = questSteps.filter(Boolean).length;
  let percent = 20;
  let progressText = 'Fortschritt: [□□□□□] 20% XP';
  if (doneCount === 1) { percent = 40; progressText = 'Fortschritt: [■■□□□] 40% XP'; }
  else if (doneCount === 2) { percent = 60; progressText = 'Fortschritt: [■■■□□] 60% XP'; }
  else if (doneCount >= 3) { percent = 100; progressText = 'Fortschritt: [■■■■■] 100% XP'; }

  if ($('questProgressText')) $('questProgressText').textContent = progressText;
  if ($('questProgressBar')) $('questProgressBar').style.width = percent + '%';
  if ($('questBannerProgressText')) $('questBannerProgressText').textContent = progressText;
  if ($('questBannerProgressBar')) $('questBannerProgressBar').style.width = percent + '%';
  if ($('questStatusLevel')) $('questStatusLevel').textContent = doneCount >= 3 ? 'MAX' : `LVL ${doneCount + 1}`;

  document.querySelectorAll('.quest-mission-item').forEach((item, idx) => {
    item.classList.toggle('completed', Boolean(questSteps[idx]));
    const check = item.querySelector('.mission-check');
    if (check) check.textContent = questSteps[idx] ? '✓' : '';
  });
}

function launchConfetti() {
  const container = $('questConfetti');
  if (!container) return;
  container.innerHTML = '';
  const emojis = ['🪙', '💎', '✨', '💵', '🪙', '💎', '🟢', '⭐'];
  for (let i = 0; i < 36; i++) {
    const span = document.createElement('span');
    span.className = 'confetti-particle';
    span.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    const left = Math.random() * 92 + 4;
    const dur = 1.8 + Math.random() * 1.4;
    const delay = Math.random() * 0.35;
    const rot = Math.floor(Math.random() * 360);
    const size = 16 + Math.floor(Math.random() * 16);
    span.style.cssText = `left:${left}%; animation-duration:${dur}s; animation-delay:${delay}s; font-size:${size}px; --rot:${rot}deg;`;
    container.appendChild(span);
  }
  setTimeout(() => { container.innerHTML = ''; }, 3800);
}

function completeQuest(silent = false) {
  questSteps = [true, true, true];
  localStorage.setItem('pai_quest_completed', 'true');
  localStorage.setItem('pai_quest_steps', JSON.stringify(questSteps));
  updateQuestProgressUI();
  if ($('questCelebration')) $('questCelebration').hidden = false;
  if ($('questCompleteBtn')) {
    $('questCompleteBtn').disabled = true;
    $('questCompleteBtn').innerHTML = '<span>🏆 Quest gemeistert!</span>';
  }
  if (!silent) launchConfetti();
}

function snoozeQuest() {
  localStorage.setItem('pai_quest_dismissed', 'true');
  if ($('installQuestBanner')) $('installQuestBanner').hidden = true;
  if ($('installGuide')) $('installGuide').close();
}

function openQuestModal() {
  const dialog = $('installGuide');
  if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
}

function renderMissions() {
  const container = $('questMissions');
  if (!container) return;
  let missions = [];
  if (currentDevice.type === 'ios') {
    missions = [
      { id: 0, text: 'Mission 1: Tippe unten auf den Teilen-Button ⎋ (Share-Icon)', arrow: true },
      { id: 1, text: "Mission 2: Scrolle kurz nach unten und wähle 'Zum Home-Bildschirm' 📲", arrow: false },
      { id: 2, text: 'Mission 3: Starte Philipps AI direkt vom Homescreen für pure 120 FPS Liquid Glass Power!', arrow: false }
    ];
  } else if (currentDevice.type === 'android') {
    missions = [
      { id: 0, text: "Mission 1: Klicke auf '🚀 Jetzt als App installieren' (oder im Menü ⋮)", arrow: false },
      { id: 1, text: 'Mission 2: Bestätige die Installation im Browser-Dialog 📲', arrow: false },
      { id: 2, text: 'Mission 3: Starte Philipps AI direkt vom Homescreen für pure 120 FPS Liquid Glass Power!', arrow: false }
    ];
    if (deferredInstallPrompt && $('questNativeWrap')) $('questNativeWrap').hidden = false;
  } else {
    missions = [
      { id: 0, text: 'Mission 1: Klicke oben auf das Installations-Symbol ⊕ in der Adressleiste', arrow: false },
      { id: 1, text: 'Mission 2: Bestätige die App-Installation im Browser-Popup 🖥️', arrow: false },
      { id: 2, text: 'Mission 3: Starte Philipps AI als Desktop-App für pure 120 FPS Liquid Glass Power!', arrow: false }
    ];
  }

  container.innerHTML = missions.map(m => `
    <div class="quest-mission-item ${questSteps[m.id] ? 'completed' : ''}" data-mission="${m.id}" role="checkbox" aria-checked="${Boolean(questSteps[m.id])}" tabindex="0">
      <span class="mission-check">${questSteps[m.id] ? '✓' : ''}</span>
      <div class="mission-body">
        <p class="mission-title">${esc(m.text)}${m.arrow ? '<span class="quest-pulse-arrow" aria-hidden="true">⬇️</span>' : ''}</p>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-mission]').forEach(elem => {
    const toggle = () => {
      const idx = +elem.dataset.mission;
      questSteps[idx] = !questSteps[idx];
      localStorage.setItem('pai_quest_steps', JSON.stringify(questSteps));
      if (questSteps.every(Boolean)) localStorage.setItem('pai_quest_completed', 'true');
      updateQuestProgressUI();
    };
    elem.onclick = toggle;
    elem.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
  });
}

function initDeviceAndQuest() {
  if ($('devicePillText')) $('devicePillText').textContent = currentDevice.label;
  if ($('devicePill')) $('devicePill').onclick = openQuestModal;

  const standalone = isStandaloneMode();
  const isMobile = currentDevice.isMobile || window.innerWidth <= 800;
  const isDismissed = localStorage.getItem('pai_quest_dismissed') === 'true';

  if ($('installQuestBanner')) {
    $('installQuestBanner').hidden = !(isMobile && !standalone && !isDismissed);
  }

  renderMissions();
  updateQuestProgressUI();

  if (localStorage.getItem('pai_quest_completed') === 'true') {
    if ($('questCelebration')) $('questCelebration').hidden = false;
    if ($('questCompleteBtn')) {
      $('questCompleteBtn').disabled = true;
      $('questCompleteBtn').innerHTML = '<span>🏆 Quest gemeistert!</span>';
    }
  }

  if ($('questBannerOpenBtn')) $('questBannerOpenBtn').onclick = openQuestModal;
  if ($('questBannerDismissBtn')) $('questBannerDismissBtn').onclick = snoozeQuest;
  if ($('questCloseBtn')) $('questCloseBtn').onclick = () => $('installGuide')?.close();
  if ($('questCompleteBtn')) $('questCompleteBtn').onclick = () => completeQuest(false);
  if ($('questSnoozeBtn')) $('questSnoozeBtn').onclick = snoozeQuest;
  if ($('questNativeBtn')) {
    $('questNativeBtn').onclick = async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') completeQuest(false);
        deferredInstallPrompt = null;
      } else {
        alert('Tippe im Browser-Menü (oben rechts ⋮) auf "App installieren"!');
      }
    };
  }
  document.querySelectorAll('[data-install]').forEach(b => { b.onclick = openQuestModal; });
}

function viewport() {
  const height = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty('--viewport-height',height + 'px');
  document.body.classList.toggle('keyboard-open',window.innerHeight - height > 120);
}
window.visualViewport?.addEventListener('resize',viewport); window.addEventListener('resize',viewport); viewport();

function networkStatus() {
  if ($('offlineBanner')) $('offlineBanner').hidden = navigator.onLine;
  controls();
}
window.addEventListener('online',networkStatus); window.addEventListener('offline',networkStatus); networkStatus();
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});

async function loadProfile() {
  if (!connected) return;
  try {
    const data = await api('/api/profile');
    if ($('profileConsent')) $('profileConsent').checked = Boolean(data.consentEnabled);
    if ($('profileStatus')) $('profileStatus').textContent = data.consentEnabled ? 'Einwilligung erteilt. Profile und Zusammenfassungen werden gespeichert.' : 'Einwilligung nicht erteilt.';
    if ($('profileContent')) {
      $('profileContent').textContent = data.profile?.content || 'Noch kein Profil abgeleitet.';
      $('profileContent').classList.toggle('empty', !data.profile);
    }
    if ($('dailySummaries')) {
      $('dailySummaries').innerHTML = (data.summaries || []).map(s => `<div class="panel"><strong>${esc(s.date)}</strong>: ${esc(s.content)}</div>`).join('') || 'Noch keine Tageszusammenfassungen.';
      $('dailySummaries').classList.toggle('empty', !(data.summaries && data.summaries.length));
    }
  } catch (error) {
    if ($('profileStatus')) $('profileStatus').textContent = error.message;
  }
}

if ($('saveProfileConsent')) {
  $('saveProfileConsent').onclick = async () => {
    if (!connected || busy) return;
    busy = true; controls();
    try {
      const enabled = $('profileConsent').checked;
      await api('/api/profile/consent', { method: 'POST', body: JSON.stringify({ enabled }) });
      await loadProfile();
    } catch (error) {
      if ($('profileStatus')) $('profileStatus').textContent = error.message;
    } finally {
      busy = false; controls();
    }
  };
}

async function loadAdmin() {
  if (!connected) return;
  try {
    $('adminStatus').textContent = 'Lade Nutzerkonten …';
    const data = await api('/api/admin/users');
    $('adminStatus').textContent = `${data.users.length} Konto/Konten geladen.`;
    const container = $('adminUsers');
    container.classList.toggle('empty', !data.users.length);
    container.innerHTML = data.users.map(u => `<button class="admin-user-btn" data-admin-user="${esc(u.id)}"><strong>${esc(u.email || u.display_name || u.id)}</strong><small>Status: ${esc(u.status)} · ${u.conversation_count} Chats · ${u.memory_count} Erinnerungen</small></button>`).join('') || 'Keine Nutzerkonten gefunden.';
    container.querySelectorAll('[data-admin-user]').forEach(btn => {
      btn.onclick = () => selectAdminUser(data.users.find(u => u.id === btn.dataset.adminUser));
    });
  } catch (error) {
    $('adminStatus').textContent = error.message;
  }
}

async function selectAdminUser(user) {
  if (!user) return;
  adminSelectedUser = user;
  $('adminUserTitle').textContent = user.email || user.display_name || user.id;
  $('adminBlock').disabled = user.status === 'blocked';
  $('adminUnblock').disabled = user.status === 'active';
  try {
    const [convData, memData] = await Promise.all([
      api(`/api/admin/users/${encodeURIComponent(user.id)}/conversations`),
      api(`/api/admin/users/${encodeURIComponent(user.id)}/memories`)
    ]);
    const convBox = $('adminConversations');
    convBox.classList.toggle('empty', !convData.conversations.length);
    convBox.innerHTML = convData.conversations.map(c => `<button data-admin-conv="${esc(c.id)}"><strong>${esc(c.title || 'Gespräch')}</strong><small>${c.message_count} Nachrichten</small></button>`).join('') || 'Keine Gespräche vorhanden.';
    convBox.querySelectorAll('[data-admin-conv]').forEach(b => {
      b.onclick = async () => {
        const histData = await api(`/api/admin/users/${encodeURIComponent(user.id)}/history?conversation_id=${encodeURIComponent(b.dataset.adminConv)}`);
        const msgBox = $('adminMessages');
        msgBox.classList.toggle('empty', !histData.messages.length);
        msgBox.innerHTML = histData.messages.map(m => `<div class="msg ${m.role === 'user' ? 'user' : ''}">${esc(m.content)}</div>`).join('') || 'Keine Nachrichten.';
      };
    });
    const memBox = $('adminMemories');
    memBox.classList.toggle('empty', !memData.memories.length);
    memBox.innerHTML = memData.memories.map(m => `<div class="panel">${esc(m.content)}</div>`).join('') || 'Keine Erinnerungen.';
  } catch (error) {
    $('adminStatus').textContent = error.message;
  }
}

if ($('adminBlock')) {
  $('adminBlock').onclick = async () => {
    if (!adminSelectedUser || busy) return;
    busy = true; controls();
    try {
      await api(`/api/admin/users/${encodeURIComponent(adminSelectedUser.id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'blocked' }) });
      await loadAdmin();
      if (adminSelectedUser) selectAdminUser({ ...adminSelectedUser, status: 'blocked' });
    } catch (e) { $('adminStatus').textContent = e.message; }
    finally { busy = false; controls(); }
  };
}

if ($('adminUnblock')) {
  $('adminUnblock').onclick = async () => {
    if (!adminSelectedUser || busy) return;
    busy = true; controls();
    try {
      await api(`/api/admin/users/${encodeURIComponent(adminSelectedUser.id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'active' }) });
      await loadAdmin();
      if (adminSelectedUser) selectAdminUser({ ...adminSelectedUser, status: 'active' });
    } catch (e) { $('adminStatus').textContent = e.message; }
    finally { busy = false; controls(); }
  };
}

const termsDialog = $('termsDialog');
const declinedDialog = $('declinedTermsDialog');
if ($('acceptTerms')) $('acceptTerms').onclick = () => { localStorage.setItem('pai_terms', 'accepted'); termsDialog?.close(); };
if ($('declineTerms')) $('declineTerms').onclick = () => { termsDialog?.close(); declinedDialog?.showModal(); };
if ($('reconsiderTerms')) $('reconsiderTerms').onclick = () => { declinedDialog?.close(); termsDialog?.showModal(); };
if ($('leaveTerms')) $('leaveTerms').onclick = () => { declinedDialog?.close(); $('logout')?.click(); };

render(); renderConversations(); go('overview'); initDeviceAndQuest(); health();

// ==========================================
// FEATURE MODULE A: VOICE & AUDIO ENGINE
// ==========================================
let activeUtterance = null;
function toggleSpeech(text, btn) {
  if (!('speechSynthesis' in window)) {
    alert('Sprachausgabe wird von diesem Browser nicht unterstützt.');
    return;
  }
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    if (btn._speaking) {
      btn._speaking = false;
      btn.innerHTML = '<svg class="mini-icon" aria-hidden="true"><use href="#i-speaker"></use></svg><span>Vorlesen</span>';
      return;
    }
  }
  document.querySelectorAll('.speak-btn').forEach(b => {
    b._speaking = false;
    b.innerHTML = '<svg class="mini-icon" aria-hidden="true"><use href="#i-speaker"></use></svg><span>Vorlesen</span>';
  });

  const cleanText = text
    .replace(/\`\`\`[\s\S]*?\`\`\`/g, 'Codeblock.')
    .replace(/\`([^\`]+)\`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~#]/g, '')
    .trim();

  activeUtterance = new SpeechSynthesisUtterance(cleanText);
  activeUtterance.lang = 'de-DE';
  activeUtterance.rate = 1.05;

  const voices = window.speechSynthesis.getVoices();
  const deVoice = voices.find(v => v.lang.startsWith('de') && (v.name.includes('Google') || v.name.includes('Anna') || v.name.includes('Stefan') || v.name.includes('Markus')));
  if (deVoice) activeUtterance.voice = deVoice;

  activeUtterance.onend = () => {
    btn._speaking = false;
    btn.innerHTML = '<svg class="mini-icon" aria-hidden="true"><use href="#i-speaker"></use></svg><span>Vorlesen</span>';
  };
  activeUtterance.onerror = () => {
    btn._speaking = false;
    btn.innerHTML = '<svg class="mini-icon" aria-hidden="true"><use href="#i-speaker"></use></svg><span>Vorlesen</span>';
  };

  btn._speaking = true;
  btn.innerHTML = '<span class="audio-wave-dot"></span><span>Stoppen</span>';
  window.speechSynthesis.speak(activeUtterance);
}

function initSpeechRecognition() {
  const micBtn = $('micBtn');
  if (!micBtn) return;
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    micBtn.title = 'Spracherkennung wird im aktuellen Browser nicht unterstützt';
    return;
  }
  const rec = new SpeechRec();
  rec.lang = 'de-DE';
  rec.continuous = false;
  rec.interimResults = true;

  let listening = false;
  micBtn.onclick = () => {
    if (listening) {
      rec.stop();
    } else {
      try {
        rec.start();
      } catch (e) {
        console.warn('Speech rec error:', e);
      }
    }
  };

  rec.onstart = () => {
    listening = true;
    micBtn.classList.add('recording');
    $('input').placeholder = 'Ich höre zu … sprich jetzt frei …';
  };

  rec.onresult = event => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      transcript += event.results[i][0].transcript;
    }
    $('input').value = transcript;
    $('input').style.height = 'auto';
    $('input').style.height = Math.min($('input').scrollHeight, 140) + 'px';
    if ($('send')) $('send').classList.toggle('has-text', Boolean(transcript.trim()));
    if ($('send')) $('send').disabled = !connected || !transcript.trim();
  };

  rec.onend = () => {
    listening = false;
    micBtn.classList.remove('recording');
    $('input').placeholder = 'Nachricht an Philipps AI …';
  };

  rec.onerror = () => {
    listening = false;
    micBtn.classList.remove('recording');
    $('input').placeholder = 'Nachricht an Philipps AI …';
  };
}

// ==========================================
// FEATURE MODULE B: DOKUMENTEN- & DATEI-UPLOAD
// ==========================================
function clearAttachment() {
  attachedFile = null;
  const preview = $('fileAttachmentPreview');
  if (preview) {
    preview.hidden = true;
    preview.innerHTML = '';
  }
  if ($('chatFileInput')) $('chatFileInput').value = '';
}

function showAttachmentPill(name, size) {
  const preview = $('fileAttachmentPreview');
  if (!preview) return;
  preview.hidden = false;
  preview.innerHTML = `<div class="attachment-pill"><svg class="mini-icon" aria-hidden="true"><use href="#i-paperclip"></use></svg><strong>${esc(name)}</strong><span>(${(size / 1024).toFixed(1)} KB)</span><button type="button" id="removeAttachBtn" title="Anhang entfernen">×</button></div>`;
  $('removeAttachBtn').onclick = () => clearAttachment();
}

function initChatAttachment() {
  const attachBtn = $('attachBtn');
  const fileInput = $('chatFileInput');
  if (!attachBtn || !fileInput) return;

  attachBtn.onclick = () => fileInput.click();

  fileInput.onchange = event => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      attachedFile = {
        name: file.name,
        size: file.size,
        content: e.target.result || ''
      };
      showAttachmentPill(file.name, file.size);
      $('input').focus();
    };
    reader.readAsText(file);
  };
}

// Dokumenten-Tresor (Files View)
function getVaultFiles() {
  try {
    return JSON.parse(localStorage.getItem('pai_vault_docs') || '[]');
  } catch {
    return [];
  }
}

function saveVaultFiles(docs) {
  localStorage.setItem('pai_vault_docs', JSON.stringify(docs));
  renderVaultFiles();
}

function renderVaultFiles() {
  const list = $('vaultFileList');
  const countBadge = $('vaultDocCount');
  if (!list) return;
  const docs = getVaultFiles();
  if (countBadge) countBadge.textContent = `${docs.length} Dokument${docs.length === 1 ? '' : 'e'}`;
  if (!docs.length) {
    list.classList.add('empty');
    list.innerHTML = 'Noch keine Dokumente abgelegt. Lade oben eine Datei hoch.';
    return;
  }
  list.classList.remove('empty');
  list.innerHTML = docs.map((doc, idx) => `
    <div class="vault-file-card glass">
      <div class="vault-file-meta">
        <span class="vault-file-icon">📄</span>
        <div class="vault-file-info">
          <span class="vault-file-name">${esc(doc.name)}</span>
          <span class="vault-file-details">${(doc.size / 1024).toFixed(1)} KB · ${doc.date || 'Gerade eben'}</span>
        </div>
      </div>
      <div class="vault-file-actions">
        <button class="secondary compact" type="button" data-vault-chat="${idx}"><svg class="mini-icon" aria-hidden="true"><use href="#i-chat"></use></svg>In Chat analysieren</button>
        <button class="icon-button danger-subtle" type="button" data-vault-del="${idx}" title="Löschen"><svg aria-hidden="true" focusable="false"><use href="#i-trash"></use></svg></button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-vault-chat]').forEach(btn => {
    btn.onclick = () => {
      const doc = docs[+btn.dataset.vaultChat];
      if (!doc) return;
      attachedFile = { name: doc.name, size: doc.size, content: doc.content };
      showAttachmentPill(doc.name, doc.size);
      go('chat');
      $('input').value = 'Analysiere bitte dieses Dokument gründlich: Worum geht es genau, welche Risiken oder wichtigen Klauseln gibt es, und was sind die nächsten Schritte?';
      $('input').focus();
      $('input').dispatchEvent(new Event('input'));
    };
  });

  list.querySelectorAll('[data-vault-del]').forEach(btn => {
    btn.onclick = () => {
      docs.splice(+btn.dataset.vaultDel, 1);
      saveVaultFiles(docs);
    };
  });
}

function initVaultDropZone() {
  const dropZone = $('fileDropZone');
  const fileInput = $('vaultFileInput');
  if (!dropZone || !fileInput) return;

  dropZone.onclick = () => fileInput.click();

  ['dragenter', 'dragover'].forEach(name => {
    dropZone.addEventListener(name, e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(name => {
    dropZone.addEventListener(name, e => { e.preventDefault(); dropZone.classList.remove('dragover'); });
  });

  dropZone.addEventListener('drop', e => {
    const files = e.dataTransfer.files;
    handleVaultUpload(files);
  });

  fileInput.onchange = e => handleVaultUpload(e.target.files);

  function handleVaultUpload(files) {
    if (!files || !files.length) return;
    const docs = getVaultFiles();
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        docs.unshift({
          name: file.name,
          size: file.size,
          content: ev.target.result || '',
          date: new Date().toLocaleDateString('de-DE')
        });
        saveVaultFiles(docs);
      };
      reader.readAsText(file);
    });
  }
}

// ==========================================
// FEATURE MODULE C: BUSINESS COCKPIT TOOLS
// ==========================================
function initBusinessTools() {
  // 1. 48h-Mahnung Generator
  const genMahnBtn = $('generateMahnBtn');
  if (genMahnBtn) {
    genMahnBtn.onclick = () => {
      const debtor = $('mahnDebtor').value.trim() || 'Firma / Schuldner';
      const amount = $('mahnAmount').value.trim() || '0,00';
      const invoice = $('mahnInvoice').value.trim() || 'RE-2026-XXX';
      
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + 48);
      const deadlineStr = deadline.toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' }) + ', 12:00 Uhr';

      const mahnText =
`LETZTE AUSSERGERICHTLICHE ZAHLUNGSAUFFORDERUNG (48-STUNDEN-FRIST)

An: ${debtor}
Rechnungsnummer: ${invoice}
Forderungsbetrag: ${amount} EUR

Sehr geehrte Damen und Herren,

trotz Fälligkeit der oben genannten Rechnung konnte bis zum heutigen Tag kein Zahlungseingang festgestellt werden. Sie befinden sich gemäß § 286 BGB im gesetzlichen Verzug.

Ich setze Ihnen hiermit eine letztmalige Frist von 48 Stunden bis zum:
${deadlineStr}

zur vollständigen Begleichung des offenen Gesamtbetrags auf das in der Rechnung angegebene Bankkonto.

Sollte der Betrag nicht innerhalb dieser Frist gutgeschrieben sein, werde ich ohne weitere Ankündigung:
1. Unverzüglich das gerichtliche Mahnverfahren (Antrag auf Erlass eines Mahnbescheids) einleiten.
2. Die Forderung an die Rechtsanwaltskanzlei zur gerichtlichen Durchsetzung übergeben.
3. Verzugszinsen in gesetzlicher Höhe (§ 288 BGB), die gesetzliche Verzugspauschale von 40,00 EUR (§ 288 Abs. 5 BGB) sowie sämtliche anfallenden Anwalts- und Gerichtskosten geltend machen.

Nutzen Sie dieses letzte Zeitfenster, um unnötige Zusatzkosten und Bonitätsfolgen abzuwenden.

Mit freundlichen Grüßen
Philipp Bartsch`;

      $('mahnResultText').textContent = mahnText;
      $('mahnResultWrap').hidden = false;

      $('copyMahnBtn').onclick = async () => {
        await navigator.clipboard.writeText(mahnText);
        $('copyMahnBtn').textContent = 'Kopiert!';
        setTimeout(() => { $('copyMahnBtn').textContent = 'Kopieren'; }, 2000);
      };

      $('downloadMahnBtn').onclick = () => {
        download(`48h-Mahnung-${debtor.replace(/\s+/g, '_')}.txt`, mahnText);
      };

      $('sendMahnToChatBtn').onclick = () => {
        go('chat');
        $('input').value = `Hier ist mein Mahnschreiben für ${debtor}. Bitte prüfe, ob alles wasserdicht ist oder ob wir noch etwas schärfer formulieren müssen:` + '\n\n' + mahnText;
        $('input').focus();
        $('input').dispatchEvent(new Event('input'));
      };
    };
  }

  // 2. Equity- & Vesting-Rechner
  const genVestBtn = $('generateVestBtn');
  if (genVestBtn) {
    genVestBtn.onclick = () => {
      const partner = $('vestPartner').value.trim() || 'Co-Founder';
      const equity = Number($('vestEquity').value) || 20;
      const years = Number($('vestYears').value) || 4;
      const cliff = Number($('vestCliff').value) || 12;
      const milestone = $('vestMilestone').value.trim() || 'Messbares Umsatzziel';

      const totalMonths = years * 12;
      const monthlyRate = (equity / totalMonths).toFixed(2);
      const cliffEquity = (monthlyRate * cliff).toFixed(2);

      const vestText =
`VESTING- & EQUITY-STRUKTUR: ${partner}

1. Eckdaten:
- Gesamte geplante Beteiligung: ${equity}%
- Vesting-Zeitraum: ${years} Jahre (${totalMonths} Monate)
- Cliff-Periode: ${cliff} Monate
- Verbindliche Leistungsvoraussetzung: ${milestone}

2. Vesting-Zeitplan:
- Monate 1 bis ${cliff}: 0.00% (Vor Ablauf des Cliffs verfallen alle Ansprüche ersatzlos).
- Nach Monat ${cliff} (Cliff-Stichtag): ${cliffEquity}% werden erstmalig übertragen.
- Ab Monat ${cliff + 1}: ${monthlyRate}% Übertragung pro vollem Monat bis zum Erreichen der maximalen ${equity}%.

3. Knallharte Schutz-Klauseln (Philipp-Prinzip):
- Meilenstein-Kopplung: Die Anteile werden AUSSCHLIESSLICH bei Erreichen von: "${milestone}" wirksam gevestet. Ohne Leistung keine Anteile.
- Bad-Leaver-Klausel: Bei vorzeitigem Ausstieg, Pflichtverletzung oder Nichterfüllung der vereinbarten Meilensteine fallen sämtliche noch nicht gevesteten Anteile entschädigungslos an die Gesellschaft zurück. Bereits gevestete Anteile unterliegen einem gesellschaftlichen Rückkaufrecht zum Nennwert.
- Kein Verwässerungsschutz ohne Pro-Rata-Reinvestition.`;

      $('vestResultText').textContent = vestText;
      $('vestResultWrap').hidden = false;

      $('copyVestBtn').onclick = async () => {
        await navigator.clipboard.writeText(vestText);
        $('copyVestBtn').textContent = 'Kopiert!';
        setTimeout(() => { $('copyVestBtn').textContent = 'Kopieren'; }, 2000);
      };

      $('sendVestToChatBtn').onclick = () => {
        go('chat');
        $('input').value = `Hier ist mein geplanter Vesting-Plan für ${partner}. Schau dir die Klauseln an und sag mir deine Einschätzung:` + '\n\n' + vestText;
        $('input').focus();
        $('input').dispatchEvent(new Event('input'));
      };
    };
  }

  // 3. Cashflow- & Auto-Check
  const checkCfBtn = $('checkCashflowBtn');
  if (checkCfBtn) {
    checkCfBtn.onclick = () => {
      const rev = Number($('cfRevenue').value) || 0;
      const exp = Number($('cfExpenses').value) || 0;
      const car = Number($('cfCarRate').value) || 0;
      const res = Number($('cfReserve').value) || 0;

      const freeCashflow = rev - exp;
      const carRatio = freeCashflow > 0 ? ((car / freeCashflow) * 100).toFixed(1) : 100;
      const minReserve = exp * 6;

      const badge = $('cfVerdictBadge');
      const text = $('cfVerdictText');
      badge.className = 'cf-verdict-badge';

      if (freeCashflow <= 0 || carRatio > 35 || res < minReserve * 0.5) {
        badge.classList.add('red');
        badge.textContent = 'Ampel: ROT (Finger weg)';
        text.textContent = `Bruder, absolut keine Chance. Dein freier Cashflow liegt bei ${freeCashflow.toLocaleString('de-DE')} € und die Rate frisst ${carRatio}% davon auf. Deine Bar-Reserve (${res.toLocaleString('de-DE')} €) reicht nicht mal für 3 Monate Fixkosten. Statussymbole auf Pump sind peinlich. Spar dir erst mindestens ${minReserve.toLocaleString('de-DE')} € Reserve an und verdopple den Cashflow, dann reden wir über BMW M oder AMG!`;
      } else if (carRatio > 20 || res < minReserve) {
        badge.classList.add('yellow');
        badge.textContent = 'Ampel: GELB (Grenzbereich / Auf Kante)';
        text.textContent = `Machbar, aber auf Kante genäht. Die Rate macht ${carRatio}% deines freien Cashflows aus (${freeCashflow.toLocaleString('de-DE')} €). Wenn ein Kunde abspringt oder die Steuer nachfordert, kommst du ins Schwitzen. Bau erst deine Reserve auf ${minReserve.toLocaleString('de-DE')} € aus, bevor du dir den Traumwagen vor die Tür stellst.`;
      } else {
        badge.classList.add('green');
        badge.textContent = 'Ampel: GRÜN (Wohlverdiente Trophäe)';
        text.textContent = `Brutaler Meilenstein! Dein Cashflow (${freeCashflow.toLocaleString('de-DE')} €) deckt die Rate mehrfach ab (nur ${carRatio}% Quote) und deine Rücklagen (${res.toLocaleString('de-DE')} €) sind solide über dem 6-Monats-Puffer. Die Cashflow-Maschine läuft. Gönn dir das Auto als Trophäe für die harte Arbeit – kein Auge!`;
      }

      $('cfResultWrap').hidden = false;
    };
  }
}

// ==========================================
// FEATURE MODULE D: PROJEKTE & TASK BOARD
// ==========================================
async function loadProjects() {
  if (!connected) return;
  try {
    const data = await api('/api/projects');
    if (data?.projects && data?.tasks) {
      projects = data.projects;
      tasks = data.tasks;
      put('projects', projects);
      put('tasks', tasks);
      renderProjectsBoard();
    }
  } catch (err) {
    console.warn('Projects load warning:', err);
  }
}

function renderProjectsBoard() {
  $('pc').textContent = projects.length;
  $('tc').textContent = tasks.filter(t => !t.done).length;

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.done).length;
  const percent = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  if ($('projectsProgressBar')) $('projectsProgressBar').style.width = percent + '%';
  if ($('projectsProgressPercent')) $('projectsProgressPercent').textContent = percent + '% erledigt';
  if ($('projectsProgressLabel')) $('projectsProgressLabel').textContent = `${doneTasks} von ${totalTasks} Aufgaben erledigt`;

  // Filter Row
  const filterRow = $('projectFilterRow');
  if (filterRow) {
    const filters = [{ id: null, title: 'Alle Aufgaben' }, ...projects];
    filterRow.innerHTML = filters.map(f => `
      <button type="button" class="project-filter-pill ${selectedProjectFilter === f.id ? 'active' : ''}" data-filter="${f.id || 'all'}">
        ${esc(f.title)}
      </button>
    `).join('');

    filterRow.querySelectorAll('[data-filter]').forEach(b => {
      b.onclick = () => {
        selectedProjectFilter = b.dataset.filter === 'all' ? null : b.dataset.filter;
        renderProjectsBoard();
      };
    });
  }

  // Filtered Task List
  const list = $('projectList');
  if (!list) return;

  const filteredTasks = selectedProjectFilter
    ? tasks.filter(t => t.project_id === selectedProjectFilter)
    : tasks;

  if (!filteredTasks.length && !projects.length) {
    list.classList.add('empty');
    list.innerHTML = 'Noch keine Projekte oder Aufgaben angelegt. Klicke oben auf „Projekt anlegen“ oder „Aufgabe hinzufügen“.';
    return;
  }

  list.classList.remove('empty');
  list.innerHTML = filteredTasks.map((t, idx) => {
    const realIndex = tasks.indexOf(t);
    const proj = projects.find(p => p.id === t.project_id);
    return `
      <div class="task-item glass">
        <div class="task-left">
          <input type="checkbox" data-task-check="${realIndex}" ${t.done ? 'checked' : ''} aria-label="Aufgabe abhaken">
          <div>
            <span class="task-title ${t.done ? 'done' : ''}">${esc(t.title || t.name)}</span>
            ${proj ? `<small style="display:block;color:var(--accent);font-size:12px;">${esc(proj.title)}</small>` : ''}
          </div>
        </div>
        <button class="icon-button danger-subtle" type="button" data-task-del="${realIndex}" title="Aufgabe löschen">
          <svg aria-hidden="true" focusable="false"><use href="#i-trash"></use></svg>
        </button>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-task-check]').forEach(cb => {
    cb.onchange = async () => {
      const idx = +cb.dataset.taskCheck;
      const t = tasks[idx];
      if (!t) return;
      t.done = cb.checked;
      put('tasks', tasks);
      renderProjectsBoard();
      if (connected && t.id) {
        api('/api/tasks?id=' + encodeURIComponent(t.id), { method: 'PATCH', body: JSON.stringify({ done: t.done }) }).catch(console.warn);
      }
    };
  });

  list.querySelectorAll('[data-task-del]').forEach(btn => {
    btn.onclick = async () => {
      const idx = +btn.dataset.taskDel;
      const t = tasks[idx];
      if (!t) return;
      tasks.splice(idx, 1);
      put('tasks', tasks);
      renderProjectsBoard();
      if (connected && t.id) {
        api('/api/tasks?id=' + encodeURIComponent(t.id), { method: 'DELETE' }).catch(console.warn);
      }
    };
  });
}

// Override old render for projects
const origRender = render;
render = function() {
  origRender();
  renderProjectsBoard();
};

// Wire Add Project & Add Task with D1 sync
$('addProject').onclick = async () => {
  const value = await ask('Neues Projekt', 'Projektname', 200);
  if (!value?.trim()) return;
  const newProj = { id: crypto.randomUUID(), title: value.trim(), color: '#9cbaff' };
  projects.unshift(newProj);
  put('projects', projects);
  renderProjectsBoard();
  if (connected) {
    api('/api/projects', { method: 'POST', body: JSON.stringify(newProj) }).catch(console.warn);
  }
};

$('addTask').onclick = async () => {
  const value = await ask('Neue Aufgabe', 'Was möchtest du erledigen?', 500);
  if (!value?.trim()) return;
  const newTask = {
    id: crypto.randomUUID(),
    title: value.trim(),
    done: false,
    priority: 'normal',
    project_id: selectedProjectFilter || null
  };
  tasks.unshift(newTask);
  put('tasks', tasks);
  renderProjectsBoard();
  if (connected) {
    api('/api/tasks', { method: 'POST', body: JSON.stringify(newTask) }).catch(console.warn);
  }
};

// Initialize all features on startup
initSpeechRecognition();
initChatAttachment();
initVaultDropZone();
renderVaultFiles();
initBusinessTools();
renderProjectsBoard();

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
  if ($('input')) $('input').placeholder = `Nachricht an ${agent.name} …`;
}

function renderAgentDropdown() {
  const dropdown = $('agentPickerDropdown');
  if (!dropdown) return;
  dropdown.innerHTML = customAgents.map(a => `
    <button type="button" class="agent-dropdown-item ${a.id === activeAgentId ? 'active' : ''}" data-agent-pick="${esc(a.id)}">
      <span class="agent-dropdown-avatar">${esc(a.avatar || '🤖')}</span>
      <div class="agent-dropdown-meta">
        <span class="agent-dropdown-name">${esc(a.name)}</span>
        <span class="agent-dropdown-role">${esc(a.role)}</span>
      </div>
    </button>
  `).join('');

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
  grid.innerHTML = customAgents.map(agent => `
    <div class="agent-module-card glass">
      <div class="agent-module-top">
        <span class="agent-module-avatar">${esc(agent.avatar || '🤖')}</span>
        <span class="agent-status-pill ${agent.status === 'active' ? 'active' : 'paused'}">
          ${agent.status === 'active' ? 'Aktiv' : 'Standby'}
        </span>
      </div>
      <h4 class="agent-module-name">${esc(agent.name)}</h4>
      <p class="agent-module-role">${esc(agent.role)}</p>
      <p class="agent-module-prompt">${esc(agent.system_prompt)}</p>
      <div class="agent-module-actions">
        <button class="btn compact" type="button" data-agent-chat="${esc(agent.id)}">
          <svg class="mini-icon" aria-hidden="true"><use href="#i-chat"></use></svg>
          <span>Chatten</span>
        </button>
        ${agent.is_default ? '' : `
          <button class="secondary compact" type="button" data-agent-toggle="${esc(agent.id)}">
            ${agent.status === 'active' ? 'Pausieren' : 'Aktivieren'}
          </button>
          <button class="icon-button danger-subtle" type="button" data-agent-del="${esc(agent.id)}" title="Löschen">
            <svg aria-hidden="true" focusable="false"><use href="#i-trash"></use></svg>
          </button>
        `}
      </div>
    </div>
  `).join('');

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


// Hilfe-Reiter: Gerätewechsel iPhone / Android
if ($('tabIphone') && $('tabAndroid')) {
  $('tabIphone').onclick = () => {
    $('tabIphone').classList.add('active');
    $('tabAndroid').classList.remove('active');
    $('guideIphone').hidden = false;
    $('guideAndroid').hidden = true;
  };
  $('tabAndroid').onclick = () => {
    $('tabAndroid').classList.add('active');
    $('tabIphone').classList.remove('active');
    $('guideAndroid').hidden = false;
    $('guideIphone').hidden = true;
  };
}

if ($('helpDirectInstallBtn')) {
  $('helpDirectInstallBtn').onclick = () => {
    if (window.__deferredPrompt) {
      window.__deferredPrompt.prompt();
    } else {
      alert('Tippe oben rechts im Menü deines Browsers auf die 3 Punkte und wähle "App installieren" oder "Zum Startbildschirm hinzufügen".');
    }
  };
}

// Lernen-Reiter: Wissenseinspeisung in D1
if ($('learnForm')) {
  $('learnForm').onsubmit = async (e) => {
    e.preventDefault();
    const category = ($('learnCategory')?.value || 'Allgemein').trim();
    const topic = ($('learnTopic')?.value || '').trim();
    const content = ($('learnContent')?.value || '').trim();
    if (!content) return;
    const fullContent = topic ? `[${topic}] ${content}` : content;
    try {
      $('saveLearnBtn').disabled = true;
      if ($('learnStatus')) $('learnStatus').textContent = 'Speichere Wissen in Cloudflare D1 …';
      await api('/api/memories', {
        method: 'POST',
        body: JSON.stringify({ content: fullContent, category: 'memory' })
      });
      if ($('learnStatus')) $('learnStatus').textContent = '✓ Wissen erfolgreich in D1 verankert!';
      if ($('learnContent')) $('learnContent').value = '';
      if ($('learnTopic')) $('learnTopic').value = '';
      await loadMemories();
      renderLearnList();
      setTimeout(() => { if ($('learnStatus')) $('learnStatus').textContent = ''; }, 3000);
    } catch (err) {
      if ($('learnStatus')) $('learnStatus').textContent = 'Fehler beim Speichern: ' + err.message;
    } finally {
      if ($('saveLearnBtn')) $('saveLearnBtn').disabled = false;
    }
  };
}

function renderLearnList() {
  const container = $('learnList');
  const countBadge = $('learnCount');
  if (!container) return;
  if (!memories.length) {
    container.innerHTML = '<p class="muted" style="padding:16px;">Noch kein individuelles Wissen eingespeist.</p>';
    if (countBadge) countBadge.textContent = '0 Einträge';
    return;
  }
  if (countBadge) countBadge.textContent = `${memories.length} Einträge`;
  container.innerHTML = memories.map(m => `
    <div class="panel learn-item-panel">
      <div class="learn-item-text">${esc(m.content)}</div>
      <button class="secondary compact" data-del-learn="${esc(m.id)}">Löschen</button>
    </div>
  `).join('');
  container.querySelectorAll('[data-del-learn]').forEach(btn => {
    btn.onclick = async () => {
      try {
        await api('/api/memories', { method: 'DELETE', body: JSON.stringify({ id: btn.dataset.delLearn }) });
        await loadMemories();
        renderLearnList();
      } catch (err) { alert('Fehler: ' + err.message); }
    };
  });
}

// 7 Family Slots in Master Cockpit
const FAMILY_SLOTS = [
  { id: 'philipp', slotName: '1. Philipp (Master)', role: 'Betreiber & Boss', avatar: '👑', status: 'Aktiv (Master-Admin)', note: 'Vollzugriff, Dev-Titan, Boss-Modus, D1-Speicher' },
  { id: 'freundin', slotName: '2. Freundin', role: 'Partnerin & VIP', avatar: '🌸', status: 'Bereit zur Personalisierung', note: 'Persönliche Assistentin, Lifestyle, Termine, empathischer Ton' },
  { id: 'mutter_freundin', slotName: '3. Mutter der Freundin', role: 'Familie', avatar: '🌿', status: 'Bereit zur Personalisierung', note: 'Geduldig, alltagstauglich, verständlich, Rezepte & Garten' },
  { id: 'onkel_freundin', slotName: '4. Onkel der Freundin', role: 'Technik & Handwerk', avatar: '🛠️', status: 'Bereit zur Personalisierung', note: 'Pragmatisch, Heimwerker, Autos, Technik & Finanzen' },
  { id: 'mutter', slotName: '5. Meine Mutter', role: 'Familie & Alltag', avatar: '❤️', status: 'Bereit zur Personalisierung', note: 'Herzlich, fürsorglich, Alltagshilfe, Briefe & Gesundheit' },
  { id: 'vater', slotName: '6. Mein Vater', role: 'Familie & Macher', avatar: '🏎️', status: 'Bereit zur Personalisierung', note: 'Bodenständig, sachlich, Technik, Verträge & Auto' },
  { id: 'slot_7', slotName: '7. Freier Slot (Partner / Gast)', role: 'Frei konfigurierbar', avatar: '⭐', status: 'Offen', note: 'Flexibler Slot für Geschäftspartner, Freund oder Familie' }
];

function renderFamilySlots() {
  const grid = $('familySlotsGrid');
  if (!grid) return;
  grid.innerHTML = FAMILY_SLOTS.map(slot => `
    <div class="family-slot-card glass">
      <div class="slot-top">
        <span class="slot-avatar">${slot.avatar}</span>
        <div class="slot-meta">
          <strong>${esc(slot.slotName)}</strong>
          <small>${esc(slot.role)}</small>
        </div>
        <span class="slot-badge ${slot.id === 'philipp' ? 'active' : 'pending'}">${esc(slot.status)}</span>
      </div>
      <p class="slot-note">${esc(slot.note)}</p>
    </div>
  `).join('');
}
