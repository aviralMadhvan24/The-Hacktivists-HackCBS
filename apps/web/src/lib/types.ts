export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export type Visibility = 'private' | 'family';

export interface User { id: string; name: string; email: string; createdAt?: string }
export interface FamilySummary { id: string; name: string; role: Role; memberCount: number }
export interface Member { id: string; name: string; email: string; role: Role; joinedAt: string }
export interface Family { id: string; name: string; approvalThreshold: number; myRole: Role; members: Member[] }
export interface Owner { userId: string; sharePct: number; name?: string }

export interface Account {
  id: string; name: string; kind: string; liquidity: string; value: number; valueSource: string; equityPct: number;
  visibility: Visibility; institution?: string | null; maturityDate?: string | null; notes?: string | null; owners: Owner[];
  createdBy: string; canEdit?: boolean;
}
export interface Liability {
  id: string; name: string; kind: string; outstanding: number; interestRatePct?: number | null; emiMonthly: number;
  remainingMonths?: number | null; rateType: 'fixed' | 'floating'; visibility: Visibility; lender?: string | null; owners: Owner[];
}
export interface Cashflow {
  id: string; direction: 'income' | 'expense'; category: string; name: string; amount: number; frequency: string;
  essential: boolean; visibility: Visibility; startsOn?: string | null; endsOn?: string | null; owners: Owner[];
}
export interface Holding {
  id: string; accountId: string; symbol: string; exchange: string; name?: string | null; sector?: string | null; instrument: string;
  quantity: number; avgPrice: number; lastPrice?: number | null; priceAsOf?: string | null; priceSource?: string | null; source: string; value: number;
}

export interface Pillar {
  key: string; name: string; max: number; points: number; rating: string; formula: string; explanation: string;
  metrics: Record<string, any>; actions: { text: string; pointsGain: number }[]; notes: string[];
}
export interface ScoreReport {
  score: number; band: string; hasData: boolean; pillars: Pillar[];
  topActions: { text: string; pointsGain: number; pillar: string }[]; disclaimer: string;
}
export interface Position {
  assets: { total: number; liquid: number; semiLiquid: number; illiquid: number; equityExposure: number; byKind: Record<string, number> };
  liabilities: { total: number; monthlyEmi: number; byKind: Record<string, number> };
  netWorth: number;
  cashflow: {
    monthlyIncome: number; essentialExpenses: number; discretionaryExpenses: number; monthlyExpenses: number; monthlyEmi: number;
    monthlyOutflows: number; essentialOutflows: number; monthlySavings: number; savingsRatePct: number | null; netBurn: number; incomeByUser?: Record<string, number>;
  };
  runway: { state: string; currentBurnMonths: number | null; ifIncomeStopsMonths: number | null; ifIncomeStopsEssentialOnlyMonths: number | null; withSemiLiquidMonths: number | null };
  /** Scope-weighted investment positions (holdings and equity in funds). */
  positions?: { accountId: string; symbol: string | null; name: string; sector: string; instrument: string; diversified: boolean; value: number; equityValue: number }[];
  /** Accounts visible to the viewer, weighted by the viewer's scope. */
  accounts?: { id: string; name: string; kind: string; liquidity: string; weight: number; value: number }[];
  liabilityItems?: { id: string; name: string; kind: string; weight: number; outstanding: number; emi: number; rateType: string }[];
}
export interface ScoreChange { delta: number | null; summary: string; changes: { pillar: string; name: string; delta: number; explanation: string }[]; comparedTo?: string }
export interface Dashboard {
  scope: { type: 'family' | 'individual'; userId?: string };
  position: Position; score: ScoreReport; scoreChange: ScoreChange; privacyNote: string;
  freshness: { holdingsCount: number; holdingsWithoutMarketPrice: number; oldestPriceAsOf: string | null };
}

export type Shock = Record<string, any> & { type: string };
export interface StressResult {
  shocks: Shock[];
  assumptions: { horizonMonths: number; allowForcedSelling: boolean; assumedAnnualEquityReturnPct: number };
  before: any; after: any; beforeScore: ScoreReport; afterScore: ScoreReport;
  impact: {
    portfolioLoss: number; portfolioLossPct: number; immediateCashOutflow: number; netWorthChangeImmediate: number;
    netWorthChangeEndOfHorizon: number; peakMonthlyBurn: number; cashRunwayMonths: number | null; totalRunwayMonths: number | null;
    forcedSales: number; firstForcedSaleMonth: number | null; shortfallAtHorizon: number; scoreChange: number;
    hardestHitPositions: { symbol: string | null; name: string; loss: number; declinePct: number }[];
  };
  recovery: { cashRebuildMonths: number | null; cashRebuildNote: string; portfolioRecoveryMonths: number | null; portfolioRecoveryNote: string };
  projection: { month: number; cash: number; semiLiquid: number; cumulativeForcedSales: number; net: number }[];
  verdict: { level: 'ok' | 'warning' | 'severe' | 'critical'; text: string };
  savedId?: string | null;
}
