"""
Build a comprehensive lender/contact CSV merging:
  1. Brian Peart 2 (1).xls   -> original lender list w/ programs, niches, YSP, etc.
  2. 120424LIST (1).pdf      -> SFNet / TMA joint holiday networking attendees
  3. master_lenders.csv      -> extracted from the multi-tab "Master Lender List"
                                 xlsx via import_master_xlsx.py
  4. additional_lenders.csv  -> manual / ongoing additions (edit this file directly,
                                or use add_lender.py to append interactively)

Output: Comprehensive_Lender_List.csv

To add a new lender:
  * Option A: Run `python add_lender.py` and answer the prompts.
  * Option B: Open additional_lenders.csv in Excel/Google Sheets, add a row,
              save, and run `python build_csv.py`.
  * Option C: Use the Next.js app in lender-app/ (form, CSV upload, or ask
              the Cursor agent to call the `lenders:upsert` Convex mutation).

To re-import the master xlsx (if it gets updated), re-run:
  `python import_master_xlsx.py && python build_csv.py`.

Duplicate rule: rows with the same normalized Company + Email (or Company +
Contact Name when email is absent) are deduped. Priority goes lowest-to-highest:
Excel < PDF < master_lenders.csv < additional_lenders.csv.
"""

import csv
import re
import pandas as pd
from pathlib import Path

ROOT = Path(r"c:\Users\joshu\OneDrive\Desktop\Lender List")

# ---------- Column schema for output CSV ----------
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


# ---------- Helpers for the Excel "Niches" column ----------
FIELD_KEYS = [
    ("Primary Niche / Specialty", [r"Favorite Niche", r"Specialty", r"Niche"]),
    ("Property Types", [r"Property Types", r"Collateral types we are lending on", r"Loan Types"]),
    ("Exclusions", [r"\*Exclusions", r"Exclusions", r"Loan Types NOT CONSIDERED",
                    r"Collateral Types NOT CONSIDERED"]),
    ("States Served", [r"States you currently lend in", r"Geographic Location",
                       r"Lending Area", r"LENDING AREA", r"States Lend in", r"Location",
                       r"Territory"]),
    ("Owner-Occupied or Investor", [r"Owner-?Occupied or Investor", r"Ownership"]),
    ("Loan Amount", [r"Loan Amounts.*?Min to Max", r"LOAN AMOUNTS", r"Loan Amounts",
                     r"Loan Size", r"Investment Amounts", r"Loan Amount", r"Deals Size",
                     r"Loan Size Range"]),
    ("LTV / Leverage", [r"LOAN-?TO-?VALUE", r"LTV/?LTC", r"Loan to Value", r"LTV", r"Leverage"]),
    ("Interest Rates", [r"INTEREST RATES", r"Interest Rate Range", r"Interest Rates", r"Rate",
                        r"Rates"]),
    ("Amortization / Term", [r"Amortization", r"TERM", r"Term", r"Terms", r"Maturity"]),
    ("Referral / YSP Fees", [r"Referral \(YSP\) Fees", r"Referral YSP Fees",
                             r"Referral Fees", r"YSP Fees", r"Referral Fee"]),
]


def split_pipe_fields(text):
    """Split a Niches string by '  |  ' into a list of (key, value) or (None, value)."""
    if not text:
        return []
    parts = re.split(r"\s{1,}\|\s{1,}", text)
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        m = re.match(r"^([A-Za-z][^:]{0,60}?):\s*(.*)$", p, re.DOTALL)
        if m:
            out.append((m.group(1).strip(), m.group(2).strip()))
        else:
            out.append((None, p))
    return out


def extract_niches_fields(text):
    """Extract structured fields from the free-text Niches / program column."""
    result = {k: "" for k, _ in FIELD_KEYS}
    result["Loan Amount - Min"] = ""
    result["Loan Amount - Max"] = ""
    leftovers = []

    if not text or not isinstance(text, str):
        return result, ""

    clean = text.strip()
    pairs = split_pipe_fields(clean)

    consumed = [False] * len(pairs)
    for i, (k, v) in enumerate(pairs):
        if k is None:
            continue
        for out_key, patterns in FIELD_KEYS:
            for pat in patterns:
                if re.match(pat + r"\s*$", k, re.IGNORECASE):
                    if result.get(out_key):
                        result[out_key] += " | " + v
                    else:
                        result[out_key] = v
                    consumed[i] = True
                    break
            if consumed[i]:
                break

    for i, (k, v) in enumerate(pairs):
        if consumed[i]:
            continue
        piece = f"{k}: {v}" if k else v
        leftovers.append(piece)

    additional = " | ".join([x for x in leftovers if x]).strip()

    # Parse loan amount min/max
    la = result.pop("Loan Amount", "")
    if la:
        result["Loan Amount - Min"], result["Loan Amount - Max"] = parse_loan_amount(la)
        if not (result["Loan Amount - Min"] or result["Loan Amount - Max"]):
            additional = (f"Loan Amount: {la}" + (" | " + additional if additional else ""))

    return result, additional


