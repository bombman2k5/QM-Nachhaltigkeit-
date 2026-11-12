import { ProductEvaluationResult } from '../types/dgnb';

/**
 * Offizielle Kopf- und Fußzeilen-Daten, extrahiert aus der KAUBIT-Briefbogenvorlage:
 * /assets/aistudio/Vorlage_wpz_neu_9a344953.pdf
 */
export interface KaubitBankAccount {
  bankName: string;
  bic: string;
  iban: string;
}

export interface KaubitLetterheadConfig {
  brandColors: {
    blue: string;
    teal: string;
  };
  header: {
    logoAssetPath: string;
    templatePdfPath: string;
    brandName: string;
    tagline: string;
    postalHeaderLine: string;
  };
  footer: {
    companyColumn: {
      companyName: string;
      street: string;
      city: string;
      phone: string;
      fax: string;
      website: string;
      email: string;
    };
    registryColumn: {
      registeredOffice: string;
      registerLabel: string;
      registerCourt: string;
      registerNumber: string;
      vatId: string;
      taxNumber: string;
    };
    bankAccounts: KaubitBankAccount[];
    boardLine: string;
  };
}

export const KAUBIT_LETTERHEAD: KaubitLetterheadConfig = {
  brandColors: {
    blue: '#0066b3',
    teal: '#00b5a5',
  },
  header: {
    logoAssetPath: '/assets/aistudio/kaubit-logo.png',
    templatePdfPath: '/assets/aistudio/Vorlage_wpz_neu_9a344953.pdf',
    brandName: 'KAUBIT',
    tagline: 'Systemabdichtungsbaustoffe',
    postalHeaderLine: 'KAUBIT Aktiengesellschaft · Postfach 11 48 · DE-49407 Dinklage',
  },
  footer: {
    companyColumn: {
      companyName: 'Kaubit Aktiengesellschaft',
      street: 'Industriestraße 1',
      city: 'DE-49413 Dinklage',
      phone: 'Telefon +49 (0) 44 43/ 96 69-0',
      fax: 'Telefax +49 (0) 44 43/ 96 69-66',
      website: 'Internet: www.kaubit.de',
      email: 'E-Mail: info@kaubit.de',
    },
    registryColumn: {
      registeredOffice: 'Sitz der Gesellschaft: Dinklage',
      registerLabel: 'Handelsregister:',
      registerCourt: 'Amtsgericht Oldenburg',
      registerNumber: 'Abt. B Nr. 111274',
      vatId: 'USt-IdNr. DE812447898',
      taxNumber: 'Steuer-Nr. 68/203/71814',
    },
    bankAccounts: [
      {
        bankName: 'Oldenburgische Landesbank AG, Dinklage',
        bic: 'OLBODEH2XXX',
        iban: 'DE77 2802 0050 4387 5756 00',
      },
      {
        bankName: 'Deutsche Bank AG, Vechta',
        bic: 'DEUTDEHB290',
        iban: 'DE84 2907 0059 0610 0457 00',
      },
      {
        bankName: 'VR Bank Dinklage-Steinfeld eG',
        bic: 'GENODEF1DIK',
        iban: 'DE27 2806 5108 0011 6955 00',
      },
      {
        bankName: 'Bremer Landesbank',
        bic: 'BRLADE22XXX',
        iban: 'DE46 2905 0000 2002 0807 64',
      },
      {
        bankName: 'Landessparkasse zu Oldenburg, Lohne',
        bic: 'SLZODE22XXX',
        iban: 'DE74 2805 0100 0001 9914 88',
      },
      {
        bankName: 'Commerzbank AG, Vechta',
        bic: 'COBADEFFXXX',
        iban: 'DE22 2804 2865 0593 5341 00',
      },
      {
        bankName: 'Kreissparkasse Bersenbrück',
        bic: 'NOLADE21BEB',
        iban: 'DE20 2655 1540 0085 1569 17',
      },
    ],
    boardLine:
      'Vorstandsvorsitzende: Sylvia Selting · Mitglied des Vorstandes: Rüdiger Selting · Aufsichtsratsvorsitzender: Bernhard Taute',
  },
};

