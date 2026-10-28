import type { RuleDefinition } from "./types";
import { structuring } from "./structuring";
import { rapidMovement } from "./rapid-movement";
import { highRiskJurisdiction } from "./high-risk-jurisdiction";
import { unusualVolume } from "./unusual-volume";
import { dormantReactivated } from "./dormant-reactivated";

export const RULES: RuleDefinition[] = [
  structuring,
  rapidMovement,
  highRiskJurisdiction,
  unusualVolume,
  dormantReactivated,
];
