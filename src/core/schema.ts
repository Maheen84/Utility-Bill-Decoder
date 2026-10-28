import { z } from "zod";

const num = z.number();

export const ChargeType = z.enum([
  "energy",
  "fixed",
  "fpa",
  "quarterly_adjustment",
  "surcharge",
  "meter_rent",
  "subsidy",
  "other",
]);

export const TaxType = z.enum([
  "gst",
  "electricity_duty",
  "income_tax",
  "municipal_tax",
  "other_tax",
]);

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const BillSchema = z.object({
  provider: z.enum(["KE", "LESCO", "IESCO"]).nullable(),
  tariff: z.string().nullable(),
  sanctioned_load_kw: num.nullable(),
  bill_month: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
  reading_date: dateOnly.nullable(),
  issue_date: dateOnly.nullable(),
  due_date: dateOnly.nullable(),
  previous_reading: num.nullable(),
  current_reading: num.nullable(),
  units_consumed: num.nullable(),
  charges: z.array(z.object({ type: ChargeType, amount: num })),
  total_charges: num.nullable(),
  taxes: z.array(z.object({ type: TaxType, amount: num })),
  total_taxes: num.nullable(),
  current_bill: num.nullable(),
  arrears: num.nullable(),
  payable_within_due_date: num.nullable(),
  payable_after_due_date: num.nullable(),
});

export type Bill = z.infer<typeof BillSchema>;