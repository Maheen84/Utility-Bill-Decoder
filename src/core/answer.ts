import { evaluate } from "mathjs";
import { z } from "zod";
import { askModel } from "./llm";
import type { Bill } from "./schema";
import type { History } from "./history";

const OutSchema = z.object({
  calculations: z.record(z.string(), z.string()).optional(),
  answer: z.string().min(1),
});

const SYSTEM = `You answer a customer's question about ONE electricity bill, in plain English.
You are given: the bill image, the extracted bill JSON, and the extracted history JSON.

RULES
- Use ONLY information on this bill. Never use outside tariff, rate or policy knowledge.
- If the bill does not show something needed, say so clearly instead of guessing.
- Always answer in English, even if parts of the bill are in Urdu.
- Never output names, addresses, CNIC, account, reference, consumer or meter numbers.
- If a value is an estimate, say it is an estimate and explain how you calculated it.
- If the question can reasonably mean more than one thing, state the meaning you used, or answer both.
- Keep answers short and specific: 2 to 4 sentences, with the relevant numbers and PKR amounts.
- Be specific: when relevant, break totals down into their individual lines from the bill JSON (for example each tax or charge line with its amount), and mention any related figure the bill prints itself, such as a printed percentage split. Do not add detail that is unrelated to the question.
- When a question asks how much of the bill is a particular part (taxes, a charge, a subsidy), always give both the amount and its percentage of the relevant total, with the percentage written as a {{placeholder}} formula.
- When comparing two amounts, say which is higher or lower and by how much (for example "PKR 89 lower than last month") instead of a signed number. When the answer is zero or "none", still give the closest relevant figure (for example the highest value) so the answer stays specific.
- When you compute an average or total over the history, say how many months it covers and whether the current month is included. If the current month is not part of the history, also mention its value and give the figure including it.
- For "why" questions about the amount (higher, lower, unusual), compare the units consumed this month against the history, and compare the amount against recent months, before drawing any conclusion. State only what the bill's data supports (for example that units are higher or lower than the previous months). If the bill does not show the cause, say so plainly instead of guessing.
- Never decide "higher" or "lower" yourself. For any comparison, add a formula for the difference (this minus that), for example "gap": "371 - 365.83". Write the direction as {{gap?above:below}} and the size of the difference as {{abs:gap}}. The system uses the first phrase when the difference is positive and the second when it is negative. Example: "Your usage of 371 units is {{abs:gap}} units {{gap?above:below}} the average."
MATH: never do arithmetic yourself. For every calculated number (sum, difference, average, count, percentage), add a formula to "calculations" using plain numbers copied from the data, and refer to it in your answer as {{name}}.
Formulas are math.js expressions, for example:
  "pct": "569.62 / 3430.24 * 100"
  "avg": "mean([141, 138, 197])"
  "n": "count([239, 203])"
Percentages must include "* 100". Do not round inside formulas. Numbers that are printed on the bill can be written directly in the answer.
Counting rule: when counting months, list them out in the formula, for example "count([239, 203])".
If a result is zero or needs no calculation (for example no month qualifies), write it directly in the answer instead of using a formula. Never use an empty list [] in a formula. Formulas may only contain numbers, + - * /, parentheses, and the functions mean, sum, count, max, min and round applied to non-empty lists.

Return ONE JSON object only: {"calculations": {"name": "expression"}, "answer": "text with {{name}} placeholders"}`;

function fmt(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString("en-US")
    : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function render(out: z.infer<typeof OutSchema>): string {
  const values: Record<string, number> = {};
  for (const [name, expr] of Object.entries(out.calculations ?? {})) {
    let v: number;
    try {
      v = Number(evaluate(expr));
    } catch (e: any) {
      throw new Error(
        `Formula "${name}" (${expr}) failed: ${e.message}. Use only numbers, + - * /, and mean/sum/count/max/min/round of non-empty lists.`
      );
    }
    if (!Number.isFinite(v)) {
      throw new Error(`Formula "${name}" did not produce a number: ${expr}`);
    }
    values[name] = v;
  }

  const need = (key: string): number => {
    if (!(key in values)) throw new Error(`Placeholder {{${key}}} has no formula`);
    return values[key];
  };

  const text = out.answer
    .replace(/\{\{(\w+)\?([^:{}]+):([^{}]+)\}\}/g, (_m, key: string, up: string, down: string) =>
      need(key) >= 0 ? up : down
    )
    .replace(/\{\{abs:(\w+)\}\}/g, (_m, key: string) => fmt(Math.abs(need(key))))
    .replace(/\{\{(\w+)\}\}/g, (_m, key: string) => fmt(need(key)));

  return text.trim();
}

export async function answerQuestion(opts: {
  question: string;
  bill: Bill;
  history: History;
  image: { data: Buffer; mimeType: string };
}): Promise<string> {
  const context =
    `BILL JSON:\n${JSON.stringify(opts.bill)}\n\n` +
    `HISTORY JSON:\n${JSON.stringify(opts.history)}\n\n` +
    `QUESTION: ${opts.question}`;

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? context
        : `${context}\n\nYour previous answer failed: ${lastError}\nAnswer again and fix that problem.`;

    const raw = await askModel({ system: SYSTEM, prompt, image: opts.image, json: true });
    try {
      return render(OutSchema.parse(JSON.parse(raw)));
    } catch (e: any) {
      lastError = String(e.message ?? e).slice(0, 500);
    }
  }
  throw new Error(`Answer failed after retry: ${lastError}`);
}