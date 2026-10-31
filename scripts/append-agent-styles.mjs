import fs from 'node:fs';

const agentStyles = `
/* --- Agent Selector in Chat Toolbar --- */
.agent-selector-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 40px;
}
.agent-selector-pill:hover {
  background: rgba(156, 186, 255, 0.15);
  border-color: rgba(156, 186, 255, 0.3);
}
.agent-pill-avatar {
  font-size: 18px;
  line-height: 1;
}
.agent-pill-info {
  display: flex;
  flex-direction: column;
  text-align: left;
}
.agent-pill-info strong {
  font-size: 13px;
  line-height: 1.2;
}
.agent-pill-info small {
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.2;
}
.agent-selector-pill .chevron {
  width: 14px;
  height: 14px;
  fill: #94a3b8;
  transition: transform 0.2s ease;
}

/* Agent Picker Dropdown Popover */
.agent-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 280px;
  max-height: 380px;
  overflow-y: auto;
  border-radius: 16px;
  padding: 8px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.agent-dropdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: none;
  border: 0;
  color: #e2e8f0;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
  width: 100%;
}
.agent-dropdown-item:hover, .agent-dropdown-item.active {
  background: rgba(156, 186, 255, 0.15);
  color: #fff;
}
.agent-dropdown-avatar {
  font-size: 20px;
  line-height: 1;
}
.agent-dropdown-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.agent-dropdown-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agent-dropdown-role {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* --- Agent Manager in Business Cockpit --- */
.agent-manager-card {
  padding: 22px;
  border-radius: 20px;
  margin-bottom: 24px;
}
.agent-manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.agent-manager-header h3 {
  margin: 4px 0 2px;
  font-size: 18px;
  color: #fff;
}
.agent-manager-header p {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
}
.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
.agent-module-card {
  padding: 18px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: all 0.2s ease;
}
.agent-module-card:hover {
  border-color: rgba(156, 186, 255, 0.3);
  background: rgba(255, 255, 255, 0.05);
}
.agent-module-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.agent-module-avatar {
  font-size: 28px;
  line-height: 1;
  background: rgba(255, 255, 255, 0.06);
  padding: 8px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.agent-status-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.agent-status-pill.active {
  background: rgba(0, 230, 118, 0.15);
  color: #00e676;
  border: 1px solid rgba(0, 230, 118, 0.3);
}
.agent-status-pill.paused {
  background: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.3);
}
.agent-module-name {
  font-size: 15px;
  font-weight: 600;
  color: #f1f5f9;
  margin: 0 0 2px;
}
.agent-module-role {
  font-size: 12px;
  color: #9cbaff;
  margin: 0 0 10px;
}
.agent-module-prompt {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
  margin: 0 0 16px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.agent-module-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: auto;
}
`;

let css = fs.readFileSync('public/styles.css', 'utf8');
if (!css.includes('.agent-selector-pill')) {
  css += agentStyles;
  fs.writeFileSync('public/styles.css', css, 'utf8');
  console.log('✓ Added agent styles to public/styles.css');
}
