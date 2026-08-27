import { useState, useRef, useCallback, useEffect } from "react";
import { useTemplateSettings } from "@/hooks/useTemplateSettings";
import { Button } from "@/components/ui/button";
import { Save, Move, Maximize2 } from "lucide-react";
import { toast } from "sonner";

export interface StampSignaturePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  show: boolean;
  sellerRep?: string;
  sellerPos?: string;
  editable?: boolean;
}

const DEFAULT_STAMP: StampSignaturePosition = { x: 5, y: 50, width: 160, height: 160 };
const DEFAULT_SIG: StampSignaturePosition = { x: 30, y: 45, width: 140, height: 100 };

export const OnlineStampSignature = ({ show, sellerRep, sellerPos, editable = false }: Props) => {
  const { settings, saveSettings } = useTemplateSettings();
  const [stampPos, setStampPos] = useState<StampSignaturePosition>(DEFAULT_STAMP);
  const [sigPos, setSigPos] = useState<StampSignaturePosition>(DEFAULT_SIG);
  const [dragging, setDragging] = useState<"stamp" | "sig" | null>(null);
  const [resizing, setResizing] = useState<"stamp" | "sig" | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (settings.stampPosition) setStampPos(settings.stampPosition);
    if (settings.signaturePosition) setSigPos(settings.signaturePosition);
  }, [settings.stampPosition, settings.signaturePosition]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    if (dragging) {
      const dxPct = (dx / rect.width) * 100;
      const dyPct = (dy / rect.height) * 100;
      const setter = dragging === "stamp" ? setStampPos : setSigPos;
      setter(prev => ({
        ...prev,
        x: Math.max(0, Math.min(90, prev.x + dxPct)),
        y: Math.max(0, Math.min(90, prev.y + dyPct)),
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    }

    if (resizing) {
      const setter = resizing === "stamp" ? setStampPos : setSigPos;
      setter(prev => ({
        ...prev,
        width: Math.max(40, prev.width + dx),
        height: Math.max(30, prev.height + dy),
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  }, [dragging, resizing, dragStart]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
  }, []);

  useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragging, resizing, handleMouseMove, handleMouseUp]);

  if (!show) return null;

  const hasStamp = !!settings.stampUrl;
  const hasSignature = !!settings.signatureUrl;

  if (!hasStamp && !hasSignature) {
    return <div style={{ height: 80 }} />;
  }

  const handleMouseDown = (type: "stamp" | "sig", mode: "drag" | "resize", e: React.MouseEvent) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    if (mode === "drag") setDragging(type);
    else setResizing(type);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const success = await saveSettings({
        ...settings,
        stampPosition: stampPos,
        signaturePosition: sigPos,
      });
      if (success) toast.success("Đã lưu vị trí con dấu & chữ ký!");
      else toast.error("Lỗi khi lưu vị trí.");
    } finally {
      setSaving(false);
    }
  };

  const containerHeight = editable ? 220 : 160;

  return (
    <>
      <div
        ref={containerRef}
        className={`relative ${editable ? "border-2 border-dashed border-blue-300 bg-blue-50/30 rounded" : ""}`}
        style={{ height: containerHeight, width: "100%", userSelect: dragging || resizing ? "none" : "auto" }}
      >
        {editable && (
          <div className="absolute top-1 left-1 flex items-center gap-1 z-10">
            <span className="text-[10px] text-blue-500 bg-white/80 px-1 rounded">
              <Move className="w-3 h-3 inline mr-0.5" />Kéo thả &nbsp;
              <Maximize2 className="w-3 h-3 inline mr-0.5" />Resize góc
            </span>
          </div>
        )}

        {hasStamp && (
          <div
            className={`absolute ${editable ? "cursor-move ring-2 ring-blue-400 ring-dashed rounded" : ""}`}
            style={{
              left: `${stampPos.x}%`,
              top: `${stampPos.y}%`,
              transform: "translateY(-50%)",
              width: stampPos.width,
              height: stampPos.height,
            }}
            onMouseDown={(e) => handleMouseDown("stamp", "drag", e)}
          >
            <img
              src={settings.stampUrl}
              alt="Con dấu"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
              crossOrigin="anonymous"
              className="pointer-events-none"
              draggable={false}
            />
            {editable && (
              <div
                className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 rounded-tl cursor-se-resize"
                onMouseDown={(e) => handleMouseDown("stamp", "resize", e)}
              />
            )}
          </div>
        )}

        {hasSignature && (
          <div
            className={`absolute ${editable ? "cursor-move ring-2 ring-green-400 ring-dashed rounded" : ""}`}
            style={{
              left: `${sigPos.x}%`,
              top: `${sigPos.y}%`,
              transform: "translateY(-50%)",
              width: sigPos.width,
              height: sigPos.height,
            }}
            onMouseDown={(e) => handleMouseDown("sig", "drag", e)}
          >
            <img
              src={settings.signatureUrl}
              alt="Chữ ký"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
              crossOrigin="anonymous"
              className="pointer-events-none"
              draggable={false}
            />
            {editable && (
              <div
                className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-tl cursor-se-resize"
                onMouseDown={(e) => handleMouseDown("sig", "resize", e)}
              />
            )}
          </div>
        )}
      </div>

      {editable && (
        <div className="flex justify-center mt-2">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? "Đang lưu..." : "Lưu vị trí"}
          </Button>
        </div>
      )}

      {sellerRep && (
        <p className="font-bold" style={{ textDecoration: "underline" }}>{sellerRep}</p>
      )}
      {sellerPos && (
        <p className="text-xs italic">{sellerPos}</p>
      )}
    </>
  );
};
