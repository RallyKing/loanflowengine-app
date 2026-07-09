"""
Interactive helper to append a new lender/contact to additional_lenders.csv.

Usage:
    python add_lender.py

The script prompts for each field (press Enter to skip optional fields), shows
a preview, then appends the row to additional_lenders.csv. After saving, it
offers to rebuild Comprehensive_Lender_List.csv for you.

You can also run it multiple times in one sitting to add several lenders back
to back.
"""

import csv
import datetime as dt
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ADDITIONAL_CSV = ROOT / "additional_lenders.csv"

COLUMNS = [
    "Source",
    "Section",
    "Company",
    "Contact Name",
    "Title / Role",
    "Phone",
    "Email",
    "Website",
    "Entity Type",
    "Primary Niche / Specialty",
    "Programs / Loan Types",
    "Property Types",
    "Exclusions",
    "States Served",
    "Owner-Occupied or Investor",
    "Loan Amount - Min",
    "Loan Amount - Max",
    "LTV / Leverage",
    "Interest Rates",
    "Amortization / Term",
    "Referral / YSP Fees",
    "Additional Notes",
    "Status",
    "Last Updated",
]

# Sensible drop-down choices for Entity Type (user can type their own too)
ENTITY_TYPES = [
    "Bank / Commercial Lender",
    "Credit Union",
    "SBA / USDA Lender",
    "Hard Money / Bridge Lender",
    "Private / Hedge Fund",
    "Factoring / A/R",
    "Multifamily / Agency Lender",
    "CMBS / Conduit",
    "Life Company Lender",
    "Church Lender",
    "Farm / Agricultural Lender",
    "Franchise Finance",
    "Equipment / Leasing",
    "Merchant / MCA / CC Financing",
    "Securities / IRA Lender",
    "Auction / Asset Disposition",
    "Restructuring / Turnaround",
    "Consulting / Advisory",
    "Law Firm",
    "Broker / Correspondent",
    "Cost Segregation / Tax Service",
    "Commercial Finance",
]

# Short hints shown next to each prompt
HINTS = {
    "Source": "Where did you get this contact? (default: Manual Entry)",
    "Section": "Grouping label (default: Manual Addition)",
    "Company": "REQUIRED – lender / firm name",
    "Contact Name": "First + Last name of your contact",
    "Title / Role": "e.g. VP Lending, SBA Officer, Esq., CTP",
    "Phone": "Any format is fine, e.g. (215) 555-0100",
    "Email": "Used for duplicate detection",
    "Website": "e.g. www.example.com",
    "Entity Type": "See numbered list; type a number or your own",
    "Primary Niche / Specialty": "Their sweet spot, e.g. 'SBA 7(a) owner-user RE'",
    "Programs / Loan Types": "Product menu, e.g. '7(a), 504, conventional'",
    "Property Types": "e.g. 'retail, industrial, owner-occupied'",
    "Exclusions": "What they WON'T finance",
    "States Served": "e.g. 'All 50' or 'FL, GA, NC, SC'",
    "Owner-Occupied or Investor": "Owner / Investor / Both",
    "Loan Amount - Min": "e.g. $250,000",
    "Loan Amount - Max": "e.g. $5,000,000 or $10M",
    "LTV / Leverage": "e.g. 'Up to 75%'",
    "Interest Rates": "e.g. 'Prime + 2%' or '9-13%'",
    "Amortization / Term": "e.g. '25 years' or '5yr fixed / 25 am'",
    "Referral / YSP Fees": "e.g. '1% at closing' or 'up to 1.5%'",
    "Additional Notes": "Anything else a referral partner should know",
    "Status": "e.g. 'Active' or 'Not lending right now'",
    "Last Updated": f"YYYY-MM-DD (default: today = {dt.date.today().isoformat()})",
}


def prompt(label, hint=None, default=None, required=False):
    """Prompt the user for a single field. Returns a string (possibly empty)."""
    h = f"  [{hint}]" if hint else ""
    d = f" (default: {default})" if default else ""
    while True:
        raw = input(f"{label}{h}{d}: ").strip()
        if raw:
            return raw
        if default is not None:
            return default
        if not required:
            return ""
        print("  ^ This field is required. Please enter a value.")


def prompt_entity_type():
    print("\nEntity Type — pick a number, or type your own label:")
    for i, et in enumerate(ENTITY_TYPES, 1):
        print(f"  {i:2d}. {et}")
    raw = input("Entity Type (number or text, Enter to leave blank for auto-classify): ").strip()
    if not raw:
        return ""
    if raw.isdigit():
        idx = int(raw)
        if 1 <= idx <= len(ENTITY_TYPES):
            return ENTITY_TYPES[idx - 1]
    return raw


