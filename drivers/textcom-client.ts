import fetch from "node-fetch";

const TEXTCOM_API = process.env.TEXTCOM_API_URL!;
const TEXTCOM_KEY = process.env.TEXTCOM_API_KEY!;

/**
 * Example wrapper — update request shape to match Text.com's assistant API.
 * Pass context in metadata/session if your integration supports session variables.
 */
export async function getTextComResponse(prompt: string, context: { role?: string; loggedIn?: boolean }) {
  const body = {
    input: prompt,
    // metadata/session: your provider-specific field
    session: {
      role: context.role || "guest",
      logged_in: context.loggedIn || false
    }
  };
  const res = await fetch(TEXTCOM_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${TEXTCOM_KEY}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Text.com API error: ${res.status} ${txt}`);
  }
  const j = await res.json();
  // adapt to actual response shape
  return j.reply ?? j.output ?? j.choices?.[0]?.text ?? JSON.stringify(j);
}
