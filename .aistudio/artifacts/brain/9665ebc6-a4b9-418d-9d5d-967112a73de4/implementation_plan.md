# QM-Tool Nachhaltigkeit – Multi-Standard Erweiterung mit selektiver Prüfgrundlagen-Auswahl

Transformation des bisherigen DGNB-spezifischen Tools in das übergeordnete **QM-Tool Nachhaltigkeit**. Das System unterstützt standardmäßig DGNB (ENV1.2), QNG (Qualitätssiegel Nachhaltiges Gebäude, Anhang 3) und BNB (Bewertungssystem Nachhaltiges Bauen, Kriterium 1.1.6) und ermöglicht das flexible Hochladen von Leitfäden beliebiger weiterer Institute via KI-Scan mit anschließender interaktiver Bestätigung.

> [!IMPORTANT]
> **Aktualisierte Kernanforderung (Token- & Traffic-Optimierung):**
> Bei der Eingabe der Produktdaten (Schritt 2) kann der Nutzer über Checkboxen **gezielt auswählen, gegen welche Prüfgrundsätze** das Produkt evaluiert werden soll (z.B. nur DGNB, nur QNG, nur BNB, zwei ausgewählte oder alle verfügbaren Standards).
> - **Server & KI:** Es werden nur die selektierten Standards im Prompt und in der Auswertung verarbeitet, was unnötige API-Aufrufe und Token-Kosten eliminiert.
> - **Dashboard & Nachweis:** In der Auswertung (Schritt 3) und im Kundendokument (Schritt 4) werden ausschließlich die gewählten Prüfgrundlagen und deren synoptischer Vergleich dargestellt.

---

## 1. Übersicht & Kernkonzept

- **Was das System leistet:**
  1. **Multi-Standard-Matrixverwaltung (Schritt 1):** Verwaltung aktiver Prüfgrundlagen (DGNB 2023, QNG 2023/2024, BNB 1.1.6) sowie dynamisch per PDF hochgeladener Institutsleitfäden (z. B. NaWoh, BREEAM, LEED oder kommunale Standards).
  2. **KI-Dokumentenscan & Kriterien-Extraktion:** PDF-Upload von Institutsleitfäden mit automatischer Erkennung von Produktgruppen, Schadstoffparametern und Anforderungsstufen durch Gemini `gemini-3.8-flash`.
  3. **Interaktive Prüf- und Bestätigungsmaske:** Erkannte Kriterien werden dem Nutzer vor der Übernahme in einer strukturierten Maske zur Kontrolle und manuellen Korrektur vorgelegt.
  4. **Selektive Multi-Standard-Produktprüfung (Schritt 2):**
     - Bei der Produkterfassung wählt der Nutzer über intuitive Schalter/Checkboxen die zu prüfenden Standards aus (z.B. `[x] DGNB`, `[ ] QNG`, `[x] BNB`).
     - Standard-spezifische Zeilenzuordnungen (oder automatische Bauteilerkennung) werden für die ausgewählten Systeme vorgenommen.
  5. **Bedarfsgerechte Auswertung (Schritt 3):**
     - Gesamt-Dashboard mit Kacheln **nur für die aktiv gewählten Standards**.
     - Synopse vergleicht exakt die angeforderten Zertifizierungssysteme.
  6. **Konsolidierter Kundennachweis (Schritt 4):**
     - Druckfertiger Konformitätsbericht mit Nachweisen und K.O.-Begründungen ausschließlich für die beauftragten Standards.

---

## 2. Benutzererlebnis & Interface-Design

