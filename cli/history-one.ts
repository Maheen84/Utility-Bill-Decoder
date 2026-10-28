import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { extractHistory } from "../src/core/history";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx cli/history-one.ts <bill-image>");
  process.exit(1);
}

const ext = path.extname(file).toLowerCase();
const mimeType = ext === ".png" ? "image/png" : "image/jpeg";

extractHistory({ data: fs.readFileSync(file), mimeType })
  .then((h) => console.log(JSON.stringify(h, null, 2)))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });