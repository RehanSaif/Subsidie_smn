# 🧪 Test Bestanden

Deze folder bevat test bestanden en test data voor de ISDE Subsidie Automatisering.

## 📄 Bestanden

### [test_sanitization.html](test_sanitization.html)
Standalone HTML pagina voor het testen van alle 15 field sanitization functies.

**Features:**
- ✅ Test alle sanitization functies (BSN, IBAN, telefoon, etc.)
- ✅ Real-time input → output display
- ✅ Validatie met checksum tests (BSN 11-proef, IBAN modulo-97)
- ✅ Console logging voor debugging
- ✅ Geen dependencies - gewoon openen in browser

**Gebruik:**
```bash
# Open in browser
open test_sanitization.html
# Of dubbelklik op het bestand
```

**Test Scenarios:**
1. **OCR Errors**: Test O/0, I/1, S/5, 8/B verwarring
2. **Format Conversie**: Test spaties, punten, case sensitivity
3. **Validation**: Test checksum validatie (BSN, IBAN)
4. **Edge Cases**: Test lege velden, ongeldige input, edge cases

**Voorbeelden:**
```javascript
// Test IBAN correctie
Input:  "NLO3RAB00123456789"
Output: "NL03RABO0123456789" ✅

// Test BSN 11-proef
Input:  "12345678O"
Output: "123456789" ✅ (als checksum klopt)
Output: null ❌ (als checksum fout is)

// Test postcode
Input:  "12O4 ab"
Output: "1204 AB" ✅
```

### [test_sanitization.html.backup](test_sanitization.html.backup)
Backup van de originele test file voordat wijzigingen werden gemaakt.

**Gebruik:**
- Bewaar als referentie
- Restore bij problemen
- Compare met huidige versie

### [Eherkenning_ISDE.json](Eherkenning_ISDE.json)
Voorbeeld test data in JSON formaat voor ISDE aanvragen.

**Bevat:**
```json
{
  "bsn": "123456789",
  "initials": "J.H.M.",
  "lastName": "Janssen",
  "gender": "male",
  "phone": "0612345678",
  "email": "j.janssen@example.com",
  "iban": "NL91ABNA0417164300",
  "street": "Hoofdstraat",
  "houseNumber": "123",
  "houseNumberAddition": "A",
  "postalCode": "1234 AB",
  "city": "Amsterdam",
  "gasUsage": "yes",
  "meldCode": "KA06175",
  "installationDate": "15-03-2024",
  "purchaseDate": "10-03-2024"
}
```

**Gebruik:**
- Test data voor ontwikkeling
- Voorbeeld voor gebruikers documentatie
- Validatie reference
- **BELANGRIJK**: Bevat GEEN echte klantgegevens!

## 🧪 Testen

### Unit Tests (Sanitization)

Open `test_sanitization.html` en test elke functie:

1. **BSN Sanitization**
   - ✅ Test: "12345678O" → "123456789"
   - ✅ Test: "123456789" (geldig) → "123456789"
   - ❌ Test: "12345678" (te kort) → null

2. **IBAN Sanitization**
   - ✅ Test: "NLO3RAB00123456789" → "NL03RABO0123456789"
   - ✅ Test: "NL 33 INGB 0682 4030 59" → "NL33INGB0682403059"
   - ❌ Test: "NL99FAKE1234567890" (invalid checksum) → null

3. **Telefoon Sanitization**
   - ✅ Test: "06-1234 5678" → "0612345678"
   - ✅ Test: "+31 6 12345678" → "0612345678"
   - ⚠️ Test: "0851234567" → "0851234567" (warning: service nummer)

4. **Postcode Sanitization**
   - ✅ Test: "12O4 ab" → "1204 AB"
   - ✅ Test: "1234ab" → "1234 AB"
   - ❌ Test: "123 AB" (te kort) → null

5. **Email Sanitization**
   - ✅ Test: "test@example.com" → "test@example.com"
   - ✅ Test: "test@example.com." → "test@example.com"
   - ❌ Test: "test@samangroep.nl" → null (bedrijfsemail)

### Integration Tests (Extension)

1. **Upload Test Document**
   - Upload test document in extensie popup
   - Check of OCR correct extraheert
   - Verificeer field sanitization werkt

2. **Automation Flow Test**
   - Start automatisering op test omgeving
   - Check elke stap wordt correct uitgevoerd
   - Verificeer document upload werkt

3. **Recovery Test**
   - Start automatisering
   - Stop halverwege
   - Herstart en check of hervat werkt

## 📊 Test Coverage

| Component | Test Type | Status |
|-----------|-----------|--------|
| Field Sanitization | Unit | ✅ 100% |
| OCR Extraction | Manual | ✅ Tested |
| Document Upload | Manual | ✅ Tested |
| Automation Flow | Manual | ✅ Tested |
| Multi-tab Support | Manual | ✅ Tested |
| Recovery | Manual | ✅ Tested |

## 🔗 Related

- [Sanitization Analysis](../docs/FIELD_SANITIZATION_ANALYSIS.md)
- [OCR Error Patterns](../docs/OCR_ERROR_PATTERNS.md)
- [Troubleshooting Guide](../docs/TROUBLESHOOTING.md)

## 🚀 Adding New Tests

Voor nieuwe test scenarios:

1. **Open** `test_sanitization.html`
2. **Add** nieuwe test functie:
   ```javascript
   function testNewFunction() {
     const input = "test input";
     const output = sanitizeNewField(input);
     console.log('Input:', input);
     console.log('Output:', output);
     // Add assertions
   }
   ```
3. **Add** nieuwe section in HTML
4. **Test** in browser
5. **Commit** als het werkt

---

**Tip**: Bij nieuwe field sanitization functies, voeg ALTIJD eerst tests toe voordat je de functie in productie gebruikt!
