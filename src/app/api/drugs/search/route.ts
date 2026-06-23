import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2) return NextResponse.json({ results: [] });

  try {
    // Search FDA animal drug labels (NADA/ANADA application numbers = animal drugs)
    const encoded = encodeURIComponent(query);
    const url = `https://api.fda.gov/drug/label.json?search=openfda.application_number:NADA*+AND+(openfda.brand_name:${encoded}+openfda.generic_name:${encoded})&limit=8&fields=openfda.brand_name,openfda.generic_name,openfda.application_number,dosage_and_administration,indications_and_usage`;

    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return NextResponse.json({ results: [] });

    const data = await res.json() as {
      results?: {
        openfda?: { brand_name?: string[]; generic_name?: string[]; application_number?: string[] };
        dosage_and_administration?: string[];
        indications_and_usage?: string[];
      }[];
    };

    const results = (data.results ?? []).map((r) => {
      const brand = r.openfda?.brand_name?.[0] ?? null;
      const generic = r.openfda?.generic_name?.[0] ?? null;
      const name = brand ?? generic ?? "Unknown";
      const dosageText = r.dosage_and_administration?.[0]?.slice(0, 300) ?? null;
      const indication = r.indications_and_usage?.[0]?.slice(0, 120) ?? null;
      return { name, brand, generic, dosageText, indication, source: "fda" as const };
    }).filter((r, i, arr) => arr.findIndex(x => x.name === r.name) === i); // dedupe

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
