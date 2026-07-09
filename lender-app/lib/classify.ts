/**
 * Lightweight rule-based entity-type classifier.
 * Mirrors the Python classifier in ../build_csv.py so manual entries without
 * an Entity Type get the same treatment as the original import.
 */

const RULES: Array<[string, RegExp[]]> = [
  ["Law Firm", [
    /\bllp\b/, /\blaw\b/, /\bp\.?c\.?\b/, /& english/, /attorney/, /counsel/,
    /blank rome/, /ballard spahr/, /saul ewing/, /cozen o'connor/, /stradley/,
    /archer & greiner/, /bayard/, /pachulski/, /mccarter/, /flaster\/greenberg/,
    /gellert seitz/, /white and williams/, /goldstein & mcclintock/,
    /starfield & smith/, /robinson\+cole/, /javerbaum/,
  ]],
  ["Bank / Commercial Lender", [
    /\bbank\b/, /bancorp/, /savings/, /trust co/, /\bcibc\b/, /\bpnc\b/, /\btd\b/,
    /citizens/, /jpmorgan/, /bank of america/, /huntington/, /provident/, /univest/,
    /firstrust/, /webster business/, /berkshire bank/, /flushing/, /presidential/,
    /capital bank/,
  ]],
  ["Credit Union", [/credit union/, /\bccu\b/, /federal credit union/]],
  ["SBA / USDA Lender", [/\bsba\b/, /\busda\b/, /7\(a\)/, /504/]],
  ["Factoring / A/R", [/factor/, /a\/?r /, /accounts receivable/, /invoice/]],
  ["Hard Money / Bridge Lender", [/hard money/, /bridge/]],
  ["Private / Hedge Fund", [
    /hedge fund/, /private fund/, /private money/, /private lender/, /\bfund\b/,
  ]],
  ["Church Lender", [/\bchurch\b/, /\bchristian\b/, /\bministry\b/, /\bchurches\b/]],
  ["Franchise Finance", [/franchise/]],
  ["Equipment / Leasing", [/equipment/, /leasing/]],
  ["Multifamily / Agency Lender", [
    /multifamily/, /apartment/, /fannie/, /freddie/, /agency/, /fha/, /hud/,
  ]],
  ["Restructuring / Turnaround", [
    /restructur/, /turnaround/, /workout/, /advisors/, /tma/, /bankruptcy/,
    /solmonese/, /macco/, /phoenix management/, /getzler/, /novo advisors/,
    /walker nell/, /\bctp\b/, /eisner/, /epiq/, /ssg capital/, /hunterpoint/,
    /versa capital/, /beane associates/,
  ]],
  ["Auction / Asset Disposition", [/tranzon/, /auction/, /heritage global/, /tiger capital/, /hilco/]],
  ["Consulting / Advisory", [/consultants/, /consulting/, /advisory/, /50 words/]],
  ["Cost Segregation / Tax Service", [
    /cost segregation/, /health & wealth/, /commercial property consultants/,
  ]],
  ["Broker / Correspondent", [/broker/, /commercial capital ltd/, /net branch/]],
  ["Merchant / MCA / CC Financing", [/merchant/, /cc receivable/, /strategic funding/]],
  ["Securities / IRA Lender", [/securities/, /\bira\b/, /401k/, /self directed/]],
  ["Life Company Lender", [/life company/, /life insurance/, /national western life/]],
  ["CMBS / Conduit", [/conduit/, /cmbs/, /wall street/]],
  ["Farm / Agricultural Lender", [/farm/, /agricultural/, /\bag\b/, /land loan/]],
];

const PRIORITY = [
  "Law Firm",
  "Bank / Commercial Lender",
  "Credit Union",
  "Church Lender",
  "Hard Money / Bridge Lender",
  "SBA / USDA Lender",
  "Multifamily / Agency Lender",
  "Factoring / A/R",
  "Franchise Finance",
  "Equipment / Leasing",
  "Farm / Agricultural Lender",
  "Merchant / MCA / CC Financing",
  "Securities / IRA Lender",
  "Life Company Lender",
  "CMBS / Conduit",
  "Private / Hedge Fund",
  "Auction / Asset Disposition",
  "Restructuring / Turnaround",
  "Consulting / Advisory",
  "Cost Segregation / Tax Service",
  "Broker / Correspondent",
];

export function classifyEntity(
  company: string,
  niche = "",
  notes = ""
): string {
  const combined = `${company} | ${niche} | ${notes}`.toLowerCase();
  const hits = new Set<string>();
  for (const [label, patterns] of RULES) {
    for (const re of patterns) {
      if (re.test(combined)) {
        hits.add(label);
        break;
      }
    }
  }
  if (hits.size === 0) return "Commercial Finance";
  const ordered = [...hits].sort(
    (a, b) =>
      (PRIORITY.indexOf(a) === -1 ? 99 : PRIORITY.indexOf(a)) -
      (PRIORITY.indexOf(b) === -1 ? 99 : PRIORITY.indexOf(b))
  );
  return ordered.slice(0, 3).join("; ");
}
