"use client";

/**
 * AnnotatorModal — minimal screenshot annotation surface (v2.0.0 #7).
 *
 * Native HTML5 Canvas, zero deps. The full screen modal loads the source
 * evidence onto a canvas, draws operator markup (rectangle, free-pencil,
 * arrow, text) on top, and exports a PNG via `canvas.toBlob()`. The
 * exported PNG POSTs to `/api/engagements/:id/evidence` with
 * `parentEvidenceId` set to the source row's id — so the original
 * survives untouched and the gallery records provenance.
 *
 * Tool palette is intentionally tiny: pentest screenshots usually need
 * a box around something, an arrow pointing at it, and a one-line label.
 * If the operator wants tldraw-grade richness later, this stays as the
 * fallback path.
 */

import { useEffect, useRef, useState } from "react";
import { Square, Pencil, Type, ArrowRight, Undo2, Save, X } from "lucide-react";
import { toast } from "sonner";

type Tool = "rect" | "pencil" | "arrow" | "text";

interface Stroke {
  tool: Tool;
  color: string;
  // Each tool packs its own minimal vertex list:
  //   rect / arrow → [start, end]
  //   pencil       → list of pointer-move points
  //   text         → [position] + body text
  points: Array<{ x: number; y: number }>;
  text?: string;
}

interface Props {
  engagementId: number;
  evidenceId: number;
  filename: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (newEvidenceId: number) => void;
}

const COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#fafafa"];
const STROKE_WIDTH = 3;

