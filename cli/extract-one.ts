import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { extractBill } from "../src/core/extract";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx cli/extract-one.ts <bill-image>");
  process.exit(1);
}

const ext = path.extname(file).toLowerCase();
const mimeType = ext === ".png" ? "image/png" : "image/jpeg";

extractBill({ data: fs.readFileSync(file), mimeType })
  .then((bill) => console.log(JSON.stringify(bill, null, 2)))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
