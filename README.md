# ISDE Subsidie Automatisering - Chrome Extensie

Chrome extensie voor het automatiseren van ISDE (Investeringssubsidie Duurzame Energie) subsidieaanvragen voor warmtepompen via het eLoket portaal.

## 📁 Project Structuur

```
subsidie/
├── 📄 Core Extensie Bestanden
│   ├── manifest.json           # Chrome extensie configuratie
│   ├── background.js           # Service worker voor message routing
│   ├── content.js              # Hoofdautomatisering script
│   ├── popup.html              # Sidebar UI
│   ├── popup.js                # Popup logica, OCR, validatie
│   ├── status-panel.js         # Status overlay op eloket.nl
│   ├── pdf.min.js              # PDF.js voor PDF parsing
│   └── pdf.worker.min.js       # PDF.js web worker
│
├── 📚 docs/                    # Documentatie
│   ├── CHANGELOG.md            # Versiegeschiedenis en wijzigingen
│   ├── TECHNISCHE_OVERDRACHT.md # Technische documentatie
│   ├── TROUBLESHOOTING.md      # Probleemoplossing guide
│   ├── FIELD_SANITIZATION_ANALYSIS.md # Field validatie analyse
│   └── OCR_ERROR_PATTERNS.md   # OCR error patterns en correcties
│
├── 🧪 test/                    # Test bestanden
│   ├── test_sanitization.html  # Sanitization functies tester
│   ├── README.md               # Test documentatie
│   └── Eherkenning_ISDE.json   # Test data voorbeeld
│
└── 🎨 assets/                  # Assets (logo's, iconen)
    ├── icon-16.png             # Chrome extensie icoon (16x16)
    ├── icon-48.png             # Chrome extensie icoon (48x48)
    ├── icon-128.png            # Chrome extensie icoon (128x128)
    ├── icon.jpg                # Project icoon
    └── logo.png                # Logo afbeelding
```

## 🚀 Installatie

1. **Clone/Download** dit project
2. Open Chrome en ga naar `chrome://extensions/`
3. Schakel **"Developer mode"** in (rechterbovenhoek)
4. Klik **"Load unpacked"**
5. Selecteer de `subsidie` map
6. Klik op het extensie icoon en configureer je **Mistral API key** in instellingen

## 📖 Documentatie

- **[CHANGELOG.md](docs/CHANGELOG.md)** - Alle wijzigingen en versiegeschiedenis
- **[TECHNISCHE_OVERDRACHT.md](docs/TECHNISCHE_OVERDRACHT.md)** - Technische documentatie en architectuur
- **[TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Veelvoorkomende problemen en oplossingen
- **[FIELD_SANITIZATION_ANALYSIS.md](docs/FIELD_SANITIZATION_ANALYSIS.md)** - Field validatie en sanitization
- **[OCR_ERROR_PATTERNS.md](docs/OCR_ERROR_PATTERNS.md)** - OCR error patterns en auto-correctie

## ✨ Features

- ✅ **Automatische formulier invulling** (20+ stappen)
- ✅ **OCR extractie** met Mistral AI (Document OCR + Vision AI)
- ✅ **15 field sanitization functies** voor OCR error correctie
- ✅ **Multi-tab ondersteuning** met audio keep-alive
- ✅ **Document upload** (betaalbewijs, factuur, machtigingsbewijs)
- ✅ **Real-time validatie** (IBAN checksum, BSN 11-proef, etc.)
- ✅ **Loop detectie** en error handling
- ✅ **Pause/Resume/Stop** functionaliteit

## 🔧 Technologie

- **Chrome Extension API** (Manifest V3)
- **JavaScript** (Vanilla JS)
- **PDF.js** voor PDF parsing
- **Mistral AI API**:
  - `mistral-ocr-latest` - Document OCR
  - `mistral-small-latest` - Gestructureerde data extractie
  - `pixtral-12b-2409` - Vision AI voor checkbox detectie

## 📝 Vereisten

- Google Chrome (versie 88+)
- Mistral AI API key ([console.mistral.ai](https://console.mistral.ai/))
- Toegang tot eloket.dienstuitvoering.nl

## 🎯 Gebruik

1. Navigeer naar https://eloket.dienstuitvoering.nl
2. Log in met eHerkenning
3. Klik op extensie icoon in Chrome
4. Upload documenten (betaalbewijs, factuur, machtigingsformulier)
5. Controleer automatisch ingevulde velden
6. Klik **"Start Automatisering"**
7. Extensie vult 20+ stappen automatisch in
8. Controleer finale gegevens en dien handmatig in

## 🐛 Troubleshooting

Zie [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) voor:
- Veelvoorkomende problemen
- Selector updates bij website wijzigingen
- OCR extractie problemen
- Loop detectie issues
- Document upload errors

## 👥 Bijdragen

Voor vragen, bugs, of feature requests:
1. Check eerst [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
2. Bekijk console logs (F12)
3. Neem contact op met het ontwikkelteam

## 📊 Versie

**Huidige versie**: 1.1
**Laatste update**: 2025-11-06

Zie [CHANGELOG.md](docs/CHANGELOG.md) voor volledige versiegeschiedenis.

## 📄 Licentie

Dit project is ontwikkeld voor intern gebruik door Saman Groep.

---

**Auteur**: Rehan (met hulp van Claude AI)