def parse_loan_amount(s):
    """Try to pull min and max out of a free-text loan amount string."""
    if not s:
        return "", ""
    orig = s
    s2 = s.replace(",", "")
    # dollar figure with optional m/mm/million/k
    pat = r"\$?\s*([\d\.]+)\s*(mm|million|mil|m|k|thousand)?"
    # Find ranges first
    r = re.search(pat + r"\s*(?:-|to|–|—|up to)\s*" + pat, s2, re.IGNORECASE)
    if r:
        lo = format_amount(r.group(1), r.group(2))
        hi = format_amount(r.group(3), r.group(4))
        return lo, hi
    r = re.search(r"up to\s*" + pat, s2, re.IGNORECASE)
    if r:
        return "", format_amount(r.group(1), r.group(2))
    r = re.search(r"(?:min(?:imum)?|from)\s*" + pat, s2, re.IGNORECASE)
    if r:
        return format_amount(r.group(1), r.group(2)), ""
    # fallback: a single number
    r = re.search(pat, s2, re.IGNORECASE)
    if r and r.group(1):
        return format_amount(r.group(1), r.group(2)), ""
    return orig, ""


def format_amount(num, unit):
    try:
        n = float(num)
    except Exception:
        return num
    unit = (unit or "").lower()
    if unit in ("mm", "million", "mil", "m"):
        return f"${int(n):,}M" if n == int(n) else f"${n}M"
    if unit in ("k", "thousand"):
        return f"${int(n*1_000):,}"
    # raw number
    if n >= 1_000_000:
        return f"${int(n):,}"
    if n >= 1_000:
        return f"${int(n):,}"
    return f"${int(n)}" if n == int(n) else f"${n}"


# ---------- Entity type classification ----------
def classify_entity(company, niche="", notes=""):
    c = (company or "").lower()
    n = (niche or "").lower()
    nt = (notes or "").lower()
    combined = f"{c} | {n} | {nt}"

    rules = [
        ("Law Firm", [r"\bllp\b", r"\blaw\b", r"\bp\.?c\.?\b", r"& english", r"attorney",
                      r"counsel", r"blank rome", r"ballard spahr", r"saul ewing",
                      r"cozen o'connor", r"stradley", r"archer & greiner",
                      r"bayard", r"pachulski", r"mccarter", r"flaster/greenberg",
                      r"gellert seitz", r"white and williams", r"goldstein & mcclintock",
                      r"starfield & smith", r"robinson\+cole", r"javerbaum"]),
        ("Bank / Commercial Lender", [r"\bbank\b", r"bancorp", r"savings", r"trust co",
                                      r"credit (?:union|corp)", r"federal credit union",
                                      r"\bcibc\b", r"\bpnc\b", r"\btd\b", r"citizens",
                                      r"jpmorgan", r"bank of america", r"huntington",
                                      r"provident", r"univest", r"firstrust",
                                      r"webster business", r"berkshire bank", r"flushing",
                                      r"presidential", r"capital bank"]),
        ("Credit Union", [r"credit union", r"\bccu\b", r"\bcu\b", r"federal credit union"]),
        ("SBA / USDA Lender", [r"\bsba\b", r"\busda\b", r"7\(a\)", r"504"]),
        ("Factoring / A/R", [r"factor", r"a/?r ", r"accounts receivable", r"invoice"]),
        ("Hard Money / Bridge Lender", [r"hard money", r"bridge"]),
        ("Private / Hedge Fund", [r"hedge fund", r"private fund", r"private money",
                                  r"private lender", r"\bfund\b"]),
        ("Church Lender", [r"\bchurch\b", r"\bchristian\b", r"\bccu\b", r"\bministry\b",
                           r"\bchurches\b"]),
        ("Franchise Finance", [r"franchise"]),
        ("Equipment / Leasing", [r"equipment", r"leasing"]),
        ("Multifamily / Agency Lender", [r"multifamily", r"apartment", r"fannie", r"freddie",
                                         r"agency", r"fha", r"hud"]),
        ("Restructuring / Turnaround", [r"restructur", r"turnaround", r"workout", r"advisors",
                                        r"tma", r"bankruptcy", r"solmonese", r"macco",
                                        r"phoenix management", r"gavin \|", r"getzler",
                                        r"novo advisors", r"walker nell", r"\bctp\b",
                                        r"eisner", r"epiq", r"ssg capital", r"hunterpoint",
                                        r"versa capital", r"beane associates", r"saul ewing"]),
        ("Auction / Asset Disposition", [r"tranzon", r"auction", r"heritage global",
                                         r"tiger capital", r"hilco"]),
        ("Consulting / Advisory", [r"consultants", r"consulting", r"advisors",
                                   r"advisory", r"50 words"]),
        ("Cost Segregation / Tax Service", [r"cost segregation", r"health & wealth",
                                            r"commercial property consultants"]),
        ("Broker / Correspondent", [r"broker", r"commercial capital ltd", r"net branch"]),
        ("Merchant / MCA / CC Financing", [r"merchant", r"cc receivable",
                                           r"strategic funding"]),
        ("Securities / IRA Lender", [r"securities", r"ira", r"401k", r"self directed"]),
        ("Life Company Lender", [r"life company", r"life insurance", r"national western life"]),
        ("CMBS / Conduit", [r"conduit", r"cmbs", r"wall street"]),
        ("Farm / Agricultural Lender", [r"farm", r"agricultural", r"\bag\b", r"land loan"]),
    ]

    hits = []
    for label, patterns in rules:
        for p in patterns:
            if re.search(p, combined):
                hits.append(label)
                break
    if not hits:
        return "Commercial Finance"
    # Prefer law firm / bank / credit union to keep primary category first
    priority = [
        "Law Firm", "Bank / Commercial Lender", "Credit Union", "Church Lender",
        "Hard Money / Bridge Lender", "SBA / USDA Lender", "Multifamily / Agency Lender",
        "Factoring / A/R", "Franchise Finance", "Equipment / Leasing",
        "Farm / Agricultural Lender", "Merchant / MCA / CC Financing",
        "Securities / IRA Lender", "Life Company Lender", "CMBS / Conduit",
        "Private / Hedge Fund", "Auction / Asset Disposition",
        "Restructuring / Turnaround", "Consulting / Advisory",
        "Cost Segregation / Tax Service", "Broker / Correspondent",
    ]
    ordered = sorted(set(hits), key=lambda h: priority.index(h) if h in priority else 99)
    return "; ".join(ordered[:3])


