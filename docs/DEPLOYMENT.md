# Betrieb und Deployment

## Vor dem ersten produktiven Update

Die lokale Version ist getrennt vom bisher laufenden Worker zu beurteilen. Ein erfolgreicher Healthcheck bestätigt nur Erreichbarkeit und Konfigurationsmerkmale. Erst ein angemeldeter `/api/status` prüft das erforderliche D1-Schema. Eine echte Modellantwort benötigt zusätzlich einen erreichbaren Modellserver.

`APP_TOKEN` und `VLLM_API_KEY` gehören ausschließlich in Cloudflare Secrets. `VLLM_BASE_URL` und bei Bedarf `VLLM_MODEL` sind serverseitige Konfiguration. Das geprüfte Live-Deployment besitzt aktuell keine `VLLM_BASE_URL`; die alte RunPod-Adresse aus der Übergabe muss vor Verwendung gegen den tatsächlich gestarteten Pod abgeglichen werden.

Ein früher offengelegter App-Token muss in Cloudflare rotiert werden. Einen im Chat geteilten GitHub-Token in GitHub widerrufen. Neue Secrets niemals über Chat oder als Kommandozeilenargument übertragen. Für GitHub die Browser-Anmeldung verwenden; Wrangler fragt Secrets verdeckt ab:

```powershell
. .\scripts\Enter-Dev.ps1
npx.cmd wrangler login
npx.cmd wrangler secret put APP_TOKEN
npx.cmd wrangler secret put VLLM_API_KEY
```

Die Secret-Kommandos ändern Produktion und sind kein notwendiger Schritt für lokale Tests. Bestehende Secrets erst nach einer bewussten Rotation ersetzen.

## Automatische Anmeldung mit Cloudflare Access

Access ist im geprüften Konto noch nicht aktiviert. Die Aktivierung kann eine Plan-/Kontoeinrichtung verlangen; eine kostenpflichtige Option wird nicht automatisch gewählt. Danach:

1. Eine Access-Anwendung für die tatsächliche App-Domain und alle benötigten Pfade anlegen. Zunächst die eigene Identität prüfen, dann die gewünschten 2–5 Personen gezielt zulassen. Jede Person benötigt eine eigene geprüfte Identität. Keine öffentliche Bypass-Regel erstellen.
2. `ACCESS_TEAM_DOMAIN` als reine Team-Domain wie `mein-team.cloudflareaccess.com` und `ACCESS_AUD` als Audience dieser Anwendung am Worker setzen. Beides muss zur Anwendung passen.
3. Im Browser anmelden und `/api/status` prüfen. Der Worker validiert Signatur, Aussteller, Audience und Ablauf des weitergereichten JWT; ein bloßer E-Mail-Header genügt nicht.
4. Direkte `workers.dev`-, alternative Domain- und Preview-Aufrufe ohne gültiges JWT müssen die Daten- und Chat-API ablehnen. Keine ungeschützte Zweit-URL hinterlassen.
5. Erst nach erfolgreicher Prüfung verschwindet die manuelle URL-/Token-Eingabe in der Oberfläche. Der gemeinsame Token dient im Access-Modus nicht als Ausweichzugang.

Neue Access-Nutzer erhalten eigene Datenbereiche über `access:<sub>`. Vorhandene Token-Daten bleiben unter `owner` erhalten und werden keinem beliebigen ersten Login zugeordnet. Eine Übernahme alter Daten muss die geprüfte Zielidentität ausdrücklich festlegen und zuvor gesichert werden.

Einladungen erfolgen über die Access-Zulassung beziehungsweise den gewählten Anmeldeanbieter. Die App erzeugt keine Identitäten oder Passwörter bei Cloudflare. Die Betreiberverwaltung setzt `OWNER_ACCESS_SUB` auf den tatsächlichen `sub` der vorher erfolgreich geprüften Betreiber-Anmeldung. Weder die E-Mail noch ein vom Browser behaupteter Rollenname darf diesen Wert ersetzen. Im gemeinsamen Token-Modus gibt es keine Administratorrechte. Nach Einrichtung testen, dass nur diese Access-Identität die Verwaltungsrouten verwenden kann.

Vor der Nutzung muss jeder Nutzer ausdrücklich erfahren, dass der Betreiber die vorgesehenen Benutzer- und Gesprächsdaten verwalten/einsehen kann. Diese Kenntnisnahme ist getrennt von der optionalen Profilfreigabe und von einer späteren Trainingsfreigabe. Profile sind anfangs ausgeschaltet. Details und Grenzen stehen im [Leitfaden zu Gedächtnis, Profilen und Training](TRAINING.md).

