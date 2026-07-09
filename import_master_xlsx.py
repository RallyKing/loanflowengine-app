"""Import the Master Lender List xlsx (multi-tab) into a normalized CSV.

Reads:   c:/Users/joshu/Downloads/1 - MASTER LENDER LIST (2).xlsx
Writes:  master_lenders.csv   (same schema as additional_lenders.csv / the pipeline output)

Handled sheet layouts:
  * "Program-style" (Term & LOC, Real Estate, Commercial, RehabConstruction,
    Non-QM, MCA, SBA, Land, B2C, Consolidation Svcs)
    - Company Info block (col 0), multiple program rows per company
    - Aggregates programs, restrictions, qualifications, loan size, etc. per lender
  * "27-column Lender List"  (Post AI Lender List, 9.16.24 - Pre-Org Lender List,
    Lender List) - one row per lender/program
  * "30-column 9.17.24"      - program-first, lender name in col 4
  * "6-column Sheet2"        - simple contact roster
  * "15-column Lender From James List" - niche + company + contact
  * Skipped: Summary of Loan Programs, _BLANK_, PROMPTS, TEMPLATE ITEMS

Each row in master_lenders.csv has the same 24 columns as Comprehensive_Lender_List.csv.
"""

from __future__ import annotations

import csv
import datetime
import re
import sys
from pathlib import Path

import pandas as pd

SRC = Path(r"c:/Users/joshu/Downloads/1 - MASTER LENDER LIST (2).xlsx")
OUT = Path(__file__).parent / "master_lenders.csv"

