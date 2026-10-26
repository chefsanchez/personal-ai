# OpenRouter Schnellstart & Umschalt-Anleitung

Mit dieser Anleitung kannst du jederzeit von RunPod zu OpenRouter wechseln, sobald dein RunPod-Guthaben (12 $) aufgebraucht ist.

---

## Warum OpenRouter?

| Merkmal | RunPod GPU-Miete | OpenRouter (Option 1) |
|---|---|---|
| **Abrechnung** | ca. 0,80 – 1,20 $ / Stunde (auch im Leerlauf) | **Nur pro Anfrage** (~0,05 $ / 1M Input-Tokens) |
| **Kosten für 1.000 Chats** | ca. 20 – 30 $ (wenn Pod vergessen wird) | **ca. 0,66 $ im gesamten Monat!** |
| **Server-Wartung** | Manuell starten, stoppen, migrieren | **Keine! 24/7 sofort verfügbar** |
| **Modell** | Qwen 3.6 35B NVFP4 | Qwen 3.6 35B (`qwen/qwen3.6-35b-a3b`) |

---

## 🚀 In 3 Schritten wechseln

### Schritt 1: OpenRouter API-Key holen (1 Minute)
1. Gehe im Browser auf [openrouter.ai](https://openrouter.ai/).
2. Melde dich mit deinem Google-Konto an.
3. Klicke oben rechts auf **Keys** ➔ **Create Key**.
4. Vergib einen Namen (z. B. `Personal-AI`) und kopiere den Schlüssel (`sk-or-v1-...`).
5. *(Optional)* Lade unter **Credits** ein kleines Startguthaben auf (z. B. 5 $ reichen für viele Wochen).

---

### Schritt 2: Mit einem Klick / Befehl umschalten

#### Auf Windows (PowerShell):
```powershell
.\scripts\Switch-Provider.ps1 -Provider openrouter -ApiKey "sk-or-v1-DEIN-KEY"
```

#### Auf Mac (Terminal):
```bash
./scripts/switch-provider.sh openrouter "sk-or-v1-DEIN-KEY"
```

#### Oder ChatGPT / Codex anweisen:
Wenn du ChatGPT oder Codex nutzt, sag ihm einfach:
> *"Führe `.\scripts\Switch-Provider.ps1 -Provider openrouter -ApiKey '<DEIN-KEY>'` aus."*

Das Skript erledigt alles automatisch:
- Ändert `VLLM_BASE_URL` in `wrangler.toml` auf `https://openrouter.ai/api/v1`.
- Setzt das Modell auf `qwen/qwen3.6-35b-a3b`.
- Speichert deinen Key sicher als verschlüsseltes Cloudflare Secret (`VLLM_API_KEY`).
- Führt `npx wrangler deploy --keep-vars` aus.

---

### Schritt 3: Zurück zu RunPod wechseln (falls gewünscht)

Wenn du wieder zu RunPod zurückwechseln möchtest:
```powershell
.\scripts\Switch-Provider.ps1 -Provider runpod
```
(bzw. auf Mac: `./scripts/switch-provider.sh runpod`)
