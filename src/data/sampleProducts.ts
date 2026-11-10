import { SampleProduct } from '../types/dgnb';

export const SAMPLE_PRODUCTS: SampleProduct[] = [
  {
    id: 'sample-1',
    name: 'Caparol Sylitol Bio-Innenfarbe',
    manufacturer: 'Caparol Farben Lacke Bautenschutz GmbH',
    criteriaNr: '1',
    description: 'Konservierungsmittelfreie Silikat-Innenfarbe für Allergiker. Zertifiziert mit Blauer Engel DE-UZ 102.',
    expectedLevel: 4,
    hasBauteilekatalog: true,
    sdbSnippet: `SICHERHEITSDATENBLATT gem. Verordnung (EG) Nr. 1907/2006 (REACH)
Handelsname: Sylitol Bio-Innenfarbe
Hersteller: Caparol Farben Lacke Bautenschutz GmbH
Abschnitt 2: Mögliche Gefahren: Nicht einstufungspflichtig gem. Verordnung (EG) Nr. 1272/2008.
Abschnitt 3: Zusammensetzung: Kaliwasserglas, mineralische Pigmente und Füllstoffe, Reinacrylat-Dispersion (< 3 %). SVHC: Enthält keine Stoffe der REACH-Kandidatenliste in Konzentrationen > 0,1 % w/w.
Abschnitt 9: Physikalische Eigenschaften: pH-Wert ca. 11,0. Dichte ca. 1,48 g/cm³. Lösemittelfrei und weichmacherfrei gem. VdL-RL01.
Abschnitt 15: Vorschriften: VOC-Gehalt nach Decopaint RL 2004/42/EG: Grenzwert Kat. a (Wb): 30 g/l. Das Produkt enthält: < 1 g/l VOC.`,
    testReportSnippet: `PRÜFBERICHT / EMISSIONSZERTIFIKAT
Prüfinstitut: eco-INSTITUT Köln GmbH
Prüfgegenstand: Caparol Sylitol Bio-Innenfarbe
Ergebnis der Prüfkammeruntersuchung (28 Tage nach DIN EN 16516):
- TVOC (28d): < 5 µg/m³
- Formaldehyd: < 2 µg/m³
- SVHC: nicht nachweisbar (< 0,01 %)
- Zertifizierung: RAL Umweltzeichen "Blauer Engel" (DE-UZ 102) zuerkannt unter Registernummer 38291.
Konformität: Erfüllt alle Kriterien für schadstoffarme Beschichtungsstoffe nach DGNB ENV1.2 Neubau 2023.`,
  },
  {
    id: 'sample-2',
    name: 'ProfiColor Standard Dispersionsfarbe',
    manufacturer: 'NordBau Lacke & Farben GmbH',
    criteriaNr: '1',
    description: 'Klassische Dispersionsfarbe für Wohnräume mit VOC 28 g/l. Kein Blauer Engel vorhanden.',
    expectedLevel: 2,
    hasBauteilekatalog: false,
    sdbSnippet: `SICHERHEITSDATENBLATT gem. REACH
Produkt: ProfiColor Standard Wandfarbe
Hersteller: NordBau Lacke & Farben GmbH
Abschnitt 3: Zusammensetzung: Wässrige Kunststoffdispersion, Titandioxid, Calciumcarbonat, Wasser, Glykolether (Lösemittelanteil). SVHC ≤ 0,1 %.
Abschnitt 9: Dichte 1,42 g/ml.
Abschnitt 15: VOC nach EU-Richtlinie 2004/42/EG: Unterkategorie a: 30 g/l (2010). Dieses Produkt enthält max. 28 g/l VOC.`,
    testReportSnippet: `WERKS-PRÜFBERICHT UND ANALYSENZERTIFIKAT
Labor: NordBau Qualitätskontrolle
Messwert VOC: 28 g/l.
SVHC-Kandidatenliste: Keine Stoffe über 0,1 % Massenanteil enthalten.
Umweltzeichen: Das Produkt besitzt KEIN Umweltzeichen (kein Blauer Engel / kein DE-UZ 102).
Fazit: Erfüllt die Decopaint-Richtlinie. Für DGNB QS 3 (< 10 g/l) oder QS 4 (< 1 g/l bzw. DE-UZ 102) reicht der VOC-Gehalt von 28 g/l nicht aus.`,
  },
  {
    id: 'sample-3',
    name: 'Thomsit K 188 E Spezial-Klebstoff Extra',
    manufacturer: 'Thomsit Bautechnik',
    criteriaNr: '7',
    description: 'Hochwertiger, sehr emissionsarmer Nass- und Haftklebstoff für PVC- und Kautschukbeläge. EMICODE EC1 PLUS.',
    expectedLevel: 4,
    hasBauteilekatalog: true,
    sdbSnippet: `SICHERHEITSDATENBLATT (VO 1907/2006)
Handelsname: Thomsit K 188 E Spezial-Klebstoff Extra
Hersteller: Thomsit
Zusammensetzung: Wässrige Dispersion von Kunstharzen und Füllstoffen.
Lösemittelfrei nach TRGS 610. GISCODE D1.
SVHC: Keine SVHC über 0,1 % gem. REACH Art. 33.`,
    testReportSnippet: `GEV-EMICODE ZERTIFIKAT (Gemeinschaft Emissionskontrollierte Verlegewerkstoffe e.V.)
Zertifikatsnummer: 2491/15.01.02
Produkt: Thomsit K 188 E
Klassifizierung: EMICODE EC1 PLUS (sehr emissionsarm)
Emissionsprüfung nach EN 16516:
- TVOC nach 3 Tagen: 25 µg/m³ (Grenzwert ≤ 750 µg/m³)
- TVOC nach 28 Tagen: 15 µg/m³ (Grenzwert ≤ 60 µg/m³)
- Karzinogene nach 3 Tagen: < 1 µg/m³
Einstufung DGNB Kriterium ENV1.2 (2023) Zeile 7: Erfüllt die höchste Qualitätsstufe QS 4.`,
  },
  {
    id: 'sample-4',
    name: 'Sika Trennmittel Bio-Form 15',
    manufacturer: 'Sika Deutschland GmbH',
    criteriaNr: '14',
    description: 'Biologisch abbaubares Betontrennmittel auf Esterbasis (OECD 302). QS 3 durch OECD 302.',
    expectedLevel: 3,
    hasBauteilekatalog: true,
    sdbSnippet: `SICHERHEITSDATENBLATT gem. EG 1907/2006
Handelsname: Sika Trennmittel Bio-Form 15
Zusammensetzung: Modifizierte Pflanzenölester und Kohlenwasserstoffe.
Flammpunkt > 120 °C.
DGUV-Klassifizierung: BTM 15.
SVHC: Frei von besonders besorgniserregenden Stoffen > 0,1 %.`,
    testReportSnippet: `LABORBERICHT BIOLOGISCHE ABBAUBARKEIT
Prüflabor: Fresenius Umweltlabor
Prüfnorm: OECD 302 B (Inhärente biologische Abbaubarkeit)
Ergebnis: Abbaurate nach 28 Tagen: 78 % (OECD 302 bestanden).
Hinweis: Die Prüfung nach OECD 301 (Leichte biologische Abbaubarkeit) oder Blauer Engel DE-UZ 64 wurde nicht durchgeführt.
Einstufung DGNB Zeile 14: Erfüllt QS 3. Für QS 4 ist OECD 301 B-F oder DE-UZ 64 erforderlich.`,
  },
];
