import fs from 'node:fs';

let code = fs.readFileSync('public/app.js', 'utf8');

// 1. Add attachedFile variable
if (!code.includes('let attachedFile = null;')) {
  code = code.replace(
    'let projects = get(\'projects\'), tasks = get(\'tasks\'), memories = [], history = [];',
    'let projects = get(\'projects\'), tasks = get(\'tasks\'), memories = [], history = [];\nlet attachedFile = null;\nlet selectedProjectFilter = null;'
  );
  console.log('✓ Added attachedFile & selectedProjectFilter variables');
}

// 2. Add speakBtn to message actionRow
const oldMsgActions = `    const regenBtn = document.createElement('button');
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
    actionRow.appendChild(regenBtn);`;

const newMsgActions = `    const regenBtn = document.createElement('button');
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
    actionRow.appendChild(speakBtn);`;

if (!code.includes('toggleSpeech(mainContent, speakBtn)')) {
  const normCode = code.replace(/\r\n/g, '\n');
  const normOld = oldMsgActions.replace(/\r\n/g, '\n');
  if (normCode.includes(normOld)) {
    code = normCode.replace(normOld, newMsgActions.replace(/\r\n/g, '\n'));
    console.log('✓ Added speakBtn to assistant messages');
  } else {
    console.error('Could not find oldMsgActions in app.js');
  }
}

// 3. Update form submit to incorporate attachedFile
const oldSubmit = `  event.preventDefault(); const text = $('input').value.trim(); if (!text || busy || !connected) return;
  busy = true; controls(); message(text,'user'); $('input').value = ''; $('input').style.height = 'auto';`;

const newSubmit = `  event.preventDefault(); const text = $('input').value.trim(); if (!text || busy || !connected) return;
  let fullText = text;
  if (attachedFile) {
    fullText = \`[Angehängtes Dokument: \${attachedFile.name}]\` + '\\n\`\`\`\\n' + attachedFile.content.slice(0, 15000) + '\\n\`\`\`\\n\\n' + text;
    clearAttachment();
  }
  busy = true; controls(); message(fullText,'user'); $('input').value = ''; $('input').style.height = 'auto';`;

if (!code.includes('let fullText = text;')) {
  const normCode = code.replace(/\r\n/g, '\n');
  const normOld = oldSubmit.replace(/\r\n/g, '\n');
  if (normCode.includes(normOld)) {
    code = normCode.replace(normOld, newSubmit.replace(/\r\n/g, '\n'));
    console.log('✓ Updated form submit to handle attached documents');
  } else {
    console.error('Could not find oldSubmit in app.js');
  }
}

// 4. Update message array in submit to use fullText
code = code.replace(
  "{role:'user',content:text}",
  "{role:'user',content:fullText || text}"
);

// 5. Add loadProjects call in health()
if (!code.includes('await loadProjects();')) {
  code = code.replace(
    'await loadMemories(); await loadConversations();',
    'await loadMemories(); await loadConversations(); await loadProjects();'
  );
  console.log('✓ Added loadProjects() call in health()');
}

