import fs from 'node:fs';

const newStyles = `
/* --- Voice & Audio Modes --- */
.composer-mic-btn, .composer-attach-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  min-width: 44px;
  height: 44px;
  min-height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #9cbaff;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}
.composer-mic-btn:hover, .composer-attach-btn:hover {
  background: rgba(156, 186, 255, 0.15);
  border-color: rgba(156, 186, 255, 0.3);
  color: #fff;
}
.composer-mic-btn svg, .composer-attach-btn svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
}
.composer-mic-btn.recording {
  background: rgba(255, 68, 68, 0.25) !important;
  border-color: #ff4444 !important;
  color: #ff4444 !important;
  box-shadow: 0 0 16px rgba(255, 68, 68, 0.6);
  animation: micPulse 1.2s infinite ease-in-out;
}
@keyframes micPulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 12px rgba(255, 68, 68, 0.5); }
  50% { transform: scale(1.08); box-shadow: 0 0 20px rgba(255, 68, 68, 0.85); }
}

/* Audio wave dot for Text-to-Speech active state */
.audio-wave-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #00e676;
  box-shadow: 0 0 8px #00e676;
  animation: audioPulse 0.8s infinite alternate ease-in-out;
}
@keyframes audioPulse {
  from { opacity: 0.4; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1.2); }
}

/* Attachment preview pill above composer */
.attachment-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.attachment-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(156, 186, 255, 0.12);
  border: 1px solid rgba(156, 186, 255, 0.3);
  border-radius: 16px;
  padding: 6px 14px;
  font-size: 13px;
  color: #f1f5f9;
  max-width: 100%;
}
.attachment-pill button {
  background: none;
  border: 0;
  color: #94a3b8;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 0 0 4px;
}
.attachment-pill button:hover {
  color: #ff6b6b;
}

/* --- Business Cockpit & Tools --- */
.business-tools-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
  margin-bottom: 24px;
}
.tool-card {
  padding: 22px;
  border-radius: 20px;
  background: var(--glass-card, rgba(255, 255, 255, 0.03));
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.tool-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 18px;
}
.tool-icon {
  font-size: 26px;
  line-height: 1;
  background: rgba(255, 255, 255, 0.05);
  padding: 10px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.tool-header h3 {
  margin: 0 0 4px;
  font-size: 17px;
  color: #fff;
  font-weight: 600;
}
.tool-header p {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
}
.tool-inline-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 500px) {
  .tool-inline-fields {
    grid-template-columns: 1fr;
  }
}
.tool-result-wrap {
  margin-top: 18px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
}
.result-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.tool-result-box {
  margin: 0;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  color: #e2e8f0;
  white-space: pre-wrap;
  word-break: break-word;
}
.cf-verdict-badge {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 10px;
}
.cf-verdict-badge.red {
  background: rgba(255, 68, 68, 0.2);
  border: 1px solid rgba(255, 68, 68, 0.5);
  color: #ff6b6b;
}
.cf-verdict-badge.yellow {
  background: rgba(255, 187, 51, 0.2);
  border: 1px solid rgba(255, 187, 51, 0.5);
  color: #ffbb33;
}
.cf-verdict-badge.green {
  background: rgba(0, 230, 118, 0.2);
  border: 1px solid rgba(0, 230, 118, 0.5);
  color: #00e676;
}
.cf-verdict-text {
  font-size: 14px;
  line-height: 1.6;
  color: #f1f5f9;
  margin: 0;
}

/* --- Dokumenten-Tresor (Files) --- */
.file-drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 20px;
  border: 2px dashed rgba(156, 186, 255, 0.3);
  border-radius: 18px;
  background: rgba(156, 186, 255, 0.03);
  cursor: pointer;
  text-align: center;
  transition: all 0.2s ease;
}
.file-drop-zone:hover, .file-drop-zone.dragover {
  border-color: rgba(156, 186, 255, 0.7);
  background: rgba(156, 186, 255, 0.08);
}
.file-drop-zone .upload-icon {
  width: 32px;
  height: 32px;
  fill: #9cbaff;
}
.vault-file-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}
.vault-file-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-radius: 16px;
  background: var(--glass-card, rgba(255, 255, 255, 0.03));
  border: 1px solid rgba(255, 255, 255, 0.08);
  flex-wrap: wrap;
}
.vault-file-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}
.vault-file-icon {
  font-size: 22px;
  line-height: 1;
}
.vault-file-info {
  min-width: 0;
}
.vault-file-name {
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}
.vault-file-details {
  font-size: 12px;
  color: #94a3b8;
}
.vault-file-actions {
  display: flex;
  gap: 8px;
}

/* --- Projects & Task Board Progress --- */
.projects-progress-box {
  padding: 16px 20px;
  border-radius: 16px;
  margin-bottom: 20px;
}
.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #94a3b8;
  margin-bottom: 8px;
}
.progress-track {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #9cbaff, #00e676);
  border-radius: 4px;
  transition: width 0.3s ease;
}
.project-filter-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 8px;
  margin-bottom: 14px;
  -webkit-overflow-scrolling: touch;
}
.project-filter-pill {
  padding: 6px 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  min-height: 38px;
  display: inline-flex;
  align-items: center;
}
.project-filter-pill.active {
  background: rgba(156, 186, 255, 0.2);
  border-color: #9cbaff;
  color: #fff;
  font-weight: 600;
}
.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-radius: 14px;
  background: var(--glass-card, rgba(255, 255, 255, 0.03));
  border: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 8px;
  min-height: 52px;
}
.task-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}
.task-left input[type="checkbox"] {
  width: 22px;
  height: 22px;
  cursor: pointer;
  accent-color: #00e676;
}
.task-title {
  font-size: 14px;
  color: #f1f5f9;
  word-break: break-word;
}
.task-title.done {
  text-decoration: line-through;
  color: #64748b;
}
.feature-icon.gold {
  background: rgba(255, 187, 51, 0.15);
  color: #ffbb33;
}
.feature-icon.mint {
  background: rgba(156, 214, 197, 0.15);
  color: #9cd6c5;
}
`;

let css = fs.readFileSync('public/styles.css', 'utf8');
if (!css.includes('.composer-mic-btn')) {
  css += newStyles;
  fs.writeFileSync('public/styles.css', css, 'utf8');
  console.log('✓ Successfully added styles to public/styles.css');
}