# ---------- Process Excel ----------
def load_excel_rows():
    df = pd.read_excel(ROOT / "Brian Peart 2 (1).xls",
                       sheet_name="Lender List", header=None)
    # Columns (0-indexed):
    # 0=Specific Niche, 1=Company, 2=Contact, 3=Phone, 4=Email, 5=Website, 6=Niches, 7=Last Updated
    current_section = "Primary Lender List"
    rows = []
    i = 0
    n = len(df)
    data = df.values.tolist()
    # Skip header row
    start_idx = 1
    while start_idx < n:
        row = data[start_idx]
        # Detect section header: Company col looks like a label
        label = str(row[1]).strip() if row[1] is not None else ""
        if label in ("Brokers That May Help:",):
            current_section = "Brokers (May Help)"
            start_idx += 1
            continue
        if label == "NO LONGER ON LENDER LIST":
            current_section = "No Longer On Lender List"
            start_idx += 1
            continue
        niche_col0 = str(row[0]).strip() if row[0] is not None else ""
        if niche_col0 == "Hot Local Banks:":
            current_section = "Hot Local Banks"
            start_idx += 1
            continue
        # skip completely empty rows
        if all((x is None) or (isinstance(x, float) and pd.isna(x)) or str(x).strip() == ""
               for x in row):
            start_idx += 1
            continue

        # Multi-line cells cause subsequent physical rows to belong to same record -
        # but pandas handles cell contents w/ newlines correctly. HOWEVER, the original
        # xls has a few cases where a long Niches column ended up breaking into a
        # visually-following row with only col 6 or only col 7 populated. Detect:
        #   next row has empty 1..5 but populated 6 or 7 -> merge into this one.
        base = list(row)
        j = start_idx + 1
        while j < n:
            nxt = data[j]
            empty_first = all(
                (nxt[k] is None) or (isinstance(nxt[k], float) and pd.isna(nxt[k])) or str(nxt[k]).strip() == ""
                for k in range(0, 6)
            )
            has_tail = any(
                (nxt[k] is not None) and not (isinstance(nxt[k], float) and pd.isna(nxt[k])) and str(nxt[k]).strip() != ""
                for k in (6, 7)
            )
            if empty_first and has_tail:
                # merge tail
                if nxt[6] is not None and not (isinstance(nxt[6], float) and pd.isna(nxt[6])):
                    extra = str(nxt[6]).strip()
                    if extra:
                        cur = str(base[6]).strip() if base[6] is not None else ""
                        base[6] = (cur + " " + extra).strip()
                if nxt[7] is not None and not (isinstance(nxt[7], float) and pd.isna(nxt[7])):
                    if base[7] is None or (isinstance(base[7], float) and pd.isna(base[7])) or str(base[7]).strip() == "":
                        base[7] = nxt[7]
                j += 1
            else:
                break

        rows.append((current_section, base))
        start_idx = j

    return rows


def norm(v):
    if v is None:
        return ""
    if isinstance(v, float) and pd.isna(v):
        return ""
    s = str(v).replace("\r", " ").replace("\n", " ").strip()
    # collapse internal whitespace
    s = re.sub(r"\s+", " ", s)
    return s


def format_date(v):
    if v is None:
        return ""
    if isinstance(v, float) and pd.isna(v):
        return ""
    try:
        dt = pd.to_datetime(v, errors="coerce")
        if pd.isna(dt):
            return norm(v)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return norm(v)


