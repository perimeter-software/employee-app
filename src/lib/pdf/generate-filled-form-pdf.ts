/**
 * Generate a filled PDF from a dynamic form template + form values.
 * Replicates sp1-api GeminiController.generateFilledPdfForApplicant logic.
 */

import fs from 'fs/promises';
import path from 'path';
import { PDFDocument, rgb, StandardFonts, type PDFPage } from 'pdf-lib';

/** Form document from DB (subset we need) */
export interface FormForPdf {
  name?: string;
  filePath?: string;
  formData?: {
    form?: {
      sections?: Array<{
        rows?: Array<{
          columns?: Array<{
            id: string;
            type?: string;
            hidden?: boolean;
            position?: {
              page?: number;
              x?: number;
              y?: number;
              width?: number;
              height?: number;
              boundingBox?: number[][];
            };
            options?: string[];
          }>;
        }>;
      }>;
    };
  };
  metadata?: { shortName?: string };
}

/** Employee/applicant subset for PDF (name + optional signature) */
export interface EmployeeForPdf {
  _id: string;
  firstName?: string;
  lastName?: string;
  i9Form?: { signature?: string };
}

export interface GenerateFilledFormPdfOptions {
  /** Base path for resolving relative form.filePath and writing output (e.g. UPLOAD_PATH or cwd/public/uploads) */
  uploadBasePath: string;
  /** Company path segment (e.g. company.uploadPath or 'sp') for output dir */
  companyPathSegment: string;
  /** If set, try to load signature image from this dir for signature fields (e.g. applicants/:id/signature/) */
  signatureBasePath?: string;
}

export interface GenerateFilledFormPdfResult {
  filledPdfBytes: Uint8Array;
  fileName: string;
  /** Suggested relative path for storage (e.g. applicants/:id/:shortName/:fileName) */
  relativePath: string;
}

/**
 * Sanitize a path segment to prevent path traversal (alphanumeric, dash, underscore only).
 */
function sanitizePathSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, '') || 'unknown';
}

/**
 * Resolve the template PDF path: form.filePath can be absolute or relative to uploadBasePath.
 */
function resolvePdfPath(formFilePath: string, uploadBasePath: string): string {
  if (path.isAbsolute(formFilePath)) return formFilePath;
  return path.join(uploadBasePath, formFilePath);
}

/**
 * Generate filled PDF bytes from form template and form values.
 * Matches sp1 draw logic: text, checkbox, radio, signature (text fallback if no image).
 */
