import { useTemplateSettings } from "@/hooks/useTemplateSettings";

interface Props {
  show: boolean;
  sellerRep?: string;
  sellerPos?: string;
}

export const OnlineStampSignature = ({ show, sellerRep, sellerPos }: Props) => {
  const { settings } = useTemplateSettings();

  if (!show) return null;

  const hasStamp = !!settings.stampUrl;
  const hasSignature = !!settings.signatureUrl;

  if (!hasStamp && !hasSignature) {
    return <div style={{ height: 80 }}></div>;
  }

  return (
    <>
      <div className="relative" style={{ height: 120, width: "100%" }}>
        {hasStamp && (
          <img
            src={settings.stampUrl}
            alt="Con dấu"
            className="absolute"
            style={{ left: "15%", top: "50%", transform: "translateY(-50%)", width: 120, height: 120, opacity: 0.85, objectFit: "contain" }}
          />
        )}
        {hasSignature && (
          <img
            src={settings.signatureUrl}
            alt="Chữ ký"
            className="absolute"
            style={{ left: "35%", top: "45%", transform: "translateY(-50%)", width: 100, height: 70, opacity: 0.9, objectFit: "contain" }}
          />
        )}
      </div>
      {sellerRep && (
        <p className="font-bold" style={{ textDecoration: "underline" }}>{sellerRep}</p>
      )}
      {sellerPos && (
        <p className="text-xs italic">{sellerPos}</p>
      )}
    </>
  );
};
