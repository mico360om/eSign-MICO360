/**
 * eSign MICO360 — Brand tokens (single source of truth).
 *
 * Colors sampled directly from the official logo (logo.png):
 *   - Maroon / crimson  #8A1A1C  (primary brand color)
 *   - Near-black        #1E1F1E  (text / secondary)
 *   - White             #FFFFFF  (surface / background)
 *
 * All clients (web, desktop, mobile) import these so the palette stays
 * consistent. Change a value here and re-theme every app.
 */
const brand = {
  name: "eSign MICO360",
  tagline: "Digital Document Signature & Approval",

  colors: {
    // Core
    primary: "#8A1A1C", // maroon — buttons, links, active states
    primaryDark: "#6E1416", // hover / pressed
    primaryLight: "#B33235", // accents, highlights
    primarySoft: "#F6E9E9", // tinted backgrounds, table hover

    ink: "#1E1F1E", // near-black — headings, body text
    inkSoft: "#4A4B4A", // secondary text
    muted: "#8A8C8A", // captions, placeholders

    surface: "#FFFFFF", // cards, panels
    background: "#F5F3F2", // app background
    border: "#E3E0DE",

    // Status (aligned with document statuses)
    success: "#2E7D32",
    warning: "#C77700",
    danger: "#B3261E",
    info: "#1565C0",
    white: "#FFFFFF",
  },

  // Document status -> display color
  statusColors: {
    DRAFT: "#8A8C8A",
    UPLOADED: "#1565C0",
    PDF_CONVERTED: "#1565C0",
    PENDING_APPROVAL: "#C77700",
    PENDING_SIGNATURE: "#C77700",
    PARTIALLY_APPROVED: "#B33235",
    APPROVED: "#2E7D32",
    REJECTED: "#B3261E",
    COMPLETED: "#2E7D32",
    CANCELLED: "#8A8C8A",
  },

  typography: {
    fontFamily:
      "'Segoe UI', 'Inter', system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif",
    headingWeight: 700,
    bodyWeight: 400,
  },

  radius: { sm: "6px", md: "10px", lg: "16px", pill: "999px" },
  shadow: {
    sm: "0 1px 2px rgba(30,31,30,0.08)",
    md: "0 4px 14px rgba(30,31,30,0.10)",
    lg: "0 10px 30px rgba(30,31,30,0.14)",
  },

  logo: {
    dark: "logo.png", // dark logo for white backgrounds
    white: "logo-w.png", // white logo for dark backgrounds
  },
};

module.exports = brand;
module.exports.default = brand;
