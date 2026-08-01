import { useEffect, useMemo, useRef, useState } from "react";
import api, { API } from "@/lib/api";
import { inr, fmtDate } from "@/lib/format";
import { Plus, Search, Edit3, Trash2, X, Loader2, FileText, Sparkles, FileDown, Send, Camera, Upload } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "sonner";

const CATEGORIES = ["Materials", "Labor/Payroll", "Equipment", "Permits", "Subcontractors", "Client Retainer", "Milestone Billing", "Fuel", "Equipment Maintenance", "Other"];
const METHODS = ["Cash", "Bank Transfer", "Check", "Card", "UPI"];
const STATUSES = ["completed", "pending", "overdue"];

const empty = {
  type: "outgoing", amount: "", date: new Date().toISOString().slice(0, 10),
  project_site: "", party_name: "", category: "Materials", payment_method: "Bank Transfer",
  status: "completed", notes: "", document_id: null,
};

export default function CashFlow() {
  const [txns, setTxns] = useState([]);
  const [docs, setDocs] = useState([]);
  const [q, setQ] = useState("");
  const [fType, setFType] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | {form, id?}
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [sending, setSending] = useState(null); // txn id being reminded
  const scanCameraRef = useRef();
  const scanUploadRef = useRef();
  const topSnapRef = useRef();

  const load = async () => {
    setLoading(true);
    try {
      const [t, d] = await Promise.all([api.get("/transactions"), api.get("/documents")]);
      setTxns(t.data); setDocs(d.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return txns.filter((t) => {
      if (fType !== "all" && t.type !== fType) return false;
      if (fStatus !== "all" && t.status !== fStatus) return false;
      if (q) {
        const s = q.toLowerCase();
        if (!(t.party_name || "").toLowerCase().includes(s) &&
            !(t.project_site || "").toLowerCase().includes(s) &&
            !(t.category || "").toLowerCase().includes(s) &&
            !(t.notes || "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [txns, q, fType, fStatus]);

  const openNew = () => setModal({ form: { ...empty } });
  const openEdit = (t) => setModal({
    id: t.id,
    form: { ...empty, ...t, date: (t.date || "").slice(0, 10), amount: String(t.amount || "") }
  });

  const save = async () => {
    setSaving(true);
    const payload = { ...modal.form, amount: parseFloat(modal.form.amount) || 0 };
    try {
      if (modal.id) await api.put(`/transactions/${modal.id}`, payload);
      else await api.post("/transactions", payload);
      toast.success(modal.id ? "Transaction updated" : "Transaction added");
      setModal(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save");
    } finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this transaction?")) return;
    try { await api.delete(`/transactions/${id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Failed"); }
  };

  const invoiceUrl = (id) => `${API}/transactions/${id}/invoice?auth=${encodeURIComponent(localStorage.getItem("sf_token") || "")}`;

  const sendReminder = async (id) => {
    setSending(id);
    try {
      const r = await api.post(`/transactions/${id}/send-reminder`);
      toast.success(`Reminder sent to ${r.data.sent_to}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to send reminder");
    } finally { setSending(null); }
  };

  const onScanFile = async (file, source) => {
    if (!file) return;
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/scan-bill", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const d = r.data || {};
      setModal((m) => ({
        ...m,
        form: {
          ...m.form,
          party_name: d.vendor_name || m.form.party_name,
          amount: d.total_amount ? String(d.total_amount) : m.form.amount,
          date: d.date || m.form.date,
          category: d.category || m.form.category,
          notes: d.notes || m.form.notes,
        },
      }));
      toast.success("Bill scanned — fields prefilled");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Scan failed");
    } finally {
      setScanning(false);
      if (source === "camera" && scanCameraRef.current) scanCameraRef.current.value = "";
      if (source === "upload" && scanUploadRef.current) scanUploadRef.current.value = "";
    }
  };

  const onTopSnap = async (file) => {
    if (!file) return;
    // Open modal first with defaults for an outgoing expense, then scan
    setModal({ form: { ...empty, type: "outgoing" } });
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/scan-bill", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const d = r.data || {};
      setModal((m) => ({
        ...m,
        form: {
          ...m.form,
          party_name: d.vendor_name || "",
          amount: d.total_amount ? String(d.total_amount) : "",
          date: d.date || m.form.date,
          category: d.category || m.form.category,
          notes: d.notes || "",
        },
      }));
      toast.success("Bill scanned — review and save");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Scan failed");
    } finally {
      setScanning(false);
      if (topSnapRef.current) topSnapRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Cash Flow</h1>
          <p className="text-slate-400 mt-1 text-sm">Every rupee in and out — with proof.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={topSnapRef} type="file" hidden accept="image/*" capture="environment"
            onChange={(e) => onTopSnap(e.target.files?.[0])} data-testid="top-snap-input" />
          <button data-testid="snap-bill-btn" disabled={scanning}
            onClick={() => topSnapRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm active:scale-95 transition-transform disabled:opacity-60">
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            {scanning ? "Reading…" : "Snap Bill"}
          </button>
          <button data-testid="new-txn-btn" onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-[#ea580c] hover:bg-[#c2410c] text-white font-semibold text-sm active:scale-95 transition-transform">
            <Plus className="w-4 h-4" /> Add Transaction
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-lg border border-slate-100">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input data-testid="search-input" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search party, project, category…"
              className="w-full pl-9 pr-3 py-2.5 rounded-md border border-slate-200 focus:border-[#ea580c] focus:outline-none text-slate-900 text-sm" />
          </div>
          <select data-testid="filter-type" value={fType} onChange={(e) => setFType(e.target.value)}
            className="px-3 py-2.5 rounded-md border border-slate-200 text-sm text-slate-900">
            <option value="all">All types</option>
            <option value="incoming">Incoming</option>
            <option value="outgoing">Outgoing</option>
          </select>
          <select data-testid="filter-status" value={fStatus} onChange={(e) => setFStatus(e.target.value)}
            className="px-3 py-2.5 rounded-md border border-slate-200 text-sm text-slate-900">
            <option value="all">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
              <tr>
                <th className="text-left py-3 px-4">Date</th>
                <th className="text-left">Type</th>
                <th className="text-left">Party</th>
                <th className="text-left">Project</th>
                <th className="text-left">Category</th>
                <th className="text-left">Method</th>
                <th className="text-left">Status</th>
                <th className="text-right px-4">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="py-12 text-center text-slate-400">No transactions</td></tr>
              ) : filtered.map((t, i) => (
                <tr key={t.id} data-testid={`txn-row-${t.id}`} className={`border-t border-slate-100 ${i % 2 ? "bg-slate-50/50" : ""}`}>
                  <td className="py-3 px-4 text-slate-700 whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td><StatusBadge value={t.type} /></td>
                  <td className="font-medium text-slate-900">{t.party_name || "—"}</td>
                  <td className="text-slate-600 max-w-[200px] truncate">{t.project_site || "—"}</td>
                  <td className="text-slate-600">{t.category}</td>
                  <td className="text-slate-600">{t.payment_method}</td>
                  <td><StatusBadge value={t.status} /></td>
                  <td className={`text-right font-bold px-4 ${t.type === "incoming" ? "text-emerald-600" : "text-red-600"}`}>
                    {t.type === "incoming" ? "+" : "−"} {inr(t.amount)}
                  </td>
                  <td className="pr-3 whitespace-nowrap">
                    <button data-testid={`edit-${t.id}`} onClick={() => openEdit(t)} className="p-1.5 hover:bg-slate-200 rounded-md">
                      <Edit3 className="w-4 h-4 text-slate-600" />
                    </button>
                    <button data-testid={`delete-${t.id}`} onClick={() => del(t.id)} className="p-1.5 hover:bg-red-50 rounded-md">
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-extrabold text-slate-900">
                {modal.id ? "Edit Transaction" : "New Transaction"}
              </h2>
              <div className="flex items-center gap-2">
                <input ref={scanCameraRef} type="file" hidden accept="image/*" capture="environment"
                  onChange={(e) => onScanFile(e.target.files?.[0], "camera")} data-testid="scan-camera-input" />
                <input ref={scanUploadRef} type="file" hidden accept="image/*,application/pdf"
                  onChange={(e) => onScanFile(e.target.files?.[0], "upload")} data-testid="scan-upload-input" />
                <button type="button" disabled={scanning} onClick={() => scanCameraRef.current?.click()}
                  data-testid="modal-camera-btn"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-60">
                  {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                  Camera
                </button>
                <button type="button" disabled={scanning} onClick={() => scanUploadRef.current?.click()}
                  data-testid="modal-upload-btn"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold disabled:opacity-60">
                  <Upload className="w-3.5 h-3.5" /> Upload
                </button>
                <button onClick={() => setModal(null)} data-testid="modal-close" className="p-1 hover:bg-slate-100 rounded-md">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-600">Type</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {["incoming", "outgoing"].map((t) => (
                    <button key={t} data-testid={`type-${t}`} onClick={() => setModal((m) => ({ ...m, form: { ...m.form, type: t } }))}
                      className={`py-2 rounded-md font-semibold text-sm ${modal.form.type === t ? (t === "incoming" ? "bg-emerald-600 text-white" : "bg-red-600 text-white") : "bg-slate-100 text-slate-700"}`}>
                      {t === "incoming" ? "↓ Money In" : "↑ Money Out"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Amount (₹)</label>
                <input data-testid="input-amount" type="number" value={modal.form.amount}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, amount: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Date</label>
                <input data-testid="input-date" type="date" value={modal.form.date}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, date: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Party (Vendor/Client)</label>
                <input data-testid="input-party" value={modal.form.party_name}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, party_name: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Project / Site</label>
                <input data-testid="input-project" value={modal.form.project_site}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, project_site: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Category</label>
                <select data-testid="input-category" value={modal.form.category}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, category: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900">
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Payment Method</label>
                <select data-testid="input-method" value={modal.form.payment_method}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, payment_method: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900">
                  {METHODS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Status</label>
                <select data-testid="input-status" value={modal.form.status}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, status: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900">
                  {STATUSES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-600">Client Email (for reminders / invoice)</label>
                <input data-testid="input-client-email" type="email" value={modal.form.client_email || ""}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, client_email: e.target.value } }))}
                  placeholder="client@example.com"
                  className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-1"><FileText className="w-3 h-3" /> Attach Bill/Doc (optional)</label>
                <select data-testid="input-document" value={modal.form.document_id || ""}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, document_id: e.target.value || null } }))}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900">
                  <option value="">— None —</option>
                  {docs.map((d) => <option key={d.id} value={d.id}>{d.original_filename}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-600">Notes</label>
                <textarea data-testid="input-notes" value={modal.form.notes} rows={2}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, notes: e.target.value } }))}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-slate-300 text-slate-900" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm">Cancel</button>
              <button data-testid="save-txn-btn" disabled={saving} onClick={save}
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
