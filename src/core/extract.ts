import { z } from "zod";
import { askModel } from "./llm";
import { BillSchema, type Bill } from "./schema";

const RawBillSchema = BillSchema.extend({
  taxes_itemized: z.boolean().nullish(),
});

const SYSTEM = `You extract data from Pakistani electricity bills (K-Electric, LESCO, IESCO).
The image may be tilted, partly in Urdu, and personal details are covered by grey boxes.
Return ONE JSON object only, with exactly these keys:
provider ("KE" | "LESCO" | "IESCO"), tariff, sanctioned_load_kw, bill_month (YYYY-MM),
reading_date, issue_date, due_date (YYYY-MM-DD), previous_reading, current_reading,
units_consumed, charges [{type, amount}], total_charges, taxes [{type, amount}],
total_taxes, current_bill, arrears, payable_within_due_date, payable_after_due_date,
taxes_itemized.

RULES
- Copy values exactly as printed. Never recalculate, round or correct amounts.
- Numbers are plain JSON numbers in PKR: no "Rs.", no commas.
- Credits and subsidies are NEGATIVE (e.g. 38209CR becomes -38209).
- Unavailable, blank, greyed-out or unreadable becomes null. Never guess. Empty list becomes [].
- Never output names, addresses, CNIC, account/reference/consumer/meter numbers.
- K-Electric bills use provider "KE".
- tariff: exactly as printed (e.g. "A1-R", "A-1a(01)").
- sanctioned_load_kw: labelled "Sanc Load", "S.Load" or "San Load".
- due_date: the last date to pay WITHOUT a late payment surcharge.
- payable_after_due_date: if several late amounts are shown, use the HIGHEST.
- arrears: previous dues carried forward, keep the printed sign, null if blank.
- previous_reading / current_reading: use these only when the bill prints ONE single meter reading pair. If the bill shows several meter registers (for example Off Peak, Peak, Import, Export), return null for both fields.

CHARGES: one entry per line in the charges section. Skip blank lines and lines printed as 0.
Keep repeated types as separate entries. Types:
- energy: cost of units used ("Variable Upto ... Units", "Cost of Electricity", "Energy Charges")
- fixed: fixed charges
- fpa: fuel price adjustment (use for both FPA and FCA)
- quarterly_adjustment: QTA or Uniform Quarterly Adjustment
- surcharge: e.g. Additional Surcharge (PHL), F.C Surcharge
- meter_rent: meter rent or service rent
- subsidy: government subsidy or relief lines, amount NEGATIVE
- other: any other charge line
Only include lines printed ABOVE the charges subtotal. Lines printed after the charges and taxes sections, such as Net Metering Benefit, Opening Balance, Previous Dues, Remaining Dues, Payments/Adjustment, Current Bill Amount, Late Payment Surcharge and Outstanding Balance, are NOT charges and must never appear in "charges".
total_charges: the printed charges subtotal, else null.
Some bills print a summary block called "Bill Charges Breakdown" instead of itemized lines, with rows such as Total Electricity Charges, Subsidies, Net Electricity Charges, Taxes, Current Bill. For these: add one "energy" entry for Total Electricity Charges, add a "subsidy" entry (negative) for Subsidies only if it has a non-zero value, set total_charges to Net Electricity Charges, and put the Taxes amount in total_taxes with taxes = []. In tilted photos the numbers may sit slightly above or below their labels, so match each number to its row carefully.

TAXES: classify a line by the SECTION it is printed in, not by its name. Types:
- gst: sales tax or GST, including GST on FPA
- electricity_duty: electricity duty (ED)
- income_tax: income tax
- municipal_tax: municipal or local charges printed under taxes, e.g. KE MUCT (KMC)
- other_tax: any other tax line (extra tax, further tax, TV fee)
Also include one extra key "taxes_itemized" (true or false). Set it to true only if the bill prints individually named tax lines (such as Sales Tax, GST, Electricity Duty, MUCT). Set it to false if the bill prints just a single generic "Taxes" total with no named components.
total_taxes: the printed tax subtotal, else null.`;

function dateProblem(bill: Bill): string | null {
  const time = (d: string | null) => (d ? Date.parse(d) : NaN);
  const reading = time(bill.reading_date);
  const issue = time(bill.issue_date);
  const due = time(bill.due_date);
  const DAY = 86_400_000;

  if (!isNaN(reading) && !isNaN(issue)) {
    const gap = (issue - reading) / DAY;
    if (gap < 0 || gap > 60) {
      return `reading_date (${bill.reading_date}) should fall shortly before issue_date (${bill.issue_date}). Re-read both dates carefully, especially the year.`;
    }
  }
  if (!isNaN(issue) && !isNaN(due) && due < issue) {
    return `due_date (${bill.due_date}) is before issue_date (${bill.issue_date}). Re-read both dates carefully.`;
  }
  return null;
}

function sumProblem(bill: Bill): string | null {
  const sum = (items: { amount: number }[]) =>
    items.reduce((total, item) => total + item.amount, 0);

  if (bill.total_charges !== null && bill.charges.length > 0) {
    const diff = Math.abs(sum(bill.charges) - bill.total_charges);
    if (diff > 1.5) {
      return `The "charges" entries add up to ${sum(bill.charges).toFixed(2)} but total_charges is ${bill.total_charges}. Re-read the charges section: you may have included a line that is not part of that subtotal, or missed one.`;
    }
  }
  if (bill.total_taxes !== null && bill.taxes.length > 0) {
    const diff = Math.abs(sum(bill.taxes) - bill.total_taxes);
    if (diff > 1.5) {
      return `The "taxes" entries add up to ${sum(bill.taxes).toFixed(2)} but total_taxes is ${bill.total_taxes}. Re-read the taxes section: you may have included a line that is not part of that subtotal, or missed one.`;
    }
  }
  return null;
}

export async function extractBill(image: {
  data: Buffer;
  mimeType: string;
}): Promise<Bill> {
  let lastError = "";
  let fallback: Bill | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? "Extract this bill."
        : `Your previous output had a problem: ${lastError}\nExtract this bill again and fix that problem.`;

    const raw = await askModel({ system: SYSTEM, prompt, image, json: true });

    try {
            const parsed = JSON.parse(raw);
      for (const key of ["charges", "taxes"]) {
        if (Array.isArray(parsed[key])) {
          parsed[key] = parsed[key].filter(
            (line: any) => line && typeof line.amount === "number"
          );
        }
      }
      const { taxes_itemized, ...bill } = RawBillSchema.parse(parsed);
      if (taxes_itemized === false) bill.taxes = [];

      const problem = dateProblem(bill) ?? sumProblem(bill);
      if (!problem) return bill;

      fallback = bill;
      lastError = problem;
    } catch (e: any) {
      lastError = String(e.message ?? e).slice(0, 500);
    }
  }

  if (fallback) return fallback;
  throw new Error(`Extraction failed after retry: ${lastError}`);
}