export const DEMO_KAUBIT_EVALUATION_RESULT: ProductEvaluationResult = {
  productName: 'KAUBIT System-Abdichtungsbahn KSK-Plus ELF',
  manufacturer: 'KAUBIT Aktiengesellschaft',
  productType: 'Kalt-selbstklebende Bitumen-Dichtungsbahn / Grundierung (Zeile 13)',
  hasBauteilekatalog: true,
  selectedStandardCodes: ['DGNB', 'QNG', 'BNB'],
  standardsEvaluations: {
    DGNB: {
      standardCode: 'DGNB',
      standardName: 'DGNB Kriterium ENV1.2 (Version 2023)',
      institute: 'Deutsche Gesellschaft für Nachhaltiges Bauen (DGNB e.V.)',
      matchedCriteriaRowNr: '13',
      matchedCriteriaTitle: 'Zeile 13: Voranstriche, Grundierungen und Kaltkleber (Bitumen)',
      overallRating: 'Qualitätsstufe 4 / 4',
      overallLevelNum: 4,
      isCompliant: true,
      bottleneckReason: 'Alle Parameter und Nachweise für Qualitätsstufe 4 vollständig erfüllt.',
      userExplanation:
        'Das Produkt erfüllt sämtliche Grenzwerte für Qualitätsstufe 4 nach dem DGNB-Schwachstellenprinzip (Lösemittelfreiheit, SVHC ≤ 0,1 % und dokumentierter Bauteilekatalog).',
      recommendation: 'Uneingeschränkt freigegeben für DGNB-Platin/Gold-Bauvorhaben (Qualitätsstufe 4).',
      parameters: [
        {
          key: 'voc',
          parameterKey: 'voc',
          parameterName: 'VOC-Gehalt / Lösemittelfreiheit (GISCODE)',
          productValue: '< 1 g/l (GISCODE BBP10, lösemittelfrei)',
          requiredForQS4: 'Lösemittelfreie Dispersion (GISCODE BBP10)',
          achievedLevel: 4,
          isBottleneck: false,
          status: 'pass',
          explanation: 'Vollständig lösemittelfrei gemäß SDB Abschnitt 9 & 15.',
          evidence: {
            source: 'sdb',
            page: 2,
            quote: 'GISCODE BBP10 – VOC-Gehalt < 1 g/l (lösemittelfrei)',
            verification: 'verified',
          },
        },
        {
          key: 'svhc',
          parameterKey: 'svhc',
          parameterName: 'SVHC-Gehalt (REACH-Kandidatenliste)',
          productValue: 'Keine SVHC > 0,1 % M.-%',
          requiredForQS4: 'SVHC ≤ 0,1 %',
          achievedLevel: 4,
          isBottleneck: false,
          status: 'pass',
          explanation: 'Keine besonders besorgniserregenden Stoffe > 0,1 % enthalten.',
          evidence: {
            source: 'sdb',
            page: 1,
            quote: 'Enthält keine SVHC-Stoffe > 0,1 % w/w gemäß REACH Art. 33.',
            verification: 'verified',
          },
        },
        {
          key: 'testDate',
          parameterKey: 'testDate',
          parameterName: 'Alter Prüfbericht / Nachweisaktualität',
          productValue: '14.03.2025',
          requiredForQS4: 'Prüfbericht ≤ 5 Jahre alt',
          achievedLevel: 4,
          isBottleneck: false,
          status: 'pass',
          explanation: 'Aktueller Werksprüfbericht vorhanden.',
          evidence: {
            source: 'report',
            page: 1,
            quote: 'Prüfdatum: 14.03.2025',
            verification: 'verified',
          },
        },
      ],
    },
    QNG: {
      standardCode: 'QNG',
      standardName: 'QNG Anhangdokument 3.1.3 (Version 1.3)',
      institute: 'BMWSB – Qualitätssiegel Nachhaltiges Gebäude',
      matchedCriteriaRowNr: '5.1',
      matchedCriteriaTitle: 'Ziffer 5.1: Bitumen-Voranstriche, Dichtungsbahnen & Kleber',
      overallRating: 'QNG Erfüllt (Stufe 4)',
      overallLevelNum: 4,
      isCompliant: true,
      bottleneckReason: 'QNG-Anforderungen an Schadstoffvermeidung vollständig erfüllt.',
      userExplanation: 'Erfüllt die KfW-Förderanforderungen nach QNG Anhangdokument 3.1.3.',
      recommendation: 'Für QNG-Plus und QNG-Premium Gebäudezertifizierungen freigegeben.',
      parameters: [
        {
          key: 'voc',
          parameterKey: 'voc',
          parameterName: 'GISCODE / Lösemittelfreiheit',
          productValue: 'GISCODE BBP10 (< 1 g/l VOC)',
          requiredForQS4: 'GISCODE BBP10 (lösemittelfrei)',
          achievedLevel: 4,
          isBottleneck: false,
          status: 'pass',
          explanation: 'QNG-Grenzwert eingehalten.',
        },
      ],
    },
    BNB: {
      standardCode: 'BNB',
      standardName: 'BNB Steckbrief 1.1.6 (Version 2015)',
      institute: 'Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen',
      matchedCriteriaRowNr: '13',
      matchedCriteriaTitle: 'Anlage 1 Zeile 13: Bitumenprodukte & Grundierungen',
      overallRating: 'Qualitätsniveau 5 / 5 (Stufe 4)',
      overallLevelNum: 4,
      isCompliant: true,
      bottleneckReason: 'Höchstes BNB-Qualitätsniveau erreicht.',
      userExplanation: 'Alle Anforderungen des BNB-Steckbriefs 1.1.6 sind erfüllt.',
      recommendation: 'Freigabe für Bundesbauten im höchsten Qualitätsniveau.',
      parameters: [
        {
          key: 'svhc',
          parameterKey: 'svhc',
          parameterName: 'SVHC ≤ 0,1 % & Lösemittelfreiheit',
          productValue: 'SVHC < 0,1 %, GISCODE BBP10',
          requiredForQS4: 'SVHC ≤ 0,1 %, GISCODE BBP10',
          achievedLevel: 4,
          isBottleneck: false,
          status: 'pass',
          explanation: 'Vollständig konform.',
        },
      ],
    },
  },
  synopticSummary: {
    overallRecommendation:
      'Das geprüfte Produkt „KAUBIT System-Abdichtungsbahn KSK-Plus ELF“ der KAUBIT Aktiengesellschaft erreicht in der synoptischen Prüfung über DGNB ENV1.2, QNG 3.1.3 und BNB 1.1.6 durchgängig die höchste Qualitätsstufe (Stufe 4). Nach dem strengen K.O.-Schwachstellenprinzip liegt kein abwertender Einzelparameter vor.',
    bestStandard: 'DGNB ENV1.2 (Qualitätsstufe 4)',
    criticalStandard: 'Kein K.O.-Faktor festgestellt – alle Zielwerte für Stufe 4 erreicht.',
  },
  customerReport: {
    title: 'WERKSPRÜFZEUGNIS / KONFORMITÄTSNACHWEIS NACHHALTIGKEIT',
    subtitle: 'Schadstoff- und Emissionsbewertung nach DGNB ENV1.2, QNG 3.1.3 & BNB 1.1.6',
    executiveSummary:
      'Auf Basis der eingereichten Sicherheitsdatenblätter (SDB) und Emissionsprüfberichte wurde das Bauprodukt „KAUBIT System-Abdichtungsbahn KSK-Plus ELF“ nach dem strengen DGNB-Schwachstellenprinzip (K.O.-Verfahren) ausgewertet. Sowohl die chemischen Grenzwerte (VOC < 1 g/l, SVHC ≤ 0,1 %) als auch die formale Nachweisführung über den materialökologischen Bauteilekatalog sind für Qualitätsstufe 4 lückenlos erfüllt.',
    conclusion:
      'Ergebnis: Qualitätsstufe 4 von 4 erreicht – Produkt ist ohne Einschränkung für DGNB-, QNG- und BNB-Bauvorhaben der höchsten Qualitätsstufe freigegeben.',
    legalMandatoryNotice:
      'Dieser Nachweis basiert auf den zum Prüfzeitpunkt vorliegenden Herstellerdokumenten (SDB & Prüfberichte) nach DGNB ENV1.2 (2023), QNG 3.1.3 und BNB 1.1.6.',
  },
  auditMetadata: {
    auditId: 'WPZ-KAUBIT-2026-0412',
    auditDate: '12.11.2026',
    auditorEmail: 'brian.lackmann@kaubit.de',
    projectName: 'Neubau Büro- & Geschäftshaus Campus Nord',
    standardsVersionSummary: 'DGNB 2023 · QNG 1.3 · BNB 2015',
  },
};
