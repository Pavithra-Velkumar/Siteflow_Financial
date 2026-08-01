import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { inr, inrCompact } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { TrendingUp, TrendingDown, Wallet, HandCoins, Clock, Sparkles } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { toast } from "sonner";

const RANGES = [
  { key: "week", label: "This Week", days: 7 },
  { key: "month", label: "This Month", days: 30 },
  { key: "quarter", label: "Quarterly", days: 90 },
  { key: "ytd", label: "Year to Date", days: 365 },
];

const CATEGORY_COLORS = {
  "Labor/Payroll": "#ea580c",
  "Materials": "#f59e0b",
  "Equipment": "#0ea5e9",
  "Permits": "#8b5cf6",
  "Subcontractors": "#10b981",
  "Fuel": "#ef4444",
  "Other": "#64748b",
};

const StatCard = ({ label, value, icon: Icon, trend, accent = "#ea580c", testid }) => (
  <div data-testid={testid} className="bg-white rounded-xl p-5 shadow-lg border border-slate-100 card-lift">
    <div className="flex items-start justify-between mb-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ background: accent + "1a" }}>
        <Icon className="w-5 h-5" style={{ color: accent }} />
      </div>
    </div>
    <div className="stat-num text-3xl text-slate-900">{value}</div>
    {trend && <div className="text-xs text-slate-500 mt-2">{trend}</div>}
  </div>
);

