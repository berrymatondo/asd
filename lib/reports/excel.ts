import ExcelJS from "exceljs";
import { fmtDate } from "@/lib/format";
import type { EventRow, ReportModel } from "./build";

// Palette (ARGB) alignée sur l’interface ASD
const C = {
  indigo: "FF4F46E5",
  indigoDark: "FF312E81",
  indigoLight: "FFEEF0FF",
  band: "FFF8F8FD",
  ink: "FF1B2941",
  muted: "FF68758A",
  border: "FFE3E6F0",
  white: "FFFFFFFF",
  goodBg: "FFD1FAE5",
  goodInk: "FF047857",
  midBg: "FFFEF3C7",
  midInk: "FFB45309",
  lowBg: "FFFEE2E2",
  lowInk: "FFB91C1C",
};

const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: C.border } };
const box: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

/** Couleur d’un taux de présence (la valeur reste toujours écrite dans la cellule). */
function rateStyle(cell: ExcelJS.Cell, rate: number | null) {
  if (rate == null) {
    cell.value = "—";
    cell.alignment = { horizontal: "center" };
    return;
  }
  cell.value = rate;
  cell.numFmt = "0%";
  const [bg, ink] = rate >= 0.75 ? [C.goodBg, C.goodInk] : rate >= 0.5 ? [C.midBg, C.midInk] : [C.lowBg, C.lowInk];
  cell.fill = fill(bg);
  cell.font = { bold: true, color: { argb: ink } };
  cell.alignment = { horizontal: "center" };
}

function newSheet(wb: ExcelJS.Workbook, name: string, widths: number[]) {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: C.indigo } },
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  return ws;
}

/** Bandeau de titre sur toute la largeur. Retourne la ligne suivante libre. */
function banner(ws: ExcelJS.Worksheet, m: ReportModel, title: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { size: 18, bold: true, color: { argb: C.white } };
  t.fill = fill(C.indigo);
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 34;

  ws.mergeCells(2, 1, 2, cols);
  const s = ws.getCell(2, 1);
  s.value = `${m.subtitle}  ·  ${m.scope}`;
  s.font = { size: 11, color: { argb: C.white } };
  s.fill = fill(C.indigoDark);
  s.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(2).height = 22;

  ws.mergeCells(3, 1, 3, cols);
  const g = ws.getCell(3, 1);
  g.value = `ASD · Faiseur de disciples — généré le ${m.generatedAt} par ${m.generatedBy}`;
  g.font = { size: 9, italic: true, color: { argb: C.muted } };
  g.alignment = { indent: 1 };
  return 5;
}

function section(ws: ExcelJS.Worksheet, row: number, text: string, cols: number) {
  ws.mergeCells(row, 1, row, cols);
  const c = ws.getCell(row, 1);
  c.value = text.toUpperCase();
  c.font = { bold: true, size: 11, color: { argb: C.indigo } };
  c.border = { bottom: { style: "medium", color: { argb: C.indigo } } };
  ws.getRow(row).height = 20;
  return row + 1;
}

function header(ws: ExcelJS.Worksheet, row: number, labels: string[]) {
  const r = ws.getRow(row);
  labels.forEach((l, i) => {
    const c = r.getCell(i + 1);
    c.value = l;
    c.font = { bold: true, color: { argb: C.white } };
    c.fill = fill(C.indigo);
    c.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", wrapText: true };
    c.border = box;
  });
  r.height = 24;
  return row + 1;
}

/** Ligne de données avec bandes alternées ; `rateCol` (1-based) reçoit la couleur du taux. */
function dataRow(ws: ExcelJS.Worksheet, row: number, values: (string | number | null)[], i: number, rateCol?: number, rate?: number | null) {
  const r = ws.getRow(row);
  values.forEach((v, j) => {
    const c = r.getCell(j + 1);
    c.value = v;
    c.border = box;
    c.font = { color: { argb: C.ink } };
    c.alignment = { vertical: "top", wrapText: true, horizontal: typeof v === "number" ? "center" : "left" };
    if (i % 2) c.fill = fill(C.band);
  });
  if (rateCol) rateStyle(r.getCell(rateCol), rate ?? null);
  return row + 1;
}

