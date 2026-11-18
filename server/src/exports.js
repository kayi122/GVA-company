// Excel (.xlsx) and PDF versions of a report built by reporting.js
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const NAVY = '071533';
const OLIVE = '86A022';
const ISP = { MTN: 'MTN', AIRTEL: 'Airtel', LIQUID: 'Liquid', OTHER: 'Other', NONE: 'No internet' };
const SAT = { HAPPY: 'Happy', OK: 'Okay', UNHAPPY: 'Unhappy' };
const title = (s) => (s ? s[0] + s.slice(1).toLowerCase() : '');
const pctText = (v) => (v == null ? '—' : `${v}%`);
const dateTime = (d) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function fileBase(report) {
  const scope = report.scopeLabel.replace(/^Team of /, 'team-').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  return `gva-sales-${scope}-${report.range.from}_to_${report.range.to}`;
}

/* ------------------------------ Excel ------------------------------ */
function sheet(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map(([header, key, width, fmt]) => ({ header, key, width: width ?? 14, style: fmt ? { numFmt: fmt } : {} }));
  ws.addRows(rows);
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY } };
  head.alignment = { vertical: 'middle' };
  head.height = 22;
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

export async function toXlsx(report, generatedBy) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GVA Sales Pipeline';
  wb.created = new Date();
  const t = report.totals;

  // Summary
  const s = wb.addWorksheet('Summary');
  s.columns = [{ width: 28 }, { width: 18 }, { width: 18 }];
  s.addRow(['GVA Sales Pipeline — Sales report']).font = { bold: true, size: 16, color: { argb: 'FF' + NAVY } };
  s.addRow([`${report.scopeLabel} · ${report.range.from} to ${report.range.to}`]).font = { color: { argb: 'FF64748B' } };
  s.addRow([`Generated ${dateTime(new Date())} by ${generatedBy}`]).font = { color: { argb: 'FF94A3B8' }, size: 9 };
  s.addRow([]);
  const hdr = s.addRow(['Measure', 'Result', report.targetPeriod ? `Target (${report.targetPeriod})` : '']);
  hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hdr.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY } }));
  [
    ['New leads (customers added)', t.leads, t.targetLeads],
    ['Visits logged', t.visits, t.targetVisits],
    ['Sales (paid & confirmed)', t.sales, t.targetSales],
    ['Revenue (RWF)', t.revenue],
    ['Hot leads', t.hot],
    ['Warm leads', t.warm],
    ['Cold leads', t.cold],
    ['Hot rate', t.hotRate == null ? '—' : t.hotRate / 100],
    ['Agents in report', t.agents],
    ['Agents with activity', t.activeAgents],
  ].forEach((r) => {
    const row = s.addRow(r);
    if (r[0] === 'Hot rate' && typeof r[1] === 'number') row.getCell(2).numFmt = '0%';
  });
  s.addRow([]);
  s.addRow(['Current provider of new leads']).font = { bold: true };
  Object.entries(report.isp).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => s.addRow([ISP[k] ?? k, n]));
  s.addRow([]);
  s.addRow(['Top districts']).font = { bold: true };
  report.districts.slice(0, 10).forEach((d) => s.addRow([d.name, d.n]));

  sheet(wb, 'By agent', [
    ['Agent', 'name', 26], ['Team', 'team', 24], ['Leads', 'leads', 9], ['Visits', 'visits', 9], ['Hot', 'hot', 8], ['Warm', 'warm', 8],
    ['Cold', 'cold', 8], ['Hot %', 'hotRate', 9], ['Sales', 'sales', 8], ['Revenue (RWF)', 'revenue', 14, '#,##0'], ['Target leads', 'tLeads', 13], ['% of target', 'targetPct', 12],
  ], report.agents.map((a) => ({ ...a, tLeads: a.target?.leads ?? null, hotRate: a.hotRate == null ? null : a.hotRate / 100, targetPct: a.targetPct == null ? null : a.targetPct / 100 })))
    .getColumn('hotRate').numFmt = '0%';
  wb.getWorksheet('By agent').getColumn('targetPct').numFmt = '0%';

  if (report.teams.length) {
    sheet(wb, 'By team', [
      ['Team (supervisor)', 'name', 26], ['Agents', 'agents', 9], ['Leads', 'leads', 9], ['Visits', 'visits', 9], ['Hot', 'hot', 8],
      ['Warm', 'warm', 8], ['Cold', 'cold', 8], ['Sales', 'sales', 8], ['Revenue (RWF)', 'revenue', 14, '#,##0'], ['Target leads', 'targetLeads', 13],
    ], report.teams);
  }

  sheet(wb, 'Customers', [
    ['Added', 'createdAt', 18, 'dd mmm yyyy hh:mm'], ['Customer', 'fullName', 24], ['Phone', 'phone', 13], ['Second phone', 'altPhone', 13],
    ['Type', 'type', 10], ['District', 'district', 13], ['Sector', 'sector', 14], ['Landmark', 'landmark', 26], ['Current ISP', 'isp', 13],
    ['Pays / month (RWF)', 'monthlySpend', 16, '#,##0'], ['Happy with it?', 'sat', 13], ['Status', 'statusLabel', 9], ['Stage', 'stage', 10],
    ['Agent', 'agentName', 22], ['Team', 'team', 22], ['GPS', 'gps', 22], ['Notes', 'notes', 40],
  ], (report.customers ?? []).map((c) => ({
    ...c, type: c.customerType === 'BUSINESS' ? 'Business' : 'Home', isp: c.currentIsp === 'OTHER' ? c.currentIspOther || 'Other' : ISP[c.currentIsp],
    sat: SAT[c.satisfaction] ?? '', statusLabel: title(c.status), stage: title(c.stage), gps: c.latitude != null ? `${c.latitude}, ${c.longitude}` : '',
  })));

  sheet(wb, 'Visits', [
    ['Date', 'createdAt', 18, 'dd mmm yyyy hh:mm'], ['Agent', 'agentName', 22], ['Customer', 'customer', 24], ['Phone', 'phone', 13],
    ['Status after visit', 'statusLabel', 16], ['GPS', 'gps', 22], ['Notes', 'notes', 50],
  ], (report.visits ?? []).map((v) => ({
    ...v, customer: v.customer.fullName, phone: v.customer.phone, statusLabel: title(v.status), gps: v.latitude != null ? `${v.latitude}, ${v.longitude}` : '',
  })));

  return wb.xlsx.writeBuffer();
}

