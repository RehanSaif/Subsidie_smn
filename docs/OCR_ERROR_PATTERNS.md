# Typische AI/OCR Extractie Fouten

## Algemene Letter/Cijfer Verwarring

| Correct | OCR Fout | Reden |
|---------|----------|-------|
| 0 (nul) | O (letter O) | Visueel identiek |
| O (letter) | 0 (cijfer) | Visueel identiek |
| 1 (één) | I (letter i), l (kleine L) | Visueel lijkt op elkaar |
| 5 (vijf) | S (letter S) | Bij slechte kwaliteit |
| 8 (acht) | B (letter B) | Bij slechte kwaliteit |
| 2 (twee) | Z (letter Z) | Bij slechte kwaliteit |
| 6 (zes) | G (letter G) | Bij slechte kwaliteit |
| B (letter) | 8 (cijfer) | Visueel lijkt op elkaar |
| S (letter) | 5 (cijfer) | Bij slechte kwaliteit |
| Z (letter) | 2 (cijfer) | Bij slechte kwaliteit |

---

## Per Veld Type

### IBAN (NL format: NL + 2 cijfers + 4 letters bankcode + 10 cijfers)

**Bekende Nederlandse bankcodes (4 letters):**
- RABO (Rabobank)
- INGB (ING Bank)
- ABNA (ABN AMRO)
- SNSB (SNS Bank)
- ASNB (ASN Bank)
- TRIO (Triodos Bank)
- BUNQ (Bunq)
- KNAB (Knab)
- RBRB (RegioBank)
- FVLB (Van Lanschot)
- HAND (Handelsbanken)
- NNBA (Nationale Nederlanden)

**Typische OCR fouten in IBAN:**

| Correct IBAN | OCR Fout | Wat er mis gaat |
|--------------|----------|-----------------|
| NL91RABO0123456789 | NL91RAB00123456789 | RABO → RAB0 (O wordt 0) |
| NL91RABO0123456789 | NL9IRABO0123456789 | 1 → I in checksum |
| NL91INGB0123456789 | NL91ING80123456789 | INGB → ING8 (B wordt 8) |
| NL91INGB0123456789 | NL9lINGB0123456789 | 1 → l in checksum |
| NL91ABNA0123456789 | NL91ABN40123456789 | ABNA → ABN4 (A wordt 4) |
| NL91ABNA0123456789 | NL91A8NA0123456789 | ABNA → A8NA (B wordt 8) |
| NL91SNSB0123456789 | NL915NSB0123456789 | SNSB → 5NSB (S wordt 5) |
| NL91SNSB0123456789 | NL91SNS80123456789 | SNSB → SNS8 (B wordt 8) |
| NL91TRIO0123456789 | NL91TR100123456789 | TRIO → TR10 (I wordt 1, O wordt 0) |
| NL91BUNQ0123456789 | NL918UNQ0123456789 | BUNQ → 8UNQ (B wordt 8) |
| NL91RABO0123456789 | NL9IRABO0I23456789 | Meerdere 1→I fouten |

**Extra complicatie:**
- Account nummer gedeelte (laatste 10 posities) moet cijfers zijn
- Als daar letters staan → O/0, I/1, S/5, B/8 correctie nodig

---

### BSN (9 cijfers)

**Typische OCR fouten:**

| Correct BSN | OCR Fout | Wat er mis gaat |
|-------------|----------|-----------------|
| 123456782 | I23456782 | 1 → I |
| 123456782 | 12345678Z | 2 → Z |
| 012345678 | O12345678 | 0 → O |
| 123056789 | 12305678g | 9 → g (kleine g) |

---

### Telefoon (10 cijfers, start met 0)

**Typische OCR fouten:**

| Correct | OCR Fout | Wat er mis gaat |
|---------|----------|-----------------|
| 0612345678 | O612345678 | 0 → O |
| 0201234567 | O201234567 | 0 → O |
| 0201234567 | 020I234567 | 1 → I |
| 0201234567 | O20I234567 | 0 → O, 1 → I |

---

