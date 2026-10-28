import type { RuleTx } from "./types";

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

export const sum = (txs: RuleTx[]) => Math.round(txs.reduce((total, t) => total + t.amount, 0) * 100) / 100;

export const nzd = (value: number) =>
  value.toLocaleString("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 });