def ensure_file_has_header():
    """Create additional_lenders.csv with a header row if it doesn't exist."""
    if ADDITIONAL_CSV.exists():
        return
    with ADDITIONAL_CSV.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, quoting=csv.QUOTE_ALL)
        w.writeheader()


def collect_row():
    print("=" * 72)
    print("Add a new lender / referral contact")
    print("=" * 72)
    print("Press Enter to skip any field you don't know. Only Company is required.\n")

    row = {c: "" for c in COLUMNS}

    row["Company"] = prompt("Company", HINTS["Company"], required=True)
    row["Contact Name"] = prompt("Contact Name", HINTS["Contact Name"])
    row["Title / Role"] = prompt("Title / Role", HINTS["Title / Role"])
    row["Phone"] = prompt("Phone", HINTS["Phone"])
    row["Email"] = prompt("Email", HINTS["Email"])
    row["Website"] = prompt("Website", HINTS["Website"])
    row["Entity Type"] = prompt_entity_type()
    row["Primary Niche / Specialty"] = prompt(
        "Primary Niche / Specialty", HINTS["Primary Niche / Specialty"]
    )
    row["Programs / Loan Types"] = prompt(
        "Programs / Loan Types", HINTS["Programs / Loan Types"]
    )
    row["Property Types"] = prompt("Property Types", HINTS["Property Types"])
    row["Exclusions"] = prompt("Exclusions", HINTS["Exclusions"])
    row["States Served"] = prompt("States Served", HINTS["States Served"])
    row["Owner-Occupied or Investor"] = prompt(
        "Owner-Occupied or Investor", HINTS["Owner-Occupied or Investor"]
    )
    row["Loan Amount - Min"] = prompt("Loan Amount - Min", HINTS["Loan Amount - Min"])
    row["Loan Amount - Max"] = prompt("Loan Amount - Max", HINTS["Loan Amount - Max"])
    row["LTV / Leverage"] = prompt("LTV / Leverage", HINTS["LTV / Leverage"])
    row["Interest Rates"] = prompt("Interest Rates", HINTS["Interest Rates"])
    row["Amortization / Term"] = prompt(
        "Amortization / Term", HINTS["Amortization / Term"]
    )
    row["Referral / YSP Fees"] = prompt(
        "Referral / YSP Fees", HINTS["Referral / YSP Fees"]
    )
    row["Additional Notes"] = prompt("Additional Notes", HINTS["Additional Notes"])
    row["Status"] = prompt("Status", HINTS["Status"], default="Active")
    row["Source"] = prompt("Source", HINTS["Source"], default="Manual Entry")
    row["Section"] = prompt("Section", HINTS["Section"], default="Manual Addition")
    row["Last Updated"] = prompt(
        "Last Updated", HINTS["Last Updated"], default=dt.date.today().isoformat()
    )
    return row


def show_preview(row):
    print("\n" + "-" * 72)
    print("Preview")
    print("-" * 72)
    for col in COLUMNS:
        val = row.get(col, "")
        if val:
            print(f"  {col:30s}: {val}")
    print("-" * 72)


def confirm(q, default_yes=True):
    suffix = "Y/n" if default_yes else "y/N"
    raw = input(f"{q} [{suffix}]: ").strip().lower()
    if not raw:
        return default_yes
    return raw in ("y", "yes")


def append_row(row):
    ensure_file_has_header()
    with ADDITIONAL_CSV.open("a", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, quoting=csv.QUOTE_ALL)
        w.writerow(row)


def rebuild():
    script = ROOT / "build_csv.py"
    print("\nRebuilding Comprehensive_Lender_List.csv ...")
    result = subprocess.run([sys.executable, str(script)], cwd=str(ROOT))
    if result.returncode != 0:
        print("Rebuild failed. Check the errors above.")
    else:
        print("Done.")


def main():
    while True:
        row = collect_row()
        show_preview(row)
        if confirm("Save this lender?"):
            append_row(row)
            print(f"Appended to {ADDITIONAL_CSV.name}")
        else:
            print("Discarded.")
        if not confirm("Add another lender?", default_yes=False):
            break

    if confirm("Rebuild the comprehensive CSV now?"):
        rebuild()


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("\nCancelled.")