### Postcode (4 cijfers + 2 letters)

**Typische OCR fouten:**

| Correct | OCR Fout | Wat er mis gaat |
|---------|----------|-----------------|
| 1234AB | I234AB | 1 → I |
| 1234AB | 1Z34AB | 2 → Z |
| 1234AB | 12340B | A → 4 (dit zou niet moeten, want laatste 2 zijn altijd letters) |
| 1234AB | 1O34AB | 2e positie → O in plaats van cijfer |
| 1034AB | 1O34AB | 0 → O |
| 5678AB | 567BAB | 8 → B (fout, want 4e positie moet cijfer zijn) |

---

### MeldCode (KA + 5 cijfers)

**Typische OCR fouten:**

| Correct | OCR Fout | Wat er mis gaat |
|---------|----------|-----------------|
| KA12345 | K412345 | A → 4 |
| KA12345 | KAI2345 | 1 → I |
| KA12345 | KA1Z345 | 2 → Z |
| KA01234 | KAO1234 | 0 → O (al gecorrigeerd) |
| KA05678 | KAO5678 | 0 → O |

---

### Email

**Typische OCR fouten:**

| Correct | OCR Fout | Wat er mis gaat |
|---------|----------|-----------------|
| test@example.com | test at example.com | @ → "at" (text) |
| test@example.com | test(at)example.com | @ → "(at)" |
| test@example.com | test_@_example.com | Extra underscores |
| info@test.nl | inf0@test.nl | o → 0 |

---

### Voorletters

**Typische OCR fouten:**

| Correct | OCR Fout | Wat er mis gaat |
|---------|----------|-----------------|
| J.H.M. | J.H.5. | M → 5 (bij slechte kwaliteit) |
| S.A.B. | 5.A.B. | S → 5 (eerste letter) |
| S.A.B. | S.A.8. | B → 8 |
| P.O.J. | P.0.J. | O → 0 (letter O wordt cijfer) |
| I.J.K. | 1.J.K. | I → 1 (letter I wordt cijfer) |
| T.Z.A. | T.2.A. | Z → 2 |

**Belangrijke regel:**
- Voorletters kunnen **ALLEEN letters** bevatten (A-Z)
- Als cijfers worden gedetecteerd → corrigeer naar meest waarschijnlijke letter
- Meest voorkomende cijfer-fouten in voorletters:
  - 5 → S (zeer vaak)
  - 0 → O (zeer vaak)
  - 1 → I
  - 8 → B
  - 2 → Z
  - 6 → G

---

### Datum (DD-MM-YYYY)

**Typische OCR fouten:**

| Correct | OCR Fout | Wat er mis gaat |
|---------|----------|-----------------|
| 01-06-2024 | O1-06-2024 | 0 → O (al gecorrigeerd) |
| 01-06-2024 | 0I-06-2024 | 1 → I |
| 01-06-2024 | O1-O6-2O24 | Meerdere 0 → O (al gecorrigeerd) |
| 15-12-2024 | I5-12-2024 | 1 → I |

---

## Prioriteit voor Verbetering

### Hoge Prioriteit (kritisch voor validatie):
1. **IBAN**: Bank code correctie + account nummer O/0, I/1, S/5, B/8
2. **BSN**: I/1, O/0, Z/2 correctie
3. **Telefoon**: O/0, I/1 correctie in eerste positie
4. **MeldCode**: A/4 correctie in "KA" prefix, I/1, Z/2 in cijfers

### Medium Prioriteit:
5. **Postcode**: I/1, Z/2, B/8, S/5 correctie in cijfer gedeelte
6. **Voorletters**: 5/S, 0/O, 1/I, 8/B, 2/Z correctie (alleen letters toegestaan)
7. **Email**: "at" → @ correctie

### Lage Prioriteit (al redelijk goed):
8. **Datum**: I/1 correctie (0/O al gedaan)
9. **Andere velden**: Meestal geen OCR fouten

---

## Field Combinatie Problemen (OCR Merge Errors)

