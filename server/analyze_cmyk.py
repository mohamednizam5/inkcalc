#!/usr/bin/env python3
"""
CMYK Ink Coverage Analyzer
Accepts a single image path (or a JSON object with cmyk_channels) and outputs
JSON with per-channel coverage metrics.

Two analysis modes:
  1. Native CMYK mode: reads Ghostscript tiffsep channel TIFFs directly.
     Input: JSON string {"path": "...", "cmyk_channels": {"C": "...", "M": "...", "Y": "...", "K": "..."}}
  2. RGB fallback mode: converts RGB image to CMYK mathematically.
     Input: plain image file path (JPEG, PNG, TIFF, etc.)

Usage:
  python3 analyze_cmyk.py <image_path>
  python3 analyze_cmyk.py '{"path":"page.png","cmyk_channels":{"C":"...","M":"...","Y":"...","K":"..."}}'
"""
import sys
import json
import os

try:
    from PIL import Image
    import numpy as np
except ImportError as e:
    print(json.dumps({"error": f"Missing dependency: {e}"}))
    sys.exit(1)


def analyze_cmyk_native(cmyk_channels: dict, reference_path: str) -> dict:
    """
    Analyze CMYK coverage using native Ghostscript tiffsep channel files.
    Each channel TIFF is a greyscale image where:
      - 0 (black pixel)   = full ink
      - 255 (white pixel) = no ink
    Coverage = mean(1 - pixel/255) * 100
    """
    try:
        img_ref = Image.open(reference_path).convert("RGB")
        ref_arr = np.array(img_ref)
        total_pixels = ref_arr.shape[0] * ref_arr.shape[1]
    except Exception as e:
        return {"error": f"Cannot open reference image: {e}"}

    channel_map = {
        "cCoverage": cmyk_channels.get("C"),
        "mCoverage": cmyk_channels.get("M"),
        "yCoverage": cmyk_channels.get("Y"),
        "kCoverage": cmyk_channels.get("K"),
    }

    coverages = {}
    ink_pixels = 0

    for key, ch_path in channel_map.items():
        if not ch_path or not os.path.exists(ch_path):
            coverages[key] = 0.0
            continue
        try:
            ch_img = Image.open(ch_path).convert("L")
            ch_arr = np.array(ch_img, dtype=np.float32)
            # tiffsep: 0=ink, 255=no ink — invert to get ink fraction
            ink_fraction = 1.0 - (ch_arr / 255.0)
            coverage = float(np.mean(ink_fraction) * 100)
            coverages[key] = round(coverage, 4)
            if key == "kCoverage":
                # Count pixels with any ink for inkPixels stat
                ink_pixels = int(np.sum(ink_fraction > 0.01))
        except Exception as e:
            coverages[key] = 0.0

    tac = sum(coverages.values())

    return {
        "cCoverage": coverages.get("cCoverage", 0.0),
        "mCoverage": coverages.get("mCoverage", 0.0),
        "yCoverage": coverages.get("yCoverage", 0.0),
        "kCoverage": coverages.get("kCoverage", 0.0),
        "tac": round(tac, 4),
        "totalPixels": total_pixels,
        "inkPixels": ink_pixels,
        "analysisMode": "native_cmyk",
    }


def rgb_to_cmyk(r, g, b):
    """Convert RGB (0-255) arrays to CMYK (0-1) arrays."""
    r_norm = r / 255.0
    g_norm = g / 255.0
    b_norm = b / 255.0

    k = 1.0 - np.maximum(np.maximum(r_norm, g_norm), b_norm)
    divisor = np.where(k < 1.0, 1.0 - k, 1.0)

    c = np.where(k < 1.0, (1.0 - r_norm - k) / divisor, 0.0)
    m = np.where(k < 1.0, (1.0 - g_norm - k) / divisor, 0.0)
    y = np.where(k < 1.0, (1.0 - b_norm - k) / divisor, 0.0)

    return (
        np.clip(c, 0, 1),
        np.clip(m, 0, 1),
        np.clip(y, 0, 1),
        np.clip(k, 0, 1),
    )


def analyze_image_rgb(image_path: str) -> dict:
    """
    Fallback: analyze CMYK coverage by converting RGB image to CMYK mathematically.
    Used for JPEG, PNG, TIFF images that are not PDF-sourced.
    """
    img = Image.open(image_path)

    if img.mode == "RGBA":
        r_ch, g_ch, b_ch, a_ch = img.split()
        alpha_mask = np.array(a_ch) > 10
        img = img.convert("RGB")
    elif img.mode in ("LA", "L"):
        img = img.convert("RGB")
        alpha_mask = None
    else:
        img = img.convert("RGB")
        alpha_mask = None

    img_array = np.array(img, dtype=np.float32)
    r = img_array[:, :, 0]
    g = img_array[:, :, 1]
    b = img_array[:, :, 2]

    is_white = (r > 245) & (g > 245) & (b > 245)

    if alpha_mask is not None:
        ink_mask = (~is_white) & alpha_mask
    else:
        ink_mask = ~is_white

    total_pixels = r.size
    ink_pixels = int(np.sum(ink_mask))

    if ink_pixels == 0:
        return {
            "cCoverage": 0.0,
            "mCoverage": 0.0,
            "yCoverage": 0.0,
            "kCoverage": 0.0,
            "tac": 0.0,
            "totalPixels": total_pixels,
            "inkPixels": 0,
            "analysisMode": "rgb_conversion",
        }

    c, m, y, k = rgb_to_cmyk(r, g, b)

    c_cov = float(np.mean(c) * 100)
    m_cov = float(np.mean(m) * 100)
    y_cov = float(np.mean(y) * 100)
    k_cov = float(np.mean(k) * 100)
    tac = c_cov + m_cov + y_cov + k_cov

    # RGB channel coverage: mean ink density per channel (0=white/no ink, 100=full ink)
    # For RGB inkjet printers — ink usage is proportional to (255 - channel) / 255
    r_cov = float(np.mean((255.0 - r) / 255.0) * 100)
    g_cov = float(np.mean((255.0 - g) / 255.0) * 100)
    b_cov = float(np.mean((255.0 - b) / 255.0) * 100)

    return {
        "cCoverage": round(c_cov, 4),
        "mCoverage": round(m_cov, 4),
        "yCoverage": round(y_cov, 4),
        "kCoverage": round(k_cov, 4),
        "tac": round(tac, 4),
        "rCoverage": round(r_cov, 4),
        "gCoverage": round(g_cov, 4),
        "bCoverage": round(b_cov, 4),
        "totalPixels": total_pixels,
        "inkPixels": ink_pixels,
        "analysisMode": "rgb_conversion",
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: analyze_cmyk.py <image_path_or_json>"}))
        sys.exit(1)

    arg = sys.argv[1]

    # Check if argument is a JSON object (native CMYK mode)
    if arg.strip().startswith("{"):
        try:
            data = json.loads(arg)
            if "cmyk_channels" in data and "path" in data:
                result = analyze_cmyk_native(data["cmyk_channels"], data["path"])
            elif "path" in data:
                result = analyze_image_rgb(data["path"])
            else:
                result = {"error": "JSON input must contain 'path' key"}
        except json.JSONDecodeError as e:
            result = {"error": f"Invalid JSON input: {e}"}
    else:
        # Plain file path — use RGB fallback
        image_path = arg
        if not os.path.exists(image_path):
            print(json.dumps({"error": f"File not found: {image_path}"}))
            sys.exit(1)
        result = analyze_image_rgb(image_path)

    if "error" in result:
        print(json.dumps(result))
        sys.exit(1)

    print(json.dumps(result))
