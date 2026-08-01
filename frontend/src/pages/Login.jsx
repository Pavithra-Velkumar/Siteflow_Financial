import { useState } from "react";
import { Link } from "react-router-dom";
import { HardHat, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await login(email, password);
    if (!r.ok) { setErr(r.error); toast.error(r.error); }
    else toast.success("Welcome back!");
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-[#1e293b] grid lg:grid-cols-2">
      <div className="hidden lg:block relative">
        <img
          src="https://images.unsplash.com/photo-1488972685288-c3fd157d7c7a?crop=entropy&cs=srgb&fm=jpg&w=1400&q=80"
          alt="Construction"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-[#1e293b]/95 via-[#1e293b]/60 to-transparent" />
        <div className="relative z-10 h-full flex flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-md bg-[#ea580c] flex items-center justify-center">
              <HardHat className="w-6 h-6 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-display text-xl font-extrabold text-white">SiteFlow</div>
              <div className="text-xs text-slate-300 -mt-0.5">Financials</div>
            </div>
          </div>
          <div className="text-white max-w-md">
            <h2 className="font-display text-4xl font-extrabold leading-tight mb-3">
              Build sites. Not spreadsheets.
            </h2>
            <p className="text-slate-300 text-base">
              Track every rupee flowing in and out of your job sites. Manage crews, payroll and schedules from one screen — on-site or in the office.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-8">
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-md bg-[#ea580c] flex items-center justify-center">
              <HardHat className="w-6 h-6 text-white" strokeWidth={2.5} />
            </div>
            <div className="font-display text-xl font-extrabold text-slate-900">SiteFlow Financials</div>
          </div>
          <h1 className="font-display text-3xl font-extrabold text-slate-900 mb-1">Sign in</h1>
          <p className="text-sm text-slate-500 mb-6">Access your job site financial command center.</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                data-testid="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-md border border-slate-300 focus:border-[#ea580c] focus:outline-none text-slate-900"
                placeholder="you@site.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <input
                data-testid="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-md border border-slate-300 focus:border-[#ea580c] focus:outline-none text-slate-900"
                placeholder="••••••••"
              />
            </div>
            {err && <div className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{err}</div>}
            <button
              data-testid="login-submit"
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-[#ea580c] hover:bg-[#c2410c] text-white font-semibold py-2.5 rounded-md transition-colors active:scale-95 disabled:opacity-60"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign in
            </button>
          </form>
          <div className="mt-6 text-sm text-slate-600 text-center">
            New contractor? <Link to="/register" data-testid="link-register" className="text-[#ea580c] font-semibold hover:underline">Create account</Link>
          </div>
          <div className="mt-4 text-xs text-slate-400 text-center border-t border-slate-100 pt-4">
            Demo: <span className="font-mono">futureperfectcourse@gmail.com</span> / <span className="font-mono">SiteFlow@2026</span>
          </div>
        </div>
      </div>
    </div>
  );
}
