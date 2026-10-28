type ScoreInput = {
  baseScore: number;
  riskRating: string;
  amount: number;
  hasRecentAlert: boolean;
};

// Risk score from 0 to 100, as described in the requirements.
export function calculateRiskScore({ baseScore, riskRating, amount, hasRecentAlert }: ScoreInput) {
  let score = baseScore;
  if (riskRating === "high") score += 15;

  if (amount >= 50000) score += 20;
  else if (amount >= 25000) score += 15;
  else if (amount >= 10000) score += 10;
  else if (amount >= 5000) score += 5;

  if (hasRecentAlert) score += 10;
  return Math.min(100, score);
}
