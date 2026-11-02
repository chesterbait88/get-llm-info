"use client";

import { useEffect, useState } from "react";
import { Segmented } from "./ui";

type Theme = "system" | "light" | "dark";

/** Light / dark / follow the system. Stored per browser; the layout script applies it before paint. */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const t = window.localStorage.getItem("theme");
      if (t === "light" || t === "dark") setTheme(t);
    } catch {
      /* storage blocked */
    }
  }, []);

  const choose = (t: Theme) => {
    setTheme(t);
    const root = document.documentElement;
    if (t === "system") delete root.dataset.theme;
    else root.dataset.theme = t;
    try {
      if (t === "system") window.localStorage.removeItem("theme");
      else window.localStorage.setItem("theme", t);
    } catch {
      /* storage blocked */
    }
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="field-label">Theme</span>
      <Segmented
        ariaLabel="Colour theme"
        value={theme}
        onChange={choose}
        options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
    </div>
  );
}
