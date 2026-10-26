# Wie deine persönliche KI dazulernt

Für diese App sollte „lernen“ zuerst bedeuten: bestätigte Fakten wiederfinden, den Gesprächskontext richtig nutzen und nachvollziehbare Zusammenfassungen anbieten. Dafür müssen keine Modellgewichte verändert werden. Echtes Fine-Tuning ist ein eigener, späterer Trainingsschritt mit separaten Daten, Kosten und Tests.

## Vier unterschiedliche Ebenen

| Ebene | Was passiert | Stand und Grenze |
| --- | --- | --- |
| Gesprächskontext | Die letzten Nachrichten werden bei der nächsten Frage mitgesendet. | Umgesetzt und begrenzt; ein Verlauf ist kein dauerhaftes Modellwissen. |
| D1-Gedächtnis | Gespeicherte Fakten werden nutzerbezogen abgerufen und dem Modell als Kontext gegeben. | Umgesetzt. Abruf ist derzeit eine begrenzte Text-/Relevanzauswahl, keine vollständige Vektorsuche. |
| Persönliches Profil und Tageszusammenfassung | Ein Modell leitet aus freigegebenen eigenen Gesprächen Vorschläge beziehungsweise Rückblicke ab. | Daten-, Rechte- und Einwilligungsfunktionen werden vorbereitet. Die automatische Generierung bleibt zunächst deaktiviert, bis Anbieter, Datenschutz, Budget und Tests bestätigt sind. |
| Fine-Tuning, etwa LoRA | Ein eigener Trainingslauf verändert zusätzliche Modellparameter. | Kein automatischer Trainingslauf und keine Gewichtsänderung durch normale Chats. Noch keine fertige Trainingspipeline in diesem Repository. |

Erinnerungen eignen sich für veränderliche Fakten wie Antwortsprache oder Projektstand: Sie lassen sich prüfen, korrigieren und löschen. Fine-Tuning eignet sich eher für ein wiederkehrendes Antwortformat oder ein enges Aufgabenmuster. Es ist kein zuverlässiger Ersatz für eine Datenbank und keine sinnvolle erste Lösung für fünf persönliche Profile.

## Anmeldung und Transparenz für 2–5 Personen

Jede Person meldet sich über ihre eigene von Cloudflare Access bestätigte Identität an. Die Datenzuordnung erfolgt serverseitig; eine Angabe des Namens oder einer E-Mail im Chat erzeugt kein Konto und keine Berechtigung. Neue Personen werden über die Access-Zulassung eingeladen. Die App erstellt selbst keine Passwörter oder Identitäten beim Anmeldeanbieter.

Der Betreiber möchte die Benutzer und deren Gespräche verwalten können. Diese Betreiber-Einsicht muss **vor der Nutzung klar sichtbar erklärt** werden. Die App darf deshalb keine vertraulichen Chats ausschließlich zwischen Nutzer und KI versprechen. Die Betreiberrolle wird serverseitig über `OWNER_ACCESS_SUB` festgelegt, das mit dem `sub` eines gültig geprüften Access-JWT übereinstimmen muss; eine E-Mail oder ein Browser-Schalter genügt nicht. Der vorläufige gemeinsame Token erhält keine Administratorrechte.

Die Kenntnisnahme dieser Betreiber-Einsicht ist etwas anderes als die optionale Profilerstellung. Profile und automatische Rückblicke sind zunächst ausgeschaltet und benötigen eine eigene aktive Freigabe. Eine Freigabe dafür ist wiederum **keine Zustimmung zum Training von Modellgewichten** oder zur Weitergabe aller Chats an beliebige Anbieter.

## Profile und Tagesrückblicke sinnvoll einführen

1. Erst Modellanbieter, Datenbedingungen und einen überprüften Kostenrahmen festlegen. Die Hintergrundgenerierung bleibt bis dahin aus.
2. Jeder Nutzer entscheidet separat, ob eigene Gespräche für persönliche Ableitungen verwendet werden dürfen. Kein Profil eines anderen Nutzers beimischen; keine versteckte gemeinsame Zusammenfassung erzeugen.
3. Ergebnisse als abgeleitete, möglicherweise falsche Vorschläge kennzeichnen. Keine Diagnosen oder festen Persönlichkeitsurteile aus wenigen Nachrichten ableiten. Ein Vorschlag wird nicht automatisch zur bestätigten Erinnerung.
4. Eigene Ableitungen müssen sichtbar und löschbar sein. Das Abschalten beendet neue Ableitungen; bereits gespeicherte Daten benötigen eine klare separate Löschfunktion. Ein Tagesrückblick darf keine erfolgreiche Erstellung anzeigen, wenn kein Modell aufgerufen wurde oder die Speicherung fehlgeschlagen ist.
5. Später einen begrenzten Tageslauf pro freigegebenem Nutzer einführen, mit Datum/Zeitzone, überprüfbarer Herkunft, Wiederholschutz und Kostenlimit. „Täglich“ bedeutet zunächst einen geplanten Ausbau, solange kein Generator und Zeitplan nachweislich laufen.

Ein Betreiberzugriff ist auf die dafür vorgesehenen Verwaltungsrouten begrenzt. Gewöhnliche Nutzer erhalten dadurch keinen Zugriff auf fremde Chats oder Profile. Zugriffsprüfungen müssen im Worker erfolgen, auch wenn die Oberfläche entsprechende Schaltflächen ausblendet.

## Vor einem echten Training: gute Beispiele sammeln

