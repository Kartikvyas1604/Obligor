/**
 * Minimal, dependency-free RFC 4180 CSV reader.
 *
 * Handles: quoted fields, embedded commas/newlines inside quotes, escaped
 * quotes (""), CRLF and LF line endings, and a trailing newline. It does not
 * guess delimiters or coerce types — callers map and validate the string grid
 * themselves so import errors stay explicit and row-numbered.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnyChar = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    sawAnyChar = true;

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      if (field.length === 0) {
        inQuotes = true;
      } else {
        // A quote inside an unquoted field is taken literally (lenient).
        field += ch;
      }
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      // Swallow CR; the LF that follows terminates the row. A lone CR also
      // terminates so old-Mac files still parse.
      if (text[i + 1] !== "\n") pushRow();
    } else {
      field += ch;
    }
  }

  if (inQuotes) {
    throw new Error("csv: unterminated quoted field");
  }

  // Flush the final field/row unless the input ended exactly on a newline.
  if (sawAnyChar && (field.length > 0 || row.length > 0)) pushRow();

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}
