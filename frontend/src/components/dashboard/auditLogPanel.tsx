import { Activity } from "lucide-react";
import type { AuditLog } from "@/types/domainTypes";

export function AuditLogPanel({ auditLogs }: { auditLogs: AuditLog[] }) {
  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2 font-semibold">
        <Activity className="size-4 text-amber-600" />
        Audit log
      </div>
      <div className="grid gap-3">
        {auditLogs.length === 0 ? (
          <p className="text-sm text-stone-600">No audit events yet.</p>
        ) : (
          auditLogs.map((log) => (
            <article
              key={log.id}
              className="rounded-2xl border border-stone-200 p-3"
            >
              <p className="text-sm font-medium">{log.action}</p>
              <p className="mt-1 text-xs text-stone-500">
                {log.targetType} - {new Date(log.createdAt).toLocaleString()}
              </p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
