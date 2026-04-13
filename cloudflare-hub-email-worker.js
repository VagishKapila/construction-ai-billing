/**
 * Cloudflare Email Worker — ConstructInvoice AI Hub Inbound Email
 * 
 * Catches all email sent to *@hub.constructinv.varshyl.com
 * Parses the alias format: {trade-slug}-{project-id}@hub.constructinv.varshyl.com
 * POSTs the email payload to Railway backend with X-Hub-Secret auth
 * 
 * Deploy: wrangler deploy
 * Route:  catch-all on hub.constructinv.varshyl.com via Email Routing
 */

const BACKEND_URL = "https://constructinv.varshyl.com/api/hub/inbound-email";
const HUB_INBOUND_SECRET = "3f3af11ac59ef4f0d4fca14a5234feede4eac36e22f6d4d448a7d876189733e2";

export default {
  async email(message, env, ctx) {
    const to = message.to;
    const from = message.from;
    const subject = message.headers.get("subject") || "(no subject)";
    const messageId = message.headers.get("message-id") || "";

    // Read raw email body (first 500KB max to avoid memory limits)
    const rawEmail = await readStream(message.raw, 512 * 1024);

    // Parse the alias: plumbing-123@hub.constructinv.varshyl.com
    // Extract local part before @
    const localPart = to.split("@")[0]; // e.g. "plumbing-123" or "electrical-456"
    
    // Last segment after final dash is the project trade ID or project ID
    // Format: {trade-slug}-{project-id} where project-id is numeric
    const lastDashIndex = localPart.lastIndexOf("-");
    let tradeSlug = localPart;
    let projectRef = null;
    
    if (lastDashIndex !== -1) {
      const possibleId = localPart.substring(lastDashIndex + 1);
      if (/^\d+$/.test(possibleId)) {
        tradeSlug = localPart.substring(0, lastDashIndex);
        projectRef = possibleId;
      }
    }

    // Build payload for Railway backend
    const payload = {
      to,
      from,
      subject,
      messageId,
      tradeSlug,
      projectRef,
      rawEmail: rawEmail ? Buffer.from(rawEmail).toString("base64") : null,
      receivedAt: new Date().toISOString(),
    };

    // POST to backend
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Secret": HUB_INBOUND_SECRET,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Hub inbound email failed: ${response.status} ${errorBody}`);
      // Don't throw — Cloudflare will retry if we throw. 
      // A 4xx from our backend means bad data, not transient — just log it.
    } else {
      console.log(`Hub email processed: ${from} → ${to} (trade: ${tradeSlug}, project: ${projectRef})`);
    }
  },
};

/**
 * Read a ReadableStream up to maxBytes, return Uint8Array or null
 */
async function readStream(stream, maxBytes) {
  if (!stream) return null;
  const reader = stream.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        totalBytes += value.length;
        if (totalBytes >= maxBytes) break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (chunks.length === 0) return null;
  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
