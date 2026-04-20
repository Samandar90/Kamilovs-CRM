import React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./utils/cn";
import { Button } from "./Button";

export type DropdownItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
};

export type DropdownProps = {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
  variant?: "secondary" | "ghost";
};

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  items,
  align = "left",
  variant = "secondary",
}) => {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <Button
        type="button"
        variant={variant}
        size="md"
        className="gap-1.5"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {trigger}
        <ChevronDown className={cn("h-4 w-4 opacity-70 transition-transform duration-200", open && "rotate-180")} />
      </Button>
      {open ? (
        <div
          className={cn(
            "crm-dropdown-enter absolute z-50 mt-1.5 min-w-[12rem] rounded-xl border border-slate-200 bg-white py-1 shadow-lg",
            align === "right" ? "right-0" : "left-0"
          )}
          role="menu"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={cn(
                "flex w-full items-center px-3 py-2 text-left text-sm text-slate-700 transition-colors duration-200",
                "hover:bg-slate-50",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
              onClick={() => {
                if (!item.disabled) {
                  item.onSelect();
                  setOpen(false);
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
