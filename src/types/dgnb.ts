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

export interface ParameterEvaluation {
  parameterName: string;
  productValue: string;
  requiredForQS4: string;
  achievedLevel: QualityLevel;
  isBottleneck: boolean;
  status: 'pass' | 'fail' | 'warning';
  explanation: string;
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
}

export interface ProductEvaluationResult {
  productName: string;
  manufacturer: string;
  productType: string;
  hasBauteilekatalog: boolean;
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

export interface SampleProduct {
  id: string;
  name: string;
  manufacturer: string;
  criteriaNr: string;
  description: string;
  expectedLevel: QualityLevel;
  sdbSnippet: string;
  testReportSnippet: string;
  hasBauteilekatalog: boolean;
}
