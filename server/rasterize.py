#!/usr/bin/env python3
"""
Document Rasterizer
Converts PDF, DOCX, EPS, and other vector/document formats to per-page images.
For PDFs: uses Ghostscript native CMYK separation (tiffsep) for accurate ink coverage.
For images: converts to PNG for RGB-based analysis.
Usage: python3 rasterize.py <input_file> <output_dir> [dpi]
Output: JSON array of { page: int, path: string, cmyk_channels?: {C, M, Y, K} } or { error: string }
"""
import sys
import json
import os
import subprocess
import glob

try:
    from PIL import Image
except ImportError as e:
    print(json.dumps({"error": f"Missing dependency: {e}"}))
    sys.exit(1)


def rasterize_pdf_cmyk(pdf_path, output_dir, dpi=150):
    """
    Rasterize PDF using Ghostscript tiffsep device for native CMYK separation.
    Produces per-page CMYK channel TIFF files.
    Returns list of { page, path, cmyk_channels: {C, M, Y, K} }
    """
    import shutil

    gs_bin = shutil.which("gs") or shutil.which("gswin64c") or shutil.which("gswin32c")
    if not gs_bin:
        # Fallback to RGB if Ghostscript not available
        return rasterize_pdf_rgb(pdf_path, output_dir, dpi)

    try:
        output_template = os.path.join(output_dir, "page_%04d.tif")
        result = subprocess.run(
            [
                gs_bin,
                "-dNOPAUSE", "-dBATCH", "-dSAFER",
                f"-sDEVICE=tiffsep",
                f"-r{dpi}",
                f"-sOutputFile={output_template}",
                pdf_path,
            ],
            capture_output=True, text=True, timeout=180
        )
        if result.returncode != 0:
            # Fallback to RGB on Ghostscript error
            return rasterize_pdf_rgb(pdf_path, output_dir, dpi)

        # Find all composite TIFF pages (page_NNNN.tif without channel name in parens)
        all_tifs = sorted(glob.glob(os.path.join(output_dir, "page_*.tif")))
        # Composite pages are named page_0001.tif, page_0002.tif etc (no parentheses)
        composite_pages = [f for f in all_tifs if "(" not in os.path.basename(f)]

        if not composite_pages:
            return rasterize_pdf_rgb(pdf_path, output_dir, dpi)

        results = []
        for i, comp_path in enumerate(composite_pages):
            page_num = i + 1
            # Derive channel file paths from composite name
            base = os.path.splitext(comp_path)[0]  # e.g. .../page_0001
            c_path = base + "(Cyan).tif"
            m_path = base + "(Magenta).tif"
            y_path = base + "(Yellow).tif"
            k_path = base + "(Black).tif"

            # Convert composite TIFF to PNG for thumbnail generation
            png_path = base + ".png"
            try:
                img = Image.open(comp_path).convert("RGB")
                img.save(png_path, "PNG")
            except Exception:
                png_path = comp_path  # use tif if png conversion fails

            entry = {"page": page_num, "path": png_path}

            # Attach CMYK channel paths if all 4 exist
            if all(os.path.exists(p) for p in [c_path, m_path, y_path, k_path]):
                entry["cmyk_channels"] = {
                    "C": c_path,
                    "M": m_path,
                    "Y": y_path,
                    "K": k_path,
                }

            results.append(entry)

        return results

    except subprocess.TimeoutExpired:
        return rasterize_pdf_rgb(pdf_path, output_dir, dpi)
    except Exception as e:
        return rasterize_pdf_rgb(pdf_path, output_dir, dpi)


def rasterize_pdf_rgb(pdf_path, output_dir, dpi=150):
    """Fallback: Rasterize PDF to per-page RGB PNG images using pdf2image/poppler."""
    try:
        from pdf2image import convert_from_path
        pages = convert_from_path(pdf_path, dpi=dpi)
        results = []
        for i, page in enumerate(pages):
            out_path = os.path.join(output_dir, f"page_{i+1:04d}.png")
            page.save(out_path, "PNG")
            results.append({"page": i + 1, "path": out_path})
        return results
    except Exception as e:
        return {"error": f"PDF rasterization failed: {e}"}


def rasterize_docx(docx_path, output_dir, dpi=150):
    """Convert DOCX → PDF via LibreOffice headless, then rasterize."""
    try:
        result = subprocess.run(
            ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", output_dir, docx_path],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode != 0:
            return {"error": f"LibreOffice conversion failed: {result.stderr[:500]}"}
        base = os.path.splitext(os.path.basename(docx_path))[0]
        pdf_path = os.path.join(output_dir, base + ".pdf")
        if not os.path.exists(pdf_path):
            pdfs = [f for f in os.listdir(output_dir) if f.endswith(".pdf")]
            if pdfs:
                pdf_path = os.path.join(output_dir, pdfs[0])
            else:
                return {"error": "LibreOffice did not produce a PDF file"}
        return rasterize_pdf_cmyk(pdf_path, output_dir, dpi)
    except subprocess.TimeoutExpired:
        return {"error": "LibreOffice conversion timed out"}
    except Exception as e:
        return {"error": f"DOCX rasterization failed: {e}"}


def rasterize_eps(eps_path, output_dir, dpi=150):
    """Convert EPS to PNG via PIL/Pillow."""
    try:
        img = Image.open(eps_path)
        img.load(scale=dpi // 72)
        out_path = os.path.join(output_dir, "page_0001.png")
        img.save(out_path, "PNG")
        return [{"page": 1, "path": out_path}]
    except Exception:
        return rasterize_docx(eps_path, output_dir, dpi)


def rasterize_image(image_path, output_dir):
    """Copy/convert raster image (JPEG, PNG, TIFF) to PNG."""
    try:
        img = Image.open(image_path)
        out_path = os.path.join(output_dir, "page_0001.png")
        img.save(out_path, "PNG")
        return [{"page": 1, "path": out_path}]
    except Exception as e:
        return {"error": f"Image conversion failed: {e}"}


def rasterize(input_path, output_dir, dpi=150):
    ext = os.path.splitext(input_path)[1].lower()
    os.makedirs(output_dir, exist_ok=True)

    if ext == ".pdf":
        return rasterize_pdf_cmyk(input_path, output_dir, dpi)
    elif ext in (".docx", ".doc"):
        return rasterize_docx(input_path, output_dir, dpi)
    elif ext == ".eps":
        return rasterize_eps(input_path, output_dir, dpi)
    elif ext in (".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp", ".webp"):
        return rasterize_image(input_path, output_dir)
    else:
        return {"error": f"Unsupported file type: {ext}"}


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: rasterize.py <input_file> <output_dir> [dpi]"}))
        sys.exit(1)

    input_file = sys.argv[1]
    output_directory = sys.argv[2]
    dpi_val = int(sys.argv[3]) if len(sys.argv) > 3 else 150

    if not os.path.exists(input_file):
        print(json.dumps({"error": f"File not found: {input_file}"}))
        sys.exit(1)

    result = rasterize(input_file, output_directory, dpi_val)
    print(json.dumps(result))