OUT_COLUMNS = [
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

TODAY = datetime.date.today().isoformat()
SOURCE_LABEL = "Master Lender List (imported)"

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
PHONE_RE = re.compile(
    r"(?:\+?1[\s\.-]?)?\(?\b\d{3}\)?[\s\.-]?\d{3}[\s\.-]?\d{4}\b(?:\s?(?:x|ext\.?)\s?\d{1,6})?",
    re.IGNORECASE,
)
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
URL_RE = re.compile(r"\b(?:https?://|www\.)[^\s,]+", re.IGNORECASE)

PLACEHOLDERS = {"xyz", "n/a", "na", "not available", "none", "-", "--"}

def clean(s) -> str:
    if s is None:
        return ""
    if isinstance(s, float) and pd.isna(s):
        return ""
    s = str(s).replace("\u00a0", " ").strip()
    if s.lower() in PLACEHOLDERS:
        return ""
    return s

def squash_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()

def first_line(s: str) -> str:
    for line in s.splitlines():
        line = line.strip()
        if line and line.lower() not in PLACEHOLDERS:
            return line
    return ""

def strip_placeholder_tails(s: str) -> str:
    """Remove trailing 'Contact Info:\nXYZ' template fluff."""
    s = re.sub(r"Contact Info\s*:.*?(?=\n\n|\Z)", "", s, flags=re.IGNORECASE | re.DOTALL)
    # Drop free-standing XYZ lines
    s = re.sub(r"(?im)^\s*xyz\s*$\n?", "", s)
    return s.strip()

def extract_contact_bits(blob: str) -> dict:
    """Pull phone/email/website/contact-name out of a free-text company block."""
    out = {"phone": "", "email": "", "website": "", "contact": "", "titleRole": ""}
    if not blob:
        return out
    email_m = EMAIL_RE.search(blob)
    if email_m:
        out["email"] = email_m.group(0)
    phone_m = PHONE_RE.search(blob)
    if phone_m:
        out["phone"] = squash_ws(phone_m.group(0))
    url_m = URL_RE.search(blob)
    if url_m:
        url = url_m.group(0).rstrip(".,;:)")
        if "@" not in url:
            out["website"] = url
    # Contact name: first line that's not company, not phone, not email, not url,
    # not "Contact Info:", not a placeholder.
    lines = [l.strip() for l in blob.splitlines() if l.strip()]
    if lines:
        company = lines[0]
        for line in lines[1:]:
            low = line.lower()
            if low in PLACEHOLDERS or low.startswith("contact info"):
                continue
            if EMAIL_RE.search(line) or URL_RE.search(line):
                continue
            # skip pure phone lines
            stripped = re.sub(r"[\d\s\(\)\-\+\.ext]", "", line, flags=re.IGNORECASE)
            if len(stripped) < 2:
                continue
            # plausible name is 2-4 words, no colons, not paragraph text
            if ":" in line or len(line) > 80:
                continue
            if len(line.split()) <= 5:
                out["contact"] = line
                break
        _ = company  # not used
    return out

def company_from_block(blob: str) -> str:
    """Top line of the company-info block, without trailing annotations."""
    top = first_line(blob)
    # Strip parenthetical trailing tags like "A-Paper Lender" from later lines,
    # but just use the first line itself
    return top

# ---------------------------------------------------------------------------
# row-writing utility
# ---------------------------------------------------------------------------

def make_row(**kw) -> dict:
    base = {col: "" for col in OUT_COLUMNS}
    base["Source"] = kw.pop("Source", SOURCE_LABEL)
    base["Section"] = kw.pop("Section", "Imported")
    base["Last Updated"] = TODAY
    for k, v in kw.items():
        if k in base:
            base[k] = clean(v) if isinstance(v, str) else v
    # Must have at least a company name
    if not base["Company"]:
        return None
    # Drop placeholder URLs like "privatelenderlink.com"
    if base["Company"].startswith(("http://", "https://", "www.")):
        return None
    return base

# ---------------------------------------------------------------------------
# Parser: program-style sheets
# ---------------------------------------------------------------------------

# Column heuristics for program-style sheets.
#  - First header is always "Company Info" in col 0
#  - Some sheets have "Upload" as col 1 (e.g. Term & LOC), others jump to "Programs"
#  - We detect by looking at the header row.

def parse_program_style(sheet_name: str, df: pd.DataFrame) -> list[dict]:
    # locate header row (the row that contains "Company Info")
    header_idx = None
    for i, row in df.iterrows():
        vals = [str(v).strip().lower() for v in row.tolist()]
        if "company info" in vals:
            header_idx = i
            break
    if header_idx is None:
        return []
    header = [str(v).strip() for v in df.iloc[header_idx].tolist()]
    # map header names -> column index
    col = {h.lower(): j for j, h in enumerate(header) if h}
    body = df.iloc[header_idx + 1 :].reset_index(drop=True)

    def gc(row, *names):
        for n in names:
            j = col.get(n.lower())
            if j is not None and j < len(row):
                v = clean(row.iloc[j])
                if v:
                    return v
        return ""

    grouped: dict[str, dict] = {}
    last_company_blob = ""
    for _, row in body.iterrows():
        company_blob_raw = clean(row.iloc[0]) if len(row) > 0 else ""
        if company_blob_raw:
            last_company_blob = company_blob_raw
        company_blob = strip_placeholder_tails(last_company_blob)
        if not company_blob:
            continue
        company = company_from_block(company_blob)
        if not company:
            continue

        program = gc(row, "Programs")
        restrictions = gc(row, "(NOs) Restrictions", "Restrictions")
        industries = gc(row, "Industries", "Industry")
        quals = gc(row, "(Yeses) Qualifications", "Qualifications")
        docs = gc(row, "Docs Needed")
        niche = gc(row, "Advantage, Niche, Specialty, Purpose", "Advantage, Niche, Specialty")
        fmin = gc(row, "Funding MIN")
        fmax = gc(row, "Funding MAX")
        term = gc(row, "Term & Additional Information", "Additional Info")
        approval = gc(row, "Approval & Frunding Process", "Approval & Funding Process")
        commission = gc(row, "Commission")
        upload = gc(row, "Upload")

        # Skip empty program rows that also have no funding info
        if not any([program, restrictions, quals, docs, niche, fmin, fmax, term, approval, commission]):
            # still create a bare record on the first occurrence
            pass

        bits = extract_contact_bits(company_blob)
        key = company.lower()
        rec = grouped.get(key)
        if not rec:
            rec = {
                "Source": SOURCE_LABEL,
                "Section": sheet_name,
                "Company": company,
                "Contact Name": bits["contact"],
                "Title / Role": "",
                "Phone": bits["phone"],
                "Email": bits["email"],
                "Website": bits["website"],
                "Entity Type": "",
                "Primary Niche / Specialty": "",
                "Programs / Loan Types": "",
                "Property Types": "",
                "Exclusions": "",
                "States Served": "",
                "Owner-Occupied or Investor": "",
                "Loan Amount - Min": "",
                "Loan Amount - Max": "",
                "LTV / Leverage": "",
                "Interest Rates": "",
                "Amortization / Term": "",
                "Referral / YSP Fees": commission,
                "Additional Notes": "",
                "Status": "",
                "Last Updated": TODAY,
            }
            grouped[key] = rec

        # Aggregate programs
        if program:
            rec["Programs / Loan Types"] = _join(rec["Programs / Loan Types"], program)
        if niche:
            rec["Primary Niche / Specialty"] = _join(rec["Primary Niche / Specialty"], niche)
        if industries:
            rec["Property Types"] = _join(rec["Property Types"], industries)
        if restrictions:
            rec["Exclusions"] = _join(rec["Exclusions"], restrictions)
        if fmin and not rec["Loan Amount - Min"]:
            rec["Loan Amount - Min"] = fmin
        if fmax and not rec["Loan Amount - Max"]:
            rec["Loan Amount - Max"] = fmax
        if term and not rec["Amortization / Term"]:
            rec["Amortization / Term"] = term
        if commission and not rec["Referral / YSP Fees"]:
            rec["Referral / YSP Fees"] = commission

        note_bits = []
        if quals:
            note_bits.append(f"Qualifications: {quals}")
        if docs:
            note_bits.append(f"Docs Needed: {docs}")
        if approval:
            note_bits.append(f"Approval: {approval}")
        if upload:
            note_bits.append(f"Portal: {upload}")
        if note_bits:
            rec["Additional Notes"] = _join(
                rec["Additional Notes"], " | ".join(note_bits)
            )

    return list(grouped.values())


def _join(existing: str, new: str, sep: str = " | ") -> str:
    existing = (existing or "").strip()
    new = (new or "").strip()
    if not new:
        return existing
    if not existing:
        return new
    # Avoid duplication
    if new in existing:
        return existing
    return existing + sep + new

# ---------------------------------------------------------------------------
# Parser: 27-column "Lender List" style (Post AI, Lender List, 9.16.24)
# ---------------------------------------------------------------------------

LENDER27_COLS = [
    "Lender Name",             # 0
    "Loan Program Name",       # 1
    "URL Link",                # 2
    "Contact Rep Name, Phone & Email",  # 3
    "Lender Type",             # 4
    "Loan Category",           # 5
    "Transaction Type",        # 6
    "Property Type",           # 7
    "Loan Term (in Months)",   # 8
    "State(s)",                # 9
    "Max LTV - Purchase",      # 10
    "Max LTV - Cashout",       # 11
    "Max LTV Rate/Term",       # 12
    "Max ARV",                 # 13
    "Min Loan",                # 14
    "Max Loan",                # 15
    "Min Interest Rate",       # 16
    "Max Interest Rate",       # 17
    "Origination Points & Fees",  # 18
    "Min Fico",                # 19
    "Pre-Pay Penalty",         # 20
    "Min # of Properties Owned/Completed",  # 21
    "Niches",                  # 22
    "Min Seasoning for BK, FC",  # 23
    "Program Details, Niches & Other Notes",  # 24
    "Submission Requirements", # 25
    "Loan App and Program Flyers LINK",  # 26
]

def parse_lender27(sheet_name: str, df: pd.DataFrame) -> list[dict]:
    if df.shape[0] < 2:
        return []
    # Header row is row 0 or row whose first col equals "Lender Name"/"Company"
    header_idx = 0
    for i in range(min(3, df.shape[0])):
        vals = [str(v).strip().lower() for v in df.iloc[i].tolist()]
        if vals and vals[0] in {"lender name", "company"}:
            header_idx = i
            break
    body = df.iloc[header_idx + 1 :].reset_index(drop=True)
    grouped: dict[str, dict] = {}

    # If there's an explicit "Company" header (Post AI Lender List uses it) treat col 2 as URL
    # Otherwise use the standard layout above. Column indices remain consistent.

    for _, row in body.iterrows():
        vals = [clean(str(v)) for v in row.tolist()]
        name_raw = vals[0] if len(vals) > 0 else ""
        if not name_raw:
            continue
        if name_raw.startswith(("http://", "https://", "www.")):
            continue  # directory link rows
        lender = first_line(name_raw)
        if not lender or lender.startswith(("http://", "https://", "www.")):
            continue

        program = vals[1] if len(vals) > 1 else ""
        url = vals[2] if len(vals) > 2 else ""
        contact_blob = vals[3] if len(vals) > 3 else ""
        lender_type = vals[4] if len(vals) > 4 else ""
        loan_cat = vals[5] if len(vals) > 5 else ""
        tx_type = vals[6] if len(vals) > 6 else ""
        prop_type = vals[7] if len(vals) > 7 else ""
        loan_term = vals[8] if len(vals) > 8 else ""
        states = vals[9] if len(vals) > 9 else ""
        max_ltv_p = vals[10] if len(vals) > 10 else ""
        max_ltv_c = vals[11] if len(vals) > 11 else ""
        max_ltv_rt = vals[12] if len(vals) > 12 else ""
        max_arv = vals[13] if len(vals) > 13 else ""
        min_loan = vals[14] if len(vals) > 14 else ""
        max_loan = vals[15] if len(vals) > 15 else ""
        min_rate = vals[16] if len(vals) > 16 else ""
        max_rate = vals[17] if len(vals) > 17 else ""
        origpts = vals[18] if len(vals) > 18 else ""
        min_fico = vals[19] if len(vals) > 19 else ""
        pp_pen = vals[20] if len(vals) > 20 else ""
        min_props = vals[21] if len(vals) > 21 else ""
        niches = vals[22] if len(vals) > 22 else ""
        bk_season = vals[23] if len(vals) > 23 else ""
        prog_details = vals[24] if len(vals) > 24 else ""
        submission = vals[25] if len(vals) > 25 else ""
        flyers = vals[26] if len(vals) > 26 else ""

        # Some sheets (Post AI Lender List) put the URL in a "Website" col at idx 2
        # and contact in a "Contact Information" col at idx 3. Same positions apply.

        contact_bits = extract_contact_bits(contact_blob)
        # The lender_type column sometimes contains a full contact block (seen in 9.16.24)
        if not (contact_bits["phone"] or contact_bits["email"]) and lender_type:
            second = extract_contact_bits(lender_type)
            for k in contact_bits:
                if not contact_bits[k] and second[k]:
                    contact_bits[k] = second[k]

        key = lender.lower()
        rec = grouped.get(key)
        if not rec:
            rec = {col: "" for col in OUT_COLUMNS}
            rec["Source"] = SOURCE_LABEL
            rec["Section"] = sheet_name
            rec["Company"] = lender
            rec["Contact Name"] = contact_bits["contact"]
            rec["Phone"] = contact_bits["phone"]
            rec["Email"] = contact_bits["email"]
            rec["Website"] = contact_bits["website"] or (url if URL_RE.search(url) else "")
            rec["Last Updated"] = TODAY
            grouped[key] = rec

        if program:
            rec["Programs / Loan Types"] = _join(rec["Programs / Loan Types"], program)
        if loan_cat:
            rec["Programs / Loan Types"] = _join(rec["Programs / Loan Types"], loan_cat)
        if tx_type:
            rec["Programs / Loan Types"] = _join(rec["Programs / Loan Types"], tx_type)
        if prop_type:
            rec["Property Types"] = _join(rec["Property Types"], prop_type)
        if states and not rec["States Served"]:
            rec["States Served"] = states
        if min_loan and not rec["Loan Amount - Min"]:
            rec["Loan Amount - Min"] = min_loan
        if max_loan and not rec["Loan Amount - Max"]:
            rec["Loan Amount - Max"] = max_loan
        ltv_parts = [p for p in (max_ltv_p, max_ltv_c, max_ltv_rt) if p]
        if ltv_parts:
            rec["LTV / Leverage"] = _join(rec["LTV / Leverage"], " / ".join(ltv_parts))
        rate_parts = [p for p in (min_rate, max_rate) if p]
        if rate_parts:
            rec["Interest Rates"] = _join(rec["Interest Rates"], " - ".join(rate_parts))
        if loan_term:
            rec["Amortization / Term"] = _join(rec["Amortization / Term"], loan_term)
        if niches and not rec["Primary Niche / Specialty"]:
            rec["Primary Niche / Specialty"] = niches
        note_bits = []
        if min_fico:
            note_bits.append(f"Min FICO: {min_fico}")
        if origpts:
            note_bits.append(f"Origination: {origpts}")
        if pp_pen:
            note_bits.append(f"Pre-Pay: {pp_pen}")
        if min_props:
            note_bits.append(f"Min Properties: {min_props}")
        if bk_season:
            note_bits.append(f"BK/FC Seasoning: {bk_season}")
        if max_arv:
            note_bits.append(f"Max ARV: {max_arv}")
        if prog_details:
            note_bits.append(prog_details)
        if submission:
            note_bits.append(f"Submission: {submission}")
        if flyers:
            note_bits.append(f"Flyers: {flyers}")
        if note_bits:
            rec["Additional Notes"] = _join(rec["Additional Notes"], " | ".join(note_bits))
        if lender_type and "Entity Type" in rec and not rec["Entity Type"] and len(lender_type) < 80:
            if not URL_RE.search(lender_type) and not EMAIL_RE.search(lender_type):
                rec["Entity Type"] = lender_type

    return list(grouped.values())

# ---------------------------------------------------------------------------
# Parser: 30-col "9.17.24" sheet (program-first)
# ---------------------------------------------------------------------------

def parse_9_17(sheet_name: str, df: pd.DataFrame) -> list[dict]:
    # Header at row 1
    if df.shape[0] < 3:
        return []
    header_idx = 1
    header = [str(v).strip() for v in df.iloc[header_idx].tolist()]
    col = {h: j for j, h in enumerate(header) if h}
    body = df.iloc[header_idx + 1 :].reset_index(drop=True)

    def g(row, name):
        j = col.get(name)
        if j is None or j >= len(row):
            return ""
        return clean(row.iloc[j])

    grouped: dict[str, dict] = {}

    for _, row in body.iterrows():
        lender = g(row, "Lender Name")
        if not lender:
            continue
        if lender.lower() in {"lenders", "commercial real estate"}:
            continue
        program = g(row, "Loan Program")
        program_desc = g(row, "Loan Program Description")
        contact = g(row, "Contact Info")
        url = g(row, "Lender URL")
        collateral = g(row, "Collateral")
        lien = g(row, "Lien Positions")
        fund_src = g(row, "Funding Source")
        reputation = g(row, "Reputation")
        guidelines = g(row, "Guidelines")
        term = g(row, "Term Range")
        rate_types = g(row, "Rate Types")
        iopi = g(row, "I/O - P/I")
        min_loan = g(row, "Min\nLoan Amount") or g(row, "Min Loan Amount")
        max_loan = g(row, "Max\nLoan Amount") or g(row, "Max Loan Amount")
        max_ltv = g(row, "Max \nLTV") or g(row, "Max LTV")
        max_ltc = g(row, "Max \nLTC") or g(row, "Max LTC")
        min_fico = g(row, "Min Fico")
        dscr = g(row, "DSCR Ratio")
        description = g(row, "Description")
        prop_types = g(row, "Property Types")
        rate_range = g(row, "Rate Range")
        yes_states = g(row, "YES \nStates") or g(row, "YES States")
        no_states = g(row, "NO\nStates") or g(row, "NO States")

        contact_bits = extract_contact_bits(contact)
        key = lender.lower()
        rec = grouped.get(key)
        if not rec:
            rec = {col_: "" for col_ in OUT_COLUMNS}
            rec["Source"] = SOURCE_LABEL
            rec["Section"] = sheet_name
            rec["Company"] = lender
            rec["Contact Name"] = contact_bits["contact"]
            rec["Phone"] = contact_bits["phone"]
            rec["Email"] = contact_bits["email"]
            rec["Website"] = contact_bits["website"] or (url if url else "")
            rec["Entity Type"] = fund_src
            rec["Last Updated"] = TODAY
            grouped[key] = rec

        if program:
            rec["Programs / Loan Types"] = _join(rec["Programs / Loan Types"], program)
        if prop_types:
            rec["Property Types"] = _join(rec["Property Types"], prop_types)
        states = ""
        if yes_states:
            states = yes_states
        if no_states:
            states = (states + f" (excl: {no_states})").strip()
        if states:
            rec["States Served"] = _join(rec["States Served"], states)
        if min_loan and not rec["Loan Amount - Min"]:
            rec["Loan Amount - Min"] = min_loan
        if max_loan and not rec["Loan Amount - Max"]:
            rec["Loan Amount - Max"] = max_loan
        ltv_parts = [p for p in (max_ltv, max_ltc) if p and p not in ("0", "0.0")]
        if ltv_parts:
            rec["LTV / Leverage"] = _join(rec["LTV / Leverage"], " / ".join(ltv_parts))
        if rate_range:
            rec["Interest Rates"] = _join(rec["Interest Rates"], rate_range)
        if term:
            rec["Amortization / Term"] = _join(rec["Amortization / Term"], term)
        note_bits = []
        if program_desc:
            note_bits.append(program_desc)
        if description:
            note_bits.append(description)
        if collateral:
            note_bits.append(f"Collateral: {collateral}")
        if lien:
            note_bits.append(f"Lien: {lien}")
        if reputation:
            note_bits.append(f"Reputation: {reputation}")
        if guidelines:
            note_bits.append(f"Guidelines: {guidelines}")
        if rate_types or iopi:
            note_bits.append(f"Rate/Payment: {rate_types} {iopi}".strip())
        if min_fico:
            note_bits.append(f"Min FICO: {min_fico}")
        if dscr:
            note_bits.append(f"DSCR: {dscr}")
        if note_bits:
            rec["Additional Notes"] = _join(rec["Additional Notes"], " | ".join(note_bits))

    return list(grouped.values())

# ---------------------------------------------------------------------------
# Parser: simple sheets (Sheet2, Lender From James List)
# ---------------------------------------------------------------------------

def parse_sheet2(sheet_name: str, df: pd.DataFrame) -> list[dict]:
    # Header at row 0: Lender, Contact Person, Phone, Email, Website, Niches
    if df.shape[0] < 2:
        return []
    body = df.iloc[1:].reset_index(drop=True)
    out = []
    for _, row in body.iterrows():
        lender = clean(row.iloc[0]) if len(row) > 0 else ""
        if not lender:
            continue
        contact = clean(row.iloc[1]) if len(row) > 1 else ""
        phone = clean(row.iloc[2]) if len(row) > 2 else ""
        email = clean(row.iloc[3]) if len(row) > 3 else ""
        website = clean(row.iloc[4]) if len(row) > 4 else ""
        niches = clean(row.iloc[5]) if len(row) > 5 else ""
        rec = {c: "" for c in OUT_COLUMNS}
        rec["Source"] = SOURCE_LABEL
        rec["Section"] = sheet_name
        rec["Company"] = lender
        rec["Contact Name"] = contact
        rec["Phone"] = phone
        rec["Email"] = email
        rec["Website"] = website
        rec["Primary Niche / Specialty"] = niches
        rec["Last Updated"] = TODAY
        out.append(rec)
    return out


def parse_james_list(sheet_name: str, df: pd.DataFrame) -> list[dict]:
    # Header row 0: Specific Niche, Company, Contact, Phone, Email Address, Website, Niches:
    if df.shape[0] < 2:
        return []
    body = df.iloc[1:].reset_index(drop=True)
    out = []
    for _, row in body.iterrows():
        spec = clean(row.iloc[0]) if len(row) > 0 else ""
        lender = clean(row.iloc[1]) if len(row) > 1 else ""
        if not lender:
            continue
        contact = clean(row.iloc[2]) if len(row) > 2 else ""
        phone = clean(row.iloc[3]) if len(row) > 3 else ""
        email = clean(row.iloc[4]) if len(row) > 4 else ""
        website = clean(row.iloc[5]) if len(row) > 5 else ""
        niches = clean(row.iloc[6]) if len(row) > 6 else ""
        rec = {c: "" for c in OUT_COLUMNS}
        rec["Source"] = SOURCE_LABEL
        rec["Section"] = sheet_name
        rec["Company"] = lender
        rec["Contact Name"] = contact
        rec["Phone"] = phone
        rec["Email"] = email
        rec["Website"] = website
        rec["Primary Niche / Specialty"] = _join(spec, niches)
        rec["Last Updated"] = TODAY
        out.append(rec)
    return out

# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

PROGRAM_SHEETS = {
    "Term & LOC",
    "Real Estate",
    "Commercial",
    "RehabConstruction",
    "Non-QM",
    "MCA",
    "SBA",
    "Land",
    "B2C",
    "Consolidation Svcs",
}

LENDER27_SHEETS = {
    "Post AI Lender List",
    "Lender From James List",  # NOTE handled separately
    "9.16.24 - Pre-Org Lender List",
    "Lender List",
}

SKIP_SHEETS = {
    "Summary of Loan Programs",
    "_BLANK_",
    "PROMPTS",
    "TEMPLATE ITEMS",
}

def main():
    xl = pd.ExcelFile(SRC)
    all_records: list[dict] = []
    per_sheet_counts: list[tuple[str, int]] = []

    for sheet in xl.sheet_names:
        if sheet in SKIP_SHEETS:
            continue
        df = pd.read_excel(SRC, sheet_name=sheet, dtype=str, header=None).fillna("")
        if sheet in PROGRAM_SHEETS:
            recs = parse_program_style(sheet, df)
        elif sheet == "9.17.24":
            recs = parse_9_17(sheet, df)
        elif sheet == "Sheet2":
            recs = parse_sheet2(sheet, df)
        elif sheet == "Lender From James List":
            recs = parse_james_list(sheet, df)
        elif sheet in {"Post AI Lender List", "9.16.24 - Pre-Org Lender List", "Lender List"}:
            recs = parse_lender27(sheet, df)
        else:
            # Unknown sheet layout — skip
            recs = []
        per_sheet_counts.append((sheet, len(recs)))
        all_records.extend(recs)

    # Filter junk rows (company that's just a URL, ultra short tokens, etc.)
    clean_records = []
    for r in all_records:
        c = (r.get("Company") or "").strip()
        if not c or len(c) < 2:
            continue
        if c.lower() in PLACEHOLDERS:
            continue
        if c.startswith(("http://", "https://", "www.")):
            continue
        clean_records.append(r)

    # Write CSV
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=OUT_COLUMNS, quoting=csv.QUOTE_ALL)
        w.writeheader()
        for rec in clean_records:
            w.writerow(rec)

    print("Per-sheet extraction:")
    for name, n in per_sheet_counts:
        print(f"  {name:45s} {n:4d}")
    print(f"Total lender records written: {len(clean_records)}")
    print(f"Output: {OUT}")

if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    main()