### Key User Flows

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. Kriterien- & Standardverwaltung (QM-Tool Nachhaltigkeit)                           │
│  - Tabs/Filter: DGNB ENV1.2 | QNG Siegel | BNB Bundesbau | [Eigener Standard]          │
│  - Button: "Weiteren Instituts-Leitfaden scannen (PDF)"                                │
│    └─> Datei auswählen ──> Gemini 3.8 Flash Scan ──> Interaktive Prüfmaske             │
│    └─> Kriterien überprüfen/anpassen ──> "In Bewertungsmatrix übernehmen"             │
│  - Kriterienmatrix verbindlich für das Audit bestätigen & fixieren                     │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. Produktdaten & SELEKTIVE Standard-Auswahl (Traffic-Sparmodus)                      │
│  - Checkbox-Leiste "Zu prüfende Nachhaltigkeits-Standards":                            │
│      [✓] DGNB ENV1.2 (2023)    [ ] QNG Anhang 3    [✓] BNB Kriterium 1.1.6             │
│  - Produktdaten: Name, Hersteller, Sicherheitsdatenblatt (SDB), Laborberichte          │
│  - Bauteilkatalog & Baustellenüberwachung vorhanden (Ja/Nein)                          │
│  - Klick auf "Prüfung starten" ──> Sendet NUR die gewählten Standards an den Server    │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 3. Selektives Auswertungs-Dashboard                                                   │
│  - Synoptische Ampel-Zusammenfassung NUR für die gewählten Standards                   │
│  - Kacheln:                                                                            │
│    • DGNB: Qualitätsstufe QS 1–4 (K.O.-Faktor) (sofern ausgewählt)                     │
│    • BNB: Qualitätsniveau Stufe 1–5 (sofern ausgewählt)                                │
│    • QNG: Konformitätsstatus (Erfüllt / Nicht erfüllt) (sofern ausgewählt)             │
│  - Isolierte Parameter-Tabelle je gewähltem System mit K.O.-Begründung                 │
│  - Konkrete Handlungsempfehlungen für die ausgewählten Standards                       │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 4. Druckfertiger Prüf- und Konformitätsbericht                                         │
│  - Titel: "QM-Tool Nachhaltigkeit – Zertifizierungs-Gutachten"                         │
│  - Dokumentiert klar: "Geprüft nach: DGNB ENV1.2, BNB Kriterium 1.1.6"                 │
│  - Revisionssichere Signatur- und Freigabefelder                                       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Visual Identity & Theme
- **Name:** *QM-Tool Nachhaltigkeit* (Austausch aller veralteten DGNB-only Bezeichnungen im Header, Footer, Stepper und Seitentitel).
- **Aesthetic Direction:** Präzises, industrielles Qualitätsmanagement-Design nach SaaS & Dashboard-Richtlinien (hohe Informationsdichte, Tabular-Numerals, 60-30-10 Farbdisziplin).
- **Farbpalette:** Neutraler Canvas (Slate-50 / White), strukturierte Kanten (Slate-200), Akzentgrün (Emerald-700) für Konformität und Qualitätsauszeichnungen, Bernstein (Amber-600) für K.O.-Engpässe, Schiefergrau (Slate-900) für Header und Kontrollen.
- **Typografie:** Plus Jakarta Sans für klare Überschriften und UI, JetBrains Mono / font-mono für Normangaben, CAS-Nummern, VOC-Grenzwerte und Tabellenwerte.

---

## 3. Technische Architektur & Datenmodell

### System-Architektur

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser Client (React 19 + TypeScript + Tailwind CSS)                   │
│  ├── Navbar ("QM-Tool Nachhaltigkeit", Projektwahl, Auditor-Status)     │
│  ├── Step 1: MultiStandardMatrixManager                                 │
│  │    ├── StandardsTabBar (DGNB, QNG, BNB, Custom Standards)            │
│  │    ├── GuidelineUploadModal (PDF Drag & Drop)                        │
│  │    └── ReviewCriteriaDrawer (Interaktive Freigabemaske)              │
│  ├── Step 2: MultiProductUploadForm                                     │
│  │    └── StandardsSelector (Checkboxen: [DGNB] [QNG] [BNB] [Custom])   │
│  ├── Step 3: MultiStandardDashboard                                     │
│  │    ├── SynopticSummaryHeader (nur ausgewählte Standards)             │
│  │    └── StandardResultCard (je ausgewähltem Standard)                 │
│  └── Step 4: ConsolidatedCustomerReport                                 │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ JSON API Requests (nur selektierte Standards!)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Node.js Server (server.ts + Express)                                    │
│  ├── POST /api/standards/parse-guideline-pdf                            │
│  │    └─> Gemini 3.8 Flash Multimodal Scan                              │
│  │    └─> Extrahiert Standard-Metadaten, Produktgruppen, Anforderungs-  │
│  │        stufen (QS1-4 oder Stufe 1-5 oder Erfüllt/Nicht-Erfüllt)      │
│  ├── POST /api/standards/analyze-product                                │
│  │    └─> Payload enthält nur: { targetStandards: ['DGNB', 'BNB'], ...}│
│  │    └─> Gemini 3.8 Flash Prompt konzentriert sich NUR auf angefragte  │
│  │        Systeme (enorme Token- & Latenzeinsparung)                    │
│  │    └─> Deterministische K.O.-Logik (Schwachstellenprinzip)           │
│  └── Auth & Encryption Endpoints (Bestehende Whitelist & Vault-Logik)   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Erweiterte Datenstrukturen (`src/types/dgnb.ts`)

