// ─── Constants ────────────────────────────────────────────────────────────────

export const GUMROAD_PRODUCT_URL = "https://defuselabs.gumroad.com/l/cvlyvb";
export const VERIFY_ENDPOINT = "/api/verify-license";
const STORAGE_KEY = "defuse_license_v1";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GumroadPurchaseEvent {
  license_key: string;
  product_permalink: string;
  email: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function onGumroadPurchase(
  callback: (data: GumroadPurchaseEvent) => void
): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<GumroadPurchaseEvent>).detail;
    callback(detail);
  };
  window.addEventListener("gumroad:purchase", handler);
  return () => window.removeEventListener("gumroad:purchase", handler);
}

export async function verifyLicense(licenseKey: string): Promise<boolean> {
  try {
    const res = await fetch(VERIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: licenseKey }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

export function saveLicense(licenseKey: string): void {
  localStorage.setItem(STORAGE_KEY, licenseKey);
  localStorage.setItem("defuse_unlocked_v5", "true");
}

export function loadLicense(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}
