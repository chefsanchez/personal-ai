# Modellbetrieb für 2–5 Nutzer

Planungsstand: 26. Oktober 2026. Ziel sind **20 € im Monat**, bei erkennbarem Nutzen höchstens **30 € nach gesonderter Entscheidung**. Diese Vorgabe ist keine Freigabe für ein Abo, eine Guthabenaufladung, neue Anbieter oder GPU-Ressourcen. Es wurde hier kein Anbieter aktiviert.

## Empfehlung

Für die erste Version empfehle ich einen nutzungsabhängigen Modell-API-Zugang mit festgelegtem Anbieter und Budgetbegrenzung. Worker, D1 und geprüfte Access-Identitäten bleiben bestehen. Damit hängt eine Chatfrage nicht davon ab, dass der Betreiber einen Pod einschaltet. Das ist eine Architekturentscheidung aus dem kleinen Nutzerkreis und dem Budget; Verfügbarkeit und Qualität müssen anschließend mit echten Anfragen geprüft werden.

Der vorhandene RunPod-Anschluss bleibt eine Option. Ein ständig laufender dedizierter Pod passt voraussichtlich schlecht zum Budget. Die alte Angabe von 1,19 USD/Stunde ist nicht aktuell bestätigt und wird hier nicht als Angebot verwendet. Serverless kann später sinnvoll sein, wenn eigene Modellkontrolle wichtiger wird und echte Messwerte seine Kosten rechtfertigen.

## Optionen

| Option | Eignung für den Start | Was vor Aktivierung geklärt werden muss |
| --- | --- | --- |
| Bezahlte Modell-API, etwa OpenRouter mit festem Provider | Anfrage bei Bedarf, keine eigene GPU-Leerlaufzeit | Datenverarbeitung, tatsächlicher Provider, Gebühren und harte Key-/Guthabenbegrenzung |
| Cloudflare Workers AI | Weniger Betriebsaufwand, mögliche freie Anfangsnutzung | Gewünschte Modellqualität, tatsächliche Limits und Datenbedingungen |
| RunPod Serverless mit Flex-Workern | Eigenes Modell bei automatischem Start | Kaltstart, GPU-Verfügbarkeit, Speicher und gesamte Laufzeitkosten |
| Manuell eingeschalteter bestehender Pod | Nützlich für begrenzte Tests | Verfehlt als alleiniger Zugang den Wunsch nach spontaner Verfügbarkeit |

### Beispiel: OpenRouter

