/**
 * Unified form controls for appointment modals (light premium look).
 * Native <select> list styling is complemented by `.crm-native-select` in index.css.
 */

const ringFocus = "focus:border-emerald-500/55 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

/** Base: light surface controls with clear contrast */
export const modalFormControlBase =
  `crm-native-select w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-snug text-slate-900 transition ${ringFocus} backdrop-blur-sm`;

export const modalFormControlHover = "hover:border-slate-300 hover:bg-slate-50";

export const modalFormPlaceholder = "placeholder:text-slate-400";

export const modalSelectClass = `mt-2 ${modalFormControlBase} ${modalFormControlHover} cursor-pointer ${modalFormPlaceholder}`;

/** Disabled service select — muted but intentional, not “broken grey” */
export const modalSelectDisabledClass = `mt-2 ${modalFormControlBase} cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500 focus:border-slate-200 focus:ring-0`;

export const modalInputClass = `mt-2 ${modalFormControlBase} ${modalFormControlHover} ${modalFormPlaceholder}`;

/** Combobox: обёртка с mt-2, input внутри без второго отступа */
export const modalComboboxWrapperClass = "relative mt-2";

export const modalComboboxInputClass = `${modalFormControlBase} ${modalFormControlHover} ${modalFormPlaceholder}`;

/** Payment modal etc. — no top margin */
export const modalSelectClassInline = `${modalFormControlBase} ${modalFormControlHover} cursor-pointer`;

export const modalLabelClass = "block text-xs font-semibold uppercase tracking-wide text-slate-400";

export const modalHintClass = "mt-1 text-xs text-slate-400";

/** Apple-style «Быстрая запись»: 44px controls, #f9fafb fill, green focus */
const quickFocus =
  "focus:border-[#22c55e] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#22c55e]/25";

export const quickModalLabelClass =
  "block text-xs font-semibold uppercase tracking-wide text-[#6b7280]";

export const quickModalHintClass = "mt-1 text-xs text-[#6b7280]";

export const quickModalInputClass = `crm-native-select mt-2 h-11 w-full rounded-[10px] border border-[#e5e7eb] bg-[#f9fafb] px-3 text-sm text-[#111827] transition ${quickFocus} hover:border-slate-300`;

export const quickModalSelectClass = `crm-native-select mt-2 h-11 w-full rounded-[10px] border border-[#e5e7eb] bg-[#f9fafb] px-3 text-sm text-[#111827] transition ${quickFocus} cursor-pointer hover:border-slate-300`;

export const quickModalSelectDisabledClass = `crm-native-select mt-2 h-11 w-full cursor-not-allowed rounded-[10px] border border-[#e5e7eb] bg-slate-100 px-3 text-sm text-[#6b7280] focus:ring-0`;

/** Combobox input for quick modal (no mt-2 on wrapper duplicate) */
export const quickModalComboboxInputClass = `crm-native-select h-11 w-full rounded-[10px] border border-[#e5e7eb] bg-[#f9fafb] px-3 text-sm text-[#111827] transition ${quickFocus} hover:border-slate-300`;
