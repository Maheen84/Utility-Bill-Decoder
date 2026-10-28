import { z } from "zod";
import { askModel } from "./llm";

const month = z.string().regex(/^\d{4}-\d{2}$/);

const RawSchema = z.object({
  usage: z.array(
    z.object({
      month,
      units: z.number().nullable(),
      is_current_month: z.boolean(),
    })
  ),
  billing: z.array(
    z.object({
      month,
      billed_amount: z.number().nullable(),
      payment_amount: z.number().nullable(),
    })
  ),
});

export type HistoryRow = {
  month: string;
  units: number | null;
  billed_amount: number | null;
  payment_amount: number | null;
  is_current_month: boolean;
};
export type History = { history: HistoryRow[] };

const SYSTEM = `You read the history tables of a Pakistani electricity bill image (K-Electric, LESCO or IESCO).
Return ONE JSON object with two SEPARATE lists:

"usage": the monthly units, from a "13 Month Usage History" bar chart or the UNITS column of a "Bill History" table.
  Each row: {"month": "YYYY-MM", "units": number|null, "is_current_month": boolean}
"billing": the billed amounts and payments, from a "Billing & Payment History" table or the BILL / PAYMENT columns of a "Bill History" table.
  Each row: {"month": "YYYY-MM", "billed_amount": number|null, "payment_amount": number|null}

RULES
- Read each table on its own. Do NOT try to match rows between the two lists.
- In the bar chart, each bar has a number printed on it (often rotated). Read each digit carefully. The year headings (for example 2025 and 2026) tell you which year each month belongs to.
- In tables with an "MM / YY" column, the month and year belong to that row: 03/26 means 2026-03. Take each row's own label exactly as printed. Do not shift months.
- Tables that print month names like "Sep25" or "JAN 26" mean 2025-09 and 2026-01.
- is_current_month is true only for the bill's own month (the highlighted or black bar).
- Copy numbers exactly as printed: no commas, no currency labels. Missing or unreadable is null. Never guess.
- Do NOT include names, addresses, or ID numbers.
- If a list does not exist on this bill, return [] for it.`;

function merge(raw: z.infer<typeof RawSchema>): History {
  const rows = new Map<string, HistoryRow>();
  const get = (m: string): HistoryRow => {
    let row = rows.get(m);
    if (!row) {
      row = { month: m, units: null, billed_amount: null, payment_amount: null, is_current_month: false };
      rows.set(m, row);
    }
    return row;
  };

  for (const u of raw.usage) {
    const row = get(u.month);
    row.units = u.units;
    row.is_current_month = u.is_current_month;
  }
  for (const b of raw.billing) {
    const row = get(b.month);
    row.billed_amount = b.billed_amount;
    row.payment_amount = b.payment_amount;
  }

  return { history: [...rows.values()].sort((a, b) => a.month.localeCompare(b.month)) };
}

export async function extractHistory(image: {
  data: Buffer;
  mimeType: string;
}): Promise<History> {
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? "Extract the history tables from this bill."
        : `Your previous output was invalid: ${lastError}\nExtract the history tables again and fix that problem.`;

    const raw = await askModel({ system: SYSTEM, prompt, image, json: true });

    try {
      return merge(RawSchema.parse(JSON.parse(raw)));
    } catch (e: any) {
      lastError = String(e.message ?? e).slice(0, 500);
    }
  }

  throw new Error(`History extraction failed after retry: ${lastError}`);
}