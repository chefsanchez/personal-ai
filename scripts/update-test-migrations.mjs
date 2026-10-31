import fs from 'node:fs';

['test/runtime.test.js', 'test/worker.test.js'].forEach(path => {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(
    "'0004_projects_and_tasks.sql'",
    "'0004_projects_and_tasks.sql','0005_custom_agents.sql'"
  );
  fs.writeFileSync(path, content, 'utf8');
  console.log('✓ Updated', path);
});