def excel_to_records():
    raw = load_excel_rows()
    records = []
    for section, row in raw:
        niche0, company, contact, phone, email, website, niches, updated = row[:8]
        company_s = norm(company)
        if not company_s:
            continue

        status = ""
        if section == "No Longer On Lender List":
            status = "No Longer on Lender List"
        if "NOT ACCEPTING" in norm(niches).upper() or "NO LONGER" in norm(niches).upper() \
                or "NOT LENDING" in norm(niches).upper():
            if status:
                status += "; "
            status += "Check current status (notes mention not lending / not accepting)"

        primary_niche_col = norm(niche0)
        parsed, leftover = extract_niches_fields(norm(niches))

        entity_type = classify_entity(company_s, primary_niche_col, norm(niches))

        primary = parsed.get("Primary Niche / Specialty") or primary_niche_col

        rec = {
            "Source": "Excel: Brian Peart Lender List",
            "Section": section,
            "Company": company_s,
            "Contact Name": norm(contact),
            "Title / Role": "",
            "Phone": norm(phone),
            "Email": norm(email).replace("NO EMAIL ADDRESS ON FILE", ""),
            "Website": norm(website),
            "Entity Type": entity_type,
            "Primary Niche / Specialty": primary,
            "Programs / Loan Types": primary_niche_col if primary_niche_col and primary_niche_col != primary else "",
            "Property Types": parsed.get("Property Types", ""),
            "Exclusions": parsed.get("Exclusions", ""),
            "States Served": parsed.get("States Served", ""),
            "Owner-Occupied or Investor": parsed.get("Owner-Occupied or Investor", ""),
            "Loan Amount - Min": parsed.get("Loan Amount - Min", ""),
            "Loan Amount - Max": parsed.get("Loan Amount - Max", ""),
            "LTV / Leverage": parsed.get("LTV / Leverage", ""),
            "Interest Rates": parsed.get("Interest Rates", ""),
            "Amortization / Term": parsed.get("Amortization / Term", ""),
            "Referral / YSP Fees": parsed.get("Referral / YSP Fees", ""),
            "Additional Notes": leftover,
            "Status": status,
            "Last Updated": format_date(updated),
        }
        records.append(rec)
    return records


