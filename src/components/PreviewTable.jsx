export default function PreviewTable({ rows, maxRows = 10 }) {
  if (!rows || rows.length === 0) return null;

  const headers = Object.keys(rows[0]);
  const previewRows = rows.slice(0, maxRows);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <p className="text-sm font-medium text-slate-200">
          Preview {previewRows.length} baris pertama
        </p>
        <p className="text-xs text-slate-500">{headers.length} kolom</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/80">
              {headers.map((header) => (
                <th
                  key={header}
                  className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, index) => (
              <tr
                key={index}
                className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30"
              >
                {headers.map((header) => (
                  <td
                    key={header}
                    className="whitespace-nowrap px-4 py-2.5 text-slate-300"
                  >
                    {String(row[header] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
