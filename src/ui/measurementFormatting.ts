import type { FindingMeasurement } from "../domain/analysis";

export function formatMeasurementValue(
  value: number | null,
  unit: FindingMeasurement["unit"],
  unknown = "Unknown",
): string {
  return value === null ? unknown : `${formatMeasurementNumber(value)} ${unit}`;
}

export function formatMeasurementDelta(
  value: number | null,
  unit: FindingMeasurement["unit"],
  unknown = "Unknown",
): string {
  if (value === null) return unknown;
  return `${value >= 0 ? "+" : ""}${formatMeasurementNumber(value)} ${unit}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatMeasurementNumber(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}
