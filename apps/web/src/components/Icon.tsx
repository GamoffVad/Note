/** Линейные иконки 24×24, штрих 1.6 (DESIGN-SYSTEM.md, раздел 5). Пути notes…sync — из макета variant-01. */
const PATHS = {
  notes: ["M5 3h10l4 4v14H5z", "M14 3v5h5", "M8 12h8", "M8 16h6"],
  tasks: ["M9 5h12", "M9 12h12", "M9 19h12", "M2 5l2 2 3-4", "M2 12l2 2 3-4", "M2 19l2 2 3-4"],
  files: ["M3 6h7l2 3h9v12H3z"],
  devices: ["M3 4h15v11H3z", "M8 19h5", "M10 15v4", "M19 10h3v11h-6v-5"],
  plus: ["M12 4v16", "M4 12h16"],
  search: ["M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14", "M15 15l6 6"],
  history: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18", "M12 7v5l4 2"],
  sync: ["M4 9a8 8 0 0 1 14-3l3 3", "M21 3v6h-6", "M20 15a8 8 0 0 1-14 3l-3-3", "M3 21v-6h6"],
  back: ["M20 12H4", "M10 6l-6 6 6 6"],
  arrow: ["M4 12h16", "M14 6l6 6-6 6"],
  check: ["M4 12l5 5L20 6"],
  menu: ["M4 6h16", "M4 12h16", "M4 18h16"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 14h10l1-14", "M10 11v6", "M14 11v6"],
  restore: ["M4 12a8 8 0 1 0 3-6.2", "M4 4v5h5"],
  pin: ["M9 4h6l-1 6 3 3H7l3-3z", "M12 13v7"],
  settings: [
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
    "M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2",
  ],
  mic: ["M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3", "M5 11a7 7 0 0 0 14 0", "M12 18v3"],
  download: ["M12 4v11", "M7 10l5 5 5-5", "M5 20h14"],
  text: ["M5 6h14", "M5 11h14", "M5 16h9"],
  warning: ["M12 4l9 16H3z", "M12 10v4", "M12 17v.5"],
  cloudOff: ["M3 3l18 18", "M8 8a5 5 0 0 0-1 9h10", "M11 6a5 5 0 0 1 7 4 4 4 0 0 1 2 5"],
  tag: ["M4 4h7l9 9-7 7-9-9z", "M8.5 8.5h.01"],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={size ? { width: size, height: size } : undefined}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** Знак «Маяк» — линейный силуэт маяка из макета. */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        d="M12 27l2-13h4l2 13M10 27h12M12 14h8M13 8h6v6h-6zM12 8l4-4 4 4M7 10H3m22 0h4M7 6L4 4m21 2 3-2"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
