import React, { useState, useEffect } from "react";
import { ChevronDown, Plus, Trash2, Info } from "lucide-react";
import {
  PRINTER_TYPE_TEMPLATES,
  type CartridgeDef,
  type PrinterType,
  type InkChannel,
} from "../../../shared/cartridgeTypes";

interface CartridgeConfigProps {
  cartridges: CartridgeDef[];
  printerType: PrinterType;
  coveragePercent: number;
  onChange: (cartridges: CartridgeDef[], printerType: PrinterType) => void;
}

const CHANNEL_OPTIONS: { value: InkChannel; label: string; color: string }[] = [
  { value: "C", label: "Cyan (C)",    color: "#06b6d4" },
  { value: "M", label: "Magenta (M)", color: "#ec4899" },
  { value: "Y", label: "Yellow (Y)",  color: "#eab308" },
  { value: "K", label: "Black (K)",   color: "#1a1a1a" },
  { value: "R", label: "Red (R)",     color: "#ef4444" },
  { value: "G", label: "Green (G)",   color: "#22c55e" },
  { value: "B", label: "Blue (B)",    color: "#3b82f6" },
];

const DEFAULT_COLORS: Record<string, string> = {
  black: "#1a1a1a",
  colour: "#7c3aed",
  cyan: "#06b6d4",
  magenta: "#ec4899",
  yellow: "#eab308",
  "photo-cyan": "#67e8f9",
  "photo-mag": "#f9a8d4",
};

function getDefaultColor(id: string): string {
  return DEFAULT_COLORS[id] ?? "#6b7280";
}

