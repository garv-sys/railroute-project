"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex p-1 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 opacity-50">
        <div className="w-8 h-8 rounded-full" />
        <div className="w-8 h-8 rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex items-center p-1 rounded-full bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-white/10 shadow-inner">
      <button
        onClick={() => setTheme("light")}
        className={`relative flex items-center justify-center w-8 h-8 rounded-full transition-colors z-10 ${
          theme === "light" ? "text-amber-600" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        }`}
        aria-label="Light mode"
      >
        {theme === "light" && (
          <motion.div
            layoutId="theme-bubble"
            className="absolute inset-0 bg-white dark:bg-slate-800 rounded-full shadow-sm border border-slate-200/50"
            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
          />
        )}
        <Sun className="w-4 h-4 relative z-20" />
      </button>

      <button
        onClick={() => setTheme("dark")}
        className={`relative flex items-center justify-center w-8 h-8 rounded-full transition-colors z-10 ${
          theme === "dark" ? "text-indigo-400" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        }`}
        aria-label="Dark mode"
      >
        {theme === "dark" && (
          <motion.div
            layoutId="theme-bubble"
            className="absolute inset-0 bg-slate-800 rounded-full shadow-sm border border-slate-700"
            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
          />
        )}
        <Moon className="w-4 h-4 relative z-20" />
      </button>
    </div>
  );
}
