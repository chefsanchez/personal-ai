import fs from 'node:fs';

let js = fs.readFileSync('public/app.js', 'utf8');

js = js.replace(
  "$('file').onchange =",
  "if ($('file')) $('file').onchange ="
);

fs.writeFileSync('public/app.js', js, 'utf8');
console.log('✓ Added null check for file input in public/app.js');