export function AnnotatorModal({
  engagementId,
  evidenceId,
  filename,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>("rect");
  const [color, setColor] = useState<string>(COLORS[0]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [active, setActive] = useState<Stroke | null>(null);
  const [pending, setPending] = useState(false);
  // Loaded image natural dimensions — used to keep the canvas at the
  // exact source resolution so the saved PNG isn't down-rezzed.
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(
    null,
  );

  // Load the source image once on open. Reload on evidence change to
  // support "annotate next" without a remount.
  useEffect(() => {
    if (!open) return;
    setStrokes([]);
    setActive(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = `/api/engagements/${engagementId}/evidence/${evidenceId}/raw`;
    img.onload = () => {
      imageRef.current = img;
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      toast.error("Failed to load source image.");
      onOpenChange(false);
    };
  }, [open, engagementId, evidenceId, onOpenChange]);

  // Re-draw on any state change. Cheap because canvas is just one
  // image blit + N stroke replays at single-user scale.
  useEffect(() => {
    const cnv = canvasRef.current;
    const img = imageRef.current;
    if (!cnv || !img || !imgSize) return;
    const ctx = cnv.getContext("2d");
    if (!ctx) return;
    cnv.width = imgSize.w;
    cnv.height = imgSize.h;
    ctx.drawImage(img, 0, 0);
    const all = active ? [...strokes, active] : strokes;
    for (const s of all) drawStroke(ctx, s);
  }, [strokes, active, imgSize]);

  function eventPoint(ev: React.PointerEvent<HTMLCanvasElement>): {
    x: number;
    y: number;
  } {
    const cnv = canvasRef.current!;
    const rect = cnv.getBoundingClientRect();
    const sx = cnv.width / rect.width;
    const sy = cnv.height / rect.height;
    return {
      x: (ev.clientX - rect.left) * sx,
      y: (ev.clientY - rect.top) * sy,
    };
  }

  function onPointerDown(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (pending) return;
    const p = eventPoint(ev);
    if (tool === "text") {
      const body = window.prompt("Label text", "");
      if (!body) return;
      setStrokes((prev) => [
        ...prev,
        { tool: "text", color, points: [p], text: body },
      ]);
      return;
    }
    setActive({ tool, color, points: [p] });
    canvasRef.current?.setPointerCapture(ev.pointerId);
  }

  function onPointerMove(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (!active) return;
    const p = eventPoint(ev);
    if (active.tool === "pencil") {
      setActive({ ...active, points: [...active.points, p] });
    } else {
      setActive({
        ...active,
        points: [active.points[0], p],
      });
    }
  }

  function onPointerUp(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (!active) return;
    canvasRef.current?.releasePointerCapture(ev.pointerId);
    setStrokes((prev) => [...prev, active]);
    setActive(null);
  }

  function undo() {
    setStrokes((prev) => prev.slice(0, -1));
  }

  async function save() {
    const cnv = canvasRef.current;
    if (!cnv) return;
    setPending(true);
    try {
      const blob: Blob = await new Promise((resolve, reject) => {
        cnv.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
          "image/png",
        );
      });
      const fd = new FormData();
      // Suffix the source filename so the gallery row is recognisable.
      const baseName = filename.replace(/\.(png|jpe?g|gif|webp)$/i, "");
      fd.set(
        "file",
        new File([blob], `${baseName}.annotated.png`, { type: "image/png" }),
      );
      fd.set("parentEvidenceId", String(evidenceId));
      const res = await fetch(`/api/engagements/${engagementId}/evidence`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(err.error ?? "Save failed.");
        return;
      }
      const payload = (await res.json().catch(() => ({}))) as {
        evidence?: { id: number };
      };
      toast.success("Annotated screenshot saved.");
      onOpenChange(false);
      if (payload.evidence?.id && onSaved) onSaved(payload.evidence.id);
    } catch {
      toast.error("Save failed.");
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: "var(--bg-1)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span
          className="mono uppercase tracking-[0.08em]"
          style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}
        >
          ANNOTATE
        </span>
        <span
          className="mono truncate"
          style={{
            fontSize: 12,
            color: "var(--fg-muted)",
            maxWidth: 360,
            marginRight: 16,
          }}
        >
          {filename}
        </span>
        <ToolButton
          icon={<Square size={13} />}
          label="Box"
          active={tool === "rect"}
          onClick={() => setTool("rect")}
        />
        <ToolButton
          icon={<ArrowRight size={13} />}
          label="Arrow"
          active={tool === "arrow"}
          onClick={() => setTool("arrow")}
        />
        <ToolButton
          icon={<Pencil size={13} />}
          label="Pencil"
          active={tool === "pencil"}
          onClick={() => setTool("pencil")}
        />
        <ToolButton
          icon={<Type size={13} />}
          label="Text"
          active={tool === "text"}
          onClick={() => setTool("text")}
        />
        <div style={{ width: 1, height: 20, background: "var(--border)" }} />
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Color ${c}`}
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: c,
              border:
                color === c ? "2px solid var(--fg)" : "1px solid var(--border)",
              cursor: "pointer",
            }}
          />
        ))}
        <div style={{ flex: 1 }} />
        <ToolButton
          icon={<Undo2 size={13} />}
          label={`Undo${strokes.length > 0 ? ` (${strokes.length})` : ""}`}
          onClick={undo}
          disabled={strokes.length === 0 || pending}
        />
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={pending}
          className="inline-flex items-center gap-1.5"
          style={{
            padding: "5px 10px",
            borderRadius: 5,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--fg-muted)",
            fontSize: 12,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          <X size={12} />
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={pending}
          className="inline-flex items-center gap-1.5"
          style={{
            padding: "5px 12px",
            borderRadius: 5,
            border: "1px solid var(--accent)",
            background: "var(--accent)",
            color: "#05170d",
            fontSize: 12,
            fontWeight: 600,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          <Save size={12} />
          {pending ? "Saving…" : "Save annotated"}
        </button>
      </div>

      {/* Canvas viewport */}
      <div
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          padding: 20,
          overflow: "auto",
        }}
      >
        {imgSize ? (
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              background: "#000",
              cursor: tool === "text" ? "text" : "crosshair",
              touchAction: "none",
            }}
          />
        ) : (
          <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>
            Loading image…
          </span>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="inline-flex items-center gap-1.5"
      style={{
        padding: "5px 10px",
        borderRadius: 5,
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "var(--bg-3)" : "transparent",
        color: active ? "var(--accent)" : "var(--fg-muted)",
        fontSize: 11.5,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  s: Stroke,
): void {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (s.tool === "rect") {
    if (s.points.length < 2) return ctx.restore();
    const [a, b] = s.points;
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  } else if (s.tool === "pencil") {
    if (s.points.length < 2) return ctx.restore();
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (const p of s.points.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  } else if (s.tool === "arrow") {
    if (s.points.length < 2) return ctx.restore();
    const [a, b] = s.points;
    drawArrow(ctx, a.x, a.y, b.x, b.y);
  } else if (s.tool === "text") {
    if (!s.text || s.points.length < 1) return ctx.restore();
    const [p] = s.points;
    const fontSize = 22;
    ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    // Translucent backdrop so the label stays readable on busy
    // screenshots.
    const m = ctx.measureText(s.text);
    const padX = 6;
    const padY = 4;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(
      p.x - padX,
      p.y - fontSize - padY,
      m.width + padX * 2,
      fontSize + padY * 2,
    );
    ctx.fillStyle = s.color;
    ctx.fillText(s.text, p.x, p.y);
  }
  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const headLen = 14;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 6),
    y2 - headLen * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 6),
    y2 - headLen * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
}
