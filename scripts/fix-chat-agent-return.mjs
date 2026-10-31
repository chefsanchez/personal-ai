import fs from 'node:fs';

let content = fs.readFileSync('src/worker.js', 'utf8');

const oldLine = `return json({ choices: [{ message: { role: 'assistant', content: reply } }], conversation_id: id, historySaved, ...(historySaved ? {} : { warning: 'Antwort erhalten, aber Chatverlauf konnte nicht gespeichert werden.' }) });`;

const newLine = `return json({ choices: [{ message: { role: 'assistant', content: reply } }], conversation_id: id, historySaved, agent: { id: activeAgent.id, name: activeAgent.name, avatar: activeAgent.avatar, role: activeAgent.role }, ...(historySaved ? {} : { warning: 'Antwort erhalten, aber Chatverlauf konnte nicht gespeichert werden.' }) });`;

content = content.replace(oldLine, newLine);

fs.writeFileSync('src/worker.js', content, 'utf8');
console.log('✓ Added agent to /api/chat return');
