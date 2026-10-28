import { z } from "zod";
import { answerQuestion } from "../../../core/answer";
import { BillSchema } from "../../../core/schema";

export const maxDuration = 60;

const ALLOWED = ["image/png", "image/jpeg"];
const MAX_BYTES = 4 * 1024 * 1024;

const HistoryRowSchema = z.object({
  month: z.string(),
  units: z.number().nullable(),
  billed_amount: z.number().nullable(),
  payment_amount: z.number().nullable(),
  is_current_month: z.boolean(),
});

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    const question = String(form.get("question") ?? "").trim();

    if (!(file instanceof File) || !ALLOWED.includes(file.type)) {
      return Response.json({ error: "Please upload a PNG or JPEG bill image." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "Image is too large (limit 4 MB)." }, { status: 413 });
    }
    if (!question) {
      return Response.json({ error: "Please type a question." }, { status: 400 });
    }
    if (question.length > 500) {
      return Response.json({ error: "Question is too long (limit 500 characters)." }, { status: 400 });
    }

    const bill = BillSchema.parse(JSON.parse(String(form.get("bill") ?? "null")));
    const rows = z.array(HistoryRowSchema).parse(JSON.parse(String(form.get("history") ?? "[]")));

    const answer = await answerQuestion({
      question,
      bill,
      history: { history: rows },
      image: { data: Buffer.from(await file.arrayBuffer()), mimeType: file.type },
    });

    return Response.json({ answer });
  } catch (e: any) {
    return Response.json(
      { error: "Could not answer that question. Please try again." , detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}