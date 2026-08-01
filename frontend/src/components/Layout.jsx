import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { HardHat, LayoutDashboard, Receipt, Users, CalendarDays, FileText, LogOut, Menu, X, Building2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/cashflow", label: "Cash Flow", icon: Receipt, testid: "nav-cashflow" },
  { to: "/employees", label: "Crew & Payroll", icon: Users, testid: "nav-employees" },
  { to: "/projects", label: "Projects", icon: Building2, testid: "nav-projects" },
  { to: "/planner", label: "Planner", icon: CalendarDays, testid: "nav-planner" },
  { to: "/documents", label: "Bills & Docs", icon: FileText, testid: "nav-documents" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#1e293b] text-slate-100 flex">
      {/* Sidebar - desktop */}
      <aside className="hidden lg:flex w-64 flex-col bg-[#0f172a] border-r border-slate-800 sticky top-0 h-screen">
        <div className="px-6 py-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-[#ea580c] flex items-center justify-center">
              <HardHat className="w-6 h-6 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-display text-lg font-extrabold tracking-tight">SiteFlow</div>
              <div className="text-xs text-slate-400 -mt-0.5">Financials</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, label, icon: Icon, testid }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              data-testid={testid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                  isActive ? "bg-[#ea580c] text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-slate-800">
          <div className="text-xs text-slate-400 mb-2">Signed in as</div>
          <div className="text-sm font-medium truncate">{user?.name}</div>
          <div className="text-xs text-slate-400 truncate mb-3">{user?.email}</div>
          <button
            data-testid="logout-btn"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 transition-colors active:scale-95"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 bg-[#0f172a] border-b border-slate-800 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-[#ea580c] flex items-center justify-center">
            <HardHat className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-display font-extrabold">SiteFlow</span>
        </div>
        <button
          data-testid="mobile-menu-toggle"
          onClick={() => setMobileOpen((v) => !v)}
          className="p-2 rounded-md hover:bg-slate-800"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 top-14 z-30 bg-[#0f172a]">
          <nav className="p-4 space-y-1">
            {nav.map(({ to, label, icon: Icon, testid }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                data-testid={`mobile-${testid}`}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-md text-base font-medium ${
                    isActive ? "bg-[#ea580c] text-white" : "text-slate-300 hover:bg-slate-800"
                  }`
                }
              >
                <Icon className="w-5 h-5" /> {label}
              </NavLink>
            ))}
            <button
              onClick={handleLogout}
              data-testid="mobile-logout-btn"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-slate-300 hover:bg-slate-800 mt-4"
            >
              <LogOut className="w-5 h-5" /> Sign out
            </button>
          </nav>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 pt-14 lg:pt-0 pb-20 lg:pb-0">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
          <Outlet />
        </div>
      </main>

      {/* Bottom nav mobile */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 grid grid-cols-6">
        {nav.map(({ to, label, icon: Icon, testid }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            data-testid={`bottom-${testid}`}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2 text-[10px] font-medium ${
                isActive ? "text-[#ea580c]" : "text-slate-500"
              }`
            }
          >
            <Icon className="w-5 h-5 mb-0.5" />
            {label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
