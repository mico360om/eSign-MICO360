import { ReactNode, useMemo, useState } from "react";
import { Spinner } from "./ui";

export interface Column<T> {
  key: string;
  header: string;
  /** cell renderer (defaults to row[key]) */
  render?: (row: T) => ReactNode;
  /** value used for sorting/searching (defaults to row[key]) */
  value?: (row: T) => string | number;
  sortable?: boolean;
  className?: string;
}

export interface FilterDef {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}

interface Props<T> {
  rows: T[] | null;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** fields searched by the toolbar search box */
  searchValue?: (row: T) => string;
  searchPlaceholder?: string;
  filters?: FilterDef[];
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  emptyText?: string;
  toolbarExtra?: ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchValue,
  searchPlaceholder = "Search…",
  filters = [],
  loading,
  error,
  onRefresh,
  onRowClick,
  pageSize = 10,
  emptyText = "No records found.",
  toolbarExtra,
}: Props<T>) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const valueOf = (row: T, col: Column<T>) => (col.value ? col.value(row) : (row as any)[col.key]);

  const filtered = useMemo(() => {
    let data = rows ?? [];
    if (q && searchValue) {
      const needle = q.toLowerCase();
      data = data.filter((r) => searchValue(r).toLowerCase().includes(needle));
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col) {
        data = [...data].sort((a, b) => {
          const av = valueOf(a, col), bv = valueOf(b, col);
          const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }
    return data;
  }, [rows, q, sortKey, sortDir, columns, searchValue]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (col: Column<T>) => {
    if (col.sortable === false) return;
    if (sortKey === col.key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(col.key); setSortDir("asc"); }
  };

  return (
    <div>
      <div className="toolbar">
        {searchValue && (
          <input className="search" placeholder={searchPlaceholder} value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        )}
        {filters.map((f) => (
          <select key={f.label} value={f.value} onChange={(e) => { f.onChange(e.target.value); setPage(0); }} aria-label={f.label}>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        {toolbarExtra}
        <div className="spacer" />
        {(q || filters.some((f) => f.value)) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setQ(""); filters.forEach((f) => f.onChange("")); setPage(0); }}>Clear</button>
        )}
        {onRefresh && <button className="btn btn-ghost btn-sm" onClick={onRefresh}>↻ Refresh</button>}
      </div>

      <div className="card">
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="empty-state" style={{ color: "var(--danger)" }}>{error}</div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c.key} className={c.sortable === false ? "" : "sortable"} onClick={() => toggleSort(c)}>
                        {c.header}{sortKey === c.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} style={onRowClick ? { cursor: "pointer" } : undefined}>
                      {columns.map((c) => (
                        <td key={c.key} className={c.className}>{c.render ? c.render(r) : (r as any)[c.key]}</td>
                      ))}
                    </tr>
                  ))}
                  {pageRows.length === 0 && (
                    <tr><td colSpan={columns.length}><div className="empty-state">{emptyText}</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > pageSize && (
              <div className="pagination">
                <span className="muted">
                  {filtered.length} record{filtered.length === 1 ? "" : "s"} · page {safePage + 1} of {pageCount}
                </span>
                <div className="pages">
                  <button className="btn btn-ghost btn-sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>‹ Prev</button>
                  <button className="btn btn-ghost btn-sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next ›</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
