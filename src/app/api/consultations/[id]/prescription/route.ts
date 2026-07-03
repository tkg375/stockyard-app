import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export const dynamic = "force-dynamic";

function splitText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length <= maxChars) {
      current = (current + " " + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function generateRxPdf(params: {
  vetName: string;
  licenseNumber: string;
  practicePhone: string;
  ownerName: string;
  petName: string;
  petType: string;
  petBreed: string | null;
  petWeight: number | null;
  drugName: string;
  strength: string;
  doseInstructions: string;
  quantity: string;
  refills: number;
  notes: string | null;
  pharmacyName: string | null;
  signatureB64: string | null;
  issuedDate: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const { width, height } = page.getSize();

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  const teal = rgb(0.1, 0.416, 0.416);
  const dark = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.45, 0.45, 0.45);
  const lightGray = rgb(0.9, 0.9, 0.9);

  let y = height - 40;
  const margin = 50;
  const contentWidth = width - margin * 2;

  // Header bar
  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: teal });
  page.drawText("VETERINARY PRESCRIPTION", {
    x: margin, y: height - 35, size: 18, font: fontBold, color: rgb(1, 1, 1),
  });
  page.drawText("Stockyard Animal Health LLC", {
    x: margin, y: height - 55, size: 11, font: fontRegular, color: rgb(0.9, 0.95, 0.95),
  });
  page.drawText(`NOT VALID FOR CONTROLLED SUBSTANCES`, {
    x: margin, y: height - 70, size: 8, font: fontOblique, color: rgb(1, 0.85, 0.5),
  });

  // Practice info (right side of header)
  const practiceLines = [
    params.vetName,
    `FL Vet License: ${params.licenseNumber}`,
    params.practicePhone,
    "stockyardanimalhealth.com",
  ];
  practiceLines.forEach((line, i) => {
    const textWidth = fontRegular.widthOfTextAtSize(line, 9);
    page.drawText(line, {
      x: width - margin - textWidth, y: height - 28 - i * 13,
      size: 9, font: i === 0 ? fontBold : fontRegular, color: rgb(1, 1, 1),
    });
  });

  y = height - 100;

  // Date + Rx# row
  const rxId = crypto.randomUUID().slice(0, 8).toUpperCase();
  page.drawText(`Date: ${params.issuedDate}`, { x: margin, y, size: 10, font: fontRegular, color: dark });
  const rxLabel = `Rx #: ${rxId}`;
  page.drawText(rxLabel, { x: width - margin - fontBold.widthOfTextAtSize(rxLabel, 10), y, size: 10, font: fontBold, color: dark });

  y -= 20;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: lightGray });
  y -= 18;

  // Patient section
  page.drawText("PATIENT INFORMATION", { x: margin, y, size: 9, font: fontBold, color: teal });
  y -= 14;

  const patientFields: [string, string][] = [
    ["Owner", params.ownerName],
    ["Animal Name", params.petName],
    ["Species / Breed", `${params.petType}${params.petBreed ? ` — ${params.petBreed}` : ""}`],
    ["Weight", params.petWeight ? `${params.petWeight} lbs` : "Not recorded"],
  ];
  patientFields.forEach(([label, value]) => {
    page.drawText(`${label}:`, { x: margin, y, size: 9, font: fontBold, color: dark });
    page.drawText(value, { x: margin + 90, y, size: 9, font: fontRegular, color: dark });
    y -= 14;
  });

  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: lightGray });
  y -= 18;

  // Rx section
  page.drawText("PRESCRIPTION", { x: margin, y, size: 9, font: fontBold, color: teal });
  y -= 16;

  // Drug box
  page.drawRectangle({ x: margin, y: y - 10, width: contentWidth, height: 90, color: rgb(0.97, 0.99, 0.99), borderColor: teal, borderWidth: 1 });
  y -= 2;

  page.drawText("Drug / Medication:", { x: margin + 10, y, size: 9, font: fontBold, color: dark });
  page.drawText(`${params.drugName}  ${params.strength}`, { x: margin + 120, y, size: 11, font: fontBold, color: teal });
  y -= 16;

  page.drawText("Directions:", { x: margin + 10, y, size: 9, font: fontBold, color: dark });
  const dirLines = splitText(params.doseInstructions, 65);
  dirLines.forEach((line, i) => {
    page.drawText(line, { x: margin + 80, y: y - i * 13, size: 9, font: fontRegular, color: dark });
  });
  y -= Math.max(dirLines.length, 1) * 13 + 4;

  page.drawText("Quantity:", { x: margin + 10, y, size: 9, font: fontBold, color: dark });
  page.drawText(params.quantity, { x: margin + 80, y, size: 9, font: fontRegular, color: dark });

  page.drawText("Refills:", { x: margin + 200, y, size: 9, font: fontBold, color: dark });
  page.drawText(params.refills === 0 ? "0 (None)" : String(params.refills), { x: margin + 248, y, size: 9, font: fontRegular, color: dark });
  y -= 20;

  if (params.notes) {
    y -= 8;
    page.drawText("Additional Notes:", { x: margin, y, size: 9, font: fontBold, color: dark });
    y -= 14;
    const noteLines = splitText(params.notes, 80);
    noteLines.forEach((line) => {
      page.drawText(line, { x: margin, y, size: 9, font: fontOblique, color: gray });
      y -= 13;
    });
  }

  y -= 12;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: lightGray });
  y -= 18;

  // Pharmacy
  if (params.pharmacyName) {
    page.drawText("SEND TO PHARMACY", { x: margin, y, size: 9, font: fontBold, color: teal });
    y -= 14;
    page.drawText(params.pharmacyName, { x: margin, y, size: 9, font: fontRegular, color: dark });
    y -= 20;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: lightGray });
    y -= 18;
  }

  // Signature block
  page.drawText("AUTHORIZED SIGNATURE", { x: margin, y, size: 9, font: fontBold, color: teal });
  y -= 14;

  if (params.signatureB64) {
    try {
      const b64Data = params.signatureB64.replace(/^data:image\/png;base64,/, "");
      const sigBytes = Uint8Array.from(atob(b64Data), c => c.charCodeAt(0));
      const sigImage = await doc.embedPng(sigBytes);
      const sigDims = sigImage.scaleToFit(200, 60);
      page.drawImage(sigImage, { x: margin, y: y - sigDims.height, width: sigDims.width, height: sigDims.height });
      y -= sigDims.height + 6;
    } catch { /* skip sig image if corrupt */ }
  }

  page.drawLine({ start: { x: margin, y }, end: { x: margin + 220, y }, thickness: 1, color: dark });
  y -= 14;
  page.drawText(params.vetName, { x: margin, y, size: 10, font: fontBold, color: dark });
  y -= 13;
  page.drawText(`FL Vet License #: ${params.licenseNumber}`, { x: margin, y, size: 9, font: fontRegular, color: gray });
  y -= 13;
  page.drawText(`Date: ${params.issuedDate}`, { x: margin, y, size: 9, font: fontRegular, color: gray });

  // Footer disclaimer
  const disclaimer = "This prescription is issued pursuant to a valid veterinarian-client-patient relationship. Not valid for controlled substances. Valid in Florida only.";
  const disclaimerLines = splitText(disclaimer, 90);
  const footerY = 28 + disclaimerLines.length * 11;
  page.drawRectangle({ x: 0, y: 0, width, height: footerY + 8, color: rgb(0.95, 0.95, 0.95) });
  disclaimerLines.forEach((line, i) => {
    const tw = fontOblique.widthOfTextAtSize(line, 8);
    page.drawText(line, { x: (width - tw) / 2, y: footerY - i * 11, size: 8, font: fontOblique, color: gray });
  });

  return doc.save();
}

