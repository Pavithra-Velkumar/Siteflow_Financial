const STYLES = {
  completed: "bg-emerald-100 text-emerald-800",
  paid: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  overdue: "bg-red-100 text-red-800",
  in_progress: "bg-blue-100 text-blue-800",
  not_started: "bg-slate-100 text-slate-700",
  blocked: "bg-red-100 text-red-800",
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-700",
  incoming: "bg-emerald-100 text-emerald-800",
  outgoing: "bg-red-100 text-red-800",
};

export default function StatusBadge({ value, label }) {
  const key = String(value || "").toLowerCase();
  const cls = STYLES[key] || "bg-slate-100 text-slate-700";
  const text = label ?? (value || "").replace(/_/g, " ");
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${cls}`}>
      {text}
    </span>
  );
}
