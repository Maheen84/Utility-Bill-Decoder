import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { extractBill } from "../src/core/extract";
import { extractHistory, type History } from "../src/core/history";
import { answerQuestion } from "../src/core/answer";
import type { Bill } from "../src/core/schema";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (!value) {
    console.error(`Missing --${name}`);
    process.exit(1);
  }
  return value;
}

const billsDir = arg("bills");
const level1Path = arg("level1");
const level2Path = arg("level2");
const outDir = arg("out", "output");

const EMPTY_BILL: Bill = {
  provider: null, tariff: null, sanctioned_load_kw: null, bill_month: null,
  reading_date: null, issue_date: null, due_date: null,
  previous_reading: null, current_reading: null, units_consumed: null,
  charges: [], total_charges: null, taxes: [], total_taxes: null,
  current_bill: null, arrears: null,
  payable_within_due_date: null, payable_after_due_date: null,
};
const NO_ANSWER = "I could not determine this answer from the bill.";

type L1Row = { bill_id: string; json: string };
type L2Row = { bill_id: string; question_id: string; question: string; answer: string };

const readCsv = <T>(file: string): T[] =>
  parse(fs.readFileSync(file, "utf8"), { columns: true, skip_empty_lines: true, bom: true }) as T[];

const level1 = readCsv<L1Row>(level1Path);
const level2 = readCsv<L2Row>(level2Path);

// Map bill_id -> image file name (any of .png/.jpg/.jpeg, any letter case)
const imageFiles = new Map<string, string>();
for (const f of fs.readdirSync(billsDir)) {
  const ext = path.extname(f).toLowerCase();
  if ([".png", ".jpg", ".jpeg"].includes(ext)) {
    imageFiles.set(path.basename(f, path.extname(f)), f);
  }
}

function writeOutputs() {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "level1.csv"),
    stringify(level1, { header: true, columns: ["bill_id", "json"] }),
    "utf8"
  );
  fs.writeFileSync(
    path.join(outDir, "level2.csv"),
    stringify(level2, { header: true, columns: ["bill_id", "question_id", "question", "answer"] }),
    "utf8"
  );
}

async function main() {
  const ids = [...new Set([...level1.map((r) => r.bill_id), ...level2.map((r) => r.bill_id)])];
  console.log(`Processing ${ids.length} bills...`);

  for (const [n, id] of ids.entries()) {
    console.log(`\n[${n + 1}/${ids.length}] ${id}`);
    const file = imageFiles.get(id);

    let bill: Bill = EMPTY_BILL;
    let history: History = { history: [] };
    let image: { data: Buffer; mimeType: string } | null = null;

    if (!file) {
      console.error(`  no image found for ${id} in ${billsDir}`);
    } else {
      const ext = path.extname(file).toLowerCase();
      image = {
        data: fs.readFileSync(path.join(billsDir, file)),
        mimeType: ext === ".png" ? "image/png" : "image/jpeg",
      };
      try {
        bill = await extractBill(image);
        console.log("  level 1: ok");
      } catch (e: any) {
        console.error(`  level 1 FAILED: ${e.message}`);
      }
      try {
        history = await extractHistory(image);
        console.log(`  history: ${history.history.length} months`);
      } catch (e: any) {
        console.error(`  history FAILED: ${e.message}`);
      }
    }

    for (const row of level1) {
      if (row.bill_id === id) row.json = JSON.stringify(bill);
    }

    for (const row of level2) {
      if (row.bill_id !== id) continue;
      try {
        if (!image) throw new Error("no image");
        row.answer = await answerQuestion({ question: row.question, bill, history, image });
        console.log(`  ${row.question_id}: ok`);
      } catch (e: any) {
        console.error(`  ${row.question_id} FAILED: ${e.message}`);
        row.answer = NO_ANSWER;
      }
    }

    writeOutputs(); // save after every bill so progress is never lost
  }

  console.log(`\nDone. Files written to ${outDir}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});