# ---------- Process PDF ----------
# All rows pulled from the PDF text
PDF_ROWS = [
    ("Linda", "McDonough", "50 Words LLC", "(610) 631-5702", "lmcdonough@50words.com"),
    ("James", "Shalinsky", "Advanced Funding Group", "(267) 446-7902", "james@advancedfundinggroup.com"),
    ("Kurt", "Kohler", "Allison Group, The", "(856) 464-1970", "the.allison.group@comcast.net"),
    ("Douglas", "Leney, Esq.", "Archer & Greiner, P.C.", "(856) 616-2608", "dleney@archerlaw.com"),
    ("Elizabeth", "Witko", "Armanino LLP", "(570) 702-3231", "elizabeth.witko@armaninollp.com"),
    ("Maulin", "Vidwans", "Ballard Spahr", "(215) 864-8523", "vidwansm@ballardspahr.com"),
    ("Steven", "Miller", "Ballard Spahr LLP", "(215) 864-8310", "millersm@ballardspahr.com"),
    ("Steven", "Adler", "Bayard P.A.", "(860) 869-0339", "sadler@bayardlaw.com"),
    ("Kevin", "Beane", "Beane Associates Inc.", "(302) 479-5438", "kjbeane@beaneassociates.com"),
    ("Christopher", "Todd", "Beane Associates Inc.", "(302) 479-5438", "chtodd@beaneassociates.com"),
    ("James", "Crumlish", "Berkshire Bank", "(215) 219-6200", "jcrumlish@berkshirebank.com"),
    ("Matthew", "Winalski", "Berkshire Bank", "(412) 400-1163", "matthew.winalski@gmail.com"),
    ("Dalila", "Berry", "Blank Rome LLP", "(215) 569-5567", "dalila.berry@blankrome.com"),
    ("Lawrence", "Flick", "Blank Rome LLP", "(212) 885-5556", "flick@blankrome.com"),
    ("Michael", "Graziano", "Blank Rome LLP", "(215) 569-5387", "graziano@blankrome.com"),
    ("Matthew", "Kaslow", "Blank Rome LLP", "(610) 322-7022", "mkaslow@blankrome.com"),
    ("Christopher", "Manion", "Blank Rome LLP", "", "cmanion@blankrome.com"),
    ("Josef", "Mintz", "Blank Rome LLP", "(302) 425-6478", "josef.mintz@blankrome.com"),
    ("Michael", "Morabito", "Blank Rome LLP", "(215) 569-5653", "michael.morabito@blankrome.com"),
    ("Tyler", "Mullen", "Blank Rome LLP", "(215) 569-5547", "tmullen@blankrome.com"),
    ("Mark", "Rabinowitz", "Blank Rome LLP", "(215) 569-5629", "mrabinowitz@blankrome.com"),
    ("James", "Ross", "Blank Rome LLP", "(215) 569-5681", "jsross@blankrome.com"),
    ("Adam", "Sansweet", "Blank Rome LLP", "(610) 937-3206", "adam.sansweet@blankrome.com"),
    ("Michael", "Schaedle", "Blank Rome LLP", "(215) 530-4250", "mike.schaedle@blankrome.com"),
    ("Nelson", "Sproat", "Blank Rome LLP", "(610) 574-1936", "nelson.sproat@blankrome.com"),
    ("Shlomo", "Troodler", "Blank Rome LLP", "(215) 569-5338", "troodler@blankrome.com"),
    ("Gregory", "Vizza", "Blank Rome LLP", "(215) 569-5702", "vizza@blankrome.com"),
    ("Jillian", "Zvolensky", "Blank Rome LLP", "(215) 569-5423", "jzvolensky@blankrome.com"),
    ("Ronald", "Kerdasha", "CIBC", "(443) 798-6505", "ronald.kerdasha@cibc.com"),
    ("Randy", "Lederman", "CIT Northbridge Credit", "(201) 681-5698", "randy.lederman@cit.com"),
    ("Cynthia", "Matje", "Citizens Commercial Banking", "(215) 254-3613", "cynthia.matje@citizensbank.com"),
    ("JW", "Clements", "Clements Capital LLC", "(267) 255-1325", "jw@clementscap.com"),
    ("Carol", "Apicella", "Commercial Funding Inc.", "(443) 799-0179", "capicella@commercialfund.com"),
    ("Brandon", "Schmoyer", "Cortland Credit Group", "(215) 771-0066", "bschmoyer@cortlandcredit.ca"),
    ("Marla", "Benedek", "Cozen O'Connor", "(302) 295-2024", "mbenedek@cozen.com"),
    ("Mark", "Felger", "Cozen O'Connor", "(302) 295-2087", "mfelger@cozen.com"),
    ("Gregory", "Fischer", "Cozen O'Connor", "(302) 295-2017", "gfischer@cozen.com"),
    ("Jesse", "Holstein", "Dwight Funding", "(267) 241-6252", "jholstein@dwightfund.com"),
    ("Chris", "Huntington", "eCapital", "(786) 850-0463", "Chris.Huntington@ecapital.com"),
    ("Calvin", "Navatto", "eCapital Corp.", "(201) 657-6949", "cal.navatto@ecapital.com"),
    ("Meredith", "Carter", "Edge Capital Lending", "(610) 733-5560", "meredithc@edgecl.com"),
    ("Robert", "Katz, CTP", "Eisner Advisory Group LLC", "(215) 738-5542", "robert.katz@eisneramper.com"),
    ("Lauren", "Berret", "Eisner Advisory Group, LLC", "(610) 413-8792", "lauren.berret@eisneramper.com"),
    ("Jennifer", "Rabinowitz", "Epiq", "(917) 796-9591", "jennifer.rabinowitz@epiqglobal.com"),
    ("Anne", "Roslin", "First Business Capital Corp.", "(732) 856-7826", "aroslin@firstbusiness.bank"),
    ("David", "Rivkind", "Firstrust Bank", "(610) 238-5074", "drivkind@firstrust.com"),
    ("William", "Burnett", "Flaster/Greenberg P.C.", "(215) 279-9383", "william.burnett@flastergreenberg.com"),
    ("Damien", "Tancredi", "Flaster/Greenberg P.C.", "(856) 382-2226", "damien.tancredi@flastergreenberg.com"),
    ("Stanley", "Mastil", "Gavin | Solmonese LLC", "(302) 665-8997", "stanley.mastil@gavinsolmonese.com"),
    ("Jeremy", "VanEtten", "Gavin | Solmonese LLC", "(267) 229-2448", "jeremy.vanetten@gavinsolmonese.com"),
    ("Michael", "Busenkell", "Gellert Seitz Busenkell & Brown, LLC", "(302) 425-5812", "mbusenkell@gsbblaw.com"),
    ("Ronald", "Gellert", "Gellert Seitz Busenkell & Brown, LLC", "(302) 425-5806", "rgellert@gsbblaw.com"),
    ("Michael", "Van Gorder", "Gellert Seitz Busenkell & Brown, LLC", "(302) 416-3351", "mvangorder@gsbblaw.com"),
    ("Edward", "Phillips, CTP", "Getzler Henrich & Associates LLC", "(267) 253-9262", "ephillips@getzlerhenrich.com"),
    ("Maria", "Sawczuk, Esq.", "Goldstein & McClintock LLLP", "(302) 893-5118", "marias@restructuringshop.com"),
    ("Jack", "Penzi", "Great Rock Capital", "(516) 672-2885", "penzi@greatrockcapital.com"),
    ("Michael", "Aho", "Heritage Global Partners", "(617) 470-4803", "maho@hginc.com"),
    ("Kyle", "Herman", "Hilco Corporate Finance LLC", "", "kherman@hilcocf.com"),
    ("Heather", "Morgan", "Hilco Global", "(760) 390-8266", "hmorgan@hilcoglobal.com"),
    ("Peter", "Furman", "HunterPoint LLC", "(212) 328-9497", "pfurman@hunterpoint.com"),
    ("John", "Sorber", "Huntington Business Credit", "(215) 814-0397", "john.m.sorber@huntington.com"),
    ("Raymond", "Patella", "Javerbaum Wurgaft Hicks Kahn Wikstrom & Sinins, PC", "(609) 221-7209", "rpatella@lawjw.com"),
    ("Randall", "Siegele", "JPMorgan Chase", "(215) 990-3593", "randall.w.siegele@jpmorgan.com"),
    ("Zachary", "LaSalvia", "JPMorgan Chase Bank", "(917) 322-1557", "zachary.x.lasalvia@jpmorgan.com"),
    ("David", "Fraimow", "LBC Credit Partners, LP", "(215) 972-8904", "dfraimow@lbccredit.com"),
    ("DJ", "Krystopa", "LSQ Funding Group LC", "(215) 350-3839", "dkrystopa@lsq.com"),
    ("Patrick", "Stewart, CTP", "MACCO Restructuring Group, LLC", "(215) 205-3336", "patrick@macco.group"),
    ("Inez", "Markovich, Esq.", "McCarter & English LLP", "(215) 582-1978", "imarkovich@mccarter.com"),
    ("Vincent", "Campbell", "Merchant Financial Group", "(212) 398-4183", "vcampbell@merchantfinancial.com"),
    ("Bruce", "Pavesich", "MidCap Business Credit LLC", "(410) 592-8855", "bpavesich@midcap.com"),
    ("Claudia", "Springer, Esq.", "Novo Advisors", "(215) 869-3775", "cspringer@novo-advisors.com"),
    ("James", "O'Neill", "Pachulski Stang Ziehl & Jones LLP", "(302) 778-6407", "joneill@pszjlaw.com"),
    ("Colin", "Robinson", "Pachulski Stang Ziehl & Jones LLP", "(302) 778-6426", "crobinson@pszjlaw.com"),
    ("Robert", "Abraham", "Pathward", "(646) 736-8193", "rabraham@pathward.com"),
    ("Kevin", "Doyle", "Phoenix Management, a part of J.S. Held LLC", "(708) 601-4733", "kdoyle@phoenixmanagement.com"),
    ("Robert", "Orzechowski", "PNC Business Credit", "(215) 585-6727", "robert.orzechowski@pnc.com"),
    ("Neil", "Otte", "PNC Business Credit", "(610) 283-0021", "neil.otte@pnc.com"),
    ("Kenneth", "Kaestner", "Provident Bank", "(732) 213-5876", "kenneth.kaestner@provident.bank"),
    ("Rachel", "Jaffe Mauceri", "Robinson+Cole LLP", "(917) 589-5914", "rmauceri@rc.com"),
    ("Anthony", "Vassallo", "Rosenthal & Rosental Inc.", "(917) 860-7583", "avassallo@rosenthalinc.com"),
    ("Paul", "Schuldiner", "Rosenthal & Rosenthal Inc.", "(212) 356-1703", "pschuldiner@rosenthalinc.com"),
    ("Monique", "DiSabatino", "Saul Ewing LLP", "(302) 421-6806", "monique.disabatino@saul.com"),
    ("Turner", "Falk", "Saul Ewing LLP", "(215) 972-8415", "turner.falk@saul.com"),
    ("Jeffrey", "Hampton, Esq.", "Saul Ewing LLP", "(215) 972-7118", "jeffrey.hampton@saul.com"),
    ("Maxwell", "Hanamirian", "Saul Ewing LLP", "(215) 882-2162", "maxwell.hanamirian@saul.com"),
    ("Adam H.", "Isenberg, Esq.", "Saul Ewing LLP", "(215) 972-8662", "adam.isenberg@saul.com"),
    ("Evan", "Miller", "Saul Ewing LLP", "(302) 421-6864", "evan.miller@saul.com"),
    ("Mark", "Minuti", "Saul Ewing LLP", "(302) 421-6840", "mark.minuti@saul.com"),
    ("Nicholas", "Smargiassi", "Saul Ewing LLP", "(302) 421-6827", "nicholas.smargiassi@saul.com"),
    ("Michael", "Gorman", "SC&H Capital", "(410) 403-1500", "mgorman@schgroup.com"),
    ("Stephanie", "Koveleski", "SLR Business Credit", "(609) 917-6225", "skoveleski@slrbusinesscredit.com"),
    ("Mark J.", "Simshauser", "SLR Business Credit", "(516) 660-4501", "msimshauser@slrbusinesscredit.com"),
    ("Michael", "Goodman", "SSG Capital Advisors, LLC", "(610) 940-5806", "mgoodman@ssgca.com"),
    ("Neil", "Gupta", "SSG Capital Advisors, LLC", "(610) 940-2663", "ngupta@ssgca.com"),
    ("Matthew", "Karlson", "SSG Capital Advisors, LLC", "(610) 940-5804", "mkarlson@ssgca.com"),
    ("Alexander", "Lamm", "SSG Capital Advisors, LLC", "(610) 940-3882", "alamm@ssgca.com"),
    ("J. Scott", "Victor", "SSG Capital Advisors, LLC", "(610) 940-5802", "jsvictor@ssgca.com"),
    ("Kia", "House", "Starfield & Smith PC", "(215) 479-5600", "khouse@starfieldsmith.com"),
    ("Lyndsay", "Rowland", "Starfield & Smith PC", "(267) 470-1154", "lrowland@starfieldsmith.com"),
    ("Matts", "Batryn", "Stradley Ronon Stevens & Young LLP", "", "mbatryn@stradley.com"),
    ("Michael P.", "Bonner", "Stradley Ronon Stevens & Young LLP", "(856) 321-2405", "mbonner@stradley.com"),
    ("Peter", "Brockmeyer", "Stradley Ronon Stevens & Young LLP", "(212) 812-4134", "pbrockmeyer@stradley.com"),
    ("Katherine", "Durr", "Stradley Ronon Stevens & Young LLP", "(215) 564-8154", "kdurr@stradley.com"),
    ("Caroline", "Gorman", "Stradley Ronon Stevens & Young LLP", "(215) 564-8633", "cgorman@stradley.com"),
    ("Avery", "Marz", "Stradley Ronon Stevens & Young LLP", "(484) 769-6747", "amarz@stradley.com"),
    ("Julie", "Murphy", "Stradley Ronon Stevens & Young LLP", "(609) 458-6534", "jmmurphy@stradley.com"),
    ("Sanjana", "Pai", "Stradley Ronon Stevens & Young LLP", "(954) 647-5636", "spai@stradley.com"),
    ("Daniel", "Pereira", "Stradley Ronon Stevens & Young LLP", "(215) 564-8747", "dpereira@stradley.com"),
    ("Allie", "Rice", "Stradley Ronon Stevens & Young LLP", "(215) 564-8158", "arice@stradley.com"),
    ("Christopher W.", "Rosenbleeth", "Stradley Ronon Stevens & Young LLP", "(215) 564-8051", "crosenbleeth@stradley.com"),
    ("Gary", "Scharmett", "Stradley Ronon Stevens & Young LLP", "(215) 968-2463", "gscharmett@stradley.com"),
    ("William", "Bahls", "TAB Bank", "(856) 340-3087", "bill.bahls@tabbank.com"),
    ("Steven", "Fahringer", "TD Bank", "(484) 410-5335", "steven.fahringer@td.com"),
    ("Stephen", "Savage", "Tiger Capital Group", "(215) 205-1554", "ssavage@tigergroup.com"),
    ("Frederick", "Raccosta", "Tiger Capital Group LLC", "(215) 307-7454", "fraccosta@tigergroup.com"),
    ("Bob", "Dann", "Tranzon Auction Properties", "(215) 850-5466", "bdann@tranzon.com"),
    ("Andrea", "Pauson", "Turnaround Management Association", "(215) 657-5551", "philadelphia@turnaround.org"),
    ("Jaime", "Rowley", "Turnaround Management Association", "", "jlk5480@gmail.com"),
    ("Mark", "Lammey", "U.S. Bankruptcy Court, Eastern District of Pennsylvania", "(610) 533-7636", "markrlammey@gmail.com"),
    ("Bill", "Wilson", "Univest Bank and Trust Co", "(215) 682-4115", "wilsonW@univest.net"),
    ("Richard", "Schreiber", "Versa Capital Management LLC", "(267) 808-3383", "rschreiber@versa.com"),
    ("Kenneth", "Frank", "Webster Business Credit Corp.", "(610) 220-1027", "kefrank@websterbank.com"),
    ("Amy", "Vulpio, Esq.", "White and Williams LLP", "(215) 864-6250", "vulpioa@whiteandwilliams.com"),
    ("Lauren", "O'Leary", "", "(917) 488-8991", "lolinnyc@outlook.com"),
    ("Sheri", "Perez", "", "(610) 952-0957", "sherilondonperez@gmail.com"),
]


