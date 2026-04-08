import { ImapFlow } from "imapflow";
import { PDFParse } from "pdf-parse";

const client = new ImapFlow({
  host: process.env.IMAP_HOST,
  port: Number(process.env.IMAP_PORT),
  secure: false,
  tls: { rejectUnauthorized: false },
  auth: {
    user: process.env.IMAP_USER,
    pass: process.env.IMAP_PASS,
  },
  logger: false,
});

await client.connect();
console.log("IMAP connected\n");

const lock = await client.getMailboxLock("INBOX");
try {
  const uid = 4333; // 石江的简历
  console.log(`Fetching UID ${uid}...\n`);

  const msg = await client.fetchOne(String(uid), {
    envelope: true,
    bodyStructure: true,
  });

  console.log(`Subject: ${msg.envelope.subject}\n`);

  // Find the PDF part — it's part "2" (second child of multipart/mixed)
  // Structure: multipart/mixed -> [1: multipart/alternative -> [1: text/html], 2: application/octet-stream (PDF)]
  const pdfPart = findPdfParts(msg.bodyStructure, "");
  console.log("PDF parts found:", pdfPart);

  for (const p of pdfPart) {
    console.log(`\nDownloading part ${p.part}: ${p.filename}...`);
    const { content } = await client.download(String(uid), p.part);
    const chunks = [];
    for await (const chunk of content) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    console.log(`Downloaded: ${buf.length} bytes`);
    console.log(`Magic bytes: ${buf.slice(0, 5).toString()}`);

    if (buf.slice(0, 5).toString() === "%PDF-") {
      console.log("Valid PDF confirmed\n");

      // Parse PDF text
      const parser = new PDFParse({ data: buf });
      const result = await parser.getText();
      console.log("--- Extracted Resume Text ---");
      console.log(result.text.slice(0, 2000));
      if (result.text.length > 2000) {
        console.log(`\n... (truncated, total ${result.text.length} chars)`);
      }
      await parser.destroy();
    }
  }
} finally {
  lock.release();
}

await client.logout();
console.log("\nDone");

function findPdfParts(node, prefix) {
  const results = [];
  if (node.childNodes) {
    for (let i = 0; i < node.childNodes.length; i++) {
      const part = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      results.push(...findPdfParts(node.childNodes[i], part));
    }
  } else {
    const filename = node.dispositionParameters?.filename || node.parameters?.name || "";
    if (
      filename.toLowerCase().endsWith(".pdf") ||
      (node.type === "application" && (node.subtype === "pdf" || node.subtype === "octet-stream") && filename.toLowerCase().includes(".pdf"))
    ) {
      results.push({ part: prefix || "1", filename, size: node.size || 0 });
    }
  }
  return results;
}