Cloudflare-Dokumentation: [JWT validieren](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## D1 sichern und aktualisieren

Vor einem entfernten Schreibzugriff Schema prüfen und eine Sicherung außerhalb des Git-Verlaufs erstellen. Das Backup kann persönliche Daten enthalten; geschützt aufbewahren und nicht teilen. Der Ordner `backups/` ist in Git ausgeschlossen.

```powershell
New-Item -ItemType Directory -Path backups -Force | Out-Null
$backupName = 'backups/personal-ai-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql'
npx.cmd wrangler d1 export personal-ai-db --remote --output $backupName
npx.cmd wrangler d1 migrations list personal-ai-db --remote
```

Erst nach erfolgreichem Backup und Schemaabgleich:

```powershell
npx.cmd wrangler d1 migrations apply personal-ai-db --remote
```

Die versionierten Migrationen verwenden additive Tabellen und Indizes, löschen keine Bestandsdaten und ändern vorhandene Spaltendefinitionen nicht. Bereits existierende Tabellen müssen trotzdem die erwarteten Spalten besitzen; Idempotenz ersetzt keinen Schemaabgleich. Die bisherigen Tabellen `users`, `conversations`, `messages`, `memories` und `projects` werden nicht entfernt. Historische `chat_user`-/`chat_assistant`-Zeilen in `ai_memories` bleiben erhalten; neue Chats werden separat gespeichert. Das lokale Setup wendet alle vorhandenen versionierten Migrationen ausschließlich lokal an; spätere Account-, Profil- und Zusammenfassungstabellen benötigen ebenfalls die entsprechende Migration in Produktion.

[Cloudflare D1-Migrationen](https://developers.cloudflare.com/d1/reference/migrations/) · [D1-Sicherungen und Export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)

## Bereitstellen und prüfen

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
# Veröffentlicht den Worker und seine statischen Assets:
npm.cmd run deploy
.\scripts\Verify-Deployment.ps1
```

`npm run build` ist ein Probelauf; `npm run deploy` verändert die Produktion. `keep_vars = true` erhält vorhandene, nicht in der TOML aufgelistete Dashboard-Variablen. Die CI prüft den Code, veröffentlicht aber nichts. Bei vorhandenen Cloudflare Builds deren Branch- und Build-Konfiguration im Dashboard überprüfen; eine GitHub-Verbindung ist nicht allein durch das Vorhandensein des Repositorys nachgewiesen.

Mit Browser-Anmeldung prüfen: Erinnerung anlegen, Seite neu laden, Erinnerung wiederfinden, im Chat berücksichtigen lassen und Erinnerung dauerhaft löschen. Ein Modellfehler darf keine erfolgreiche Speicherung oder Antwort vortäuschen. Ohne Anmeldung müssen private API-Endpunkte gesperrt bleiben.

## GPU und echter Modelltest

Die Anwendung startet, skaliert und stoppt keine GPU. Für lokale Tests ist kein RunPod nötig. Solange der bestehende Pod als Testziel verwendet wird: Vor dem echten Modelltest die Arbeit anhalten und den Nutzer bitten, den Pod manuell einzuschalten. Anschließend tatsächliche Endpoint-URL und Modellkennung prüfen, genau eine kurze Chatfrage stellen und eine gespeicherte Erinnerung im Folgetest verwenden. Nach Abschluss den Nutzer an das manuelle Stoppen des Pods erinnern. Keine GPU-Ressource oder zusätzliche kostenpflichtige Option ohne Zustimmung starten.

Für den regulären Betrieb ist inzwischen ein bei Bedarf verfügbarer Modellzugang für 2–5 Personen mit 20 € Monatsziel vorgesehen, optional 30 € nach Entscheidung. Ein dauerhaft manuell zu startender Pod erfüllt diesen Wunsch nicht. Die [Kostenoptionen](COST-OPTIONS.md) empfehlen zunächst eine begrenzte Modell-API; das ist Planung und aktiviert keinen Anbieter. Minutenlimits in der App sind kein monatliches Kostenlimit.

## Daten und iPhone

Fakten werden bewusst als Erinnerungen gespeichert; normale Chatnachrichten werden nicht automatisch als dauerhafte Fakten eingestuft. Erinnerungsabruf und Kontextgröße sind begrenzt. Die Gesprächsübersicht zeigt eigene gespeicherte Gespräche. „Diesen Chat löschen“ betrifft den aktuellen Gesprächsschlüssel, nicht andere Gespräche, alte Legacy-Chatzeilen oder Fakten. Ein vollständiger nutzerbezogener Export und eine Aufbewahrungsfrist sind spätere Funktionen; bis dahin für einen vollständigen Betreiber-Export D1 sichern.

Automatische Profile und Tageszusammenfassungen bleiben zunächst deaktiviert. Vor einer Aktivierung müssen Modellanbieter, zusätzliche Verarbeitung, Freigabe pro Nutzer, Zeitplan und Kostenbegrenzung nachweislich funktionieren. Eine Datenbanktabelle oder ein Einwilligungsschalter bedeutet noch nicht, dass bereits täglich ein Rückblick erstellt wird. Eigene Ableitungen müssen prüfbar und separat löschbar sein; eine deaktivierte Profilfreigabe ist keine rückwirkende Datenlöschung und keine Fine-Tuning-Freigabe.

Die App ist als installierbare Web-App vorgesehen. Auf dem iPhone in Safari anmelden und **Teilen → Zum Home-Bildschirm** wählen. Danach das neue Symbol öffnen und die Anmeldung prüfen; Safari und die installierte Web-App können getrennte Sitzungen verwenden. Die App-Hülle kann offline verfügbar sein, aber Chat, D1 und Anmeldung brauchen Netz. Private API-Antworten, Tokens und Chatdaten werden nicht im Service-Worker-Cache abgelegt. Nach einem abgelaufenen Access-Login neu anmelden.

[WebKit: Home-Screen-Web-Apps](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
