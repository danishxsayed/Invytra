import { CalendarDays } from "lucide-react";
import type { WeekTable as Data } from "@/lib/data";
import { Card, CardHeader, cx } from "./ui";

/** The last 7 days, one column per day. */
export function WeekTable({ data, timeZone }: { data: Data; timeZone: string }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title="This week" icon={CalendarDays} description={`Day by day, in ${timeZone.replace(/_/g, " ")} time`} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[15px]">
          <thead>
            <tr className="text-[13px] font-medium uppercase tracking-wide text-stone-400">
              <th className="px-5 py-2.5 text-left font-medium" />
              {data.days.map((d, i) => (
                <th key={d.key} className={cx("px-2 py-2.5 text-right font-medium", i === 6 && "text-stone-700")}>
                  {i === 6 ? "Today" : d.label}
                </th>
              ))}
              <th className="px-5 py-2.5 text-right font-medium text-stone-700">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.rows.map((r) => (
              <tr key={r.label}>
                <td className="whitespace-nowrap px-5 py-2.5 font-medium text-stone-700">{r.label}</td>
                {r.counts.map((n, i) => (
                  <td key={i} className={cx("px-2 py-2.5 text-right tabular-nums", n ? "text-stone-900" : "text-stone-300")}>
                    {n}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-stone-900">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
