import fs from 'node:fs';

const testCode = `
test('D1: Custom Agents auflisten, erstellen, ansprechen und löschen', async t => {
  const f = await fixture(t);

  // 1. List default agents
  const res1 = await f.call('/api/agents');
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.equal(data1.agents.length, 5);
  assert.equal(data1.agents[0].id, 'core');
  assert.equal(data1.agents[1].id, 'cfo');

  // 2. Create custom agent
  const createRes = await f.call('/api/agents', {
    method: 'POST',
    body: {
      name: 'Krypto & Web3 Scout',
      avatar: '🪙',
      role: 'On-Chain & Tokenomics Analyst',
      system_prompt: 'Analysiere Krypto-Trends und Tokenomics mit Fokus auf echten Cashflow statt Meme-Hype.'
    }
  });
  assert.equal(createRes.status, 201);
  const createdAgent = (await createRes.json()).agent;
  assert.equal(createdAgent.name, 'Krypto & Web3 Scout');
  assert.equal(createdAgent.avatar, '🪙');

  // 3. List again -> 6 agents
  const res2 = await f.call('/api/agents');
  const data2 = await res2.json();
  assert.equal(data2.agents.length, 6);
  assert.equal(data2.agents.some(a => a.id === createdAgent.id), true);

  // 4. Chat targeting agent via agent_id
  const chatRes = await f.call('/api/chat', {
    method: 'POST',
    body: {
      conversation_id: 'conv-agent-test',
      agent_id: createdAgent.id,
      messages: [{ role: 'user', content: 'Was hältst du von diesem Token-Projekt?' }]
    }
  });
  assert.equal(chatRes.status, 200);
  const chatData = await chatRes.json();
  assert.equal(chatData.agent.id, createdAgent.id);
  assert.equal(chatData.agent.avatar, '🪙');

  // 5. Chat targeting agent via @mention
  const mentionRes = await f.call('/api/chat', {
    method: 'POST',
    body: {
      conversation_id: 'conv-agent-test-2',
      messages: [{ role: 'user', content: '@cfo rechne mir bitte den Deckungsbeitrag vor.' }]
    }
  });
  assert.equal(mentionRes.status, 200);
  const mentionData = await mentionRes.json();
  assert.equal(mentionData.agent.id, 'cfo');

  // 6. Delete default agent should fail
  const delDefault = await f.call('/api/agents?id=core', { method: 'DELETE' });
  assert.equal(delDefault.status, 400);

  // 7. Delete custom agent should succeed
  const delCustom = await f.call('/api/agents?id=' + createdAgent.id, { method: 'DELETE' });
  assert.equal(delCustom.status, 200);

  // 8. List again -> 5 default agents
  const res3 = await f.call('/api/agents');
  assert.equal((await res3.json()).agents.length, 5);
});
`;

let content = fs.readFileSync('test/worker.test.js', 'utf8');
if (!content.includes('Custom Agents auflisten')) {
  content += testCode;
  fs.writeFileSync('test/worker.test.js', content, 'utf8');
  console.log('✓ Added agent test to test/worker.test.js');
}