def pdf_to_records():
    records = []
    source = "PDF: SFNet/TMA Joint Holiday Networking, Garces Trading Co, Philadelphia PA - Dec 4, 2024"
    for first, last, company, phone, email in PDF_ROWS:
        full_name = f"{first} {last}".strip().rstrip(",").strip()
        # Extract title designations from last name (e.g. ", Esq.", ", CTP")
        title = ""
        m = re.search(r",\s*(Esq\.?|CTP|PC|MD|Ph\.?D\.?|CPA)\s*$", last)
        if m:
            title = m.group(1)

        entity_type = classify_entity(company or full_name)

        primary = ""
        if entity_type and entity_type != "Commercial Finance":
            primary = entity_type

        rec = {
            "Source": source,
            "Section": "Networking Event Attendee",
            "Company": company,
            "Contact Name": full_name,
            "Title / Role": title,
            "Phone": phone,
            "Email": email,
            "Website": "",
            "Entity Type": entity_type,
            "Primary Niche / Specialty": primary,
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
            "Referral / YSP Fees": "",
            "Additional Notes": "Met at SFNet / TMA joint holiday networking event; active in specialty finance / turnaround / restructuring / lending community (Greater Philadelphia / Mid-Atlantic).",
            "Status": "",
            "Last Updated": "2024-12-04",
        }
        records.append(rec)
    return records


