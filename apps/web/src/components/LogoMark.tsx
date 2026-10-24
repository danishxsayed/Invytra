import Image from "next/image";
import { cx } from "./ui";

/** The Invytra app-icon mark (public/logo-128.png). Decorative next to the word "Invytra". */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return <Image src="/logo-128.png" alt="" width={size} height={size} priority className={cx("shrink-0", className)} />;
}
