import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ALL_DESTINATIONS } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Command palette (Ctrl/Cmd+K) — jump to any module, ERP power-user style. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const nav = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term
      ? ALL_DESTINATIONS.filter(
          (d) => d.label.toLowerCase().includes(term) || d.ws.toLowerCase().includes(term)
        )
      : ALL_DESTINATIONS;
    return list.slice(0, 8);
  }, [q]);

  useEffect(() => setActive(0), [q, open]);

  if (!open) return null;

  const go = (to: string) => {
    nav(to);
    setOpen(false);
    setQ("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border bg-popover shadow-2xl animate-in"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter" && results[active]) go(results[active].to);
          }}
          placeholder="Jump to… (type a module, e.g. GST, POS, Leads)"
          className="w-full border-b bg-transparent px-4 py-3.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</div>
          )}
          {results.map((r, i) => (
            <button
              key={r.to}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r.to)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm",
                i === active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
              )}
            >
              <r.icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
              <span className="font-medium">{r.label}</span>
              <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground">{r.ws}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t px-4 py-2 text-[11px] text-muted-foreground">
          <span><kbd className="rounded border bg-muted px-1.5 py-0.5">↑↓</kbd> navigate</span>
          <span><kbd className="rounded border bg-muted px-1.5 py-0.5">↵</kbd> open</span>
          <span><kbd className="rounded border bg-muted px-1.5 py-0.5">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
