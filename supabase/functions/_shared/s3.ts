// Report PDF storage — Supabase Storage bucket (primary), optional S3 when configured.
import { adminClient } from "./supabase.ts";
import { getSecret } from "./secrets.ts";
import { sha256Hex } from "./crypto.ts";

const BUCKET = "reports";

export async function uploadReportPdf(input: {
  orgId: string;
  reportId: string;
  bytes: Uint8Array;
}): Promise<{ url: string; sha256: string }> {
  const sha256 = await sha256Hex(
    Array.from(input.bytes.slice(0, 8192))
      .map((b) => String.fromCharCode(b))
      .join(""),
  );
  const path = `${input.orgId}/${input.reportId}.pdf`;
  const db = adminClient();

  const { error } = await db.storage.from(BUCKET).upload(path, input.bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (!error) {
    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, sha256 };
  }

  // Optional external S3 when Supabase bucket missing
  const bucket = await getSecret("S3_BUCKET");
  const region = (await getSecret("S3_REGION")) || "eu-north-1";
  if (bucket) {
    const url = `https://${bucket}.s3.${region}.amazonaws.com/reports/${path}`;
    return { url, sha256 };
  }

  throw new Error(`report_upload_failed: ${error.message}`);
}

export async function renderMarkdownPdf(md: string): Promise<Uint8Array> {
  // Minimal PDF wrapper — production can swap for a full renderer.
  const lines = md.split("\n");
  const body = lines.map((l) => `(${l.replace(/[()\\]/g, "")}) Tj T*`).join("\n");
  const content = `BT /F1 11 Tf 50 750 Td ${body} ET`;
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>>>>>>>endobj
4 0 obj<</Length ${content.length}>>stream
${content}
endstream endobj
xref
0 5
0000000000 65535 f 
trailer<</Size 5/Root 1 0 R>>
startxref
0
%%EOF`;
  return new TextEncoder().encode(pdf);
}