function kpiTiles(ws: ExcelJS.Worksheet, row: number, m: ReportModel) {
  // Chaque indicateur occupe 2 colonnes : libellé, valeur, précision
  m.kpis.forEach((k, i) => {
    const col = i * 2 + 1;
    const cells: [number, string | undefined, Partial<ExcelJS.Font>][] = [
      [row, k.label, { size: 9, bold: true, color: { argb: C.muted } }],
      [row + 1, k.value, { size: 20, bold: true, color: { argb: C.indigo } }],
      [row + 2, k.hint ?? "", { size: 9, color: { argb: C.muted } }],
    ];
    for (const [r, v, font] of cells) {
      ws.mergeCells(r, col, r, col + 1);
      const c = ws.getCell(r, col);
      c.value = v ?? "";
      c.font = font;
      c.fill = fill(C.indigoLight);
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
  });
  ws.getRow(row + 1).height = 30;
  return row + 4;
}

// ---------------- Feuilles ----------------

function summarySheet(wb: ExcelJS.Workbook, m: ReportModel) {
  const ws = newSheet(wb, "Synthèse", [24, 18, 12, 12, 14, 14, 14, 14, 14, 14]);
  let row = banner(ws, m, m.title, 10);
  row = kpiTiles(ws, row, m);

  row = section(ws, row, "Par groupe", 10);
  row = header(ws, row, ["Groupe", "Berger", "Membres", "Événements", "Présences", "Attendues", "Taux de présence", "Prières", "Exaucées", "Témoignages"]);
  m.byGroup.forEach((g, i) => {
    row = dataRow(ws, row, [g.group, g.shepherd, g.members, g.events, g.present, g.expected, null, g.prayers, g.answered, g.testimonies], i, 7, g.rate);
  });
  // Ligne de total
  const tot = (k: "events" | "present" | "expected" | "prayers" | "answered" | "testimonies") => m.byGroup.reduce((n, g) => n + g[k], 0);
  const totRow = ws.getRow(row);
  ["Total", "", "", tot("events"), tot("present"), tot("expected"), null, tot("prayers"), tot("answered"), tot("testimonies")].forEach((v, j) => {
    const c = totRow.getCell(j + 1);
    c.value = v;
    c.font = { bold: true, color: { argb: C.indigoDark } };
    c.fill = fill(C.indigoLight);
    c.border = { top: { style: "medium", color: { argb: C.indigo } } };
    c.alignment = { horizontal: j === 0 ? "left" : "center" };
  });
  rateStyle(totRow.getCell(7), tot("expected") ? tot("present") / tot("expected") : null);
  row += 2;

  if (m.byMonth.length) {
    row = section(ws, row, "Par mois", 10);
    row = header(ws, row, ["Mois", "Événements", "Taux de présence", "Prières", "Exaucées", "Témoignages"]);
    m.byMonth.forEach((mo, i) => {
      row = dataRow(ws, row, [mo.label, mo.events, null, mo.prayers, mo.answered, mo.testimonies], i, 3, mo.rate);
    });
  }
}

function eventsSheet(wb: ExcelJS.Workbook, m: ReportModel) {
  const ws = newSheet(wb, "Événements", [14, 14, 34, 11, 11, 14, 13, 70]);
  ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false };
  let row = banner(ws, m, "Détail des événements", 8);
  const head = row;
  row = header(ws, row, ["Date", "Horaire", "Événement", "Présents", "Attendus", "Taux", "Statut", "Synthèse"]);
  ws.views = [{ state: "frozen", ySplit: head, showGridLines: false }];

  // Regroupement par groupe : ligne de titre + lignes repliables (plan Excel)
  const byGroup = new Map<string, EventRow[]>();
  m.events.forEach((e) => byGroup.set(e.group, [...(byGroup.get(e.group) ?? []), e]));
  if (!m.events.length) {
    ws.getCell(row, 1).value = "Aucun événement sur la période.";
    ws.getCell(row, 1).font = { italic: true, color: { argb: C.muted } };
  }
  for (const [group, evs] of byGroup) {
    const present = evs.reduce((n, e) => n + e.present, 0);
    const expected = evs.reduce((n, e) => n + e.expected, 0);
    ws.mergeCells(row, 1, row, 3);
    const g = ws.getRow(row);
    g.getCell(1).value = `${group} — ${evs.length} événement${evs.length > 1 ? "s" : ""}`;
    [1, 4, 5, 6, 7, 8].forEach((j) => {
      g.getCell(j).fill = fill(C.indigoLight);
      g.getCell(j).font = { bold: true, color: { argb: C.indigoDark } };
    });
    g.getCell(4).value = present;
    g.getCell(5).value = expected;
    [4, 5].forEach((j) => (g.getCell(j).alignment = { horizontal: "center" }));
    rateStyle(g.getCell(6), expected ? present / expected : null);
    g.height = 20;
    row++;
    evs.forEach((e, i) => {
      row = dataRow(ws, row, [fmtDate(e.date), e.time, e.title, e.present, e.expected, null, e.locked ? "Verrouillé" : "Modifiable", e.summary || "—"], i, 6, e.rate);
      ws.getRow(row - 1).outlineLevel = 1;
    });
  }
}

