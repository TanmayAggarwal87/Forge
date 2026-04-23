import { Hammer } from "lucide-react";

export function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className="flex items-center gap-3 text-sm font-semibold">
      <span
        className={`grid size-9 place-items-center rounded-xl ${
          inverse ? "bg-white text-stone-950" : "bg-stone-950 text-white"
        }`}
      >
        <Hammer className="size-4" />
      </span>
      <span>Forge</span>
    </div>
  );
}