async function sendFax(pdfBytes: Uint8Array, toFax: string, env: Record<string, string>): Promise<{ success: boolean; faxId?: string; error?: string }> {
  const apiKey = env.PHAXIO_API_KEY;
  const apiSecret = env.PHAXIO_API_SECRET;
  if (!apiKey || !apiSecret) return { success: false, error: "Fax service not configured (PHAXIO_API_KEY / PHAXIO_API_SECRET missing)" };

  const form = new FormData();
  form.append("to", toFax.replace(/\D/g, ""));
  form.append("file", new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" }), "prescription.pdf");

  const creds = btoa(`${apiKey}:${apiSecret}`);
  const res = await fetch("https://api.phaxio.com/v2.1/faxes", {
    method: "POST",
    headers: { Authorization: `Basic ${creds}` },
    body: form,
    signal: AbortSignal.timeout(20000),
  });

  const data = await res.json() as { success: boolean; data?: { id: string }; message?: string };
  if (!data.success) return { success: false, error: data.message ?? "Fax send failed" };
  return { success: true, faxId: String(data.data?.id ?? "") };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionFromRequest(req);
  if (!user || user.role !== "vet") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    drugName: string;
    strength: string;
    doseInstructions: string;
    quantity: string;
    refills: number;
    notes?: string;
    pharmacyName?: string;
    pharmacyFax?: string;
    pharmacyEmail?: string;
    sendFax?: boolean;
    sendEmail?: boolean;
  };

  if (!body.drugName || !body.strength || !body.doseInstructions || !body.quantity) {
    return NextResponse.json({ error: "Missing required prescription fields" }, { status: 400 });
  }

  const db = await getDb();

  // Load consultation + patient info
  const consult = await db.prepare(`
    SELECT * FROM consultations WHERE id = ?
  `).bind(id).first<Record<string, unknown>>();
  if (!consult) return NextResponse.json({ error: "Consultation not found" }, { status: 404 });

  // Load vet settings + signature
  const [vetName, vetPhone, vetLicense, sigRow] = await Promise.all([
    db.prepare("SELECT value FROM settings WHERE key = 'vet_name'").first<{ value: string }>(),
    db.prepare("SELECT value FROM settings WHERE key = 'vet_phone'").first<{ value: string }>(),
    db.prepare("SELECT value FROM settings WHERE key = 'vet_license'").first<{ value: string }>(),
    db.prepare("SELECT value FROM settings WHERE key = 'vet_signature_b64'").first<{ value: string }>(),
  ]);

  const issuedDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // Generate PDF
  const pdfBytes = await generateRxPdf({
    vetName: vetName?.value ?? "Dr. Meleah McMillen, DVM",
    licenseNumber: vetLicense?.value ?? "VM16794",
    practicePhone: vetPhone?.value ?? "(352) 238-5043",
    ownerName: String(consult.user_name ?? ""),
    petName: String(consult.pet_name ?? ""),
    petType: String(consult.pet_type ?? ""),
    petBreed: consult.pet_breed ? String(consult.pet_breed) : null,
    petWeight: consult.pet_weight ? Number(consult.pet_weight) : null,
    drugName: body.drugName,
    strength: body.strength,
    doseInstructions: body.doseInstructions,
    quantity: body.quantity,
    refills: body.refills ?? 0,
    notes: body.notes ?? null,
    pharmacyName: (body.pharmacyName ?? String(consult.pharmacy_name ?? "")) || null,
    signatureB64: sigRow?.value ?? null,
    issuedDate,
  });

  // Save prescription record
  const rxId = crypto.randomUUID();
  const pharmacyFax = (body.pharmacyFax ?? String(consult.pharmacy_fax ?? "")) || null;
  const pharmacyEmail = (body.pharmacyEmail ?? String(consult.pharmacy_email ?? "")) || null;
  const pharmacyName = (body.pharmacyName ?? String(consult.pharmacy_name ?? "")) || null;

  await db.prepare(`
    INSERT INTO prescriptions (id, consultation_id, drug_name, strength, dose_instructions, quantity, refills, notes, pharmacy_name, pharmacy_fax, pharmacy_email, fax_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(rxId, id, body.drugName, body.strength, body.doseInstructions, body.quantity, body.refills ?? 0, body.notes ?? null, pharmacyName, pharmacyFax, pharmacyEmail, "pending").run();

  const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

  // Email prescription if pharmacy takes email
  if (body.sendEmail && pharmacyEmail) {
    const petName = String(consult.pet_name ?? "");
    const ownerName = String(consult.user_name ?? "");
    const emailOk = await sendEmail({
      to: pharmacyEmail,
      subject: `Veterinary Prescription — ${petName} (${ownerName}) — ${body.drugName} ${body.strength}`,
      htmlBody: `<p>Please find attached a veterinary prescription for <strong>${petName}</strong>, owner <strong>${ownerName}</strong>.</p><p>Drug: <strong>${body.drugName} ${body.strength}</strong><br>Directions: ${body.doseInstructions}<br>Qty: ${body.quantity} | Refills: ${body.refills ?? 0}</p><p>Issued by Dr. Meleah McMillen, DVM — Stockyard Animal Health LLC<br>FL Vet License #VM16794 | (352) 238-5043</p>`,
      textBody: `Veterinary prescription for ${petName} (${ownerName})\nDrug: ${body.drugName} ${body.strength}\nDirections: ${body.doseInstructions}\nQty: ${body.quantity} | Refills: ${body.refills ?? 0}\nIssued by Dr. Meleah McMillen, DVM — Stockyard Animal Health LLC`,
      attachment: { filename: `prescription-${petName.replace(/\s+/g, "-")}.pdf`, contentType: "application/pdf", content: pdfBase64 },
    });
    await db.prepare(`UPDATE prescriptions SET fax_status = ? WHERE id = ?`).bind(emailOk ? "emailed" : "email_failed", rxId).run();
    return NextResponse.json({ rxId, emailed: emailOk, emailedTo: pharmacyEmail, emailError: emailOk ? null : "Email send failed" });
  }

  // Fax if requested and fax number available
  if (body.sendFax && pharmacyFax) {
    const env = process.env as unknown as Record<string, string>;
    const faxResult = await sendFax(pdfBytes, pharmacyFax, env);
    await db.prepare(`
      UPDATE prescriptions SET fax_status = ?, fax_id = ?, fax_error = ? WHERE id = ?
    `).bind(faxResult.success ? "sent" : "failed", faxResult.faxId ?? null, faxResult.error ?? null, rxId).run();

    if (!faxResult.success) {
      return NextResponse.json({ rxId, faxed: false, faxError: faxResult.error, pdfBase64 });
    }
    return NextResponse.json({ rxId, faxed: true, faxId: faxResult.faxId });
  }

  // Return PDF as base64 for download/preview when not faxing
  return NextResponse.json({ rxId, faxed: false, pdfBase64 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionFromRequest(req);
  if (!user || user.role !== "vet") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const rxList = await db.prepare("SELECT * FROM prescriptions WHERE consultation_id = ? ORDER BY created_at DESC").bind(id).all();
  return NextResponse.json({ prescriptions: rxList.results });
}
