import archiver from "archiver";
import { PassThrough } from "node:stream";

export type XlsxCell =
  | { type: "text"; value?: string | null }
  | { type: "number"; value?: number | string | null }
  | { type: "date"; value?: string | null };

export type ContractWorkbookOptions = {
  title: string;
  propertyLabel: string;
  exportedAt: Date;
  headers: string[];
  rows: XlsxCell[][];
};

const contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function createContractWorkbook(options: ContractWorkbookOptions) {
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(chunk));

  const completed = new Promise<Buffer>((resolve, reject) => {
    output.on("end", () => resolve(Buffer.concat(chunks)));
    output.on("error", reject);
  });

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (error) => output.destroy(error));
  archive.pipe(output);

  const lastColumn = columnName(options.headers.length);
  const headerRow = 6;
  const lastRow = headerRow + options.rows.length;
  const tableEndRow = Math.max(headerRow, lastRow);

  appendXml(archive, "[Content_Types].xml", contentTypesXml());
  appendXml(archive, "_rels/.rels", rootRelationshipsXml());
  appendXml(archive, "docProps/app.xml", appPropertiesXml());
  appendXml(archive, "docProps/core.xml", corePropertiesXml(options.exportedAt));
  appendXml(archive, "xl/workbook.xml", workbookXml());
  appendXml(archive, "xl/_rels/workbook.xml.rels", workbookRelationshipsXml());
  appendXml(archive, "xl/styles.xml", stylesXml());
  appendXml(archive, "xl/worksheets/sheet1.xml", worksheetXml(options, lastColumn, headerRow, lastRow));
  appendXml(archive, "xl/worksheets/_rels/sheet1.xml.rels", sheetRelationshipsXml());
  appendXml(archive, "xl/tables/table1.xml", tableXml(options.headers, lastColumn, headerRow, tableEndRow));

  await archive.finalize();
  return completed;
}

export function xlsxResponse(buffer: Buffer, filename: string) {
  const safeName = sanitizeFilename(filename).replace(/\.xlsx$/i, "") + ".xlsx";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

export function sanitizeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._ ]+|[._ ]+$/g, "")
    .slice(0, 140) || "export";
}

function appendXml(archive: archiver.Archiver, path: string, xml: string) {
  archive.append(xml, { name: path });
}

function worksheetXml(options: ContractWorkbookOptions, lastColumn: string, headerRow: number, lastRow: number) {
  const widths = [6, 24, 16, 38, 12, 18, 15, 15, 20, 18];
  const summary = [
    `<row r="1" ht="28" customHeight="1">${inlineCell("A1", options.title, 1)}</row>`,
    `<row r="2">${inlineCell("A2", `Tòa nhà: ${options.propertyLabel}`, 2)}</row>`,
    `<row r="3">${inlineCell("A3", `Ngày xuất: ${formatVietnameseDate(options.exportedAt)}`, 2)}</row>`,
    `<row r="4">${inlineCell("A4", `Tổng số hợp đồng: ${options.rows.length}`, 2)}</row>`,
  ];
  const header = `<row r="${headerRow}" ht="30" customHeight="1">${options.headers.map((value, index) => inlineCell(`${columnName(index + 1)}${headerRow}`, value, 8)).join("")}</row>`;
  const dataRows = options.rows.map((row, rowIndex) => {
    const rowNumber = headerRow + rowIndex + 1;
    return `<row r="${rowNumber}" ht="22" customHeight="1">${row.map((cell, columnIndex) => cellXml(`${columnName(columnIndex + 1)}${rowNumber}`, cell, columnIndex)).join("")}</row>`;
  });

  return xml(`
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${lastColumn}${Math.max(headerRow, lastRow)}"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${headerRow + 1}" sqref="A${headerRow + 1}"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>
  <sheetData>${summary.join("")}<row r="5" ht="8" customHeight="1"/>${header}${dataRows.join("")}</sheetData>
  <mergeCells count="4"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/><mergeCell ref="A3:${lastColumn}3"/><mergeCell ref="A4:${lastColumn}4"/></mergeCells>
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
  <tableParts count="1"><tablePart r:id="rId1"/></tableParts>
</worksheet>`);
}

function cellXml(reference: string, cell: XlsxCell, columnIndex: number) {
  if (cell.type === "number") {
    if (cell.value === null || cell.value === undefined || cell.value === "") return `<c r="${reference}" s="6"/>`;
    const value = Number(cell.value);
    return Number.isFinite(value) ? `<c r="${reference}" s="6"><v>${value}</v></c>` : `<c r="${reference}" s="6"/>`;
  }
  if (cell.type === "date") {
    const serial = excelDateSerial(cell.value);
    return serial === null ? `<c r="${reference}" s="5"/>` : `<c r="${reference}" s="5"><v>${serial}</v></c>`;
  }
  const style = columnIndex === 0 ? 7 : columnIndex === 2 ? 4 : 3;
  return inlineCell(reference, cell.value ?? "", style);
}

function inlineCell(reference: string, value: string, style: number) {
  const preserve = /^\s|\s$/.test(value) ? ' xml:space="preserve"' : "";
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t${preserve}>${escapeXml(value)}</t></is></c>`;
}

function excelDateSerial(value?: string | null) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return timestamp / 86_400_000 + 25_569;
}

function tableXml(headers: string[], lastColumn: string, headerRow: number, lastRow: number) {
  const reference = `A${headerRow}:${lastColumn}${lastRow}`;
  return xml(`
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="HopDongThueTable" displayName="HopDongThueTable" ref="${reference}" totalsRowShown="0">
  <autoFilter ref="${reference}"/>
  <tableColumns count="${headers.length}">${headers.map((header, index) => `<tableColumn id="${index + 1}" name="${escapeXml(header)}"/>`).join("")}</tableColumns>
  <tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/>
</table>`);
}

function stylesXml() {
  const thinBorder = '<border><left style="thin"><color rgb="FFD9C7B5"/></left><right style="thin"><color rgb="FFD9C7B5"/></right><top style="thin"><color rgb="FFD9C7B5"/></top><bottom style="thin"><color rgb="FFD9C7B5"/></bottom><diagonal/></border>';
  return xml(`
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0 [$₫-vi-VN]"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
  <fonts count="4"><font><sz val="11"/><name val="Aptos"/><family val="2"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font><font><b/><sz val="11"/><color rgb="FF4D3422"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>
  <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF744722"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8EAD7"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${thinBorder}</borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`);
}

function contentTypesXml() { return xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`); }
function rootRelationshipsXml() { return xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`); }
function workbookXml() { return xml(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Hợp đồng thuê" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>`); }
function workbookRelationshipsXml() { return xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`); }
function sheetRelationshipsXml() { return xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/></Relationships>`); }
function appPropertiesXml() { return xml(`<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>KimLan.group</Application></Properties>`); }
function corePropertiesXml(date: Date) { const iso = date.toISOString(); return xml(`<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>KimLan.group</dc:creator><cp:lastModifiedBy>KimLan.group</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`); }
function formatVietnameseDate(date: Date) { return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(date); }
function columnName(index: number) { let result = ""; for (let value = index; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + ((value - 1) % 26)) + result; return result; }
function escapeXml(value: string) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function xml(body: string) { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body.trim()}`; }