Mit der bestehenden KI zunächst typische Aufgaben bearbeiten. Schlechte Antworten markieren und **die gewünschte richtige Antwort selbst prüfen**. Für einen Trainingsdatensatz nur ausgewählte, rechtmäßig freigegebene Beispiele übernehmen. Ein ungeprüfter vollständiger Chat- oder D1-Export ist kein fertiger Trainingsdatensatz.

Nutzerbestände getrennt halten. Keine Chats anderer Personen allein wegen Betreiberzugriff für ein gemeinsames Training verwenden. Zugangsdaten, private Informationen Dritter und nicht benötigte Identifikatoren entfernen. Für jedes Beispiel festhalten, aus welcher freigegebenen Quelle es stammt und für welchen Trainingszweck es verwendet werden darf. Die Trainingsfreigabe muss unabhängig von normaler Chatnutzung und Profilfreigabe sein.

Ein rein synthetisches Beispiel für ein geprüftes Dialogformat:

```json
{"messages":[{"role":"user","content":"Plane drei kurze Schritte für einen aufgeräumten Schreibtisch."},{"role":"assistant","content":"1. Lose Dinge sortieren.\n2. Nur täglich benötigte Dinge zurücklegen.\n3. Die freie Fläche reinigen."}]}
```

Das passende Format und Chat-Template bestimmt später das tatsächlich verwendete Modell und Trainingswerkzeug. Dieses Beispiel allein ist noch kein Training. Die Dateien sollten außerhalb des öffentlichen Repositorys liegen und nur gezielt an einen freigegebenen Trainingsanbieter gehen.

## Modell und Trainingstechnik auswählen

Der offizielle Qwen-Checkpoint `Qwen/Qwen3.6-35B-A3B` wird mit Modellgewichten und Konfiguration veröffentlicht und ist laut Modellkarte Apache-2.0-lizenziert. Vor einem Training oder einer Weitergabe die konkrete Modellrevision, Lizenzdateien, Nutzungsbedingungen und unterstützte Trainingsbibliotheken prüfen und dokumentieren. Architektur, Tokenizer/Processor und Chat-Template müssen zum Checkpoint passen. [Offizielle Qwen-Modellkarte](https://huggingface.co/Qwen/Qwen3.6-35B-A3B).

Der bisherige `nvidia/Qwen3.6-35B-A3B-NVFP4` ist eine von NVIDIA quantisierte Bereitstellung für Inferenz. Er wird hier **nicht als fertiger Trainings-Checkpoint** behandelt. Für einen späteren Adapterlauf einen geeigneten ursprünglichen Checkpoint und einen nachweislich kompatiblen Trainingspfad wählen. Ein erfolgreicher vLLM-Start belegt diese Trainingskompatibilität nicht. [NVIDIA-Modellkarte](https://huggingface.co/nvidia/Qwen3.6-35B-A3B-NVFP4).

LoRA trainiert kleine zusätzliche Gewichtsmatrizen, während die ursprünglichen Modellgewichte eingefroren bleiben. Der Adapter gehört anschließend zu genau der Basis, für die er trainiert wurde. Auch dieser Ansatz benötigt Speicher, eine unterstützte Modellintegration und einen echten Trainingslauf. Hardwarebedarf nicht aus den nur pro Token aktiven Parametern ableiten. [PEFT: LoRA](https://huggingface.co/docs/peft/main/en/conceptual_guides/lora).

Vor jedem solchen Lauf einen konkreten Plan mit Anbieter, maximaler Laufzeit, Kostengrenze, Datenumfang, Zielmodell und Abbruchkriterium vorlegen. Keine GPU starten, Ressource hochskalieren oder einen Trainingsauftrag bezahlen, bevor der Betreiber das ausdrücklich freigegeben hat. Das Monatsziel von 20 € beziehungsweise optional 30 € für die App ist keine pauschale Trainingsfreigabe.

## Wirkung messen, bevor etwas produktiv wird

Trainings-, Entwicklungs- und abschließende Testbeispiele trennen. Den Testbestand vor dem Training festlegen und weder zum Trainieren noch zum wiederholten Optimieren verwenden. Nahezu gleiche Dialoge dürfen nicht auf beide Seiten verteilt werden. Bei kleinen Beständen sind nachvollziehbare neue Aufgaben wichtiger als eine beeindruckende Prozentzahl auf bereits bekannten Beispielen.

Unverändertes Basismodell und neue Variante unter denselben Bedingungen vergleichen:

- Befolgt die KI das gewünschte Format und bleibt die Antwort sachlich richtig?
- Verwendet sie passende eigene Erinnerungen und ignoriert fremde oder widersprüchliche Daten?
- Erfindet sie keine gespeicherten Fakten und behauptet keinen erfolgreichen Tool-Aufruf?
- Funktionieren Löschung, Abmeldung und Nutzertrennung weiter?
- Wie ändern sich Antwortzeit, Tokenverbrauch und tatsächliche Kosten?

Ein kleines Paket wiederkehrender, manuell geprüfter Aufgaben reicht für einen ersten Vergleich. Datenschutz- und Isolationstests müssen unabhängig von der sprachlichen Qualität bestehen. Erst nach einem messbaren Nutzen und ohne neue wesentliche Fehler eine neue Modellversion einsetzen; die alte Konfiguration für einen Rückwechsel aufbewahren. Weder ein größerer Datensatz noch ein niedrigerer Trainingsverlust garantiert eine bessere persönliche KI.
