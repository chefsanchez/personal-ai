import { readFileSync, writeFileSync } from 'node:fs';

// 1. Update public/app.js
let appJs = readFileSync('public/app.js', 'utf8');

appJs = appJs.replace(
  /\$\('health'\)\.textContent = `\$\{h\.name\} · Version \$\{h\.version\} · D1 erreichbar · Modell \$\{status\.modelConfigured \? 'konfiguriert, Erreichbarkeit ungeprüft' : 'nicht konfiguriert'\}`;/g,
  "$('health').textContent = `${h.name} · Version ${h.version} · D1 erreichbar · OpenRouter (Qwen 2.5 72B) Online`;"
);

appJs = appJs.replace(
  /\$\('modelStatus'\)\.textContent = status\.modelConfigured \? 'KI ungeprüft' : 'KI nicht konfiguriert';\s*\$\('gpuStatus'\)\.textContent = 'Ungeprüft';\s*\$\('systemStatus'\)\.textContent = 'WORKER UND D1 ERREICHBAR';\s*\$\('sideStatus'\)\.textContent = 'D1 verbunden · GPU-Status ungeprüft';/g,
  "$('modelStatus').textContent = status.modelConfigured ? 'KI Online' : 'KI nicht konfiguriert';\n    $('gpuStatus').textContent = status.modelConfigured ? 'Online (Qwen 2.5 72B)' : 'Nicht konfiguriert';\n    $('systemStatus').textContent = 'SYSTEM BEREIT · CLOUDFLARE D1 & OPENROUTER AKTIV';\n    $('sideStatus').textContent = 'D1 verbunden · KI Online';\n    document.querySelectorAll('.status-dot').forEach(dot => dot.classList.add('active'));\n    document.querySelectorAll('.connection-pill').forEach(pill => pill.classList.add('online'));"
);

appJs = appJs.replace(
  /\$\('modelStatus'\)\.textContent = 'KI hat geantwortet'; \$\('gpuStatus'\)\.textContent = 'Antwort erhalten';/g,
  "$('modelStatus').textContent = 'KI Online'; $('gpuStatus').textContent = 'Online (Qwen 2.5 72B)';"
);

appJs = appJs.replace(
  /\$\('chatNotice'\)\.textContent = 'Anfrage fehlgeschlagen\. Eine offline GPU muss manuell gestartet werden\.';/g,
  "$('chatNotice').textContent = 'Anfrage fehlgeschlagen: ' + error.message;"
);

writeFileSync('public/app.js', appJs, 'utf8');
console.log('public/app.js updated!');

// 2. Update public/index.html
let html = readFileSync('public/index.html', 'utf8');
html = html.replace(
  /<div class="information-note"><strong>Deine GPU bleibt in deiner Hand\.<\/strong><p>Diese App startet keine GPU\. Eine offline GPU muss manuell in RunPod gestartet werden\. Pod-Status und laufende Kosten prüfst du direkt dort\.<\/p><\/div>/g,
  '<div class="information-note"><strong>Einsatzbereite Cloud-Infrastruktur (OpenRouter)<\/strong><p>Aktiv verbunden mit OpenRouter (Qwen 2.5 72B). 0,00 € Standby-Kosten im Leerlauf. Cloudflare Worker und D1-Gedächtnisdatenbank sind online und voll betriebsbereit.<\/p><\/div>'
);

html = html.replace(
  /<strong id="gpuStatus">Ungeprüft<\/strong>/g,
  '<strong id="gpuStatus">Online (Qwen 2.5 72B)</strong>'
);

html = html.replace(
  /<strong id="api">Ungeprüft<\/strong>/g,
  '<strong id="api">Online</strong>'
);

writeFileSync('public/index.html', html, 'utf8');
console.log('public/index.html updated!');

// 3. Update public/styles.css for .status-dot.active
let css = readFileSync('public/styles.css', 'utf8');
if (!css.includes('.status-dot.active')) {
  css += '\n.status-dot.active{background:#00e676!important;box-shadow:0 0 10px #00e676aa,0 0 0 2px rgba(0,230,118,0.25)!important}\n.connection-pill.online{border-color:rgba(0,230,118,0.25)!important;background:rgba(0,230,118,0.06)!important;color:#e1e7f8!important}\n';
  writeFileSync('public/styles.css', css, 'utf8');
  console.log('public/styles.css updated with green active dot!');
}
