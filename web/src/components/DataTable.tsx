import { ReactNode, useMemo, useState } from "react";
import { Skeleton } from "./ui";

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
  /** Optional row selection for bulk actions. */
  selectable?: boolean;
  isRowSelectable?: (row: T) => boolean;
  selectedKeys?: Set<string>;
  onSelectedKeysChange?: (keys: Set<string>) => void;
  /** Empty-state "Clear filters" button — clears parent-owned filters too. */
  onClearFilters?: () => void;
  filtersActive?: boolean;
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
  selectable,
  isRowSelectable,
  selectedKeys,
  onSelectedKeysChange,
  onClearFilters,
  filtersActive,
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

  // Selection (bulk actions)
  const sel = selectedKeys ?? new Set<string>();
  const canSelect = (r: T) => !isRowSelectable || isRowSelectable(r);
  const selectablePageRows = pageRows.filter(canSelect);
  const allPageSelected = selectablePageRows.length > 0 && selectablePageRows.every((r) => sel.has(rowKey(r)));
  const somePageSelected = selectablePageRows.some((r) => sel.has(rowKey(r)));
  const toggleRow = (r: T) => { const n = new Set(sel); const k = rowKey(r); n.has(k) ? n.delete(k) : n.add(k); onSelectedKeysChange?.(n); };
  const toggleAllPage = () => { const n = new Set(sel); if (allPageSelected) selectablePageRows.forEach((r) => n.delete(rowKey(r))); else selectablePageRows.forEach((r) => n.add(rowKey(r))); onSelectedKeysChange?.(n); };
  const colCount = columns.length + (selectable ? 1 : 0);

  const searchOrFilterActive = !!q || filters.some((f) => f.value) || !!filtersActive;
  const clearAll = () => { setQ(""); filters.forEach((f) => f.onChange("")); setPage(0); onClearFilters?.(); };

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
        {searchOrFilterActive && (
          <button className="btn btn-ghost btn-sm" onClick={clearAll}>Clear</button>
        )}
        {onRefresh && <button className="btn btn-ghost btn-sm" onClick={onRefresh}>↻ Refresh</button>}
      </div>

      <div className="card">
        {error ? (
          <div className="empty-state" style={{ color: "var(--danger)" }}>{error}</div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {selectable && (
                      <th style={{ width: 1 }}>
                        {!loading && (
                          <input type="checkbox" aria-label="Select all rows on this page"
                            ref={(el) => { if (el) el.indeterminate = !allPageSelected && somePageSelected; }}
                            checked={allPageSelected} onChange={toggleAllPage} />
                        )}
                      </th>
                    )}
                    {columns.map((c) => (
                      <th key={c.key} className={c.sortable === false ? "" : "sortable"} onClick={() => !loading && toggleSort(c)}
                        aria-sort={sortKey === c.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
                        {c.header}{sortKey === c.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: Math.min(pageSize, 6) }).map((_, i) => (
                      <tr key={`sk-${i}`}>
                        {selectable && <td style={{ width: 1 }}><Skeleton width={16} height={16} /></td>}
                        {columns.map((c) => (
                          <td key={c.key} className={c.className}><Skeleton width={`${45 + ((i * 17 + c.key.length * 11) % 45)}%`} /></td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <>
                      {pageRows.map((r) => {
                        const isSel = !!selectable && sel.has(rowKey(r));
                        return (
                          <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
                            style={{ ...(onRowClick ? { cursor: "pointer" } : {}), ...(isSel ? { background: "var(--primary-soft)" } : {}) }}>
                            {selectable && (
                              <td style={{ width: 1 }} onClick={(e) => e.stopPropagation()}>
                                {canSelect(r) ? <input type="checkbox" aria-label="Select row" checked={sel.has(rowKey(r))} onChange={() => toggleRow(r)} /> : null}
                              </td>
                            )}
                            {columns.map((c) => (
                              <td key={c.key} className={c.className}>{c.render ? c.render(r) : (r as any)[c.key]}</td>
                            ))}
                          </tr>
                        );
                      })}
                      {pageRows.length === 0 && (
                        <tr><td colSpan={colCount}>
                          <div className="empty-state">
                            <div>{emptyText}</div>
                            {searchOrFilterActive && (
                              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={clearAll}>Clear filters</button>
                            )}
                          </div>
                        </td></tr>
                      )}
                    </>
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
