import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { inr, fmtDate } from "@/lib/format";
import { Plus, Edit3, Trash2, X, Loader2, HardHat, HandCoins } from "lucide-react";
import { toast } from "sonner";

const ROLES = ["Site Supervisor", "Carpenter", "Electrician", "Mason", "Plumber", "Helper", "Subcontractor"];

const empEmpty = { name: "", role: "Carpenter", pay_rate: "", rate_type: "hourly", contact: "", active: true };
const payEmpty = { employee_id: "", units: "", total_pay: "", date: new Date().toISOString().slice(0, 10), project_site: "", notes: "" };

export default function Employees() {
  const [emps, setEmps] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [tab, setTab] = useState("directory");
  const [empModal, setEmpModal] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [e, p] = await Promise.all([api.get("/employees"), api.get("/payouts")]);
      setEmps(e.data); setPayouts(p.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const empById = useMemo(() => Object.fromEntries(emps.map((e) => [e.id, e])), [emps]);

  const totalsByEmp = useMemo(() => {
    const m = {};
    payouts.forEach((p) => { m[p.employee_id] = (m[p.employee_id] || 0) + Number(p.total_pay); });
    return m;
  }, [payouts]);

  const saveEmp = async () => {
    setSaving(true);
    const p = { ...empModal.form, pay_rate: parseFloat(empModal.form.pay_rate) || 0 };
    try {
      if (empModal.id) await api.put(`/employees/${empModal.id}`, p);
      else await api.post("/employees", p);
      toast.success("Saved");
      setEmpModal(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const delEmp = async (id) => {
    if (!window.confirm("Delete this employee?")) return;
    await api.delete(`/employees/${id}`); toast.success("Deleted"); load();
  };

  const savePay = async () => {
    setSaving(true);
    const p = {
      ...payModal.form,
      units: parseFloat(payModal.form.units) || 0,
      total_pay: parseFloat(payModal.form.total_pay) || 0,
    };
    try {
      await api.post("/payouts", p);
      toast.success("Payout logged (auto-created expense)");
      setPayModal(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const delPayout = async (id) => {
    if (!window.confirm("Delete this payout? (linked expense will also be removed)")) return;
    await api.delete(`/payouts/${id}`); toast.success("Deleted"); load();
  };

  const onEmpChange = (id) => {
    const e = emps.find((x) => x.id === id);
    if (!e) return;
    setPayModal((m) => {
      const units = parseFloat(m.form.units) || 0;
      return { ...m, form: { ...m.form, employee_id: id, total_pay: (units * e.pay_rate).toFixed(0) } };
    });
  };
  const onUnitsChange = (v) => {
    setPayModal((m) => {
      const e = emps.find((x) => x.id === m.form.employee_id);
      const total = e ? (parseFloat(v) || 0) * e.pay_rate : m.form.total_pay;
      return { ...m, form: { ...m.form, units: v, total_pay: e ? total.toFixed(0) : m.form.total_pay } };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Crew & Payroll</h1>
          <p className="text-slate-400 mt-1 text-sm">Your team on site and everyone you have paid.</p>
        </div>
        <div className="flex gap-2">
          <button data-testid="new-payout-btn" onClick={() => setPayModal({ form: { ...payEmpty } })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-white text-slate-900 font-semibold text-sm border border-slate-200 hover:bg-slate-50 active:scale-95 transition-transform">
            <HandCoins className="w-4 h-4" /> Log Payout
          </button>
          <button data-testid="new-emp-btn" onClick={() => setEmpModal({ form: { ...empEmpty } })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-[#ea580c] hover:bg-[#c2410c] text-white font-semibold text-sm active:scale-95 transition-transform">
            <Plus className="w-4 h-4" /> Add Employee
          </button>
        </div>
      </div>

      <div className="inline-flex bg-[#0f172a] rounded-md p-1 border border-slate-700">
        {[["directory", "Directory"], ["payouts", "Payout Ledger"]].map(([k, l]) => (
          <button key={k} data-testid={`tab-${k}`} onClick={() => setTab(k)}
            className={`px-4 py-1.5 text-sm font-semibold rounded ${tab === k ? "bg-[#ea580c] text-white" : "text-slate-300"}`}>{l}</button>
        ))}
      </div>

      {tab === "directory" && (
        <div className="bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="text-left py-3 px-4">Name</th><th className="text-left">Role</th>
                  <th className="text-left">Contact</th><th className="text-right">Pay Rate</th>
                  <th className="text-right">Total Paid</th><th className="text-center">Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
                ) : emps.length === 0 ? (
                  <tr><td colSpan={7} className="py-12 text-center text-slate-400">No employees yet. Add your first crew member.</td></tr>
                ) : emps.map((e, i) => (
                  <tr key={e.id} data-testid={`emp-row-${e.id}`} className={`border-t border-slate-100 ${i % 2 ? "bg-slate-50/50" : ""}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-md bg-[#ea580c]/10 flex items-center justify-center">
                          <HardHat className="w-4 h-4 text-[#ea580c]" />
                        </div>
                        <span className="font-semibold text-slate-900">{e.name}</span>
                      </div>
                    </td>
                    <td className="text-slate-600">{e.role}</td>
                    <td className="text-slate-600">{e.contact || "—"}</td>
                    <td className="text-right font-semibold text-slate-900">{inr(e.pay_rate)}/{e.rate_type === "hourly" ? "hr" : "day"}</td>
                    <td className="text-right font-bold text-emerald-600">{inr(totalsByEmp[e.id] || 0)}</td>
                    <td className="text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${e.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                        {e.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="pr-3 whitespace-nowrap">
                      <button data-testid={`edit-emp-${e.id}`} onClick={() => setEmpModal({ id: e.id, form: { ...e, pay_rate: String(e.pay_rate) } })} className="p-1.5 hover:bg-slate-200 rounded-md">
                        <Edit3 className="w-4 h-4 text-slate-600" />
                      </button>
                      <button data-testid={`del-emp-${e.id}`} onClick={() => delEmp(e.id)} className="p-1.5 hover:bg-red-50 rounded-md">
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

      {tab === "payouts" && (
        <div className="bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="text-left py-3 px-4">Date</th><th className="text-left">Employee</th>
                  <th className="text-left">Site</th><th className="text-right">Units</th>
                  <th className="text-right">Total Pay</th><th></th>
                </tr>
              </thead>
              <tbody>
                {payouts.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-slate-400">No payouts logged yet.</td></tr>
                ) : payouts.map((p, i) => {
                  const e = empById[p.employee_id];
                  return (
                    <tr key={p.id} className={`border-t border-slate-100 ${i % 2 ? "bg-slate-50/50" : ""}`}>
                      <td className="py-3 px-4 text-slate-700">{fmtDate(p.date)}</td>
                      <td className="font-semibold text-slate-900">{p.employee_name || e?.name || "—"}</td>
                      <td className="text-slate-600">{p.project_site || "—"}</td>
                      <td className="text-right text-slate-600">{p.units} {e?.rate_type === "daily" ? "day(s)" : "hr(s)"}</td>
                      <td className="text-right font-bold text-emerald-600">{inr(p.total_pay)}</td>
                      <td className="pr-3">
                        <button onClick={() => delPayout(p.id)} className="p-1.5 hover:bg-red-50 rounded-md">
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Employee Modal */}
      {empModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4" onClick={() => setEmpModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-extrabold text-slate-900">{empModal.id ? "Edit Employee" : "Add Employee"}</h2>
              <button onClick={() => setEmpModal(null)} className="p-1 hover:bg-slate-100 rounded-md"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Name</label>
                <input data-testid="emp-name" value={empModal.form.name}
                  onChange={(e) => setEmpModal((m) => ({ ...m, form: { ...m.form, name: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Role</label>
                  <select data-testid="emp-role" value={empModal.form.role}
                    onChange={(e) => setEmpModal((m) => ({ ...m, form: { ...m.form, role: e.target.value } }))}
                    className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900">
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Rate Type</label>
                  <select data-testid="emp-rate-type" value={empModal.form.rate_type}
                    onChange={(e) => setEmpModal((m) => ({ ...m, form: { ...m.form, rate_type: e.target.value } }))}
                    className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900">
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Pay Rate (₹)</label>
                  <input data-testid="emp-rate" type="number" value={empModal.form.pay_rate}
                    onChange={(e) => setEmpModal((m) => ({ ...m, form: { ...m.form, pay_rate: e.target.value } }))}
                    className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Contact</label>
                  <input data-testid="emp-contact" value={empModal.form.contact}
                    onChange={(e) => setEmpModal((m) => ({ ...m, form: { ...m.form, contact: e.target.value } }))}
                    className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={empModal.form.active}
                  onChange={(e) => setEmpModal((m) => ({ ...m, form: { ...m.form, active: e.target.checked } }))} />
                Active on payroll
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEmpModal(null)} className="px-4 py-2 rounded-md bg-slate-100 text-slate-700 font-semibold text-sm">Cancel</button>
              <button data-testid="save-emp-btn" disabled={saving} onClick={saveEmp}
                className="px-4 py-2 rounded-md bg-[#ea580c] hover:bg-[#c2410c] text-white font-semibold text-sm active:scale-95 disabled:opacity-60 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payout Modal */}
      {payModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4" onClick={() => setPayModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-extrabold text-slate-900">Log Payout</h2>
              <button onClick={() => setPayModal(null)} className="p-1 hover:bg-slate-100 rounded-md"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Employee</label>
                <select data-testid="pay-emp" value={payModal.form.employee_id}
                  onChange={(e) => onEmpChange(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900">
                  <option value="">— Select —</option>
                  {emps.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Hours/Days Worked</label>
                  <input data-testid="pay-units" type="number" step="0.5" value={payModal.form.units}
                    onChange={(e) => onUnitsChange(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Total Pay (₹)</label>
                  <input data-testid="pay-total" type="number" value={payModal.form.total_pay}
                    onChange={(e) => setPayModal((m) => ({ ...m, form: { ...m.form, total_pay: e.target.value } }))}
                    className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900 font-semibold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Payment Date</label>
                  <input data-testid="pay-date" type="date" value={payModal.form.date}
                    onChange={(e) => setPayModal((m) => ({ ...m, form: { ...m.form, date: e.target.value } }))}
                    className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Job Site</label>
                  <input data-testid="pay-site" value={payModal.form.project_site}
                    onChange={(e) => setPayModal((m) => ({ ...m, form: { ...m.form, project_site: e.target.value } }))}
                    className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900" />
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-500 mt-3 bg-amber-50 rounded-md px-3 py-2">
              An outgoing Labor/Payroll expense will be auto-created and added to your cash flow.
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setPayModal(null)} className="px-4 py-2 rounded-md bg-slate-100 text-slate-700 font-semibold text-sm">Cancel</button>
              <button data-testid="save-pay-btn" disabled={saving || !payModal.form.employee_id} onClick={savePay}
                className="px-4 py-2 rounded-md bg-[#ea580c] hover:bg-[#c2410c] text-white font-semibold text-sm active:scale-95 disabled:opacity-60 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Log Payout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
