# KI-gestützter PDF-Upload für Sicherheitsdatenblätter & Prüfberichte mit Bestätigungs-Workflow

Vollständige Integration einer KI-gestützten Dokumentenextraktion für Bauprodukt-Nachweise (Sicherheitsdatenblätter und Labor-Prüfberichte/Zertifikate) im Schritt 2, inklusive interaktivem Bestätigungsdialog für ausgelesene Kennwerte und barrierefreiem Direkteinstieg ohne Login- oder Demodaten-Zwänge.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> Die folgenden Kernentscheidungen wurden in Phase 1 mit dem Anwender abgestimmt und bilden das Fundament der Implementierung:

- **Bestätigungs-Workflow (KI-Datenübernahme)**: Die von der KI aus den PDFs ausgelesenen Kennwerte (Produktname, Hersteller, primäre DGNB-Bauteilzeile, VOC-Werte, REACH SVHC, Prüfzeichen/Zertifikate) werden in einem strukturierten **Dialogfenster (Modal)** mit Vorher-Nachher-Gegenüberstellung, Zuverlässigkeitshinweisen und Textzitaten aus dem Dokument präsentiert. Erst nach ausdrücklicher Bestätigung (und optionaler manueller Korrektur) durch den Benutzer werden die Werte in das Bewertungsformular übernommen.
- **Upload-Struktur im Schritt 2**: Zwei klar separierte Drag-and-Drop-Zonen für **Sicherheitsdatenblätter (SDB)** und **Labor-Prüfberichte / Zertifikate** (jeweils PDF-Format, max. 30 MB pro Dokument, mit Dateinamenanzeige, Dateigröße und Löschen-/Ersetzen-Option).
- **Startverhalten & Navigation**: Die Anwendung startet direkt in **Schritt 1 (Kriterienmatrix)** mit einer hervorgehobenen Schnellstart-Schaltfläche (*"Direkt zur Produktprüfung (Schritt 2)"*), sodass der Anwender entweder die Regelwerksmatrix sichten oder ohne Umwege sofort Dokumente prüfen kann.
- **Vollständige Entfernung von Login & Demodaten**: 
  - Die bisherige `AuthScreen`-Sperre, Whitelist-Abfragen und die Passphrase-Verschlüsselung werden entfernt; die App ist sofort einsatzbereit.
  - Vorgefertigte Mustertexte (z. B. Caparol-Demodaten) und Dummy-Schnipsel werden restlos entfernt. Das Formular startet in einem sauberen, neutralen Zustand.

---

### 1. Overview & Core Concept

- **Was das Feature leistet**: Anwender können originale PDF-Dateien von Sicherheitsdatenblättern und Prüfberichten per Drag-and-Drop hochladen. Das Backend analysiert die Dokumente server-seitig über das Gemini-Modell (`gemini-3.8-flash`) mit strukturierter JSON-Extraktion. Die extrahierten baustoffökologischen Parameter werden in einem übersichtlichen Bestätigungsdialog angezeigt, vom Prüfer freigegeben und automatisiert in das Prüfformular übernommen.
- **Zielgruppe**: Nachhaltigkeits-Auditoren, DGNB-/BNB-/QNG-Consultants, Bauleiter und Qualitätsmanager, die Baustoffe zügig und fehlerfrei auf Konformität mit Schadstoffkriterien prüfen müssen.
- **Kernwert**: Drastische Zeitersparnis bei der manuellen Durchsicht mehrseitiger Sicherheitsdatenblätter (Kapitel 3, 9, 15) und Prüfberichte, kombiniert mit maximaler Verlässlichkeit durch das Schwachstellen-/K.O.-Prinzip und den menschlichen Freigabeschritt ("Human in the loop").

---

### 2. User Experience & Visual Design

#### Key User Flows

1. **Start & Direkteinstieg**:
   - Die App öffnet ohne jegliche Anmeldeschranke direkt in Schritt 1 (Kriterienmatrix).
   - In der Kopfzeile und im oberen Bereich von Schritt 1 ermöglicht der Aktions-Button *"Direkt zur Produktprüfung (Schritt 2)"* einen sofortigen Wechsel.
2. **Dokumenten-Upload im Schritt 2**:
   - Zwei visuell abgesetzte Upload-Zonen:
     - **Zone A**: *"1. Sicherheitsdatenblatt (SDB)"* (Symbol: Datei mit Gefahrstoff-/Schutzschild-Akzent, Hinweistext: "PDF mit Abschnitten 3, 9 & 15").
     - **Zone B**: *"2. Labor-Prüfbericht / Zertifikat"* (Symbol: Zertifikats-/Prüfkammer-Akzent, Hinweistext: "PDF mit Blauer Engel, EMICODE EC1 PLUS, AgBB, FSC/PEFC").
   - Nach Auswahl einer PDF-Datei erscheint sofort eine visuelle Statusanzeige (Dateiname, Größe, Ladebalken/Status *"Wird durch KI analysiert..."*).
