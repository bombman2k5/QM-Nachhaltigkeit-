export type QualityLevel = 1 | 2 | 3 | 4;

export type StandardCode = 'DGNB' | 'QNG' | 'BNB' | string;

export interface AuthState {
  isAuthenticated: boolean;
  isVaultUnlocked: boolean;
  userEmail: string;
  userId?: string;
  hasPassphraseConfigured: boolean;
  sessionToken?: string;
  saltHex?: string;
  verifierHex?: string;
}

export interface CriteriaRow {
  id: string;
  nr: string;
  standardCode?: StandardCode;
  bauteil: string;
  anwendungsbereich: string;
  betrachteteStoffe: string;
  bezugsnorm: string;
  qs1: string;
  qs2: string;
  qs3: string;
  qs4: string;
  artDokumentation: string;
  geltungsbereich: string;
  kategorie?: string;
  dgnbRefNr?: string;
  qngRefNr?: string;
  bnbRefNr?: string;
}

export interface SustainabilityStandard {
  id: string;
  code: StandardCode;
  name: string;
  institute: string;
  version: string;
  shortDescription: string;
  ratingSystemType: 'QS1_QS4' | 'QNG_PASS_FAIL' | 'BNB_STUFEN' | 'CUSTOM';
  isCustom?: boolean;
  criteriaRows: CriteriaRow[];
}

/**
 * Ergebnis der serverseitigen Quellenprüfung eines KI-extrahierten Werts gegen den PDF-Textlayer.
 * - verified:       Zitat steht wörtlich im PDF und stützt den Wert
 * - partial:        Zitat nur ähnlich im PDF gefunden bzw. Wert nicht vollständig im Zitat
 * - unverified:     Zitat nicht im PDF gefunden (mögliche Halluzination)
 * - no-text-layer:  PDF hat keinen auslesbaren Text (Scan), Prüfung nicht möglich
 * - manual:         vom Nutzer manuell eingegeben oder geändert
 */
export type Verification = 'verified' | 'partial' | 'unverified' | 'no-text-layer' | 'manual';

/** Stabile Schlüssel der Pflichtparameter der Stufenbewertung. */
export type ParameterKey = 'voc' | 'testDate' | 'svhc' | 'label';

export interface ParameterEvidence {
  source?: 'sdb' | 'tm' | 'report' | 'manual' | 'missing';
  quote?: string;
  page?: number;
  verification: Verification;
  documentType?: 'sdb' | 'pruefbericht' | 'tm' | 'allgemein';
}

export interface ParameterEvaluation {
  key?: ParameterKey;
  parameterKey?: ParameterKey;
  parameterName: string;
  productValue: string;
  requiredForQS4: string;
  achievedLevel: QualityLevel;
  isBottleneck: boolean;
  status: 'pass' | 'fail' | 'warning';
  explanation: string;
  /** Beleg aus dem Dokument (falls vorhanden) */
  evidence?: ParameterEvidence;
  /** true, wenn der Parameter nicht eindeutig automatisch bewertet werden konnte (Human-in-the-loop) */
  needsManualReview?: boolean;
  /** Herkunft der Angabe */
  source?: 'document' | 'manual' | 'missing';
}

export interface ComplianceEvaluation {
  overallLevel: QualityLevel;
  maxChemicalLevel: QualityLevel;
  isBauteilekatalogKO: boolean;
  bottleneckParameter: ParameterEvaluation | null;
  bottleneckReason: string;
  userExplanation: string;
  bauteilekatalogImpactNote?: string;
  evaluatedParameters: ParameterEvaluation[];
  /** true, wenn mindestens ein Parameter manuell geprüft werden muss */
  isProvisional?: boolean;
}

export interface SingleStandardEvaluationResult {
  standardCode: StandardCode;
  standardName: string;
  institute: string;
  matchedCriteriaRowNr: string;
  matchedCriteriaTitle: string;
  overallRating: string; // e.g. "QS 3", "Erfüllt (Standard)", "Qualitätsniveau 4"
  overallLevelNum?: QualityLevel;
  isCompliant: boolean;
  bottleneckParameter?: string;
  bottleneckReason: string;
  userExplanation: string;
  parameters: ParameterEvaluation[];
  recommendation: string;
  /** true, wenn manuelle Prüfung erforderlich ist (unklare/nicht belegte Parameter) */
  isProvisional?: boolean;
  /** Hinweise, z. B. nicht zugeordnete Kriterienzeile */
  notes?: string[];
}

export interface ProductEvaluationResult {
  productName: string;
  manufacturer: string;
  productType: string;
  hasBauteilekatalog: boolean;
  /** Ausdrücklich getroffene Annahmen (z. B. Bauteilekatalog wird unterstellt) – erscheinen im Gutachten */
  assumptions?: string[];
  /** true, wenn mindestens ein Standard vorläufig ist */
  isProvisional?: boolean;
  selectedStandardCodes: string[];
  auditMetadata: {
    auditId: string;
    auditDate: string;
    auditorEmail: string;
    projectName: string;
    standardsVersionSummary: string;
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

export interface ExtractedFieldQuote {
  field: string;
  label: string;
  value: string;
  quote: string;
  pageOrSection?: string;
  /** Selbsteinschätzung des Modells – KEINE Verifikation */
  confidence?: 'high' | 'medium' | 'low';
  /** Serverseitig gegen den PDF-Textlayer geprüft */
  verification?: Verification;
  /** Seite, auf der das Zitat serverseitig gefunden wurde */
  page?: number;
}

export interface ExtractedExcerpt {
  page: number;
  text: string;
}

export interface ExtractedDocumentData {
  documentType: 'sdb' | 'pruefbericht' | 'tm' | 'allgemein';
  filename?: string;
  productName?: string;
  manufacturer?: string;
  suggestedCriteriaNr?: string;
  /** Begründung des KI-Vorschlags für die Bauteilgruppe (nur Vorschlag) */
  suggestionReason?: string;
  vocContent?: string;
  vocTestDate?: string;
  svhcStatus?: string;
  certificates?: string[];
  hasBauteilekatalog?: boolean;
  /** Wörtliche Textauszüge aus dem PDF-Textlayer (kein Modelltext) */
  summarySnippet?: string;
  excerpts?: ExtractedExcerpt[];
  fieldQuotes: ExtractedFieldQuote[];
  rawAnalysisText?: string;
  /** Hinweise zur Auslese (z. B. Scan ohne Textlayer, Dokumenttyp weicht ab, KI nicht verfügbar) */
  warnings?: string[];
  hasTextLayer?: boolean;
}

/** Vom Nutzer bestätigte Beleg-Metadaten je Feld (wird an die Bewertung übergeben). */
export type ConfirmedEvidence = Partial<
  Record<
    'voc' | 'testDate' | 'svhc' | 'label' | 'vocContent' | 'vocTestDate' | 'svhcStatus' | 'certificates',
    ParameterEvidence
  >
>;

export interface SampleProduct {
  id: string;
  name: string;
  manufacturer: string;
  criteriaNr: string;
  description: string;
  expectedLevel: QualityLevel;
  sdbSnippet: string;
  testReportSnippet: string;
  tmSnippet?: string;
  hasBauteilekatalog: boolean;
}

