import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface NpiAddress {
  address_type: string;
  address_1: string;
  city: string;
  state: string;
  postal_code: string;
  telephone_number?: string;
  fax_number?: string;
}

interface NpiResult {
  basic?: { organization_name?: string };
  addresses?: NpiAddress[];
}

interface PharmacyResult {
  name: string;
  address: string;
  phone: string | null;
  fax: string | null;
  email: string | null;
  source: "npi" | "google" | "known";
}

// Well-known online/mail-order vet pharmacies that won't appear in NPI or Google Maps
const KNOWN_ONLINE_PHARMACIES: PharmacyResult[] = [
  { name: "Chewy Pharmacy", address: "chewy.com — Online / Mail-Order", phone: "1-877-977-3879", fax: null, email: "Rx@chewy.com", source: "known" },
  { name: "Amazon Pharmacy", address: "pharmacy.amazon.com — Online / Mail-Order", phone: "1-855-745-5725", fax: "1-512-884-5981", email: null, source: "known" },
  { name: "1-800-PetMeds", address: "petmeds.com — Online / Mail-Order", phone: "1-800-738-6337", fax: "1-800-600-8285", email: null, source: "known" },
  { name: "Wedgewood Pharmacy", address: "wedgewoodpharmacy.com — Compounding / Mail-Order", phone: "1-877-357-6613", fax: "1-800-589-4250", email: null, source: "known" },
  { name: "Mixlab Pharmacy", address: "mixlab.com — Compounding / Mail-Order", phone: "1-888-649-5227", fax: "1-212-967-0892", email: null, source: "known" },
  { name: "Vetsource", address: "vetsource.com — Online / Mail-Order", phone: "1-877-738-8883", fax: null, email: null, source: "known" },
  { name: "Allivet", address: "allivet.com — Online / Mail-Order", phone: "1-888-500-5808", fax: "1-877-500-9950", email: null, source: "known" },
  { name: "Valley Vet Supply", address: "1118 Pony Express Hwy, Marysville, KS 66508", phone: "(800) 419-9524", fax: "1-800-531-2390", email: null, source: "known" },
];

async function searchNpi(query?: string, city?: string, state?: string): Promise<PharmacyResult[]> {
  try {
    const params = new URLSearchParams({ version: "2.1", limit: "20", taxonomy_description: "pharmacy" });
    if (query) params.set("organization_name", query + "*");
    if (city) params.set("city", city);
    if (state) params.set("state", state);

    const res = await fetch(`https://npiregistry.cms.hhs.gov/api/?${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];

    const data = await res.json() as { results?: NpiResult[] };
    return (data.results ?? []).map((r) => {
      const name = r.basic?.organization_name ?? "Unknown Pharmacy";
      const addr = r.addresses?.find((a) => a.address_type === "LOCATION") ?? r.addresses?.[0];
      const address = addr ? `${addr.address_1}, ${addr.city}, ${addr.state} ${addr.postal_code.slice(0, 5)}` : "";
      return { name, address, phone: addr?.telephone_number ?? null, fax: addr?.fax_number ?? null, email: null, source: "npi" as const };
    }).filter((p) => p.name && p.address);
  } catch {
    return [];
  }
}

async function searchGooglePlaces(query: string, city?: string, state?: string, apiKey?: string): Promise<PharmacyResult[]> {
  if (!apiKey) return [];
  try {
    // No type filter — lets it find online pharmacies, compounding pharmacies, etc.
    const textQuery = `${query} pharmacy${city ? " " + city : ""}${state ? " " + state : ""}`;
    const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    url.searchParams.set("query", textQuery);
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];

    const data = await res.json() as { results?: { place_id: string; name: string; formatted_address: string }[] };
    const places = data.results?.slice(0, 8) ?? [];

    const results = await Promise.all(places.map(async (p) => {
      let phone: string | null = null;
      try {
        const detailUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
        detailUrl.searchParams.set("place_id", p.place_id);
        detailUrl.searchParams.set("fields", "formatted_phone_number");
        detailUrl.searchParams.set("key", apiKey);
        const dr = await fetch(detailUrl.toString(), { signal: AbortSignal.timeout(4000) });
        if (dr.ok) {
          const dd = await dr.json() as { result?: { formatted_phone_number?: string } };
          phone = dd.result?.formatted_phone_number ?? null;
        }
      } catch { /* non-critical */ }
      return { name: p.name, address: p.formatted_address, phone, fax: null, email: null, source: "google" as const };
    }));

    return results;
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const { query, city, state } = await req.json() as { query?: string; city?: string; state?: string };

  if (!query && !city) return NextResponse.json({ pharmacies: [] });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const q = (query ?? "").toLowerCase().trim();

  // Check known online pharmacies first
  const knownMatches = q.length >= 2
    ? KNOWN_ONLINE_PHARMACIES.filter(p => p.name.toLowerCase().includes(q))
    : [];

  // Run NPI and Google in parallel
  const [npiResults, googleResults] = await Promise.all([
    searchNpi(query, city, state),
    searchGooglePlaces(query ?? "", city, state, apiKey),
  ]);

  // Merge: known first, then NPI (has fax), then Google — dedupe by name
  const seen = new Set<string>();
  const merged: PharmacyResult[] = [];
  for (const p of [...knownMatches, ...npiResults, ...googleResults]) {
    const key = p.name.toLowerCase();
    if (!seen.has(key)) { seen.add(key); merged.push(p); }
  }

  return NextResponse.json({ pharmacies: merged });
}
