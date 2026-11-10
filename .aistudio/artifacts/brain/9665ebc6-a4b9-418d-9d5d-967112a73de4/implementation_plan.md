# QM-Tool Nachhaltigkeit – Vereinheitlichung der Systembezeichnung

Umfassende Harmonisierung und Umstellung der Anwendungsbezeichnung auf **QM-Tool Nachhaltigkeit** über alle Benutzeroberflächen, Sicherheitsmasken und Kommunikationsbereiche hinweg, unter Beibehaltung von *DGNB ENV1.2* als spezifischem Fachkriterium im Multi-Standard-Prüfkatalog.

> [!IMPORTANT]
> **Bestätigte Entscheidungen aus der Abstimmung:**
> 1. **Trennung von App-Brand und Normenkatalog:** Die Applikation, das Sicherheitsportal, die Navigation, Seitentitel und Systemhinweise treten einheitlich als **QM-Tool Nachhaltigkeit** auf. Die fachliche Kriterienmatrix *DGNB ENV1.2 (Neubau 2023)* bleibt innerhalb der Multi-Standard-Auswahl (neben QNG und BNB) als präzise Normenbezeichnung erhalten, um fachliche Verwechslungen zu vermeiden.
> 2. **Sicherheits- & Login-Screen:** Der Authentifizierungs-Screen ("DGNB ENV1.2 Sicherheits-Screen") wird auf **QM-Tool Nachhaltigkeit – Sicherheitsportal** umgestellt. Hinweistexte und die empfohlene Test-Passphrase werden auf das QM-Tool ausgerichtet (mit voller Abwärtskompatibilität für bestehende Test-Passphrasen).

---

## 1. Übersicht & Kernkonzept

- **Was das System leistet:**
  Das **QM-Tool Nachhaltigkeit** dient Auditoren, Nachhaltigkeitsberatern und Planern als zentrales Qualitätsmanagement-System zur Prüfung von Bauprodukten, Sicherheitsdatenblättern (SDB) und Emissionsprüfberichten. Es bewertet Baustoffe nach dem strengen Schwachstellenprinzip (K.O.-Verfahren) selektiv gegen etablierte Nachhaltigkeitsstandards (DGNB ENV1.2, QNG Anhang 3, BNB 1.1.6) und benutzerdefinierte Institutsleitfäden.
- **Zielgruppe & Anwender:**
  DGNB-Consultants, BNB-Auditoren, Nachhaltigkeitskoordinatoren, Generalübernehmer und Produkthersteller, die eine verlässliche Konformitätsprüfung ohne Medienbrüche durchführen.
- **Mehrwert dieser Umstellung:**
  Beseitigung irreführender Altreferenzen ("DGNB ENV1.2 Sicherheits-Screen"), die den falschen Eindruck erweckten, das Werkzeug sei rein auf DGNB beschränkt. Die neue Bezeichnung spiegelt die echte Multi-Standard-Funktionalität wider, während DGNB ENV1.2 präzise als eines der wählbaren Zertifizierungssysteme verankert bleibt.

---

## 2. Benutzererlebnis & Interface-Design

### Key User Flows

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Stufe 1: QM-Tool Nachhaltigkeit – Sicherheitsportal                              │
│  - Einheitliches Branding: "QM-Tool Nachhaltigkeit – Sicherheitsportal"          │
│  - Autorisierung gegen die zentrale Whitelist (ALLOWED_EMAILS)                   │
│  - Statusanzeige: "QM-Tool Nachhaltigkeit Arbeitsbereich wird vorbereitet"       │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Stufe 2: In-App Entschlüsselungsmaske (Vault Unlock)                            │
│  - Titel: "Sicherheitsprüfung der Unternehmensdaten – QM-Tool Nachhaltigkeit"    │
│  - Hinweistext & Testschlüssel-Vorschlag aktualisiert auf: QM-Tool-2024          │
│  - Nach erfolgreicher Entschlüsselung Weiterleitung in den Arbeitsbereich       │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 4-Schritte Prüf-Workspace (QM-Tool Nachhaltigkeit)                               │
│  ├── Schritt 1: Bewertungsmatrizen Nachhaltigkeit                                │
│  │    └─> Tabs: [DGNB ENV1.2] | [QNG Siegel] | [BNB Bundesbau] | [+ Leitfaden]    │
│  ├── Schritt 2: Produktprüfung                                                   │
│  │    └─> Selektive Standard-Auswahl: [✓] DGNB ENV1.2  [✓] QNG  [✓] BNB          │
│  ├── Schritt 3: Multi-Auswertung                                                 │
│  │    └─> Synopse & Kachelansicht für die gewählten Nachhaltigkeitsstandards     │
│  └── Schritt 4: Kundennachweis                                                   │
│       └─> Druckfertiger Konformitätsbericht mit Branding "QM-Tool Nachhaltigkeit"│
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Visual Identity & Theme
- **Typografie & Display:** Plus Jakarta Sans für Headings und Systemmarke, JetBrains Mono für Prüfbericht-IDs, Grenzwerte und Passphrase-Codes.
- **Top Bar Contract:** Aufgeräumter 3-Zonen-Header ohne überladene Subtitle-Badges:
  - *Zone 1:* Marken-Wortmarke `QM-Tool Nachhaltigkeit` mit dezentem Schutzschild-Icon.
  - *Zone 2:* 4 Navigationslinks mit Einzeilen-Disziplin (`Bewertungsmatrizen`, `Produktprüfung`, `Multi-Auswertung`, `Kundennachweis`).
  - *Zone 3:* Projekt-Eingabefeld, Auditor-Konto und Abmelde-Aktion.
