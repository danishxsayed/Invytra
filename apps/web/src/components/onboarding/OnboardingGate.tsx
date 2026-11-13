"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

/**
 * New users answer the onboarding questions first, except when they've just chosen a paid
 * plan on the pricing page: then the payment comes first (onboarding follows next visit).
 * Once paying, it stays that way on this page even after the address is tidied.
 */
export function OnboardingGate({ onboarding, children }: { onboarding: React.ReactNode; children: React.ReactNode }) {
  const paying = (usePathname() ?? "").endsWith("/billing") && useSearchParams().get("pay") === "1";
  const [cameToPay] = useState(paying);
  return <>{paying || cameToPay ? children : onboarding}</>;
}
