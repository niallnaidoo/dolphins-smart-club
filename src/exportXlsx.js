// Build an .xlsx from an array of plain row objects (keys become column headers)
// and trigger a client-side download. Keeps export logic in one place so the admin
// cohort + directory exports stay consistent. exceljs is imported dynamically so it
// code-splits out of the main bundle (exports are rare, admin-only actions).
export async function exportRowsToXlsx(filename, sheetName, rows) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  if (rows.length) {
    ws.columns = Object.keys(rows[0]).map((k) => ({ header: k, key: k, width: 18 }));
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true };
  }
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Append to the DOM before click() — required by older Firefox for programmatic
  // downloads — and defer revocation so the download has started (revoking on the
  // next synchronous line can cancel it in Firefox/Safari).
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Map a club record to the export row shape shared by both admin exports. Mirrors
// the columns shown in the club directory table.
export function clubExportRow(c, { docCompletion, overallProgress, cqiBand }) {
  return {
    Club: c.name,
    District: c.sub,
    Chairperson: c.chair,
    Affiliation: c.affiliation,
    Paid: c.paid ? 'Yes' : 'No',
    'Docs %': docCompletion(c),
    'CQI Score': c.cqi,
    'CQI Band': cqiBand(c.cqi).label,
    'Overall %': overallProgress(c),
  };
}