# ---------- Process additional_lenders.csv (manual additions) ----------
ADDITIONAL_CSV = "additional_lenders.csv"
MASTER_CSV = "master_lenders.csv"


def _read_csv_records(filename: str, default_source: str, default_section: str):
    """Generic reader for any CSV that already has the Lender List schema.

    Skips blank and 'EXAMPLE ...' rows, fills Source/Section/Entity Type/Last
    Updated defaults the same way additional_csv_records() does.
    """
    path = ROOT / filename
    if not path.exists():
        return []

    import datetime as _dt

    today = _dt.date.today().isoformat()
    records = []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not any((v or "").strip() for v in row.values()):
                continue
            company = (row.get("Company") or "").strip()
            if not company:
                continue
            if company.upper().startswith("EXAMPLE"):
                continue
            rec = {k: (row.get(k) or "").strip() for k in OUT_COLUMNS}
            if not rec.get("Source"):
                rec["Source"] = default_source
            if not rec.get("Section"):
                rec["Section"] = default_section
            if not rec.get("Entity Type"):
                rec["Entity Type"] = classify_entity(
                    company,
                    rec.get("Primary Niche / Specialty", ""),
                    rec.get("Additional Notes", ""),
                )
            if not rec.get("Last Updated"):
                rec["Last Updated"] = today
            records.append(rec)
    return records


