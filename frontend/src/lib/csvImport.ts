export type CsvColumn = {
  key: string;
  label: string;
  required?: boolean;
  aliases?: string[];
};
export type CsvRow = Record<string, string>;

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

function splitLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
    } else current += character;
  }
  values.push(current.trim());
  return values;
}

export function parseCsv(text: string, columns: CsvColumn[]) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim());
  if (lines.length < 2)
    throw new Error(
      "El CSV debe incluir encabezados y al menos una fila de datos.",
    );
  const delimiter =
    (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0)
      ? ";"
      : ",";
  const headers = splitLine(lines[0], delimiter).map(normalizeHeader);
  const mapping = columns.map((column) => {
    const accepted = [column.key, column.label, ...(column.aliases ?? [])].map(
      normalizeHeader,
    );
    return {
      column,
      index: headers.findIndex((header) => accepted.includes(header)),
    };
  });
  const missing = mapping
    .filter(({ column, index }) => column.required && index < 0)
    .map(({ column }) => column.label);
  if (missing.length)
    throw new Error(`Faltan columnas obligatorias: ${missing.join(", ")}.`);
  const rows = lines
    .slice(1)
    .map((line) => {
      const values = splitLine(line, delimiter);
      return Object.fromEntries(
        mapping.map(({ column, index }) => [
          column.key,
          index >= 0 ? (values[index] ?? "").trim() : "",
        ]),
      );
    })
    .filter((row) => Object.values(row).some(Boolean));
  return rows;
}

export function downloadCsvTemplate(
  filename: string,
  columns: CsvColumn[],
  example: CsvRow,
) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const content =
    "\uFEFF" +
    [
      columns.map((column) => escape(column.label)).join(";"),
      columns.map((column) => escape(example[column.key] ?? "")).join(";"),
    ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
