import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { checkOrigin } from "@/lib/csrf";

export const dynamic = "force-dynamic";

const CF_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await getSessionFromRequest(req);
  if (!user || user.role !== "vet") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = await getDb();

  const row = await db.prepare(
    "SELECT id, pet_name, pet_type, concern, notes FROM consultations WHERE id = ?"
  ).bind(id).first<{
    id: string; pet_name: string; pet_type: string; concern: string; notes: string | null;
  }>();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let soap: { subjective?: string; objective?: string; assessment?: string; plan?: string } = {};
  try { if (row.notes) soap = JSON.parse(row.notes); } catch { /* */ }

  const { env } = await getCloudflareContext({ async: true });
  const ai = (env as any).AI;
  if (!ai) return NextResponse.json({ error: "AI service not configured." }, { status: 503 });

  const prompt = `You are a compassionate veterinary assistant helping Dr. Meleah McMillen communicate with pet owners after a telehealth consultation. Your job is to write a clear, warm, easy-to-understand discharge summary in plain language that a non-medical pet owner can fully understand — no jargon, no abbreviations.

Here is the clinical information from today's consultation:

Pet: ${row.pet_name} (${row.pet_type})
Owner's Concern: ${row.concern}

SOAP Notes:
- Subjective (what the owner reported): ${soap.subjective || "Not recorded"}
- Objective (what Dr. McMillen observed): ${soap.objective || "Not recorded"}
- Assessment (diagnosis/impression): ${soap.assessment || "Not recorded"}
- Plan (treatment/recommendations): ${soap.plan || "Not recorded"}

Please write a discharge summary with exactly these two sections:

What We Found Today
Write 2-4 sentences in warm, plain language explaining what was observed and what Dr. McMillen's assessment is. Avoid medical jargon. Write as if you are explaining it to a caring pet owner who is not a medical professional. Refer to the pet by name.

Your Next Steps
Write a numbered list of 3-6 specific, actionable steps the owner should take. Include medication instructions if mentioned in the plan, follow-up timing, warning signs to watch for, and when to seek emergency care. Keep each step concise and clear.

IMPORTANT: Output plain text only. Do not use any markdown (no asterisks, no underscores, no hashtags). Do not use any HTML tags. Do not bold or italicize anything. Section headers should be plain text on their own line with no special formatting. Each numbered step should start with just the number and a period. Do not include extra sections, disclaimers, or sign-offs. Start directly with "What We Found Today".`;

  let summary = "";
  try {
    const result = await ai.run(CF_MODEL, {
      messages: [
        { role: "system", content: "You are a helpful veterinary assistant. Output plain text only — no markdown, no asterisks, no HTML." },
        { role: "user", content: prompt },
      ],
      max_tokens: 4096,
      stream: false,
    }) as { response?: unknown };

    const raw = result as any;
    const val = raw?.response;
    if (typeof val === "string") {
      summary = val.trim();
    } else if (val !== null && typeof val === "object" && !val.getReader) {
      summary = JSON.stringify(val);
    } else {
      return NextResponse.json({ error: "AI returned an unexpected response." }, { status: 502 });
    }
    if (!summary) return NextResponse.json({ error: "AI returned an empty response." }, { status: 502 });
  } catch (err) {
    console.error("CF AI error:", err);
    return NextResponse.json({ error: "Could not reach AI service." }, { status: 502 });
  }

  await db.prepare(
    "UPDATE consultations SET ai_summary = ?, ai_summary_approved = 0, updated_at = unixepoch() WHERE id = ?"
  ).bind(summary, id).run();

  return NextResponse.json({ summary });
}
