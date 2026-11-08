import { redirect } from "next/navigation";
import { hubHref } from "@/lib/domains";

/** Settings are workspace-wide now (not part of the LinkedIn channel): old links go there. */
export default function OldSettings() {
  redirect(hubHref("/settings"));
}