export default function Dashboard() {
  const { user } = useAuth();
  const [txns, setTxns] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [range, setRange] = useState("month");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [t, p] = await Promise.all([api.get("/transactions"), api.get("/payouts")]);
      setTxns(t.data); setPayouts(p.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const seed = async () => {
    try {
      const r = await api.post("/seed-demo");
      if (r.data.seeded) toast.success("Demo data loaded");
      else toast.info("You already have data");
      load();
    } catch (e) { toast.error("Failed to load demo data"); }
  };

  const filtered = useMemo(() => {
    const cfg = RANGES.find((r) => r.key === range);
    const cutoff = Date.now() - cfg.days * 86400000;
    return txns.filter((t) => new Date(t.date).getTime() >= cutoff);
  }, [txns, range]);

  const totals = useMemo(() => {
    const income = filtered.filter((t) => t.type === "incoming").reduce((s, t) => s + Number(t.amount), 0);
    const expense = filtered.filter((t) => t.type === "outgoing").reduce((s, t) => s + Number(t.amount), 0);
    const cashBalance = txns.reduce((s, t) => s + (t.type === "incoming" ? Number(t.amount) : -Number(t.amount)), 0);
    const pendingPayroll = filtered.filter((t) => t.type === "outgoing" && t.category === "Labor/Payroll" && t.status === "pending")
      .reduce((s, t) => s + Number(t.amount), 0);
    return { income, expense, cashBalance, pendingPayroll, net: income - expense };
  }, [filtered, txns]);

  const chartData = useMemo(() => {
    const cfg = RANGES.find((r) => r.key === range);
    const buckets = cfg.days <= 7 ? 7 : cfg.days <= 30 ? 4 : cfg.days <= 90 ? 3 : 12;
    const now = Date.now();
    const spanMs = cfg.days * 86400000;
    const bucketMs = spanMs / buckets;
    const labels = cfg.days <= 7
      ? Array.from({ length: 7 }, (_, i) => new Date(now - (6 - i) * 86400000).toLocaleDateString("en-IN", { weekday: "short" }))
      : cfg.days <= 30
      ? ["Wk 1", "Wk 2", "Wk 3", "Wk 4"]
      : cfg.days <= 90
      ? ["Month -2", "Month -1", "This Month"]
      : Array.from({ length: 12 }, (_, i) => new Date(now - (11 - i) * 30 * 86400000).toLocaleDateString("en-IN", { month: "short" }));

    const arr = labels.map((l) => ({ label: l, income: 0, expense: 0 }));
    filtered.forEach((t) => {
      const age = now - new Date(t.date).getTime();
      const idx = Math.min(buckets - 1, Math.max(0, buckets - 1 - Math.floor(age / bucketMs)));
      if (t.type === "incoming") arr[idx].income += Number(t.amount);
      else arr[idx].expense += Number(t.amount);
    });
    return arr;
  }, [filtered, range]);

  const donutData = useMemo(() => {
    const map = {};
    filtered.filter((t) => t.type === "outgoing").forEach((t) => {
      map[t.category] = (map[t.category] || 0) + Number(t.amount);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Good day, {user?.name?.split(" ")[0] || "Boss"} 👷
          </h1>
          <p className="text-slate-400 mt-1 text-sm">Here is how your job sites are performing.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {txns.length === 0 && !loading && (
            <button data-testid="seed-demo-btn" onClick={seed}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-[#ea580c] text-white text-sm font-semibold hover:bg-[#c2410c] active:scale-95 transition-transform">
              <Sparkles className="w-4 h-4" /> Load Demo Data
            </button>
          )}
          <div className="inline-flex bg-[#0f172a] rounded-md p-1 border border-slate-700">
            {RANGES.map((r) => (
              <button
                key={r.key}
                data-testid={`range-${r.key}`}
                onClick={() => setRange(r.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                  range === r.key ? "bg-[#ea580c] text-white" : "text-slate-300 hover:text-white"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard testid="stat-cash-balance" label="Cash Balance" value={inrCompact(totals.cashBalance)} icon={Wallet} accent="#0f172a" trend="All-time net" />
        <StatCard testid="stat-revenue" label="Revenue In" value={inrCompact(totals.income)} icon={TrendingUp} accent="#10b981" />
        <StatCard testid="stat-expense" label="Expenses Out" value={inrCompact(totals.expense)} icon={TrendingDown} accent="#ef4444" />
        <StatCard testid="stat-net" label="Net Profit" value={inrCompact(totals.net)} icon={HandCoins} accent={totals.net >= 0 ? "#10b981" : "#ef4444"} />
        <StatCard testid="stat-payroll" label="Pending Payroll" value={inrCompact(totals.pendingPayroll)} icon={Clock} accent="#f59e0b" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-lg lg:col-span-2 border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold text-slate-900">Revenue vs Expenses</h2>
            <span className="text-xs text-slate-500 font-medium">{RANGES.find(r => r.key === range).label}</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => inrCompact(v)} />
                <Tooltip formatter={(v) => inr(v)} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
                <Legend />
                <Bar dataKey="income" fill="#10b981" name="Revenue" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expense" fill="#ea580c" name="Expenses" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-100">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4">Expense Breakdown</h2>
          <div className="h-72">
            {donutData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">No expenses in this period</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                    {donutData.map((d, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[d.name] || "#64748b"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => inr(v)} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="space-y-1.5 mt-2">
            {donutData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLORS[d.name] || "#64748b" }} />
                  <span className="text-slate-700">{d.name}</span>
                </div>
                <span className="font-semibold text-slate-900">{inrCompact(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-100">
        <h2 className="font-display text-lg font-bold text-slate-900 mb-4">Recent Transactions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="py-2">Date</th><th>Party</th><th>Project</th><th>Category</th><th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 6).map((t) => (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="py-2.5 text-slate-600">{new Date(t.date).toLocaleDateString("en-IN")}</td>
                  <td className="text-slate-900 font-medium">{t.party_name || "—"}</td>
                  <td className="text-slate-600 truncate max-w-[200px]">{t.project_site || "—"}</td>
                  <td className="text-slate-600">{t.category}</td>
                  <td className={`text-right font-semibold ${t.type === "incoming" ? "text-emerald-600" : "text-red-600"}`}>
                    {t.type === "incoming" ? "+" : "−"} {inr(t.amount)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-slate-400">No transactions in this range</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
