import fs from 'node:fs';

// 1. Update public/index.html
let indexHtml = fs.readFileSync('public/index.html', 'utf8');

indexHtml = indexHtml.replace(
  '<meta name="apple-mobile-web-app-title" content="Personal AI">',
  '<meta name="apple-mobile-web-app-title" content="Philipps AI">'
);
indexHtml = indexHtml.replace(
  '<title>Personal AI</title>',
  '<title>Philipps AI</title>'
);
indexHtml = indexHtml.replace(
  'aria-label="Personal AI Startseite"',
  'aria-label="Philipps AI Startseite"'
);
indexHtml = indexHtml.replace(
  '<span>Personal<span class="brand-light"> AI</span><small>Liquid Glass Cockpit</small></span>',
  '<span>Philipps<span class="brand-light"> AI</span><small>Liquid Glass Cockpit</small></span>'
);
indexHtml = indexHtml.replace(
  '<span id="sideUserName">Personal AI</span>',
  '<span id="sideUserName">Philipps AI</span>'
);
indexHtml = indexHtml.replace(
  '<span class="eyebrow">PERSONAL AI</span>',
  '<span class="eyebrow">PHILIPPS AI</span>'
);
indexHtml = indexHtml.replace(
  '<div>Personal AI<span class="theme-badge" id="themeBadge" hidden></span><small>Raum für deine Gedanken</small></div>',
  '<div>Philipps AI<span class="theme-badge" id="themeBadge" hidden></span><small>Raum für deine Gedanken</small></div>'
);
indexHtml = indexHtml.replace(
  'placeholder="Nachricht an Personal AI …"',
  'placeholder="Nachricht an Philipps AI …"'
);
indexHtml = indexHtml.replace(
  '<small>Personal AI zum Home-Bildschirm hinzufügen.</small>',
  '<small>Philipps AI zum Home-Bildschirm hinzufügen.</small>'
);
indexHtml = indexHtml.replace(
  '<p class="app-version">PERSONAL AI <span>·</span> DEIN PERSÖNLICHER WORKSPACE</p>',
  '<p class="app-version">PHILIPPS AI <span>·</span> DEIN PERSÖNLICHER WORKSPACE</p>'
);
indexHtml = indexHtml.replace(
  '<p id="termsDescription">Für die Nutzung von Personal AI gilt:</p>',
  '<p id="termsDescription">Für die Nutzung von Philipps AI gilt:</p>'
);

fs.writeFileSync('public/index.html', indexHtml, 'utf8');
console.log('✓ Updated public/index.html');

// 2. Update public/manifest.webmanifest
let manifest = JSON.parse(fs.readFileSync('public/manifest.webmanifest', 'utf8'));
manifest.name = 'Philipps AI';
manifest.short_name = 'Philipps AI';
fs.writeFileSync('public/manifest.webmanifest', JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log('✓ Updated public/manifest.webmanifest');

// 3. Update public/legal.html
let legalHtml = fs.readFileSync('public/legal.html', 'utf8');
legalHtml = legalHtml.replace(
  '<title>Nutzungsbedingungen & Datenschutz – Personal AI</title>',
  '<title>Nutzungsbedingungen & Datenschutz – Philipps AI</title>'
);
legalHtml = legalHtml.replace(
  '← Zurück zu Personal AI',
  '← Zurück zu Philipps AI'
);
legalHtml = legalHtml.replace(
  'Personal AI ist ein privates, nicht-öffentliches KI-System.',
  'Philipps AI ist ein privates, nicht-öffentliches KI-System.'
);
fs.writeFileSync('public/legal.html', legalHtml, 'utf8');
console.log('✓ Updated public/legal.html');

// 4. Update public/app.js
let appJs = fs.readFileSync('public/app.js', 'utf8');
appJs = appJs.replace(
  "status?.isAdmin ? 'Philipp (Betreiber)' : 'Personal AI'",
  "status?.isAdmin ? 'Philipp (Betreiber)' : 'Philipps AI'"
);
appJs = appJs.replace(
  "download('personal-ai-erinnerungen.json'",
  "download('philipps-ai-erinnerungen.json'"
);
appJs = appJs.replace(
  "download('personal-ai-alte-browser-erinnerungen.json'",
  "download('philipps-ai-alte-browser-erinnerungen.json'"
);
appJs = appJs.replace(
  "download('personal-ai-chat.json'",
  "download('philipps-ai-chat.json'"
);
fs.writeFileSync('public/app.js', appJs, 'utf8');
console.log('✓ Updated public/app.js');

// 5. Update src/worker.js
let workerJs = fs.readFileSync('src/worker.js', 'utf8');
workerJs = workerJs.replace(
  "name: 'Personal AI'",
  "name: 'Philipps AI'"
);
workerJs = workerJs.replace(
  "'X-Title': 'Personal AI'",
  "'X-Title': 'Philipps AI'"
);
fs.writeFileSync('src/worker.js', workerJs, 'utf8');
console.log('✓ Updated src/worker.js');

console.log('All branding renames complete.');
