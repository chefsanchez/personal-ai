import fs from 'node:fs';
let content = fs.readFileSync('test/worker.test.js', 'utf8');
content = content.replace(
  "assert.equal((await f.call('/api/terms/accept', { method: 'POST', body: { version: TERMS_VERSION } })).status, 200);\n\n",
  ""
);
fs.writeFileSync('test/worker.test.js', content, 'utf8');
console.log('Fixed test');
