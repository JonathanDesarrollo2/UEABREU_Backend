// src/config/fee-config.ts

export interface SchoolYearFees {
  schoolYear: string;                  // "2026-2027"
  inscriptionFeeUSD: number;           // 80
  monthlyFeeUSD: number;               // 100 (antes del descuento por pronto pago)
  prontoPagoDiscount: number;          // 10 (descuento sobre la mensualidad)
  prontoPagoDeadlineDay: number;       // 10 (día del mes límite para pronto pago)
  administrativeFeeUSD: number;        // 20 (solo para nuevos ingresos)
  august2027HalfPaymentUSD: number;    // 45 (50% de la mensualidad de agosto 2027)
  monthlyFeeStartDate: string;         // "2026-09-01"
  inscriptionStartDate: string;        // "2026-07-15"
  inscriptionEndDate: string;          // "2026-10-01"
}

export const currentSchoolFees: SchoolYearFees = {
  schoolYear: "2026-2027",
  inscriptionFeeUSD: 80,
  monthlyFeeUSD: 100,
  prontoPagoDiscount: 10,
  prontoPagoDeadlineDay: 10,
  administrativeFeeUSD: 20,
  august2027HalfPaymentUSD: 45,
  monthlyFeeStartDate: "2026-09-01",
  inscriptionStartDate: "2026-07-15",
  inscriptionEndDate: "2026-10-01",
};