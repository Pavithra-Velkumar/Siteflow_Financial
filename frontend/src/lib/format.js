export const inr = (n) => {
  const num = Number(n) || 0;
  return "₹" + num.toLocaleString("en-IN", { maximumFractionDigits: 0 });
};

export const inrCompact = (n) => {
  const num = Number(n) || 0;
  if (Math.abs(num) >= 10000000) return "₹" + (num / 10000000).toFixed(2) + " Cr";
  if (Math.abs(num) >= 100000) return "₹" + (num / 100000).toFixed(2) + " L";
  if (Math.abs(num) >= 1000) return "₹" + (num / 1000).toFixed(1) + "K";
  return "₹" + num.toFixed(0);
};

export const fmtDate = (iso) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
};

export const fmtDateTime = (iso) => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
};
