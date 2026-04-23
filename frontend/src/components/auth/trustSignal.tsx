import type { ReactNode } from "react";

export function TrustSignal({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-stone-200">
      <span className="text-amber-200 [&_svg]:size-4">{icon}</span>
      {label}
    </div>
  );
}