/* ------------------------------ PDF ------------------------------ */
export function pipePdf(report, generatedBy, res) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true, info: { Title: 'GVA sales report', Author: 'GVA Sales Pipeline' } });
  doc.pipe(res);
  const W = doc.page.width - 72;
  const t = report.totals;

  // header band
  doc.rect(0, 0, doc.page.width, 78).fill('#' + NAVY);
  doc.fillColor('#B8D433').font('Helvetica-Bold').fontSize(9).text('GVA  ·  SALES PIPELINE', 36, 20, { characterSpacing: 2 });
  doc.fillColor('#FFFFFF').fontSize(20).text('Sales report', 36, 34);
  doc.font('Helvetica').fontSize(10).fillColor('#CBD5E1')
    .text(`${report.scopeLabel}   ·   ${report.range.from} to ${report.range.to}`, 36, 34, { width: W, align: 'right' })
    .text(`Generated ${dateTime(new Date())} by ${generatedBy}`, 36, 50, { width: W, align: 'right' });

  // KPI boxes
  const kpis = [
    ['New leads', t.leads, t.targetLeads], ['Visits', t.visits, t.targetVisits], ['Hot', t.hot], ['Warm', t.warm], ['Cold', t.cold],
    ['Hot rate', pctText(t.hotRate)], ['Sales', t.sales, t.targetSales],
    ['Revenue (RWF)', t.revenue >= 1e6 ? `${(t.revenue / 1e6).toFixed(1)}M` : `${Math.round(t.revenue / 1000)}k`],
  ];
  const bw = (W - (kpis.length - 1) * 8) / kpis.length;
  let y = 96;
  kpis.forEach(([label, v, target], i) => {
    const x = 36 + i * (bw + 8);
    doc.roundedRect(x, y, bw, 58, 6).fill('#F1F5F9');
    doc.fillColor('#64748B').font('Helvetica').fontSize(8).text(label.toUpperCase(), x + 10, y + 9, { width: bw - 20, characterSpacing: 0.8 });
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(18).text(String(v ?? '—'), x + 10, y + 22, { width: bw - 20 });
    if (target) doc.fillColor('#6D841A').font('Helvetica').fontSize(8).text(`target ${target}`, x + 10, y + 43, { width: bw - 20 });
  });
  y += 78;

  // generic table with page breaks
  const table = (heading, cols, rows) => {
    if (y > doc.page.height - 120) { doc.addPage(); y = 40; }
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(12).text(heading, 36, y);
    y += 20;
    const total = cols.reduce((s, c) => s + c.w, 0);
    const scale = W / total;
    const drawHead = () => {
      doc.rect(36, y, W, 20).fill('#' + NAVY);
      let x = 36;
      cols.forEach((c) => {
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5).text(c.h, x + 6, y + 6, { width: c.w * scale - 12, align: c.align ?? 'left' });
        x += c.w * scale;
      });
      y += 20;
    };
    drawHead();
    rows.forEach((r, i) => {
      if (y > doc.page.height - 56) { doc.addPage(); y = 40; drawHead(); }
      if (i % 2) doc.rect(36, y, W, 18).fill('#F8FAFC');
      let x = 36;
      cols.forEach((c) => {
        const v = c.get(r);
        doc.fillColor(c.color?.(r) ?? '#1E293B').font(c.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
          .text(v == null ? '—' : String(v), x + 6, y + 5, { width: c.w * scale - 12, align: c.align ?? 'left', lineBreak: false, ellipsis: true });
        x += c.w * scale;
      });
      y += 18;
    });
    y += 16;
  };

  const num = (h, k, w = 7, extra = {}) => ({ h, w, align: 'right', get: (r) => r[k], ...extra });
  if (report.teams.length) {
    table('Teams', [
      { h: 'Team (supervisor)', w: 26, get: (r) => r.name, bold: true }, num('Agents', 'agents'), num('Leads', 'leads'), num('Visits', 'visits'),
      num('Hot', 'hot', 6, { color: () => '#BE123C' }), num('Warm', 'warm', 6), num('Cold', 'cold', 6), { h: 'Hot %', w: 7, align: 'right', get: (r) => pctText(r.hotRate) },
      num('Sales', 'sales', 6), num('Target', 'targetLeads', 7), { h: '% target', w: 8, align: 'right', get: (r) => pctText(r.targetPct) },
    ], report.teams);
  }
  table('Agents', [
    { h: 'Agent', w: 22, get: (r) => r.name, bold: true }, { h: 'Team', w: 20, get: (r) => r.team }, num('Leads', 'leads'), num('Visits', 'visits'),
    num('Hot', 'hot', 6, { color: () => '#BE123C' }), num('Warm', 'warm', 6), num('Cold', 'cold', 6), { h: 'Hot %', w: 7, align: 'right', get: (r) => pctText(r.hotRate) },
    num('Sales', 'sales', 6), { h: 'Target', w: 7, align: 'right', get: (r) => r.target?.leads ?? null },
    { h: '% target', w: 8, align: 'right', get: (r) => pctText(r.targetPct), color: (r) => (r.targetPct == null ? '#94A3B8' : r.targetPct >= 100 ? '#047857' : r.targetPct >= 60 ? '#B45309' : '#BE123C') },
  ], [...report.agents].sort((a, b) => b.leads - a.leads));

  // provider split as simple bars
  const ispRows = Object.entries(report.isp).sort((a, b) => b[1] - a[1]);
  if (ispRows.length) {
    if (y > doc.page.height - 60 - ispRows.length * 18) { doc.addPage(); y = 40; }
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(12).text('What new leads use today', 36, y);
    y += 22;
    const max = Math.max(...ispRows.map((r) => r[1]));
    ispRows.forEach(([k, n]) => {
      doc.fillColor('#334155').font('Helvetica').fontSize(9).text(ISP[k] ?? k, 36, y + 2, { width: 90 });
      doc.roundedRect(130, y, Math.max(4, (n / max) * 300), 12, 3).fill('#' + OLIVE);
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9).text(`${n} (${Math.round((n / (t.leads || 1)) * 100)}%)`, 140 + (n / max) * 300, y + 2);
      y += 18;
    });
  }

  // footer page numbers
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.fillColor('#94A3B8').font('Helvetica').fontSize(8)
      .text(`GVA Sales Pipeline · confidential · page ${i + 1} of ${range.count}`, 36, doc.page.height - 28, { width: W, align: 'center', lineBreak: false });
  }
  doc.end();
}
