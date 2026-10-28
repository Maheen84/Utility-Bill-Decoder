import { extractBill } from "../../../core/extract";
import { extractHistory } from "../../../core/history";


export const maxDuration = 60;

const ALLOWED = ["image/png", "image/jpeg"];
const MAX_BYTES = 4 * 1024 * 1024; // Vercel request bodies are limited to about 4.5 MB

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("image");

  if (!(file instanceof File)) {
    return Response.json({ error: "Please upload a bill image." }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return Response.json({ error: "Only PNG or JPEG images are supported." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Image is too large (limit 4 MB)." }, { status: 413 });
  }

  const image = { data: Buffer.from(await file.arrayBuffer()), mimeType: file.type };

  const [bill, history] = await Promise.allSettled([extractBill(image), extractHistory(image)]);

  return Response.json({
    bill: bill.status === "fulfilled" ? bill.value : null,
    history: history.status === "fulfilled" ? history.value.history : [],
    errors: {
      bill: bill.status === "rejected" ? String(bill.reason?.message ?? bill.reason) : null,
      history: history.status === "rejected" ? String(history.reason?.message ?? history.reason) : null,
    },
  });
}