Een veelvoorkomend probleem: AI/OCR extractie combineert meerdere velden in één output.

### IBAN + BIC Combinatie

**Probleem**: BIC code wordt vaak aan IBAN toegevoegd

| Correct IBAN | OCR Output | Probleem |
|--------------|------------|----------|
| NL91RABO0123456789 | NL91RABO0123456789 RABONL2U | IBAN + BIC gecombineerd |
| NL91RABO0123456789 | NL91RABO0123456789 BIC: RABONL2U | Met "BIC:" label |
| NL91INGB0123456789 | NL91INGB0123456789INGBNL2A | Direct aan elkaar geplakt |

**Oplossing**:
- Detecteer BIC patronen (8 of 11 karakters aan einde)
- Nederlandse BIC codes eindigen vaak op "NL2U" of "NL2A"
- Verwijder BIC voordat IBAN validatie

### Adres Combinaties

**Probleem**: Straat, huisnummer, postcode, plaats allemaal in één veld

| Veldtype | OCR Output | Wat er mis is |
|----------|------------|---------------|
| Straat | Insulindestraat 59 1065JD Amsterdam | Volledig adres |
| Postcode | 1065JD Amsterdam | Postcode + plaats |
| Straat | Insulindestraat 59A01 | Straat + huisnummer + toevoeging |

**Oplossing**:
- Extract postcode eerst (herkenbaar patroon: 4 cijfers + 2 letters)
- Extract huisnummer (cijfers + optioneel toevoeging)
- Wat overblijft = straatnaam of plaats

### Naam Combinaties

| Veldtype | OCR Output | Wat er mis is |
|----------|------------|---------------|
| Voorletters | J.H.M. Jansen | Voorletters + achternaam |
| Achternaam | Jansen Jan | Achternaam + voornaam (omgekeerd) |
| Voorletters | Jan Hendrik Maria | Volledige voornamen in plaats van initialen |

**Oplossing**:
- Voorletters: Extract alleen letters met punten of eerste letters van woorden
- Achternaam: Als er hoofdletters zijn, neem laatste woord(en) met hoofdletter
- Filter common voornamen uit achternaam veld

### Datum + Label Combinaties

| Veldtype | OCR Output | Wat er mis is |
|----------|------------|---------------|
| Installatiedatum | Installatiedatum: 15-06-2024 | Met label |
| Installatiedatum | Datum 15-06-2024 | Met "Datum" prefix |
| Installatiedatum | 15-06-2024 Factuur: 12345 | Datum + factuurnummer |

**Oplossing**:
- Strip bekende labels: "Datum:", "Installatiedatum:", "Datum installatie:", etc.
- Extract eerste datum patroon (DD-MM-YYYY of varianten)
- Negeer rest van string

### MeldCode + Extra Info

| Correct | OCR Output | Probleem |
|---------|------------|----------|
| KA12345 | Meldcode: KA12345 | Met label |
| KA12345 | KA12345 Type: Installatie | MeldCode + type info |

**Oplossing**:
- Strip "Meldcode:" label
- Extract alleen KA##### patroon
- Negeer rest

---

## Implementatie Strategie

Voor elk veld met hoge/medium prioriteit:

1. **Field Splitting EERST**: Detecteer en verwijder gecombineerde velden
   - IBAN: Verwijder BIC code (8-11 chars aan einde met NL2U/NL2A patroon)
   - Adres: Extract postcode/huisnummer patronen eerst
   - Datum: Strip labels en extract eerste datum patroon
   - Namen: Split op hoofdletters/spaties, filter bekende patronen

2. **Detecteer positie**: Weet welke posities cijfers vs letters moeten zijn

3. **Pas context-aware correctie toe**:
   - Als positie = cijfer verwacht → corrigeer O→0, I→1, S→5, B→8, Z→2
   - Als positie = letter verwacht → corrigeer 0→O, 1→I, 5→S, 8→B, 2→Z

4. **Valideer tegen bekende patronen**: Bijv. IBAN bank codes

5. **Log warnings**: Als correctie niet mogelijk of onzeker