export default function CartridgeConfig({
  cartridges,
  printerType,
  coveragePercent,
  onChange,
}: CartridgeConfigProps) {
  const [localType, setLocalType] = useState<PrinterType>(printerType);
  const [localCartridges, setLocalCartridges] = useState<CartridgeDef[]>(cartridges);
  const [showTypeInfo, setShowTypeInfo] = useState(false);

  // Sync when parent changes (e.g. preset loaded)
  useEffect(() => {
    setLocalType(printerType);
    setLocalCartridges(cartridges);
  }, [printerType, JSON.stringify(cartridges)]);

  function handleTypeChange(newType: PrinterType) {
    const template = PRINTER_TYPE_TEMPLATES.find((t) => t.type === newType);
    if (!template) return;

    // Build cartridge list from template, preserving prices if same id exists
    const newCartridges: CartridgeDef[] = template.cartridges.map((tmpl) => {
      const existing = localCartridges.find((c) => c.id === tmpl.id);
      return {
        ...tmpl,
        price: existing?.price ?? 0,
        yield: existing?.yield ?? 0,
        color: getDefaultColor(tmpl.id),
      };
    });

    setLocalType(newType);
    setLocalCartridges(newCartridges);
    onChange(newCartridges, newType);
  }

  function updateCartridge(idx: number, patch: Partial<CartridgeDef>) {
    const updated = localCartridges.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    setLocalCartridges(updated);
    onChange(updated, localType);
  }

  function addCustomCartridge() {
    const newCart: CartridgeDef = {
      id: `custom-${Date.now()}`,
      label: "New Cartridge",
      channels: ["K"],
      blended: false,
      price: 0,
      yield: 0,
      color: "#6b7280",
    };
    const updated = [...localCartridges, newCart];
    setLocalCartridges(updated);
    onChange(updated, localType);
  }

  function removeCartridge(idx: number) {
    const updated = localCartridges.filter((_, i) => i !== idx);
    setLocalCartridges(updated);
    onChange(updated, localType);
  }

  function toggleChannel(idx: number, ch: InkChannel) {
    const cart = localCartridges[idx];
    const has = cart.channels.includes(ch);
    const newChannels = has
      ? cart.channels.filter((c) => c !== ch)
      : [...cart.channels, ch];
    if (newChannels.length === 0) return; // must have at least one channel
    updateCartridge(idx, {
      channels: newChannels,
      blended: newChannels.length > 1 ? cart.blended : false,
    });
  }

  const selectedTemplate = PRINTER_TYPE_TEMPLATES.find((t) => t.type === localType);

  return (
    <div className="space-y-4">
      {/* Printer Type Selector */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Printer Cartridge Configuration
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PRINTER_TYPE_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.type}
              type="button"
              onClick={() => handleTypeChange(tmpl.type)}
              className={`text-left px-3 py-2.5 rounded-lg border-2 transition-all ${
                localType === tmpl.type
                  ? "border-blue-500 bg-blue-50 text-blue-900"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              <div className="font-semibold text-sm">{tmpl.label}</div>
              <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{tmpl.description}</div>
            </button>
          ))}
        </div>

        {/* Description hint */}
        {selectedTemplate && localType !== "custom" && (
          <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            <Info className="inline w-3.5 h-3.5 mr-1 text-blue-500" />
            {selectedTemplate.description}
          </p>
        )}
      </div>

      {/* Cartridge Rows */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-700">
            Cartridge Pricing
          </h4>
          {localType === "custom" && (
            <button
              type="button"
              onClick={addCustomCartridge}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Cartridge
            </button>
          )}
        </div>

        {localCartridges.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            Select a printer type above or add a custom cartridge.
          </p>
        )}

        {localCartridges.map((cart, idx) => (
          <div
            key={cart.id}
            className="rounded-lg border border-gray-200 bg-white p-3 space-y-3"
          >
            {/* Cartridge header */}
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: cart.color }}
              />
              <span className="font-semibold text-sm text-gray-800 flex-1">
                {cart.label}
              </span>
              {cart.blended && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                  Tri-colour (shared)
                </span>
              )}
              {localType === "custom" && (
                <button
                  type="button"
                  onClick={() => removeCartridge(idx)}
                  className="text-red-400 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Channel selector (custom mode only) */}
            {localType === "custom" && (
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Ink channels covered:</p>
                <div className="flex flex-wrap gap-1.5">
                  {CHANNEL_OPTIONS.map((ch) => (
                    <button
                      key={ch.value}
                      type="button"
                      onClick={() => toggleChannel(idx, ch.value)}
                      className={`px-2 py-0.5 rounded text-xs font-medium border transition-all ${
                        cart.channels.includes(ch.value)
                          ? "text-white border-transparent"
                          : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                      }`}
                      style={
                        cart.channels.includes(ch.value)
                          ? { backgroundColor: ch.color, borderColor: ch.color }
                          : {}
                      }
                    >
                      {ch.label}
                    </button>
                  ))}
                </div>
                {cart.channels.length > 1 && (
                  <label className="flex items-center gap-2 mt-2 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cart.blended}
                      onChange={(e) => updateCartridge(idx, { blended: e.target.checked })}
                      className="rounded"
                    />
                    Shared reservoir (tri-colour) — ink is drawn from one tank for all channels
                  </label>
                )}
              </div>
            )}

            {/* Price + Yield inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Price per Cartridge ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={cart.price || ""}
                  placeholder="e.g. 12.99"
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) updateCartridge(idx, { price: v });
                  }}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value);
                    updateCartridge(idx, { price: isNaN(v) ? 0 : v });
                  }}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Page Yield (at {coveragePercent}% coverage)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={cart.yield || ""}
                  placeholder="e.g. 400"
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v > 0) updateCartridge(idx, { yield: v });
                  }}
                  onBlur={(e) => {
                    const v = parseInt(e.target.value);
                    updateCartridge(idx, { yield: isNaN(v) ? 0 : Math.max(1, v) });
                  }}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Cost per page preview */}
            {cart.price > 0 && cart.yield > 0 && (
              <p className="text-xs text-emerald-600 font-medium">
                ≈ ${(cart.price / cart.yield).toFixed(4)} per page at {coveragePercent}% coverage
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Blended cartridge explanation */}
      {localCartridges.some((c) => c.blended) && (
        <div className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <strong className="text-amber-700">Tri-colour cartridge:</strong> The colour cartridge
          covers Cyan, Magenta and Yellow from a single shared reservoir. Its cost is calculated
          based on the average of C+M+Y ink usage — when any one colour channel runs out, the
          entire cartridge must be replaced.
        </div>
      )}
    </div>
  );
}
