import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Export an HTML element to a multi-page A4 PDF with proper pagination.
 * Uses PNG format and high scale for crisp stamps/signatures.
 */
export const exportElementToPDF = async (
  element: HTMLElement,
  filename: string
): Promise<void> => {
  // Clone element and force A4 width (794px = 210mm at 96dpi) for consistent layout
  const clone = element.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, {
    position: "absolute",
    left: "-9999px",
    top: "0",
    width: "794px",
    maxWidth: "794px",
    minWidth: "794px",
    backgroundColor: "#ffffff",
  });
  document.body.appendChild(clone);

  const canvas = await html2canvas(clone, {
    scale: 3,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
  });

  document.body.removeChild(clone);

  const imgData = canvas.toDataURL("image/png");

  // A4 dimensions in mm
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2;

  // Calculate total image height in mm (proportional to content width)
  const totalImgHeightMm = (canvas.height * contentWidth) / canvas.width;

  // If content fits in one page, use single page
  if (totalImgHeightMm <= contentHeight) {
    const pdf = new jsPDF("p", "mm", "a4");
    pdf.addImage(imgData, "PNG", margin, margin, contentWidth, totalImgHeightMm);
    pdf.save(filename);
    return;
  }

  // Multi-page: crop canvas into page-sized chunks
  const pdf = new jsPDF("p", "mm", "a4");
  const pxPerMm = canvas.width / contentWidth;
  const pageContentHeightPx = contentHeight * pxPerMm;
  const totalPages = Math.ceil(canvas.height / pageContentHeightPx);

  for (let i = 0; i < totalPages; i++) {
    if (i > 0) pdf.addPage();

    const sourceY = i * pageContentHeightPx;
    const sourceH = Math.min(pageContentHeightPx, canvas.height - sourceY);
    const destH = sourceH / pxPerMm;

    // Create a temporary canvas for this page slice
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sourceH;
    const ctx = pageCanvas.getContext("2d");
    if (!ctx) continue;

    ctx.drawImage(
      canvas,
      0, sourceY, canvas.width, sourceH,
      0, 0, canvas.width, sourceH
    );

    const pageImgData = pageCanvas.toDataURL("image/png");
    pdf.addImage(pageImgData, "PNG", margin, margin, contentWidth, destH);
  }

  pdf.save(filename);
};