3. **Interaktives KI-Bestätigungs-Modal**:
   - Sobald die Analyse abgeschlossen ist, öffnet sich automatisch das Bestätigungsfenster:
     - **Header**: Zusammenfassung des erkannten Dokuments mit Status *"Erfolgreich ausgelesen"*.
     - **Tabelle / Grid**:
       - *Parameter*: z. B. Produktname, Hersteller, DGNB-Bauteilzeile, VOC-Gehalt, SVHC-Status, Zertifikate.
       - *Extrahierter Wert*: Direkt im Eingabefeld editierbar, falls der Auditor einen Wert anpassen möchte.
       - *Fundstelle / Zitat*: Direkter Textausschnitt aus dem Dokument als Beleg.
     - **Aktionen**:
       - Primary: *"Werte bestätigen & ins Formular übernehmen"* (grün hervorgehoben).
       - Secondary: *"Verwerfen / Manuell eingeben"*.
4. **Formularstatus nach Bestätigung**:
   - Die Felder im Schritt 2 werden befüllt und dezent als *"KI-verifiziert & vom Nutzer freigegeben"* gekennzeichnet.
   - Textauszüge bleiben für manuelle Feinjustierungen sichtbar und editierbar.
   - Mit einem Klick auf *"Ausgewählte Standards jetzt prüfen"* startet wie gewohnt die Multi-Standard-Konformitätsprüfung (DGNB, QNG, BNB).

#### Visual Identity & Theme

- **Designsprache**: Professionelles, behördliches Qualitätsmanagement-Werkzeug im klaren Industrie-Standard (DGNB/DIN-konforme Ästhetik, Slate-Hintergründe, Emerald-Akzente für Konformität und Vertrauen).
- **Farbpalette**:
  - Neutraler Hintergrund: `bg-slate-50` / `bg-slate-100` mit `border-slate-200`
  - Primärfarben: `emerald-600` (Aktionen & bestandene Qualitätsstufen), `slate-900` (Typografie)
  - Hervorhebungen / Status: `emerald-50` mit `border-emerald-300` für freigegebene KI-Daten, `amber-50` für Prüfhinweise
- **Typografie**: Moderner Sans-Serif Stack (Inter / System-UI), mit monospace-Schriftarten für Grenzwerte, CAS-Nummern und DIN-Normen.
- **Anti-Slop Restriktion**: Keine überflüssigen Glaseffekte oder verspielte Pillen-Chips; stattdessen saubere Datentabellen mit klarer visueller Hierarchie und Barrierefreiheit nach WCAG AA.

---

### 3. Key Product Decisions & Trade-Offs

- **Entscheidung 1: Server-seitige PDF-Analyse via `@google/genai` (gemini-3.8-flash)**
  - *Gewählter Ansatz*: Upload der PDFs als Base64-Payload an den sicheren Express-Server (`/api/documents/parse-pdf`). Der Server übergibt das PDF multimodal als `application/pdf` Inline-Data an das Modell `gemini-3.8-flash` mit striktem `responseSchema`.
  - *Begründung*: Das Gemini-Modell verarbeitet mehrseitige PDFs nativ inklusive Tabellenlayouts in Sicherheitsdatenblättern ohne fehleranfälliges externes OCR oder unvollständiges Regex-Parsen. Der API-Schlüssel verbleibt geschützt auf dem Server.
  - *Verworfene Alternativen*: Reines client-seitiges `pdfjs-dist` Parsing wurde verworfen, da formatierte Tabellen in Sicherheitsdatenblättern (GHS-Kennzeichnung, Grenzwerte in g/l) dabei oft unleserlich zerstückelt werden.

- **Entscheidung 2: Zweistufiges Bestätigungsprinzip ("Human-in-the-Loop")**
  - *Gewählter Ansatz*: Automatisches Öffnen des Bestätigungs-Modals nach dem Scan mit editierbaren Feldern und Belegzitaten. Erst nach Bestätigung werden die Daten ins Arbeitsformular übernommen.
  - *Begründung*: Erfüllt exakt die DGNB- und Auditor-Anforderungen an Revisionssicherheit. Ein Auditor darf keine ungeprüften KI-Vermutungen in ein offizielles Konformitätsgutachten übernehmen.