function attendanceSheet(wb: ExcelJS.Workbook, m: ReportModel) {
  const events = m.events.slice(0, 150); // limite de lisibilité
  const ws = newSheet(wb, "Présences", [26, 18, ...events.map(() => 6), 10, 12]);
  ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false };
  const cols = events.length + 4;
  let row = banner(ws, m, "Matrice des présences", Math.max(cols, 6));
  const head = row;
  const r = ws.getRow(row);
  ["Membre", "Groupe", ...events.map((e) => `${fmtDate(e.date).slice(0, 5)}\n${e.title}`), "Présences", "Taux"].forEach((l, j) => {
    const c = r.getCell(j + 1);
    c.value = l;
    c.font = { bold: true, size: j >= 2 && j < events.length + 2 ? 8 : 11, color: { argb: C.white } };
    c.fill = fill(C.indigo);
    c.border = box;
    c.alignment =
      j >= 2 && j < events.length + 2 ? { textRotation: 90, horizontal: "center", vertical: "bottom", wrapText: true } : { vertical: "bottom", horizontal: "left" };
  });
  r.height = 110;
  row++;
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: head, showGridLines: false }];

  // Lignes regroupées par groupe du membre
  const byGroup = new Map<string, typeof m.members>();
  m.members.forEach((mm) => byGroup.set(mm.group, [...(byGroup.get(mm.group) ?? []), mm]));
  for (const [group, list] of byGroup) {
    ws.mergeCells(row, 1, row, 2);
    ws.getCell(row, 1).value = group;
    for (let j = 1; j <= cols; j++) {
      ws.getCell(row, j).fill = fill(C.indigoLight);
      ws.getCell(row, j).font = { bold: true, color: { argb: C.indigoDark } };
    }
    row++;
    list.forEach((mm, i) => {
      const line = ws.getRow(row);
      line.outlineLevel = 1;
      line.getCell(1).value = mm.name;
      line.getCell(2).value = group;
      events.forEach((e, j) => {
        const c = line.getCell(j + 3);
        const a = e.attendees.find((x) => x.personId === mm.id);
        c.alignment = { horizontal: "center" };
        c.border = box;
        if (!a) {
          c.value = "";
          c.fill = fill("FFF1F2F6");
        } else if (a.present) {
          c.value = "✓";
          c.font = { bold: true, color: { argb: C.goodInk } };
          c.fill = fill(C.goodBg);
        } else {
          c.value = "✗";
          c.font = { color: { argb: C.lowInk } };
          c.fill = fill(C.lowBg);
        }
      });
      const pc = line.getCell(events.length + 3);
      pc.value = `${mm.present}/${mm.expected}`;
      pc.alignment = { horizontal: "center" };
      rateStyle(line.getCell(events.length + 4), mm.rate);
      [1, 2, events.length + 3].forEach((j) => {
        line.getCell(j).border = box;
        if (i % 2) line.getCell(j).fill = fill(C.band);
      });
      row++;
    });
  }
  row++;
  ws.getCell(row, 1).value = "✓ présent   ✗ absent   (case grise : non concerné)";
  ws.getCell(row, 1).font = { size: 9, italic: true, color: { argb: C.muted } };
}

