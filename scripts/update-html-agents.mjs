import fs from 'node:fs';

let html = fs.readFileSync('public/index.html', 'utf8');

// 1. Update .chat-identity in section#chat
const oldChatIdentity = `<div class="chat-identity"><span class="small-orb"></span><div>Philipps AI<span class="theme-badge" id="themeBadge" hidden></span><small>Raum für deine Gedanken</small></div></div>`;

const newChatIdentity = `<div class="chat-identity"><button id="agentSelectorBtn" class="agent-selector-pill" type="button" aria-label="Aktiven Agenten wählen" title="Agenten wechseln"><span id="chatActiveAvatar" class="agent-pill-avatar">👑</span><span class="agent-pill-info"><strong id="chatActiveName">Philipps AI</strong><small id="chatActiveRole">Boss Mode</small></span><svg aria-hidden="true" focusable="false" class="chevron"><use href="#i-chevron"/></svg></button><div id="agentPickerDropdown" class="agent-dropdown glass" hidden></div></div>`;

html = html.replace(oldChatIdentity, newChatIdentity);

// 2. Add Agent Manager Section into section#agents
const oldAgentsIntro = `<section class="view" id="agents" aria-label="Business Cockpit &amp; Tools"><div class="view-intro"><span class="feature-icon gold"><svg aria-hidden="true" focusable="false"><use href="#i-briefcase"/></svg></span><h2>Business Cockpit.</h2><p>Spezialwerkzeuge für knallharte Verhandlungen, Mahnwesen und finanzielle Disziplin.</p></div><div class="business-tools-grid">`;

const newAgentsIntro = `<section class="view" id="agents" aria-label="Business Cockpit &amp; Tools"><div class="view-intro"><span class="feature-icon gold"><svg aria-hidden="true" focusable="false"><use href="#i-briefcase"/></svg></span><h2>Business Cockpit &amp; Agenten-Kader.</h2><p>Steuere dein Spezialisten-Team oder baue dir eigene autonome Agenten-Module für dein Business.</p></div><div class="agent-manager-card glass"><div class="agent-manager-header"><div><span class="card-kicker">SPEZIALISTEN-KADER</span><h3>Aktive Agenten-Module</h3><p>Wähle deinen Agenten für den Chat oder erstelle ein neues Modul.</p></div><button class="btn compact" id="openCreateAgentBtn" type="button"><svg aria-hidden="true" focusable="false"><use href="#i-plus"/></svg><span>Neuer Agent</span></button></div><div id="agentsGrid" class="agents-grid"></div></div><div class="section-heading"><h3>Business Quick Tools</h3><span>Knallhart kalkuliert</span></div><div class="business-tools-grid">`;

html = html.replace(oldAgentsIntro, newAgentsIntro);

// 3. Add #agentDialog before closing body
const agentDialogHtml = `
<dialog id="agentDialog" class="entry-dialog glass" aria-labelledby="agentDialogTitle"><form id="agentForm" method="dialog"><h2 id="agentDialogTitle">Neuen Spezial-Agenten erstellen</h2><div class="field"><label for="agentNameInput">Name des Agenten</label><input id="agentNameInput" type="text" placeholder="z. B. B2B Closer &amp; Akquise" maxlength="100" required></div><div class="tool-inline-fields"><div class="field"><label for="agentAvatarInput">Avatar Emoji</label><input id="agentAvatarInput" type="text" placeholder="🎯" maxlength="10" value="🤖" required></div><div class="field"><label for="agentRoleInput">Spezialgebiet / Rolle</label><input id="agentRoleInput" type="text" placeholder="z. B. Sales &amp; Outreach" maxlength="100" required></div></div><div class="field"><label for="agentPromptInput">System-Prompt (Fokus &amp; Verhalten)</label><textarea id="agentPromptInput" rows="5" placeholder="Definiere die genaue Fachkompetenz, Prioritäten und wie dieser Agent agieren soll..." maxlength="4000" required></textarea></div><div class="action-row"><button type="button" class="secondary" id="agentCancelBtn">Abbrechen</button><button type="submit" class="btn" id="agentSaveBtn">Agent speichern</button></div></form></dialog>`;

if (!html.includes('id="agentDialog"')) {
  html = html.replace('<dialog id="entryDialog"', agentDialogHtml + '\n<dialog id="entryDialog"');
}

fs.writeFileSync('public/index.html', html, 'utf8');
console.log('✓ Updated public/index.html with Agent Manager & Selector markup');
