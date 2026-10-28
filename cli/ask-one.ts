import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { extractBill } from "../src/core/extract";
import { extractHistory } from "../src/core/history";
import { answerQuestion } from "../src/core/answer";

const [file, question] = process.argv.slice(2);
if (!file || !question) {
  console.error('Usage: npx tsx cli/ask-one.ts <bill-image> "<question>"');
  process.exit(1);
}

const ext = path.extname(file).toLowerCase();
const image = {
  data: fs.readFileSync(file),
  mimeType: ext === ".png" ? "image/png" : "image/jpeg",
};

(async () => {
  const bill = await extractBill(image);
  const history = await extractHistory(image);
  console.log(await answerQuestion({ question, bill, history, image }));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});