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
    <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-md border border-slate-200 bg-white p-1 shadow-sm">
      <Button variant="ghost" size="icon-sm" onClick={zoomOut} className="rounded-md">
        <Minus />
      </Button>
      <span className="min-w-12 text-center text-xs font-medium text-slate-600">{zoomLabel}</span>
      <Button variant="ghost" size="icon-sm" onClick={zoomIn} className="rounded-md">
        <Plus />
      </Button>
    </div>
  );
}
