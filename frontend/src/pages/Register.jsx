import { useState } from "react";
import { Link } from "react-router-dom";
import { HardHat, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", business_name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await register(form);
    if (!r.ok) { setErr(r.error); toast.error(r.error); }
    else toast.success("Account created!");
    setBusy(false);
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="min-h-screen bg-[#1e293b] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-md bg-[#ea580c] flex items-center justify-center">
            <HardHat className="w-6 h-6 text-white" strokeWidth={2.5} />
          </div>
          <div className="font-display text-xl font-extrabold text-slate-900">SiteFlow Financials</div>
        </div>
        <h1 className="font-display text-3xl font-extrabold text-slate-900 mb-1">Create your account</h1>
        <p className="text-sm text-slate-500 mb-6">Start tracking your construction finances in minutes.</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Your name</label>
            <input data-testid="register-name" required value={form.name} onChange={set("name")}
              className="w-full px-4 py-2.5 rounded-md border border-slate-300 focus:border-[#ea580c] focus:outline-none text-slate-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Business name</label>
            <input data-testid="register-business" value={form.business_name} onChange={set("business_name")}
              className="w-full px-4 py-2.5 rounded-md border border-slate-300 focus:border-[#ea580c] focus:outline-none text-slate-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <input data-testid="register-email" type="email" required value={form.email} onChange={set("email")}
              className="w-full px-4 py-2.5 rounded-md border border-slate-300 focus:border-[#ea580c] focus:outline-none text-slate-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
            <input data-testid="register-password" type="password" required minLength={6} value={form.password} onChange={set("password")}
              className="w-full px-4 py-2.5 rounded-md border border-slate-300 focus:border-[#ea580c] focus:outline-none text-slate-900" />
          </div>
          {err && <div className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{err}</div>}
          <button data-testid="register-submit" type="submit" disabled={busy}
            className="w-full flex items-center justify-center gap-2 bg-[#ea580c] hover:bg-[#c2410c] text-white font-semibold py-2.5 rounded-md transition-colors active:scale-95 disabled:opacity-60">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Create account
          </button>
        </form>
        <div className="mt-6 text-sm text-slate-600 text-center">
          Already have an account? <Link to="/login" data-testid="link-login" className="text-[#ea580c] font-semibold hover:underline">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
