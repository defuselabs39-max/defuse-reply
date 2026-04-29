/**
 * Backend proxy for verifying Gumroad license keys.
 *
 * Deploy this as:
 *   - Vercel:  api/verify-license.ts  (auto-detected as a serverless function)
 *   - Express: mount with app.use(router) and add the route below
 *
 * Required environment variable:
 *   GUMROAD_ACCESS_TOKEN — from Gumroad Dashboard → Settings → Advanced → Access Token
 *
 * Never call Gumroad's API directly from the browser — this proxy keeps
 * your access token off the client.
 */

// ─── Vercel / Next.js serverless handler ──────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { license_key } = req.body as { license_key?: string };

  if (!license_key || typeof license_key !== "string") {
    return res.status(400).json({ success: false, error: "Missing license_key" });
  }

  const GUMROAD_ACCESS_TOKEN = process.env.GUMROAD_ACCESS_TOKEN;
  if (!GUMROAD_ACCESS_TOKEN) {
    console.error("GUMROAD_ACCESS_TOKEN environment variable is not set");
    return res.status(500).json({ success: false, error: "Server misconfiguration" });
  }

  try {
    const gumroadRes = await fetch("https://api.gumroad.com/v2/licenses/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        product_id: "cvlyvb",           // permalink from defuselabs.gumroad.com/l/cvlyvb
        license_key,
        access_token: GUMROAD_ACCESS_TOKEN,
        increment_uses_count: "false",  // prevents double-counting on re-verification
      }),
    });

    const data = await gumroadRes.json();

    // data.success = true means the key exists and belongs to this product
    // data.uses <= 1 means it hasn't been used to unlock another account
    if (data.success && data.uses <= 1) {
      return res.status(200).json({ success: true });
    }

    return res.status(403).json({ success: false, error: "Invalid or already-used license" });
  } catch (err) {
    console.error("Gumroad verify error:", err);
    return res.status(500).json({ success: false, error: "Verification failed" });
  }
}

// ─── Express alternative (if you have an existing Express server) ─────────────
//
// import express from "express";
// const router = express.Router();
//
// router.post("/api/verify-license", async (req, res) => {
//   ... same logic as above ...
// });
//
// export default router;
