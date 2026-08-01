import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Plus, X, Loader2, ChevronLeft, ChevronRight, Trash2, Edit3 } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "sonner";

const STATUSES = ["not_started", "in_progress", "blocked", "completed"];
const PRIORITIES = ["low", "medium", "high"];
const COLORS = [
  { hex: "#ea580c", name: "Orange" },
  { hex: "#f59e0b", name: "Amber" },
  { hex: "#10b981", name: "Green" },
  { hex: "#0ea5e9", name: "Blue" },
  { hex: "#8b5cf6", name: "Purple" },
  { hex: "#ef4444", name: "Red" },
];

const empty = {
  title: "", description: "", date: new Date().toISOString().slice(0, 10),
  project_site: "", priority: "medium", status: "not_started", color: "#ea580c", assignees: [],
};

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const daysInMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

export default function Planner() {
  const [tasks, setTasks] = useState([]);
  const [emps, setEmps] = useState([]);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(startOfMonth(new Date()));
  const [view, setView] = useState("calendar");

  const load = async () => {
    setLoading(true);
    try {
      const [t, e] = await Promise.all([api.get("/tasks"), api.get("/employees")]);
      setTasks(t.data); setEmps(e.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const tasksByDay = useMemo(() => {
    const m = {};
    tasks.forEach((t) => {
      const key = (t.date || "").slice(0, 10);
      if (!m[key]) m[key] = [];
      m[key].push(t);
    });
    return m;
  }, [tasks]);

  const save = async () => {
    setSaving(true);
    try {
      if (modal.id) await api.put(`/tasks/${modal.id}`, modal.form);
      else await api.post("/tasks", modal.form);
      toast.success("Saved"); setModal(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this task?")) return;
    await api.delete(`/tasks/${id}`); toast.success("Deleted"); load();
  };

  const shift = (n) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));

  const dim = daysInMonth(cursor);
  const firstDow = cursor.getDay();

  const empName = (id) => emps.find((e) => e.id === id)?.name || "?";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Construction Planner</h1>
          <p className="text-slate-400 mt-1 text-sm">Milestones, deliveries and crew schedules.</p>
        </div>
        <button data-testid="new-task-btn" onClick={() => setModal({ form: { ...empty } })}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-[#ea580c] hover:bg-[#c2410c] text-white font-semibold text-sm active:scale-95 transition-transform">
          <Plus className="w-4 h-4" /> New Task
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex bg-[#0f172a] rounded-md p-1 border border-slate-700">
          {["calendar", "list"].map((k) => (
            <button key={k} data-testid={`view-${k}`} onClick={() => setView(k)}
              className={`px-4 py-1.5 text-sm font-semibold rounded capitalize ${view === k ? "bg-[#ea580c] text-white" : "text-slate-300"}`}>{k}</button>
          ))}
        </div>
        {view === "calendar" && (
          <div className="flex items-center gap-2">
            <button data-testid="prev-month" onClick={() => shift(-1)} className="p-2 rounded-md bg-white hover:bg-slate-100 border border-slate-200"><ChevronLeft className="w-4 h-4 text-slate-700" /></button>
            <div className="font-display font-bold text-white text-lg min-w-[180px] text-center">
              {cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
            </div>
            <button data-testid="next-month" onClick={() => shift(1)} className="p-2 rounded-md bg-white hover:bg-slate-100 border border-slate-200"><ChevronRight className="w-4 h-4 text-slate-700" /></button>
          </div>
        )}
      </div>

      {view === "calendar" && (
        <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-4">
          <div className="grid grid-cols-7 gap-1 mb-2 text-xs font-semibold uppercase text-slate-500 text-center">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDow }, (_, i) => <div key={"e" + i} />)}
            {Array.from({ length: dim }, (_, i) => {
              const day = i + 1;
              const dateStr = new Date(cursor.getFullYear(), cursor.getMonth(), day).toISOString().slice(0, 10);
              const dayTasks = tasksByDay[dateStr] || [];
              const isToday = new Date().toISOString().slice(0, 10) === dateStr;
              return (
                <div key={day} data-testid={`cal-day-${day}`}
                  className={`min-h-[92px] rounded-md border p-1.5 ${isToday ? "border-[#ea580c] bg-orange-50" : "border-slate-200 bg-slate-50/40"}`}>
                  <div className={`text-xs font-bold mb-1 ${isToday ? "text-[#ea580c]" : "text-slate-700"}`}>{day}</div>
                  <div className="space-y-1">
                    {dayTasks.slice(0, 3).map((t) => (
                      <button key={t.id} onClick={() => setModal({ id: t.id, form: { ...empty, ...t, date: t.date.slice(0, 10) } })}
                        className="w-full text-left px-1.5 py-1 rounded text-[10px] font-semibold text-white truncate hover:opacity-90"
                        style={{ background: t.color || "#ea580c" }}>
                        {t.title}
                      </button>
                    ))}
                    {dayTasks.length > 3 && <div className="text-[10px] text-slate-500 px-1">+{dayTasks.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "list" && (
        <div className="bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th></th>
                  <th className="text-left py-3 px-3">Task</th>
                  <th className="text-left">Date</th>
                  <th className="text-left">Site</th>
                  <th className="text-left">Priority</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Crew</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
                ) : tasks.length === 0 ? (
                  <tr><td colSpan={8} className="py-12 text-center text-slate-400">No tasks scheduled.</td></tr>
                ) : tasks.map((t, i) => (
                  <tr key={t.id} data-testid={`task-row-${t.id}`} className={`border-t border-slate-100 ${i % 2 ? "bg-slate-50/50" : ""}`}>
                    <td className="pl-3"><span className="w-2 h-8 block rounded" style={{ background: t.color || "#ea580c" }} /></td>
                    <td className="py-3 pr-3">
                      <div className="font-semibold text-slate-900">{t.title}</div>
                      {t.description && <div className="text-xs text-slate-500 max-w-md truncate">{t.description}</div>}
                    </td>
                    <td className="text-slate-700">{fmtDate(t.date)}</td>
                    <td className="text-slate-600 max-w-[180px] truncate">{t.project_site || "—"}</td>
                    <td><StatusBadge value={t.priority} /></td>
                    <td><StatusBadge value={t.status} /></td>
                    <td className="text-slate-600 text-xs">{(t.assignees || []).map(empName).join(", ") || "—"}</td>
                    <td className="pr-3 whitespace-nowrap">
                      <button onClick={() => setModal({ id: t.id, form: { ...empty, ...t, date: t.date.slice(0, 10) } })} className="p-1.5 hover:bg-slate-200 rounded-md">
                        <Edit3 className="w-4 h-4 text-slate-600" />
                      </button>
                      <button onClick={() => del(t.id)} className="p-1.5 hover:bg-red-50 rounded-md">
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-extrabold text-slate-900">{modal.id ? "Edit Task" : "New Task"}</h2>
              <button onClick={() => setModal(null)} className="p-1 hover:bg-slate-100 rounded-md"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Title</label>
                <input data-testid="task-title" value={modal.form.title}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, title: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Description</label>
                <textarea data-testid="task-desc" rows={2} value={modal.form.description}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, description: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Date</label>
                  <input data-testid="task-date" type="date" value={modal.form.date}
                    onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, date: e.target.value } }))}
                    className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Job Site</label>
                  <input data-testid="task-site" value={modal.form.project_site}
                    onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, project_site: e.target.value } }))}
                    className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Priority</label>
                  <select data-testid="task-priority" value={modal.form.priority}
                    onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, priority: e.target.value } }))}
                    className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900 capitalize">
                    {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Status</label>
                  <select data-testid="task-status" value={modal.form.status}
                    onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, status: e.target.value } }))}
                    className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900">
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Color tag</label>
                <div className="flex gap-2 mt-1">
                  {COLORS.map((c) => (
                    <button key={c.hex} type="button" data-testid={`color-${c.name}`}
                      onClick={() => setModal((m) => ({ ...m, form: { ...m.form, color: c.hex } }))}
                      className={`w-8 h-8 rounded-md border-2 ${modal.form.color === c.hex ? "border-slate-900" : "border-transparent"}`}
                      style={{ background: c.hex }} title={c.name} />
                  ))}
                </div>
              </div>
              {emps.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-600">Assign crew</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {emps.map((e) => {
                      const sel = (modal.form.assignees || []).includes(e.id);
                      return (
                        <button key={e.id} type="button"
                          onClick={() => setModal((m) => ({
                            ...m, form: {
                              ...m.form,
                              assignees: sel ? m.form.assignees.filter((x) => x !== e.id) : [...(m.form.assignees || []), e.id]
                            }
                          }))}
                          className={`px-3 py-1 rounded-full text-xs font-semibold border ${sel ? "bg-[#ea580c] text-white border-[#ea580c]" : "bg-slate-50 text-slate-700 border-slate-200"}`}>
                          {e.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-md bg-slate-100 text-slate-700 font-semibold text-sm">Cancel</button>
              <button data-testid="save-task-btn" disabled={saving} onClick={save}
                className="px-4 py-2 rounded-md bg-[#ea580c] hover:bg-[#c2410c] text-white font-semibold text-sm active:scale-95 disabled:opacity-60 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
