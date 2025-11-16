import sys
import os
import argparse
import re
from io import StringIO

try:
    import pandas as pd
except Exception:
    pd = None
import json
"""
most likely use cases:
python excelparser.py ".\csv_examples\marketplace (14).csv" --section orders --columns marketplace,session --as-list
in csv examples marketplace (14).csv, look in the orders section, take out the columns for marketplace and session, and return them as a JSON list in stdout
"""

def extract_section_text(path, section_name):
    
    """Return the CSV text for a named section (between markers).

    Markers are lines like: `# holdings -- begin` and `# holdings -- end`.
    The function returns the lines between the begin and end markers (exclusive
    of the markers) joined as a single string, or None if the section wasn't found.
    """
    begin_re = re.compile(rf"^#\s*{re.escape(section_name)}\s*--\s*begin", re.IGNORECASE)
    end_re = re.compile(rf"^#\s*{re.escape(section_name)}\s*--\s*end", re.IGNORECASE)

    with open(path, encoding='utf-8') as f:
        lines = f.readlines()

    start_idx = None
    end_idx = None
    for i, line in enumerate(lines):
        if start_idx is None and begin_re.match(line.strip()):
            start_idx = i + 1
            continue
        if start_idx is not None and end_re.match(line.strip()):
            end_idx = i
            break

    if start_idx is None:
        return None

    section_lines = lines[start_idx:end_idx]
    # Remove leading/trailing blank lines
    while section_lines and section_lines[0].strip() == "":
        section_lines.pop(0)
    while section_lines and section_lines[-1].strip() == "":
        section_lines.pop()

    return "".join(section_lines)


def load_section_as_dataframe(path, section_name):
    text = extract_section_text(path, section_name)
    if text is None or text.strip() == "":
        return None
    return pd.read_csv(StringIO(text))


def main():
    parser = argparse.ArgumentParser(description="Parse CSV or Excel files and extract sections.")
    parser.add_argument("input_file", help="Path to a CSV or Excel file")
    parser.add_argument("--section", help="Section name to extract (e.g. 'orders' or 'holdings')")
    parser.add_argument("--filter-column", help="Column name to filter after extracting section")
    parser.add_argument("--filter-value", help="Value to match in the filter column (exact match)")
    parser.add_argument("--contains", action="store_true", help="Use substring match for --filter-value")
    parser.add_argument("--rows", type=int, help="If provided with --section, limit output to N rows starting from section top")
    parser.add_argument("--columns", help="Comma-separated list of columns to keep (order preserved)")
    parser.add_argument("--as-list", action="store_true", help="Output selected columns as lists (JSON).")
    parser.add_argument("--output-json", help="Path to write JSON output (if omitted, prints to stdout).")
    args = parser.parse_args()

    input_file = args.input_file
    if not os.path.exists(input_file):
        print(f"File not found: {input_file}")
        sys.exit(1)

    # If the user asked for a named section, try to extract it from the raw text
    if args.section:
        df = load_section_as_dataframe(input_file, args.section)
        if df is None:
            print(f"Section '{args.section}' not found in file.")
            sys.exit(1)
        if hasattr(df, 'empty') and df.empty:
            print(f"Section '{args.section}' is empty in file.")
            sys.exit(1)

    else:
      print(f"No section specified. Please provide a section name using --section.") 
      sys.exit(1)
      

    # Apply optional filtering (only if both filter-column and filter-value provided)
    if args.filter_column and args.filter_value is not None:
        col = args.filter_column
        if col not in df.columns:
            print(f"Column '{col}' not found in data. Available columns: {', '.join(list(df.columns)[:10])}")
            sys.exit(1)

        if args.contains:
            mask = df[col].astype(str).str.contains(args.filter_value, na=False)
        else:
            mask = df[col].astype(str) == args.filter_value

        df = df[mask]
    if args.rows is not None:
        df = df.head(args.rows)

    # Column selection: keep listed columns in the requested order
    if args.columns:
        cols = [c.strip() for c in args.columns.split(',') if c.strip()]
        missing = [c for c in cols if c not in df.columns]
        if missing:
            print(f"Requested columns not found: {', '.join(missing)}")
            print(f"Available columns: {', '.join(list(df.columns)[:50])}")
            sys.exit(1)

        df = df[cols]

    # Optionally output selected columns as arrays (JSON)
    if args.as_list:
        # Build mapping column -> list
        out = {col: df[col].tolist() for col in df.columns}
        dumped = json.dumps(out, indent=2, ensure_ascii=False)
        if args.output_json:
            with open(args.output_json, 'w', encoding='utf-8') as fh:
                fh.write(dumped)
            print(f"Wrote JSON arrays to {args.output_json}")
        else:
            print(dumped)
        return

    # Print a concise preview
    if pd is not None:
        with pd.option_context('display.max_rows', 200, 'display.max_columns', 50):
            print(df)
    else:
        print(df)


if __name__ == "__main__":
    main()