// 6. Append comprehensive feature engine implementations
const newFeaturesCode = `
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
    .replace(/\\\`\\\`\\\`[\\s\\S]*?\\\`\\\`\\\`/g, 'Codeblock.')
    .replace(/\\\`([^\\\`]+)\\\`/g, '$1')
    .replace(/\\[([^\\]]+)\\]\\([^)]+\\)/g, '$1')
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
  preview.innerHTML = \`<div class="attachment-pill"><svg class="mini-icon" aria-hidden="true"><use href="#i-paperclip"></use></svg><strong>\${esc(name)}</strong><span>(\${(size / 1024).toFixed(1)} KB)</span><button type="button" id="removeAttachBtn" title="Anhang entfernen">×</button></div>\`;
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
  if (countBadge) countBadge.textContent = \`\${docs.length} Dokument\${docs.length === 1 ? '' : 'e'}\`;
  if (!docs.length) {
    list.classList.add('empty');
    list.innerHTML = 'Noch keine Dokumente abgelegt. Lade oben eine Datei hoch.';
    return;
  }
  list.classList.remove('empty');
  list.innerHTML = docs.map((doc, idx) => \`
    <div class="vault-file-card glass">
      <div class="vault-file-meta">
        <span class="vault-file-icon">📄</span>
        <div class="vault-file-info">
          <span class="vault-file-name">\${esc(doc.name)}</span>
          <span class="vault-file-details">\${(doc.size / 1024).toFixed(1)} KB · \${doc.date || 'Gerade eben'}</span>
        </div>
      </div>
      <div class="vault-file-actions">
        <button class="secondary compact" type="button" data-vault-chat="\${idx}"><svg class="mini-icon" aria-hidden="true"><use href="#i-chat"></use></svg>In Chat analysieren</button>
        <button class="icon-button danger-subtle" type="button" data-vault-del="\${idx}" title="Löschen"><svg aria-hidden="true" focusable="false"><use href="#i-trash"></use></svg></button>
      </div>
    </div>
  \`).join('');

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
\`LETZTE AUSSERGERICHTLICHE ZAHLUNGSAUFFORDERUNG (48-STUNDEN-FRIST)

An: \${debtor}
Rechnungsnummer: \${invoice}
Forderungsbetrag: \${amount} EUR

Sehr geehrte Damen und Herren,

trotz Fälligkeit der oben genannten Rechnung konnte bis zum heutigen Tag kein Zahlungseingang festgestellt werden. Sie befinden sich gemäß § 286 BGB im gesetzlichen Verzug.

Ich setze Ihnen hiermit eine letztmalige Frist von 48 Stunden bis zum:
\${deadlineStr}

zur vollständigen Begleichung des offenen Gesamtbetrags auf das in der Rechnung angegebene Bankkonto.

Sollte der Betrag nicht innerhalb dieser Frist gutgeschrieben sein, werde ich ohne weitere Ankündigung:
1. Unverzüglich das gerichtliche Mahnverfahren (Antrag auf Erlass eines Mahnbescheids) einleiten.
2. Die Forderung an die Rechtsanwaltskanzlei zur gerichtlichen Durchsetzung übergeben.
3. Verzugszinsen in gesetzlicher Höhe (§ 288 BGB), die gesetzliche Verzugspauschale von 40,00 EUR (§ 288 Abs. 5 BGB) sowie sämtliche anfallenden Anwalts- und Gerichtskosten geltend machen.

Nutzen Sie dieses letzte Zeitfenster, um unnötige Zusatzkosten und Bonitätsfolgen abzuwenden.

Mit freundlichen Grüßen
Philipp Bartsch\`;

      $('mahnResultText').textContent = mahnText;
      $('mahnResultWrap').hidden = false;

      $('copyMahnBtn').onclick = async () => {
        await navigator.clipboard.writeText(mahnText);
        $('copyMahnBtn').textContent = 'Kopiert!';
        setTimeout(() => { $('copyMahnBtn').textContent = 'Kopieren'; }, 2000);
      };

      $('downloadMahnBtn').onclick = () => {
        download(\`48h-Mahnung-\${debtor.replace(/\\s+/g, '_')}.txt\`, mahnText);
      };

      $('sendMahnToChatBtn').onclick = () => {
        go('chat');
        $('input').value = \`Hier ist mein Mahnschreiben für \${debtor}. Bitte prüfe, ob alles wasserdicht ist oder ob wir noch etwas schärfer formulieren müssen:\` + '\\n\\n' + mahnText;
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
\`VESTING- & EQUITY-STRUKTUR: \${partner}

1. Eckdaten:
- Gesamte geplante Beteiligung: \${equity}%
- Vesting-Zeitraum: \${years} Jahre (\${totalMonths} Monate)
- Cliff-Periode: \${cliff} Monate
- Verbindliche Leistungsvoraussetzung: \${milestone}

2. Vesting-Zeitplan:
- Monate 1 bis \${cliff}: 0.00% (Vor Ablauf des Cliffs verfallen alle Ansprüche ersatzlos).
- Nach Monat \${cliff} (Cliff-Stichtag): \${cliffEquity}% werden erstmalig übertragen.
- Ab Monat \${cliff + 1}: \${monthlyRate}% Übertragung pro vollem Monat bis zum Erreichen der maximalen \${equity}%.

3. Knallharte Schutz-Klauseln (Philipp-Prinzip):
- Meilenstein-Kopplung: Die Anteile werden AUSSCHLIESSLICH bei Erreichen von: "\${milestone}" wirksam gevestet. Ohne Leistung keine Anteile.
- Bad-Leaver-Klausel: Bei vorzeitigem Ausstieg, Pflichtverletzung oder Nichterfüllung der vereinbarten Meilensteine fallen sämtliche noch nicht gevesteten Anteile entschädigungslos an die Gesellschaft zurück. Bereits gevestete Anteile unterliegen einem gesellschaftlichen Rückkaufrecht zum Nennwert.
- Kein Verwässerungsschutz ohne Pro-Rata-Reinvestition.\`;

      $('vestResultText').textContent = vestText;
      $('vestResultWrap').hidden = false;

      $('copyVestBtn').onclick = async () => {
        await navigator.clipboard.writeText(vestText);
        $('copyVestBtn').textContent = 'Kopiert!';
        setTimeout(() => { $('copyVestBtn').textContent = 'Kopieren'; }, 2000);
      };

      $('sendVestToChatBtn').onclick = () => {
        go('chat');
        $('input').value = \`Hier ist mein geplanter Vesting-Plan für \${partner}. Schau dir die Klauseln an und sag mir deine Einschätzung:\` + '\\n\\n' + vestText;
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
        text.textContent = \`Bruder, absolut keine Chance. Dein freier Cashflow liegt bei \${freeCashflow.toLocaleString('de-DE')} € und die Rate frisst \${carRatio}% davon auf. Deine Bar-Reserve (\${res.toLocaleString('de-DE')} €) reicht nicht mal für 3 Monate Fixkosten. Statussymbole auf Pump sind peinlich. Spar dir erst mindestens \${minReserve.toLocaleString('de-DE')} € Reserve an und verdopple den Cashflow, dann reden wir über BMW M oder AMG!\`;
      } else if (carRatio > 20 || res < minReserve) {
        badge.classList.add('yellow');
        badge.textContent = 'Ampel: GELB (Grenzbereich / Auf Kante)';
        text.textContent = \`Machbar, aber auf Kante genäht. Die Rate macht \${carRatio}% deines freien Cashflows aus (\${freeCashflow.toLocaleString('de-DE')} €). Wenn ein Kunde abspringt oder die Steuer nachfordert, kommst du ins Schwitzen. Bau erst deine Reserve auf \${minReserve.toLocaleString('de-DE')} € aus, bevor du dir den Traumwagen vor die Tür stellst.\`;
      } else {
        badge.classList.add('green');
        badge.textContent = 'Ampel: GRÜN (Wohlverdiente Trophäe)';
        text.textContent = \`Brutaler Meilenstein! Dein Cashflow (\${freeCashflow.toLocaleString('de-DE')} €) deckt die Rate mehrfach ab (nur \${carRatio}% Quote) und deine Rücklagen (\${res.toLocaleString('de-DE')} €) sind solide über dem 6-Monats-Puffer. Die Cashflow-Maschine läuft. Gönn dir das Auto als Trophäe für die harte Arbeit – kein Auge!\`;
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
  if ($('projectsProgressLabel')) $('projectsProgressLabel').textContent = \`\${doneTasks} von \${totalTasks} Aufgaben erledigt\`;

  // Filter Row
  const filterRow = $('projectFilterRow');
  if (filterRow) {
    const filters = [{ id: null, title: 'Alle Aufgaben' }, ...projects];
    filterRow.innerHTML = filters.map(f => \`
      <button type="button" class="project-filter-pill \${selectedProjectFilter === f.id ? 'active' : ''}" data-filter="\${f.id || 'all'}">
        \${esc(f.title)}
      </button>
    \`).join('');

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
    return \`
      <div class="task-item glass">
        <div class="task-left">
          <input type="checkbox" data-task-check="\${realIndex}" \${t.done ? 'checked' : ''} aria-label="Aufgabe abhaken">
          <div>
            <span class="task-title \${t.done ? 'done' : ''}">\${esc(t.title || t.name)}</span>
            \${proj ? \`<small style="display:block;color:var(--accent);font-size:12px;">\${esc(proj.title)}</small>\` : ''}
          </div>
        </div>
        <button class="icon-button danger-subtle" type="button" data-task-del="\${realIndex}" title="Aufgabe löschen">
          <svg aria-hidden="true" focusable="false"><use href="#i-trash"></use></svg>
        </button>
      </div>
    \`;
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
`;

code += newFeaturesCode;

fs.writeFileSync('public/app.js', code, 'utf8');
console.log('✓ Successfully enhanced public/app.js with all 4 feature modules');