def master_csv_records():
    """Read master_lenders.csv (output of import_master_xlsx.py) so data from
    the multi-tab Master Lender List xlsx gets merged into the pipeline.
    """
    return _read_csv_records(MASTER_CSV, "Master Lender List (imported)", "Imported")


def additional_csv_records():
    """Read additional_lenders.csv so users can add new lenders without editing code.

    Rules:
      * Blank rows are skipped.
      * Rows whose Company starts with "EXAMPLE" (case-insensitive) are treated as
        template examples and skipped.
      * If Source / Section are blank, they default to "Manual Entry" /
        "Manual Addition".
      * If Entity Type is blank, it is auto-classified from Company + Niche + Notes.
      * If Last Updated is blank, it defaults to today's date.
    """
    path = ROOT / ADDITIONAL_CSV
    if not path.exists():
        return []

    import datetime as _dt
    today = _dt.date.today().isoformat()

    records = []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not any((v or "").strip() for v in row.values()):
                continue
            company = (row.get("Company") or "").strip()
            if not company:
                continue
            if company.upper().startswith("EXAMPLE"):
                continue

            rec = {k: (row.get(k) or "").strip() for k in OUT_COLUMNS}
            if not rec.get("Source"):
                rec["Source"] = "Manual Entry"
            if not rec.get("Section"):
                rec["Section"] = "Manual Addition"
            if not rec.get("Entity Type"):
                rec["Entity Type"] = classify_entity(
                    company,
                    rec.get("Primary Niche / Specialty", ""),
                    rec.get("Additional Notes", ""),
                )
            if not rec.get("Last Updated"):
                rec["Last Updated"] = today
            records.append(rec)
    return records


# ---------- Dedupe ----------
def _dedupe_key(rec):
    """Two records collapse only when they represent the same person at the same
    company. We key on (normalized Company, Email OR Contact Name) so that e.g.
    one broker representing three lenders shows up as three rows, but the exact
    same person listed twice in both source files collapses to one."""
    company = re.sub(r"[^a-z0-9]+", "", (rec.get("Company") or "").lower())
    email = (rec.get("Email") or "").strip().lower()
    if email:
        return ("co+em", company, email)
    contact = re.sub(r"[^a-z0-9]+", "", (rec.get("Contact Name") or "").lower())
    if company or contact:
        return ("co+nm", company, contact)
    return ("uniq", id(rec))


def _merge_record(existing, incoming):
    """Field-wise merge: later (incoming) record wins when it has a value, but
    earlier fields are preserved if the incoming record leaves them blank.
    This way a sparse update doesn't wipe rich data from an earlier source.
    """
    out = dict(existing)
    for k, v in incoming.items():
        v = (v or "").strip()
        existing_v = (out.get(k) or "").strip()
        if not v:
            continue
        if not existing_v:
            out[k] = v
            continue
        # Accumulate free-text columns rather than replacing.
        if k in {
            "Programs / Loan Types",
            "Property Types",
            "Additional Notes",
            "Primary Niche / Specialty",
            "Exclusions",
            "States Served",
        }:
            if v not in existing_v:
                out[k] = existing_v + " | " + v
        else:
            out[k] = v
    return out


def merge_and_dedupe(*record_lists):
    """Merge lists, later lists override earlier ones on duplicate key.

    On duplicate-key collision we do a field-wise merge (see _merge_record) so
    a sparse later record augments instead of wiping the earlier richer data.
    Order is stable relative to first appearance.
    """
    by_key = {}
    order = []
    for lst in record_lists:
        for rec in lst:
            key = _dedupe_key(rec)
            if key in by_key:
                by_key[key] = _merge_record(by_key[key], rec)
            else:
                by_key[key] = rec
                order.append(key)
    return [by_key[k] for k in order]


# ---------- MAIN ----------
def main():
    xl_records = excel_to_records()
    pdf_records = pdf_to_records()
    master_records = master_csv_records()
    add_records = additional_csv_records()

    # Merge priority (later overrides earlier):
    #   1) Original xls sheets and PDF (base data)
    #   2) master_lenders.csv (imported from the multi-tab Master Lender List xlsx)
    #   3) additional_lenders.csv (hand-maintained manual overrides)
    all_records = merge_and_dedupe(xl_records, pdf_records, master_records, add_records)

    out_path = ROOT / "Comprehensive_Lender_List.csv"
    with out_path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=OUT_COLUMNS, quoting=csv.QUOTE_ALL)
        w.writeheader()
        for r in all_records:
            w.writerow({k: r.get(k, "") for k in OUT_COLUMNS})

    total_in = len(xl_records) + len(pdf_records) + len(master_records) + len(add_records)
    deduped = total_in - len(all_records)
    print(f"Wrote {len(all_records)} records to {out_path}")
    print(f"  From Excel (original):   {len(xl_records)}")
    print(f"  From PDF:                {len(pdf_records)}")
    print(f"  From master_lenders:     {len(master_records)}")
    print(f"  From additional_lenders: {len(add_records)}")
    if deduped:
        print(f"  Deduped (overrides):     {deduped}")


if __name__ == "__main__":
    main()
