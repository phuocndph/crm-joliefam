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

  if (!hasStamp && !hasSignature) return null;

  return (
    <div className="relative" style={{ height: 100, width: "100%" }}>
      {hasStamp && (
        <img
          src={settings.stampUrl}
          alt="Con dấu"
          className="absolute"
          style={{ left: "50%", top: "50%", transform: "translate(-60%, -50%)", width: 110, height: 110, opacity: 0.85, objectFit: "contain" }}
        />
      )}
      {hasSignature && (
        <img
          src={settings.signatureUrl}
          alt="Chữ ký"
          className="absolute"
          style={{ left: "50%", top: "50%", transform: "translate(-40%, -45%)", width: 90, height: 60, opacity: 0.9, objectFit: "contain" }}
        />
      )}
    </div>
  );
};
