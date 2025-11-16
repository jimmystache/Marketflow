import sys
import os
import pandas as pd


def main():
    print("File Parser (CSV / Excel)")
    if len(sys.argv) != 2:
        print("Usage: python excelparser.py <file.csv|file.xlsx>")
        sys.exit(1)

    input_file = sys.argv[1]

    if not os.path.exists(input_file):
        print(f"File not found: {input_file}")
        sys.exit(1)

    _, ext = os.path.splitext(input_file)
    ext = ext.lower()

    try:
        if ext == ".csv":
            df = pd.read_csv(input_file)
        else:
            print(f"Unsupported file extension: {ext}. Only .csv files are supported.")
            sys.exit(1)
        # Print a small preview if the frame is large
        with pd.option_context('display.max_rows', 20, 'display.max_columns', 20):
            print(df)

    except Exception as e:
        print(f"An error occurred while reading '{input_file}': {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()