Die Modellseite für `qwen/qwen3.6-35b-a3b` zeigt derzeit **0,05 USD je Million Eingabe- und 0,70 USD je Million Ausgabetokens**. Das ist eine angezeigte Preisuntergrenze, kein garantierter Preis jeder Route. Es ist auch nicht automatisch exakt dieselbe Bereitstellung/Quantisierung wie der bisherige NVIDIA-vLLM-Pod. [Modell und aktuelle Preise](https://openrouter.ai/qwen/qwen3.6-35b-a3b).

Reines Rechenbeispiel mit durchschnittlich 2.000 Eingabe- und 800 Ausgabetokens pro Anfrage:

| Anfragen im Monat | Eingabe | Ausgabe | Inferenz nach diesem Beispielpreis |
| --- | --- | --- | --- |
| 1.000 | 2 Mio. Tokens | 0,8 Mio. Tokens | 0,66 USD |
| 1.500 | 3 Mio. Tokens | 1,2 Mio. Tokens | 0,99 USD |
| 10.000 | 20 Mio. Tokens | 8 Mio. Tokens | 6,60 USD |

Das ist keine Gesamtrechnung. Gebühren, Steuern, Wechselkurs, längere Kontexte, Wiederholungen und gegebenenfalls zusätzliche Thinking-Tokens kommen hinzu. Der gesamte mitgesendete Verlauf und Erinnerungskontext zählt bei jeder Anfrage erneut zur Eingabe. Fünf Nutzer mit täglich zehn Fragen ergeben beispielhaft 1.500 Anfragen in 30 Tagen; die Nutzerzahl allein bestimmt den Verbrauch nicht.

### Alternative: Cloudflare Workers AI

Cloudflare nennt **10.000 freie Neurons pro Tag**. Beim Modell `@cf/qwen/qwen3-30b-a3b-fp8` werden äquivalent **0,051 USD je Million Eingabe- und 0,335 USD je Million Ausgabetokens** ausgewiesen. Das ist ein anderes Modell als Qwen3.6; gleiche Qualität wird nicht behauptet. Freie Limits können zu abgelehnten Anfragen führen. Mehrnutzung oder bestimmte Modelle verlangen eine bezahlte Freigabe. [Workers-AI-Preise](https://developers.cloudflare.com/workers-ai/platform/pricing/).

### Alternative: RunPod Serverless

Flex-Worker können auf null skalieren, Active-Worker laufen dauerhaft. Die Abrechnung umfasst die Laufzeit vom Start bis zum vollständigen Stopp, einschließlich Modellladen, Ausführung und Idle-Zeit; Speicher kann zusätzlich kosten. Eine schnelle beworbene Kaltstartzeit garantiert nicht, dass unser großes Modell ohne spürbare Verzögerung geladen wird. Erst ein begrenzter Versuch mit Kostenmessung kann die Eignung zeigen. [RunPod Serverless](https://www.runpod.io/product/serverless), [Abrechnung und Kostenbestandteile](https://docs.runpod.io/serverless/pricing).

## Plattform und Budgetschutz

Die Workers-Free-Grenzen können für einen kleinen Start genügen, sind aber kein Verfügbarkeitsversprechen. Workers Paid beginnt derzeit bei einer Basisgebühr von 5 USD pro Monat und kann verbrauchsabhängige Kosten erzeugen. D1 besitzt eigene freie Kontingente; im bezahlten Tarif kann Mehrverbrauch berechnet werden. Vor einer Tarifänderung die tatsächlichen Account-Limits prüfen. [Workers-Preise](https://developers.cloudflare.com/workers/platform/pricing/), [D1-Preise](https://developers.cloudflare.com/d1/platform/pricing/).

Als interne Aufteilung des 20-€-Ziels sind beispielsweise 8 € für Modellnutzung, 6 € für Plattform und 6 € Reserve denkbar. Das sind Planungsbeträge, keine Anbieterpreise oder Buchungen. USD-Rechnungen müssen mit Wechselkurs, Gebühren und Steuern in das Euro-Gesamtbudget passen. Domain- oder Speicherzusatzkosten gehören ebenfalls hinein.

Vor einem kostenpflichtigen Start:

1. Bei dem ausgewählten Anbieter ein begrenztes Guthaben oder ein tatsächlich durchgesetztes Key-Ausgabelimit einrichten und dessen Verhalten testen. Automatische Aufladung ausgeschaltet lassen, sofern nicht ausdrücklich genehmigt.
2. Ein eigenes Projekt-Key verwenden, Modelle/Provider begrenzen und Warnschwellen setzen. Ein gemeinsamer Key macht den Betreiber zum Kostenträger aller 2–5 Nutzer. [OpenRouter-Ausgabekontrollen](https://openrouter.ai/docs/guides/best-practices/spend-controls).
3. Nutzungsverbrauch im Betrieb verfolgen. Das aktuelle Anfragelimit pro Minute und `max_tokens` bremsen einzelne Aufrufe, sind **kein monatliches Geldlimit**. Es gibt derzeit keine verifizierte monatliche Euro-Abschaltung in der App.
4. Für 30 € oder einen zusätzlichen Dienst ist eine neue bewusste Entscheidung nötig. Ein Anbieterfehler löst keinen stillen Wechsel zu einem anderen Anbieter aus.

## Datenschutz und Mehrbenutzerbetrieb

Erinnerungen und Gesprächsteile verlassen beim Modellaufruf den Worker und gehen an den gewählten Modellanbieter. Bei OpenRouter unterscheiden sich Protokollierung, Training und Aufbewahrung je Provider. Einen zulässigen Provider samt Datenbedingungen festlegen, Training ausschließen, soweit verfügbar und gewünscht, und keine ungeprüften automatischen Fallbacks erlauben. Wenn EU-Verarbeitung oder keine Aufbewahrung erforderlich ist, muss genau diese Route das nachweislich erfüllen; ein Modellname genügt nicht. [Provider-Richtlinien](https://openrouter.ai/docs/guides/privacy/provider-logging).

Für 2–5 Nutzer ist der gemeinsame App-Token nur ein Übergang für private Tests. Die Freigabe für echte Nutzer setzt jeweils geprüfte Access-Identität, getrennte D1-Datenbereiche und einen Test gegen fremde Erinnerungen und Chatverläufe voraus. Access muss im Konto einmal aktiviert und die passende Anwendung eingerichtet werden; die bisherige OAuth-Anmeldung allein erledigt das nicht. Kosten- und Datenschutzentscheidungen bleiben beim Betreiber.
