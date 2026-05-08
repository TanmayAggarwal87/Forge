"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type CanvasToolbarProps = {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomLabel: string;
};

export function CanvasToolbar({ zoomIn, zoomOut, zoomLabel }: CanvasToolbarProps) {
  return (
    <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-md border border-stone-800 bg-stone-900 p-1 shadow-lg shadow-black/20">
      <Button variant="ghost" size="icon-sm" onClick={zoomOut} className="rounded-md text-stone-300 hover:bg-stone-800 hover:text-amber-300">
        <Minus />
      </Button>
      <span className="min-w-12 text-center text-xs font-medium text-stone-400">{zoomLabel}</span>
      <Button variant="ghost" size="icon-sm" onClick={zoomIn} className="rounded-md text-stone-300 hover:bg-stone-800 hover:text-amber-300">
        <Plus />
      </Button>
    </div>
  );
}
