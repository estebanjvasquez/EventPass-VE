import { useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import {
  downloadCsvTemplate,
  parseCsv,
  type CsvColumn,
  type CsvRow,
} from "../lib/csvImport";

type ImportResult = { created: number; skipped: number; errors?: string[] };
type Props = {
  title: string;
  description: string;
  columns: CsvColumn[];
  example: CsvRow;
  templateName: string;
  onImport: (rows: CsvRow[]) => Promise<ImportResult>;
};

export default function CsvImportPanel({
  title,
  description,
  columns,
  example,
  templateName,
  onImport,
}: Props) {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose(file?: File) {
    if (!file) return;
    setError(null);
    setResult(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Selecciona un archivo con extensión .csv.");
      return;
    }
    try {
      setRows(parseCsv(await file.text(), columns));
    } catch (issue) {
      setRows([]);
      setError(
        issue instanceof Error ? issue.message : "No se pudo leer el CSV.",
      );
    }
  }

  async function execute() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const imported = await onImport(rows);
      setResult(
        `${imported.created} registros creados · ${imported.skipped} omitidos${imported.errors?.length ? ` · ${imported.errors.length} con error` : ""}.`,
      );
      if (imported.errors?.length)
        setError(imported.errors.slice(0, 5).join(" "));
      if (!imported.errors?.length) setRows([]);
    } catch (issue) {
      setError(
        issue instanceof Error
          ? issue.message
          : "No se pudo completar la importación.",
      );
    }
    setBusy(false);
  }

  return (
    <section className="rounded-2xl border bg-white p-5">
      <div className="flex items-start gap-3">
        <FileSpreadsheet className="mt-0.5 h-5 w-5 text-emerald-700" />
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-zinc-600">{description}</p>
        </div>
      </div>
      <details className="mt-4 rounded-xl bg-zinc-50 p-3 text-sm">
        <summary className="cursor-pointer font-semibold">
          Guía para preparar el archivo en Excel
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-zinc-600">
          <li>Descarga la plantilla y ábrela con Excel.</li>
          <li>Conserva los encabezados de la primera fila sin modificarlos.</li>
          <li>
            Completa una fila por registro; no combines celdas ni agregues
            títulos.
          </li>
          <li>
            Guarda como <b>CSV UTF-8</b>. Se aceptan separadores coma o punto y
            coma.
          </li>
          <li>
            Los campos obligatorios son:{" "}
            {columns
              .filter((column) => column.required)
              .map((column) => column.label)
              .join(", ")}
            .
          </li>
        </ol>
      </details>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => downloadCsvTemplate(templateName, columns, example)}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"
        >
          <Download className="h-4 w-4" />
          Descargar plantilla CSV
        </button>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white">
          <Upload className="h-4 w-4" />
          Seleccionar CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              void choose(event.target.files?.[0]);
            }}
          />
        </label>
      </div>
      {rows.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold">
            Vista previa: {rows.length} filas
          </p>
          <div className="mt-2 max-h-48 overflow-auto rounded-lg border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-zinc-50">
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className="p-2">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((row, index) => (
                  <tr key={index} className="border-t">
                    {columns.map((column) => (
                      <td key={column.key} className="max-w-48 truncate p-2">
                        {row[column.key] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void execute();
            }}
            className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Importando…" : `Importar ${rows.length} registros`}
          </button>
        </div>
      )}
      {result && (
        <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {result}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
    </section>
  );
}