```typescript
export type StandardCode = 'DGNB' | 'QNG' | 'BNB' | string;

export interface SustainabilityStandard {
  id: string;
  code: StandardCode;
  name: string;           // z.B. "DGNB ENV1.2 Neubau (2023)"
  institute: string;      // z.B. "Deutsche Gesellschaft für Nachhaltiges Bauen"
  version: string;        // z.B. "2023"
  isCustom?: boolean;
  criteriaRows: CriteriaRow[];
}

export interface SingleStandardEvaluationResult {
  standardCode: StandardCode;
  standardName: string;
  institute: string;
  overallRating: string;       // z.B. "QS 3" (DGNB), "Erfüllt" (QNG), "Stufe 4" (BNB)
  isCompliant: boolean;        // Grundlegende Konformität
  bottleneckParameter?: string;
  bottleneckReason: string;
  userExplanation: string;
  parameters: ParameterEvaluation[];
  recommendation: string;
}

export interface MultiStandardProductEvaluationResult {
  productName: string;
  manufacturer: string;
  productType: string;
  selectedStandardCodes: string[];
  auditMetadata: {
    auditId: string;
    auditDate: string;
    auditorEmail: string;
    projectName: string;
  };
  standardsEvaluations: Record<string, SingleStandardEvaluationResult>;
  synopticSummary: {
    bestStandard: string;
    criticalStandard: string;
    overallRecommendation: string;
  };
  customerReport: {
    title: string;
    subtitle: string;
    legalMandatoryNotice: string;
    executiveSummary: string;
    conclusion: string;
  };
}
```

---

## 4. Geplante Änderungen im Detail

1. **Rebranding auf "QM-Tool Nachhaltigkeit":**
   - Aktualisierung von `index.html` (`<title>`, Meta-Tags).
   - Aktualisierung von `metadata.json` ("QM-Tool Nachhaltigkeit").
   - Neugestaltung des Headers in `Navbar.tsx` und der Footer-Texte.

2. **Standard-Kataloge bereitstellen (`src/data/standardsCatalogs.ts`):**
   - **DGNB ENV1.2 (2023):** 45 Kriterienzeilen mit QS 1 bis QS 4.
   - **QNG Anhang 3 (2023/2024):** Kriterien für schadstoffarme Baumaterialien (Grenzwerte für Innenraumfarben, Klebstoffe, Bodenbeläge, Dämmstoffe).
   - **BNB Neubau 1.1.6:** Risiken für die lokale Umwelt der Bundesbauten (Stufen 1–5).

3. **Dokumenten-Scanner Backend (`/api/standards/parse-guideline-pdf`):**
   - Verarbeitet beliebige hochgeladene PDF-Dateien via Gemini `gemini-3.8-flash`.
   - Extrahiert Standard-Name, Herausgeber/Institut, Gültigkeit und eine Liste strukturierter Kriterienzeilen.

4. **Interaktive Bestätigungsmaske (`ReviewCriteriaModal.tsx`):**
   - Zeigt dem Benutzer die erkannten Kriterienzeilen des Dokuments.
   - Ermöglicht das Bearbeiten von Grenzwerten, Stoffbezeichnungen und Nachweisdokumenten.
   - Ermöglicht das Abwählen irrelevanter Zeilen.
   - "In Bewertungsmatrix übernehmen" speichert die Kriterien in die aktive Prüfgrundlage.

5. **Schritt 2: Selektive Standard-Auswahl (Traffic-Sparer):**
   - Schalter/Checkboxen für jeden verfügbaren Standard (`[✓] DGNB`, `[ ] QNG`, `[✓] BNB`, etc.).
   - Mindestens ein Standard muss aktiv sein.
   - Der Request an `/api/standards/analyze-product` übergibt nur die aktivierten Standards.

6. **Bedarfsgerechtes Dashboard & Kundennachweis (Schritt 3 & 4):**
   - Auswertung zeigt genau Kacheln für die gewählten Systeme.
   - K.O.-Begründungen und Parameter-Vergleiche nur für die ausgewählten Standards.
   - Kundennachweis listet sauber auf, welche Zertifizierungsgrundlagen Gegenstand der Prüfung waren.