export async function generateFilledFormPdf(
  form: FormForPdf,
  employee: EmployeeForPdf,
  formValues: Record<string, unknown>,
  options: GenerateFilledFormPdfOptions
): Promise<GenerateFilledFormPdfResult> {
  const formData = form.formData?.form;
  const pdfPath = form.filePath;
  if (!formData?.sections) {
    throw new Error('Form data or sections not found');
  }
  if (!pdfPath) {
    throw new Error('PDF file path not found for form');
  }

  const uploadBasePath = options.uploadBasePath || path.join(process.cwd(), 'public', 'uploads');
  const resolvedPdfPath = resolvePdfPath(pdfPath, uploadBasePath);

  let pdfBytes: Buffer;
  try {
    pdfBytes = await fs.readFile(resolvedPdfPath);
  } catch (e) {
    throw new Error(`PDF file not found at ${resolvedPdfPath}: ${(e as Error).message}`);
  }

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const standardFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const symbolFont = await pdfDoc.embedFont(StandardFonts.ZapfDingbats);
  const fontSize = 10;

  const drawFieldValue = async (
    pagesList: PDFPage[],
    field: {
      id: string;
      type?: string;
      position?: {
        page?: number;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        boundingBox?: number[][];
      };
      options?: string[];
    },
    value: unknown
  ): Promise<void> => {
    if (!field.position) return;
    const position = field.position;
    const pageIndex = Math.max(0, (position.page ?? 1) - 1);
    if (!pagesList[pageIndex]) return;

    const currentPage = pagesList[pageIndex];
    const pageWidth = currentPage.getWidth();
    const pageHeight = currentPage.getHeight();

    let x: number, y: number, width: number, height: number;
    if (position.boundingBox && Array.isArray(position.boundingBox)) {
      const boundingBox = position.boundingBox.map((point) => [
        point[0] * pageWidth,
        point[1] * pageHeight,
      ]) as [number[], number[], number[]];
      x = boundingBox[0][0];
      y = boundingBox[0][1];
      width = Math.abs(boundingBox[1][0] - boundingBox[0][0]);
      height = Math.abs(boundingBox[2][1] - boundingBox[1][1]);
    } else if (
      typeof position.x === 'number' &&
      typeof position.y === 'number' &&
      typeof position.width === 'number' &&
      typeof position.height === 'number'
    ) {
      x = position.x * pageWidth;
      y = position.y * pageHeight;
      width = position.width * pageWidth;
      height = position.height * pageHeight;
    } else {
      return;
    }

    // Signature: optional image from disk (sp1 uses applicant i9Form.signature); else draw text
    if (field.type === 'signature' && options.signatureBasePath && employee.i9Form?.signature) {
      const sigPath = path.join(
        options.signatureBasePath,
        employee._id,
        'signature',
        employee.i9Form.signature
      );
      try {
        await fs.access(sigPath);
        const sigBytes = await fs.readFile(sigPath);
        const ext = path.extname(employee.i9Form.signature).toLowerCase();
        let img;
        if (ext === '.png') img = await pdfDoc.embedPng(sigBytes);
        else if (['.jpg', '.jpeg'].includes(ext)) img = await pdfDoc.embedJpg(sigBytes);
        if (img) {
          const dims = img.scale(1);
          const scale = Math.min(width / dims.width, height / dims.height, 1);
          const sw = dims.width * scale;
          const sh = dims.height * scale;
          const drawX = x + (width - sw) / 2;
          const drawY = pageHeight - y - (height + sh) / 2;
          currentPage.drawImage(img, { x: drawX, y: drawY, width: sw, height: sh });
          return;
        }
      } catch {
        // fall through to text
      }
    }

    let drawX: number, drawY: number;
    let textAlign: 'left' | 'center' | 'right' = 'left';
    let finalFontSize: number;
    finalFontSize = Math.min(fontSize, height * 0.7);
    if (finalFontSize < 6) finalFontSize = 6;

    if (field.type === 'checkbox' || field.type === 'radio') {
      drawX = x + width / 2;
      drawY = pageHeight - y - height / 2;
      textAlign = 'center';
      finalFontSize = Math.min(width, height) * 0.7;
    } else if (field.type === 'select' || field.type === 'dropdown') {
      drawX = x + 2;
      drawY = pageHeight - y - height / 2 + finalFontSize / 4;
      textAlign = 'left';
    } else {
      drawX = x + 2;
      drawY =
        height <= finalFontSize * 1.5
          ? pageHeight - y - height / 2 + finalFontSize / 4
          : pageHeight - y - finalFontSize - 2;
      textAlign = 'left';
    }

    if (field.type === 'checkbox' && value === true) {
      const checkSymbol = '✓';
      const symbolSize = Math.min(width, height) * 0.7;
      currentPage.drawText(checkSymbol, {
        x: drawX - symbolSize / 4,
        y: drawY - symbolSize / 4,
        size: symbolSize,
        font: symbolFont,
        color: rgb(0, 0, 0),
      });
    } else if (field.type === 'radio' && value && field.options?.includes(String(value))) {
      const bulletSymbol = '●';
      const symbolSize = Math.min(width, height) * 0.6;
      currentPage.drawText(bulletSymbol, {
        x: drawX - symbolSize / 4,
        y: drawY - symbolSize / 4,
        size: symbolSize,
        font: symbolFont,
        color: rgb(0, 0, 0),
      });
    } else if (value !== undefined && value !== null && value !== '') {
      const textValue = String(value);
      const textWidth = standardFont.widthOfTextAtSize(textValue, finalFontSize);
      let adjustedX = drawX;
      if (textAlign === 'center') adjustedX = x + width / 2 - textWidth / 2;
      else if (textAlign === 'right') adjustedX = x + width - textWidth - 2;
      const availableWidth = width - 4;
      const textFits = textWidth <= availableWidth;
      currentPage.drawText(textValue, {
        x: adjustedX,
        y: drawY,
        size: finalFontSize,
        font: standardFont,
        color: rgb(0, 0, 0),
        maxWidth: textFits ? undefined : availableWidth,
      });
    }
  };

  for (const section of formData.sections) {
    if (!section.rows) continue;
    for (const row of section.rows) {
      if (!row.columns) continue;
      for (const field of row.columns) {
        if (field.hidden) continue;
        const value = formValues[field.id];
        await drawFieldValue(pages, field, value);
      }
    }
  }

  const filledPdfBytes = await pdfDoc.save();
  const formShortName =
    (form.metadata?.shortName as string) || (form as { shortName?: string }).shortName || 'form';
  const firstName = employee.firstName || 'Unnamed';
  const lastName = employee.lastName || 'Applicant';
  const safeFirst = sanitizePathSegment(firstName);
  const safeLast = sanitizePathSegment(lastName);
  const fileName = `${safeFirst}-${safeLast}-${sanitizePathSegment(formShortName)}.pdf`;
  const relativePath = `applicants/${employee._id}/${formShortName}/${fileName}`;

  return {
    filledPdfBytes,
    fileName,
    relativePath,
  };
}

/**
 * Write the filled PDF to disk and return the path and attachment record for applicant.attachments.
 */
export async function writeFilledPdfAndBuildAttachment(
  form: FormForPdf,
  employee: EmployeeForPdf,
  formValues: Record<string, unknown>,
  options: GenerateFilledFormPdfOptions
): Promise<{ filePath: string; attachment: { title: string; type: string; docType: string; filename: string; uploadDate: Date; path?: string } }> {
  const result = await generateFilledFormPdf(form, employee, formValues, options);
  const uploadBasePath = options.uploadBasePath || path.join(process.cwd(), 'public', 'uploads');
  const companySegment = sanitizePathSegment(options.companyPathSegment || 'sp');
  const formShortName =
    (form.metadata?.shortName as string) || (form as { shortName?: string }).shortName || 'form';
  const dirPath = path.join(uploadBasePath, companySegment, 'applicants', employee._id, formShortName);
  await fs.mkdir(dirPath, { recursive: true });
  const filePath = path.join(dirPath, result.fileName);
  await fs.writeFile(filePath, Buffer.from(result.filledPdfBytes));

  const formName = form.name || 'Form';
  const attachment = {
    title: `${formName} Form`,
    type: formShortName,
    docType: 'pdf',
    filename: result.fileName,
    uploadDate: new Date(),
    path: result.relativePath,
    hidden: 'Yes',
  };
  return { filePath, attachment };
}
