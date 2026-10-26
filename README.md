# Personal AI

KI-Web-App für zunächst 2–5 getrennte Nutzer mit Cloudflare Worker, D1-Gedächtnis und einem serverseitig angebundenen OpenAI-kompatiblen Modellserver. Das bestehende Repository und vorhandene Daten bleiben erhalten. Die neue Oberfläche ist für das iPhone und die Installation auf dem Home-Bildschirm vorbereitet. Für den Mehrbenutzerbetrieb muss Cloudflare Access tatsächlich eingerichtet und geprüft sein; ein gemeinsamer Token ist dafür kein Ersatz.

Geplant sind zusätzlich eine transparente Betreiberverwaltung sowie je Nutzer separat freigegebene Profile und Tagesrückblicke. Die Hintergrundgenerierung bleibt zunächst deaktiviert, bis ein passender Modellanbieter samt Datenschutz und Budget feststeht. Normale Chats verändern keine Modellgewichte. [So unterscheiden sich Gedächtnis, Profile und echtes Training](docs/TRAINING.md).

## Windows: lokal starten

Im geklonten Projektordner mit PowerShell 7:

```powershell
. .\scripts\Enter-Dev.ps1
.\scripts\Setup-Local.ps1
npm.cmd run dev
```

`Enter-Dev.ps1` verwendet vorhandene Werkzeuge oder die portable Node.js-24-Installation unter `../.tools/`. Es verändert nur den aktuellen Prozess-PATH. `Setup-Local.ps1` installiert fehlende Projektpakete mit `npm ci`, erzeugt eine neue `.dev.vars` mit zufälligem lokalem Token und wendet Migrationen ausschließlich lokal an. Eine vorhandene `.dev.vars` bleibt unverändert. Der Token wird nicht ausgegeben.

Öffne die von Wrangler angezeigte lokale URL. Für den vorläufigen Token-Zugang kann der Wert aus `.dev.vars` direkt im lokalen Editor kopiert und unter Einstellungen eingegeben werden. Niemals im Chat, in Screenshots oder im Repository teilen. Die Oberfläche hält den eingegebenen Token nur im Arbeitsspeicher der geöffneten Seite; nach einem Neuladen ist eine erneute Eingabe nötig. In der Produktion soll Cloudflare Access diese manuelle Anmeldung ersetzen.

Das lokale Setup stellt keine Modellverbindung her. Eine offline GPU bleibt offline. `npm test` verwendet lokale Testantworten und benötigt keine RunPod-Zugangsdaten.

## Prüfen

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
.\scripts\Verify-Deployment.ps1
```

Der Build ist ein Wrangler-Probelauf und veröffentlicht nichts. Für Browser-Tests wird Microsoft Edge auf Windows verwendet, wenn vorhanden; andernfalls einmal `npx.cmd playwright install chromium` ausführen. Der Deployment-Prüflauf liest nur Oberfläche, Health und den Schutz der Speicher-API. Er sendet keine Chat-Nachricht und belegt keine Modellbereitschaft.

## Was wo gespeichert wird

- **Erinnerungen:** D1-Tabelle `ai_memories`, Kategorie `memory`, mit serverseitiger Nutzerzuordnung. Speichern, Laden und dauerhaftes Löschen laufen über die API.
- **Chat:** D1-Tabelle `chat_messages`, getrennt von dauerhaften Fakten. Gespräche sind über die nutzerbezogene Übersicht wieder aufrufbar. Aktueller Gesprächsschlüssel im Browser; Nachrichten liegen serverseitig. Ein neuer Chat löscht alte Gespräche nicht automatisch.
- **Projekte und Aufgaben:** weiterhin lokale Browserdaten und entsprechend gekennzeichnet. Agenten und Dateianalyse sind noch keine ausführenden Werkzeuge.
- **Alte Browser-Erinnerungen:** bleiben erhalten und lassen sich separat exportieren. Kein automatischer Upload.

Die angezeigten Erinnerungen und der verwendete Modellkontext sind begrenzt. Ein Browser-Export geladener Erinnerungen ist kein vollständiges Datenbank-Backup. Für Datenschutz und eine spätere vollständige Export-/Aufbewahrungsfunktion siehe [Betrieb und Deployment](docs/DEPLOYMENT.md).

## iPhone

Nach sicherer Bereitstellung die Website in Safari öffnen, anmelden und **Teilen → Zum Home-Bildschirm** wählen. Die installierte Web-App verwendet ein eigenes Symbol und öffnet ohne Browserleiste. Die API und das KI-Modell benötigen eine Internetverbindung. Das Home-Screen-Symbol startet keinen GPU-Server.

## Produktionsstatus und nächste Schritte

Der beim Neuaufsetzen geprüfte Live-Worker liefert Oberfläche und Health aus, schützt die Speicher-API aber noch mit dem gemeinsamen App-Token. Im geprüften Deployment fehlt `VLLM_BASE_URL`; Cloudflare Access ist im Konto noch nicht aktiviert. Eine echte Modellantwort ist bei ausgeschalteter GPU nicht verifiziert.

[Diagnose vom 26.10.2026](docs/DIAGNOSE-2026-10-26.md) · [Sicher bereitstellen und verifizieren](docs/DEPLOYMENT.md) · [Modellbetrieb und Budget für 2–5 Nutzer](docs/COST-OPTIONS.md)
