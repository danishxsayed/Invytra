import { redirect } from "next/navigation";

export default function EmailHome() {
  redirect("/email/mailboxes");
}
