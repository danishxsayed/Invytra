"use client";

import { X } from "lucide-react";
import { useTransition } from "react";
import { hideSetupPlanAction } from "@/app/workspace/onboarding-actions";

export function HideSetupPlan() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Hide the setup plan"
      title="Hide"
      disabled={pending}
      onClick={() => start(() => hideSetupPlanAction())}
      className="grid h-8 w-8 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  );
}