function membersSheet(wb: ExcelJS.Workbook, m: ReportModel) {
  const ws = newSheet(wb, "Assiduité", [30, 22, 14, 14, 16]);
  let row = banner(ws, m, "Assiduité des membres", 5);
  const head = row;
  row = header(ws, row, ["Membre", "Groupe", "Événements attendus", "Présences", "Taux de présence"]);
  m.members.forEach((mm, i) => (row = dataRow(ws, row, [mm.name, mm.group, mm.expected, mm.present, null], i, 5, mm.rate)));
  ws.views = [{ state: "frozen", ySplit: head, showGridLines: false }];
  if (m.members.length) ws.autoFilter = { from: { row: head, column: 1 }, to: { row: row - 1, column: 5 } };
}

function listSheet(wb: ExcelJS.Workbook, m: ReportModel, kind: "prayers" | "testimonies") {
  const isPrayer = kind === "prayers";
  const ws = newSheet(wb, isPrayer ? "Prières" : "Témoignages", [13, 20, 22, 70, 18]);
  let row = banner(ws, m, isPrayer ? "Sujets de prière" : "Témoignages", 5);
  const head = row;
  row = header(ws, row, ["Date", "Auteur", "Groupe", "Description", isPrayer ? "Statut" : "Prière liée"]);
  const items = isPrayer ? m.prayers : m.testimonies;
  items.forEach((it, i) => {
    const ok = "answered" in it ? it.answered : it.linked;
    row = dataRow(ws, row, [fmtDate(it.date), it.author, it.group, it.desc, isPrayer ? (ok ? "Exaucée" : "En attente") : ok ? "Oui" : "Non"], i);
    const c = ws.getCell(row - 1, 5);
    c.fill = fill(ok ? C.goodBg : C.midBg);
    c.font = { bold: true, color: { argb: ok ? C.goodInk : C.midInk } };
    c.alignment = { horizontal: "center", vertical: "top" };
  });
  ws.views = [{ state: "frozen", ySplit: head, showGridLines: false }];
  if (items.length) ws.autoFilter = { from: { row: head, column: 1 }, to: { row: row - 1, column: 5 } };
}

function singleEventSheet(wb: ExcelJS.Workbook, m: ReportModel) {
  const e = m.events[0];
  const ws = newSheet(wb, "Événement", [30, 22, 16, 14, 14, 14, 14, 14, 14, 14]);
  let row = banner(ws, m, `Rapport d’événement — ${m.title}`, 10);
  row = kpiTiles(ws, row, m);
  row = section(ws, row, "Présences", 10);
  const head = row;
  row = header(ws, row, ["Membre", "Groupe", "Présence"]);
  e.attendees.forEach((a, i) => {
    row = dataRow(ws, row, [a.name, a.group, a.present ? "Présent" : "Absent"], i);
    const c = ws.getCell(row - 1, 3);
    c.fill = fill(a.present ? C.goodBg : C.lowBg);
    c.font = { bold: true, color: { argb: a.present ? C.goodInk : C.lowInk } };
    c.alignment = { horizontal: "center" };
  });
  if (e.attendees.length) ws.autoFilter = { from: { row: head, column: 1 }, to: { row: row - 1, column: 3 } };
  row = section(ws, row + 1, "Synthèse de l’événement", 10);
  ws.mergeCells(row, 1, row + 14, 10);
  const s = ws.getCell(row, 1);
  s.value = e.summary || "Aucune synthèse renseignée.";
  s.alignment = { wrapText: true, vertical: "top" };
  s.font = { color: { argb: C.ink } };
  s.border = box;
}

export async function buildExcel(m: ReportModel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = `ASD — ${m.generatedBy}`;
  wb.created = new Date();
  wb.title = m.title;

  if (m.kind === "evenement") singleEventSheet(wb, m);
  else {
    summarySheet(wb, m);
    eventsSheet(wb, m);
    attendanceSheet(wb, m);
    membersSheet(wb, m);
    listSheet(wb, m, "prayers");
    listSheet(wb, m, "testimonies");
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
