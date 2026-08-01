import { useEffect, useMemo, useState } from "react";
import api, { API } from "@/lib/api";
import { inr, inrCompact, fmtDate } from "@/lib/format";
import { Building2, ChevronRight, ArrowLeft, TrendingUp, TrendingDown, HandCoins, Clock, ListChecks, Loader2, Image as ImageIcon, X, Camera } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const StatMini = ({ label, value, icon: Icon, color }) => (
  <div className="bg-white rounded-xl p-4 shadow border border-slate-100">
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <Icon className="w-4 h-4" style={{ color }} />
    </div>
    <div className="stat-num text-xl text-slate-900">{value}</div>
  </div>
);

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [active, setActive] = useState(null); // project name currently drilled into
  const [detail, setDetail] = useState({ transactions: [], tasks: [], documents: [] });
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/projects");
      setProjects(r.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openProject = async (name) => {
    setActive(name);
    setDetailLoading(true);
    try {
      const r = await api.get(`/projects/details?name=${encodeURIComponent(name)}`);
      setDetail(r.data);
    } finally { setDetailLoading(false); }
  };

  const chartData = useMemo(
    () => projects.slice(0, 8).map((p) => ({ label: p.name.length > 14 ? p.name.slice(0, 12) + "…" : p.name, Revenue: p.revenue, Expenses: p.expense })),
    [projects]
  );

  if (active) {
    const p = projects.find((x) => x.name === active);
    const docsById = Object.fromEntries((detail.documents || []).map((d) => [d.id, d]));
    const docUrl = (id) => `${API}/documents/${id}/download?auth=${encodeURIComponent(localStorage.getItem("sf_token") || "")}`;
    const photos = [];
    (detail.transactions || []).forEach((t) => {
      (t.site_photos || []).forEach((docId) => {
        const doc = docsById[docId];
        if (doc && (doc.content_type || "").startsWith("image/")) {
          photos.push({ docId, kind: "site", txn: t });
        }
      });
      if (t.document_id) {
        const doc = docsById[t.document_id];
        if (doc && (doc.content_type || "").startsWith("image/")) {
          photos.push({ docId: t.document_id, kind: "bill", txn: t });
        }
      }
    });

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button data-testid="back-to-projects" onClick={() => { setActive(null); setLightbox(null); }}
            className="p-2 rounded-md bg-white hover:bg-slate-100 border border-slate-200">
            <ArrowLeft className="w-4 h-4 text-slate-700" />
          </button>
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white tracking-tight">{active}</h1>
            <p className="text-slate-400 mt-1 text-sm">Site-level profit, tasks and photo wall.</p>
          </div>
        </div>

        {p && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatMini label="Revenue" value={inrCompact(p.revenue)} icon={TrendingUp} color="#10b981" />
            <StatMini label="Expenses" value={inrCompact(p.expense)} icon={TrendingDown} color="#ef4444" />
            <StatMini label="Net Profit" value={inrCompact(p.net)} icon={HandCoins} color={p.net >= 0 ? "#10b981" : "#ef4444"} />
            <StatMini label="Overdue" value={p.overdue_count} icon={Clock} color="#f59e0b" />
            <StatMini label="Tasks" value={p.task_count} icon={ListChecks} color="#0ea5e9" />
          </div>
        )}

        {/* Photo Wall */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-[#ea580c]" />
              <span className="font-display font-bold text-slate-900">Photo Wall</span>
            </div>
            <span className="text-xs text-slate-500 font-medium">{photos.length} photo{photos.length === 1 ? "" : "s"}</span>
          </div>
          {detailLoading ? (
            <div className="py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          ) : photos.length === 0 ? (
            <div className="py-14 text-center text-slate-400">
              <Camera className="w-10 h-10 inline mb-2 text-slate-300" />
              <div className="text-sm font-medium">No site photos yet</div>
              <div className="text-xs mt-1">Head to Cash Flow → <span className="font-semibold text-[#ea580c]">Snap Bill</span> to start the wall.</div>
            </div>
          ) : (
            <div className="max-h-[520px] overflow-y-auto p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {photos.map((ph, i) => (
                  <button key={`${ph.docId}-${i}`} onClick={() => setLightbox(ph)}
                    data-testid={`gallery-photo-${ph.docId}`}
                    className="relative aspect-square group overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                    <img src={docUrl(ph.docId)} loading="lazy" alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 text-left">
                      <div className="text-white text-[10px] font-semibold truncate">{ph.txn.party_name || "—"}</div>
                      <div className="text-white/80 text-[9px]">{fmtDate(ph.txn.date)}</div>
                    </div>
                    <span className={`absolute top-1 right-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full ${ph.kind === "bill" ? "bg-white/95 text-slate-900" : "bg-[#ea580c]/95 text-white"}`}>
                      {ph.kind === "bill" ? "BILL" : "SITE"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 font-display font-bold text-slate-900">Transactions</div>
            {detailLoading ? (
              <div className="py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
            ) : detail.transactions.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">No transactions for this project</div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {detail.transactions.map((t) => (
                      <tr key={t.id} className="border-t border-slate-100">
                        <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">{fmtDate(t.date)}</td>
                        <td className="font-medium text-slate-900">{t.party_name || "—"}</td>
                        <td className="text-xs"><StatusBadge value={t.status} /></td>
                        <td className={`text-right px-4 font-bold whitespace-nowrap ${t.type === "incoming" ? "text-emerald-600" : "text-red-600"}`}>
                          {t.type === "incoming" ? "+" : "−"} {inr(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 font-display font-bold text-slate-900">Scheduled Tasks</div>
            {detail.tasks.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">No tasks scheduled</div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto p-4 space-y-2">
                {detail.tasks.map((t) => (
                  <div key={t.id} className="flex items-start gap-3 p-3 rounded-md bg-slate-50 border border-slate-100">
                    <span className="w-1 h-full min-h-[36px] rounded" style={{ background: t.color || "#ea580c" }} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">{t.title}</span>
                        <StatusBadge value={t.status} />
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{fmtDate(t.date)} · <StatusBadge value={t.priority} /></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {lightbox && (
          <div data-testid="lightbox" className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightbox(null)}>
            <img src={docUrl(lightbox.docId)} alt="" onClick={(e) => e.stopPropagation()}
              className="max-h-[82vh] max-w-[92vw] rounded-lg shadow-2xl" />
            <button onClick={() => setLightbox(null)} data-testid="lightbox-close"
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center backdrop-blur">
              <X className="w-5 h-5" />
            </button>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm px-5 py-2.5 rounded-full text-white text-sm shadow-lg">
              <span className="font-semibold">{lightbox.txn.party_name || "—"}</span>
              <span className="mx-2 text-white/40">·</span>
              <span>{fmtDate(lightbox.txn.date)}</span>
              <span className="mx-2 text-white/40">·</span>
              <span className={lightbox.txn.type === "incoming" ? "text-emerald-300 font-semibold" : "text-orange-300 font-semibold"}>
                {inr(lightbox.txn.amount)}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Projects</h1>
        <p className="text-slate-400 mt-1 text-sm">Every job site with its own profit & loss.</p>
      </div>

      {projects.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-lg border border-slate-100">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-3">Revenue vs Expenses by Site</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} tickFormatter={inrCompact} />
                <Tooltip formatter={(v) => inr(v)} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
                <Bar dataKey="Revenue" fill="#10b981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Expenses" fill="#ea580c" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full text-center py-10 text-slate-400"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
        ) : projects.length === 0 ? (
          <div className="col-span-full text-center py-10 text-slate-400 bg-white rounded-xl border border-slate-100">
            No projects yet. Add transactions or tasks with a Project/Site name.
          </div>
        ) : projects.map((p) => (
          <button key={p.name} data-testid={`project-card-${p.name}`} onClick={() => openProject(p.name)}
            className="text-left bg-white rounded-xl p-5 shadow-lg border border-slate-100 card-lift">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-md bg-[#ea580c]/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-[#ea580c]" />
              </div>
              {p.overdue_count > 0 && <span className="text-[10px] font-bold uppercase text-white bg-red-500 px-2 py-0.5 rounded-full">{p.overdue_count} overdue</span>}
            </div>
            <div className="font-display text-lg font-extrabold text-slate-900 line-clamp-2 min-h-[3rem]">{p.name}</div>
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Revenue</div>
                <div className="stat-num text-lg text-emerald-600">{inrCompact(p.revenue)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Net</div>
                <div className={`stat-num text-lg ${p.net >= 0 ? "text-slate-900" : "text-red-600"}`}>{inrCompact(p.net)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-4 text-xs text-slate-500">
              <span>{p.txn_count} txn · {p.task_count} task{p.task_count === 1 ? "" : "s"}</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