- **Entscheidung 3: Kompletter Rückbau der Login- & Passphrase-Schicht**
  - *Gewählter Ansatz*: Entfernung von `AuthScreen`, der Session-Token-Prüfung und der WebCrypto-Passphrase-Abfrage. Die Navigation wird bereinigt (kein Abmelde-Button oder gesperrter Status mehr).
  - *Begründung*: Erfüllt den Anwenderwunsch nach einem unkomplizierten, sofort nutzbaren Werkzeug ohne Demodaten und Zugangsbarrieren.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                          React Frontend (SPA)                          │
├────────────────────────────────────────────────────────────────────────┤
│  Navbar (Bereinigt von Auth/Logout, Projektname, Quick-Navigation)     │
├────────────────────────────────────────────────────────────────────────┤
│  Stepper: [1. Kriterien]  ──►  [2. Produkt & Upload]  ──► [3. Audit]   │
├────────────────────────────────────────────────────────────────────────┤
│  Schritt 2: Step2ProductUpload                                         │
│  ┌───────────────────────────┐      ┌───────────────────────────┐      │
│  │ Upload-Zone: SDB (PDF)    │      │ Upload-Zone: Prüfbericht  │      │
│  └─────────────┬─────────────┘      └─────────────┬─────────────┘      │
│                │                                  │                    │
│                ▼                                  ▼                    │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ AI Extraction Modal: "Ausgelesene Daten prüfen & bestätigen"  │      │
│  │ - Produkt, Hersteller, DGNB-Zeile, VOC, SVHC, Zertifikate    │      │
│  │ - Zitate aus dem PDF als Nachweis, editierbare Inputs        │      │
│  │ [ Abbrechen ]            [ Daten bestätigen & übernehmen ]  │      │
│  └──────────────────────────────┬───────────────────────────────┘      │
│                                 ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ Bewertungsformular (Befüllt mit bestätigten Werten)          │      │
│  │ [ Ausgewählte Standards jetzt prüfen (DGNB, QNG, BNB) ]       │      │
│  └──────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │ HTTP POST /api/documents/parse-pdf
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Express Backend (Node.js)                       │
├────────────────────────────────────────────────────────────────────────┤
│  Route: POST /api/documents/parse-pdf                                  │
│  - Nimmt PDF base64 + Dokumententyp entgegen (sdb oder pruefbericht)   │
│  - Ruft @google/genai SDK (gemini-3.8-flash) mit Schema auf            │
│  - Gibt strukturierte Kennwerte + Zitate zurück                        │
├────────────────────────────────────────────────────────────────────────┤
│  Route: POST /api/standards/analyze-product                            │
│  - Führt deterministische K.O.-Prüfung gegen DGNB/QNG/BNB durch        │
└────────────────────────────────────────────────────────────────────────┘
```

#### Extraktions-Schema für PDF-Dokumente

```typescript
interface ExtractedDocumentData {
  documentType: 'sdb' | 'pruefbericht' | 'unbekannt';
  productName?: string;
  manufacturer?: string;
  suggestedCriteriaNr?: string; // z.B. "1" für Innenwandfarben
  vocContent?: string;          // z.B. "< 1 g/l" oder "28 g/l"
  svhcStatus?: string;          // z.B. "Keine SVHC > 0,1%"
  certificates?: string[];      // z.B. ["Blauer Engel (DE-UZ 102)", "EMICODE EC1 PLUS"]
  hasBauteilekatalog?: boolean; // Erwähnung Bauteilkatalog / Baustellendokumentation
  summarySnippet: string;       // Relevante Fundstellen im Text
  fieldQuotes: {
    field: string;
    quote: string;
    pageOrSection?: string;
  }[];
}
```

---

### Verifikations- und Akzeptanzkriterien

1. **Upload-Funktion**: Benutzer kann sowohl für SDB als auch für Prüfberichte separate PDF-Dateien hochladen (per Drag-and-Drop oder Dateidialog).
2. **KI-Analyse**: Das Backend liest per Gemini die bauphysikalisch relevanten Daten zuverlässig aus und liefert sie als strukturiertes JSON zurück.
3. **Bestätigungsdialog**: Ein Modal zeigt die extrahierten Werte mit Fundstellen an. Erst nach Klick auf *"Bestätigen & übernehmen"* fließen die Werte in das Formular.
4. **Keine Logins**: Die App öffnet ohne Login-Maske, Whitelist-Fehler oder Passphrase-Abfragen sofort betriebsbereit.
5. **Keine Demodaten**: Felder und Formulare starten leer bzw. mit Platzhaltern ("Bitte PDF hochladen oder manuell eingeben"), ohne vorbefüllte Dummy-Produkte.
6. **Kompilierung & Linting**: `npm run build` und `npm run lint` schließen fehlerfrei ab.
