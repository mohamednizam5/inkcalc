import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CmykBarProps {
  label: string;
  value: number; // 0-100
  color: "cyan" | "magenta" | "yellow" | "black";
  showValue?: boolean;
  size?: "sm" | "md";
}

const colorMap = {
  cyan: { bar: "bg-cyan-500", text: "text-cyan-600", bg: "bg-cyan-50" },
  magenta: { bar: "bg-pink-500", text: "text-pink-600", bg: "bg-pink-50" },
  yellow: { bar: "bg-yellow-400", text: "text-yellow-600", bg: "bg-yellow-50" },
  black: { bar: "bg-gray-800", text: "text-gray-700", bg: "bg-gray-100" },
};

export function CmykBar({ label, value, color, showValue = true, size = "md" }: CmykBarProps) {
  const colors = colorMap[color];
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div className="flex items-center gap-2.5">
      <span className={cn("font-semibold text-xs w-2", colors.text)}>{label}</span>
      <div className={cn("flex-1 rounded-full overflow-hidden", size === "sm" ? "h-1.5" : "h-2", "bg-muted")}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clampedValue}%` }}
          transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
          className={cn("h-full rounded-full", colors.bar)}
        />
      </div>
      {showValue && (
        <span className={cn("text-xs font-mono tabular-nums w-12 text-right", colors.text)}>
          {clampedValue.toFixed(1)}%
        </span>
      )}
    </div>
  );
}

interface CmykGroupProps {
  c: number;
  m: number;
  y: number;
  k: number;
  tac?: number;
  size?: "sm" | "md";
}

export function CmykGroup({ c, m, y, k, tac, size = "md" }: CmykGroupProps) {
  return (
    <div className="space-y-1.5">
      <CmykBar label="C" value={c} color="cyan" size={size} />
      <CmykBar label="M" value={m} color="magenta" size={size} />
      <CmykBar label="Y" value={y} color="yellow" size={size} />
      <CmykBar label="K" value={k} color="black" size={size} />
      {tac !== undefined && (
        <div className="pt-1 border-t border-border/50">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground font-medium">Total Ink Coverage</span>
            <span className="text-xs font-mono font-semibold tabular-nums">{tac.toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