- **Farbpalette:** 60% neutraler Slate-Hintergrund, 30% strukturierte weiße Kartenflächen mit subtilen 1px-Bordern, 10% Akzentgrün (`emerald-600`/`emerald-700`) für Qualitätsstufen und Bestätigungen.

---

## 3. Zentrale Produkt-Entscheidungen & Abwägungen

- **Entscheidung 1: Präzise Marken- und Katalogtrennung**
  - *Gewählter Ansatz:* Die Gesamt-Applikation heißt konsequent `QM-Tool Nachhaltigkeit`. Innerhalb der Matrizenverwaltung und des Produktprüfformulars heißt das DGNB-Kriterium weiterhin `DGNB ENV1.2 (Neubau 2023)`.
  - *Begründung:* Nutzer müssen im Multi-Standard-Betrieb eindeutig erkennen, welches Zertifizierungssystem (DGNB vs. QNG vs. BNB) sie gerade konfigurieren oder prüfen.
  - *Verworfene Alternative:* Ein pauschales Ersetzen von jedem "DGNB" im Code hätte die Kriterienauswahl unbenutzbar gemacht.

- **Entscheidung 2: Aktualisierung der Sicherheitsmaske & Passphrase-Hinweise**
  - *Gewählter Ansatz:* Die Authentifizierungsmaske (`AuthScreen.tsx`) wird von "DGNB ENV1.2 Sicherheits-Screen" auf "QM-Tool Nachhaltigkeit Sicherheits-Portal" umbenannt. Die Vorbelegungen und Hilfetexte für Testzwecke werden auf `QM-Tool-2024` modernisiert, wobei zur Vermeidung von Lockouts für bereits angelegte Accounts auch der alte Schlüssel `DGNB-ENV12-2023` im Entschlüsselungs-Fallback weiterhin akzeptiert wird.
  - *Begründung:* Maximale Konsistenz ohne bestehende Nutzertests oder bestehende Tresor-Verschlüsselungen zu zerstören.

---

## 4. Technische Architektur & System-Mapping

### System-Architektur

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Browser-Client: QM-Tool Nachhaltigkeit                                   │
│  ├── HTML Entry Point (index.html, metadata.json)                        │
│  │    └─> Title: "QM-Tool Nachhaltigkeit"                                │
│  ├── Navbar.tsx                                                          │
│  │    └─> Wordmark: "QM-Tool Nachhaltigkeit"                             │
│  ├── AuthScreen.tsx                                                      │
│  │    ├── Header: "QM-Tool Nachhaltigkeit – Sicherheitsportal"           │
│  │    ├── Subtext: 2-Stufen-Verfahren für nachhaltiges Qualitätsmanagement│
│  │    ├── Badge: "QM-Tool v2.0"                                          │
│  │    └── Feedback: "Verschlüsselung verifiziert. QM-Tool Arbeitsbereich"│
│  ├── Step1Matrix.tsx / Stepper.tsx                                       │
│  │    └─> Einheitliche QM-Tool Überschriften                             │
│  └── Step4CustomerDocument.tsx                                           │
│       └─> Briefkopf: "QM-Tool Nachhaltigkeit · Konformitätsgutachten"    │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Backend & Server-Routen (server.ts & crypto.ts)                          │
│  ├── /api/auth/verify-session                                            │
│  │    └─> Whitelist-Prüfung & Tresor-Status                              │
│  └── /api/standards/analyze-product                                      │
│       └─> Multi-Standard-Auswertung (DGNB ENV1.2, QNG, BNB)              │
└──────────────────────────────────────────────────────────────────────────┘
```

### Konkrete Komponenten-Anpassungen nach Nutzer-Freigabe

1. **`src/components/AuthScreen.tsx`**:
   - Header von `"DGNB ENV1.2 Sicherheits-Screen"` auf `"QM-Tool Nachhaltigkeit – Sicherheitsportal"` anpassen.
   - Subtext von `"DGNB ENV1.2 Arbeitsbereich wird geladen..."` auf `"QM-Tool Nachhaltigkeit Arbeitsbereich wird geladen..."` umstellen.
   - Versions-Badge von `"ENV1.2 v2023"` auf `"QM-Tool v2.0"` harmonisieren.
   - Fußzeilen-Badge von `"DGNB ENV1.2 Neubau (2023)"` auf `"QM-Tool Nachhaltigkeit · Multi-Standard"` anpassen.
   - Hilfetexte & Vorbelegungen zur Test-Passphrase auf `QM-Tool-Pass-2024` bzw. `QM-Tool-2024` ergänzen, bei vollständiger Abwärtskompatibilität für `DGNB-ENV12-2023`.
2. **`src/components/Navbar.tsx`**:
   - Sicherstellen, dass Brand-Wortmarke und Titel konsistent `QM-Tool Nachhaltigkeit` lauten.
3. **`src/components/Step4CustomerDocument.tsx`**:
   - Sicherstellen, dass im druckfertigen Kundennachweis der offizielle Header `QM-Tool Nachhaltigkeit · Baustoff-Konformitätsgutachten` prominent und sauber formatiert ist.
4. **Verifikation & Tests**:
   - Ausführung der Unit-Tests (`npx --yes tsx --test src/utils/dgnbEvaluation.test.ts`).
   - Applet-Kompilierung (`compile_applet`) und Linting (`lint_applet`).
   - Browser-Verifikation (`computer-use`) des Sicherheits-Screens und des Hauptarbeitsbereichs zur Bestätigung der visuellen Typografie und Fehlerfreiheit.
