const $ = id => document.getElementById(id);
const names = {overview:'Übersicht',chat:'KI-Chat',projects:'Projekte & Aufgaben',agents:'Agenten & Tools',memory:'Langzeitgedächtnis',files:'Dateien',automations:'Automatisierungen',usage:'Nutzung & Kosten',settings:'Einstellungen',users:'Benutzerverwaltung',profile:'Persönliches Profil & Privatsphäre',admin:'Betreiberverwaltung'};
const icons = {overview:'home',chat:'chat',projects:'projects',memory:'memory',settings:'settings'};
function makeNav(id, short = false) {
  const labels = {overview:'Home',chat:'Chat',memory:'Gedächtnis',projects:'Projekte',settings:'Einstellungen'};
  $(id).innerHTML = ['overview','chat','memory','projects','settings'].map(k => `<button data-view="${k}" aria-label="${names[k]}"><svg class="nav-icon" aria-hidden="true"><use href="#i-${icons[k]}"></use></svg><span class="nav-label">${labels[k]}</span></button>`).join('');
}
makeNav('nav'); makeNav('mobile', true);
function go(k) {
  if (!names[k]) return;
  if (k === 'admin' && (!connected || !isAdmin)) return;
  document.body.dataset.view = k;
  document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x.id === k));
  document.querySelectorAll('button[data-view]').forEach(x => { x.classList.toggle('active', x.dataset.view === k); if (x.dataset.view === k) x.setAttribute('aria-current','page'); else x.removeAttribute('aria-current'); });
  $('title').textContent = names[k]; window.scrollTo({top:0,behavior:'smooth'});
  if (k === 'profile') loadProfile();
  if (k === 'admin') loadAdmin();
}
document.addEventListener('click', e => { const button = e.target.closest('[data-view],[data-go]'); if (button) go(button.dataset.view || button.dataset.go); });
const get = key => { try { const value = JSON.parse(localStorage.getItem('pai_' + key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
const put = (key, value) => localStorage.setItem('pai_' + key, JSON.stringify(value));
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let projects = get('projects'), tasks = get('tasks'), memories = [], history = [];
const legacy = get('memories');
let token = '', connected = false, busy = false, accessVerified = false;
let isAdmin = false, termsVersion = '', currentUserId = '';
let adminSelectedUser = null, adminSelectionEpoch = 0;
let authEpoch = 0;
let conversations = [];
let conversation = localStorage.getItem('pai_conversation') || crypto.randomUUID();
localStorage.setItem('pai_conversation', conversation);
$('url').value = window.location.origin;
function controls() {
  $('send').disabled = !connected || busy || !navigator.onLine;
  $('addMemory').disabled = !connected || busy || !navigator.onLine;
  for (const id of ['save','logout','newChat','deleteChat','check','reloadMemory','forgetToken']) $(id).disabled = busy;
  if ($('saveProfileConsent')) $('saveProfileConsent').disabled = busy || !connected || !accessVerified || !navigator.onLine;
  if ($('profileConsent')) $('profileConsent').disabled = busy || !connected || !accessVerified;
  if ($('adminBlock')) $('adminBlock').disabled = busy || !connected || !isAdmin || !adminSelectedUser || adminSelectedUser.isAdmin || adminSelectedUser.status === 'blocked';
  if ($('adminUnblock')) $('adminUnblock').disabled = busy || !connected || !isAdmin || !adminSelectedUser || adminSelectedUser.status === 'active';
  document.querySelectorAll('[data-rm],[data-conversation],[data-admin-user],[data-admin-conv],[data-admin-delete]').forEach(button => { button.disabled = busy; });
}
function clearPrivateViews() {
  memories = []; history = []; conversations = []; isAdmin = false;
  adminSelectedUser = null; adminSelectionEpoch++;
  render(); renderConversations(); $('messages').replaceChildren();
  if ($('adminNav')) $('adminNav').hidden = true;
  if ($('profileConsent')) $('profileConsent').checked = false;
  for (const id of ['profileContent','dailySummaries','adminUsers','adminConversations','adminMessages','adminMemories']) {
    if ($(id)) { $(id).replaceChildren(); $(id).classList.add('empty'); }
  }
  if ($('adminUserTitle')) $('adminUserTitle').textContent = 'Noch kein Konto ausgewählt';
  if ($('adminStatus')) $('adminStatus').textContent = 'Betreiberanmeldung erforderlich.';
  if ($('profileStatus')) $('profileStatus').textContent = 'Persönliche Anmeldung erforderlich.';
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
      const copyBtn = document.createElement('button'); copyBtn.className = 'copy-code-btn'; copyBtn.type = 'button'; copyBtn.textContent = 'Kopieren';
      copyBtn.onclick = async () => {
        try {
          if (!navigator.clipboard) throw Error('Clipboard unavailable');
          await navigator.clipboard.writeText(code);
          copyBtn.textContent = 'Kopiert!';
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
function message(content, role = 'assistant') {
  const node = document.createElement('div'); node.className = 'msg' + (role === 'user' ? ' user' : '');
  const thinkMatch = role === 'assistant' ? String(content).match(/^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/) : null;
  if (thinkMatch) {
    const details = document.createElement('details'); details.className = 'think-bubble';
    const summary = document.createElement('summary'); summary.textContent = 'Gedankengang des Modells';
    const thinkText = document.createElement('div'); thinkText.className = 'think-text'; thinkText.textContent = thinkMatch[1].trim();
    details.append(summary, thinkText); node.appendChild(details);
    const textNode = document.createElement('div');
    renderFormattedText(textNode, thinkMatch[2].trim());
    node.appendChild(textNode);
  } else if (role === 'assistant') {
    renderFormattedText(node, content);
  } else {
    node.textContent = content;
  }
  $('messages').appendChild(node); node.scrollIntoView({block:'nearest'});
}
function renderHistory() {
  $('messages').replaceChildren();
  for (const item of history) message(item.content, item.role);
  if (!history.length) message('Ein neuer Chat ist bereit. Dauerhafte Fakten kannst du unter Langzeitgedächtnis speichern.');
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
  const list = $('conversationList'); if (!list) return;
  list.replaceChildren();
  for (const item of conversations) {
    const button = document.createElement('button'); button.className = 'conversation-row'; button.dataset.conversation = item.id;
    const title = document.createElement('strong'); title.textContent = item.title || 'Gespräch';
    const detail = document.createElement('span'); detail.textContent = `${item.message_count || 0} Nachrichten`;
    button.append(title,detail); button.disabled = busy;
    button.onclick = () => switchConversation(item.id); list.appendChild(button);
  }
  if (!conversations.length) { const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = connected ? 'Deine gespeicherten Gespräche erscheinen hier.' : 'Melde dich an, um deine Gespräche zu sehen.'; list.appendChild(empty); }
}
async function loadConversations() { const data = await api('/api/conversations'); conversations = data.conversations; renderConversations(); }
async function switchConversation(id) {
  if (busy || !connected) return;
  busy = true; controls();
  try { const data = await api('/api/history?conversation_id=' + encodeURIComponent(id)); conversation = id; localStorage.setItem('pai_conversation',id); history = data.messages; renderHistory(); go('chat'); }
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
async function health() {
  busy = true; connected = false; controls();
  $('health').textContent = 'Prüfe Worker und Anmeldung …';
  try {
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
    if ($('adminNav')) $('adminNav').hidden = !isAdmin;
    if ($('profileConsent')) $('profileConsent').checked = Boolean(status.profileConsent);
    $('manualConnection').hidden = accessVerified;
    connected = true;
    autoDetectTheme(status);
    $('connectionStatus').textContent = accessVerified ? 'Cloudflare Access geprüft. Automatische Verbindung mit dieser Website aktiv.' : 'Privater Token-Zugang aktiv. Automatische Access-Anmeldung noch nicht eingerichtet.';
    $('health').textContent = `${h.name} · Version ${h.version} · D1 erreichbar · Modell ${status.modelConfigured ? 'konfiguriert, Erreichbarkeit ungeprüft' : 'nicht konfiguriert'}`;
    $('modelStatus').textContent = status.modelConfigured ? 'KI ungeprüft' : 'KI nicht konfiguriert';
    $('gpuStatus').textContent = 'Ungeprüft';
    $('systemStatus').textContent = 'WORKER UND D1 ERREICHBAR';
    $('sideStatus').textContent = 'D1 verbunden · GPU-Status ungeprüft';
    $('chatNotice').textContent = 'Angemeldet. Modellanfragen werden erst beim Senden ausgeführt. Eine offline GPU muss manuell gestartet werden.';
    await loadMemories(); await loadConversations();
    const data = await api('/api/history?conversation_id=' + encodeURIComponent(conversation)); history = data.messages; renderHistory();
  } catch (error) {
    connected = false; accessVerified = false; $('manualConnection').hidden = false;
    if ($('adminNav')) $('adminNav').hidden = true;
    clearPrivateViews();
    $('health').textContent = error.message; $('connectionStatus').textContent = error.message;
    $('memoryStatus').textContent = 'D1-Erinnerungen konnten nicht geladen werden: ' + error.message;
    $('systemStatus').textContent = 'ANMELDUNG ODER VERBINDUNG PRÜFEN';
    $('sideStatus').textContent = 'Anmeldung oder Verbindung prüfen';
    $('chatNotice').textContent = error.message + ' Öffne Einstellungen oder lade die Seite für Cloudflare Access neu.';
  } finally { busy = false; controls(); }
}
$('save').onclick = async () => {
  try {
    const target = new URL($('url').value.trim());
    if (target.origin !== window.location.origin) throw Error('Öffne die App direkt unter der Worker-URL. Tokens werden nur an dieselbe Website gesendet.');
    authEpoch++; connected = false; clearPrivateViews(); token = $('app-token').value.trim(); $('app-token').value = ''; await health();
  } catch (error) { $('connectionStatus').textContent = error.message; }
};
$('forgetToken').onclick = () => { localStorage.removeItem('pai_token'); $('connectionStatus').textContent = 'Alter Browser-Token entfernt. Falls er früher offengelegt wurde, muss er zusätzlich auf Cloudflare rotiert werden.'; };
$('logout').onclick = () => {
  const accessLogout = accessVerified;
  authEpoch++; token = ''; connected = false; accessVerified = false; currentUserId = ''; clearPrivateViews();
  if (accessLogout) window.location.assign('/cdn-cgi/access/logout');
  else { $('connectionStatus').textContent = 'Abgemeldet. Token aus dem Arbeitsspeicher entfernt.'; $('chatNotice').textContent = 'Abgemeldet.'; }
};
$('check').onclick = health;
$('reloadMemory').onclick = () => loadMemories().catch(error => { $('memoryStatus').textContent = error.message; });
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
$('exportMemory').onclick = () => download('personal-ai-erinnerungen.json', memories);
$('legacyMemory').textContent = legacy.length ? `${legacy.length} alte Erinnerung(en) liegen nur in diesem Browser. Sie bleiben erhalten und werden nicht automatisch hochgeladen. Exportieren und gewünschte Fakten einzeln in D1 übernehmen.` : '';
$('exportLegacy').hidden = !legacy.length;
$('exportLegacy').onclick = () => download('personal-ai-alte-browser-erinnerungen.json', legacy);
$('newChat').onclick = () => { conversation = crypto.randomUUID(); localStorage.setItem('pai_conversation',conversation); history = []; renderHistory(); };
$('deleteChat').onclick = async () => {
  if (busy || !connected || !confirm('Diesen Chatverlauf dauerhaft aus D1 löschen? Erinnerungen bleiben erhalten.')) return;
  busy = true; controls();
  try { await api('/api/history?conversation_id=' + encodeURIComponent(conversation), {method:'DELETE'}); history = []; renderHistory(); await loadConversations(); }
  catch (error) { $('chatNotice').textContent = error.message; }
  finally { busy = false; controls(); }
};
$('form').onsubmit = async event => {
  event.preventDefault(); const text = $('input').value.trim(); if (!text || busy || !connected) return;
  busy = true; controls(); message(text,'user'); $('input').value = ''; $('input').style.height = 'auto';
  showLoading();
  try {
    // Keep complete recent turns and bound context before sending.
    const messages = [...history.map(({role,content}) => ({role,content})).slice(-28),{role:'user',content:text}];
    while (messages.length > 1 && messages.reduce((n,m) => n + m.content.length,0) > 48000) messages.splice(0,Math.min(2,messages.length-1));
    const data = await api('/api/chat', {method:'POST',body:JSON.stringify({messages,conversation_id:conversation})});
    const answer = data.choices[0].message.content;
    hideLoading();
    history = [...messages,{role:'assistant',content:answer}]; message(answer);
    $('modelStatus').textContent = 'KI hat geantwortet'; $('gpuStatus').textContent = 'Antwort erhalten';
    $('chatNotice').textContent = data.warning || 'Antwort erhalten. Chatverlauf in D1 gespeichert.';
    if (data.historySaved) loadConversations().catch(() => {});
  } catch (error) {
    hideLoading();
    message('Keine bestätigte KI-Antwort: ' + error.message);
    $('input').value = text; $('modelStatus').textContent = 'KI-Anfrage fehlgeschlagen';
    $('chatNotice').textContent = 'Anfrage fehlgeschlagen. Eine offline GPU muss manuell gestartet werden. Es erfolgt kein automatischer Neuversuch.';
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
});
$('file').onchange = event => { $('fileStatus').textContent = `${event.target.files.length} Datei(en) ausgewählt – nicht hochgeladen.`; };
document.querySelectorAll('[data-color]').forEach(button => button.onclick = () => { document.documentElement.style.setProperty('--accent',button.dataset.color); localStorage.setItem('pai_color',button.dataset.color); });
if (localStorage.getItem('pai_color')) document.documentElement.style.setProperty('--accent',localStorage.getItem('pai_color'));
const applyTheme = (theme, manual = false) => {
  if (!['default','bmw-520i','ultra-workstation',''].includes(theme || '')) theme = 'default';
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
    const themes = ['default', 'bmw-520i', 'ultra-workstation'];
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
if ($('exportChat')) $('exportChat').onclick = () => download('personal-ai-chat.json', {conversation_id:conversation,messages:history});
if ($('installApp')) $('installApp').onclick = () => $('installGuide').showModal();
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

render(); renderConversations(); go('overview'); health();
