export const formatDate = (d) => {
  if (!d) return "\u2014";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const calcTenure = (fromDate, toDate) => {
  if (!fromDate || !toDate) return "\u2014";
  const a = new Date(fromDate);
  const b = new Date(toDate);
  const totalMonths =
    (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  if (y === 0) return `${m}mo`;
  if (m === 0) return `${y}y`;
  return `${y}y ${m}mo`;
};

export const isActive = (toDate) => {
  if (!toDate) return false;
  const daysDiff = (new Date() - new Date(toDate)) / (1000 * 60 * 60 * 24);
  return daysDiff < 120;
};

// Whole years between two dates (rounded), used for an experience span.
export const yearsBetween = (from, to) => {
  if (!from || !to) return 0;
  const a = new Date(from);
  const b = new Date(to);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24 * 365.25)));
};

// Total months of a tenure, used for sorting by longevity.
export const tenureMonths = (from, to) => {
  if (!from || !to) return 0;
  const a = new Date(from);
  const b = new Date(to);
  if (isNaN(a) || isNaN(b)) return 0;
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
};
