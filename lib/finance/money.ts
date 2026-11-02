/** Redondea a céntimos (half away from zero), como se guarda en numeric(12,2). */
export function round2(n: number): number {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100;
}
