#!/usr/bin/env python3
"""Generate a self-contained Monarch-style Sankey HTML from Ledger data.json."""
import json, os, html
from collections import defaultdict
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.expanduser("~/Library/Application Support/app.ledger.desktop/data.json")
OUT = "/Users/levcraig/ledger/ledger-sankey.html"

def _load_lib(fname, url):
    """Use the bundled minified lib next to this script; re-download if missing."""
    path = os.path.join(HERE, fname)
    if not os.path.exists(path):
        import urllib.request
        urllib.request.urlretrieve(url, path)
    return open(path).read()

D3 = _load_lib("d3.min.js", "https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js")
D3SANKEY = _load_lib("d3-sankey.min.js", "https://cdn.jsdelivr.net/npm/d3-sankey@0.12.3/dist/d3-sankey.min.js")

d = json.load(open(DATA))
cats = {c["id"]: c for c in d["categories"]}
accts = {a["id"]: a for a in d["savingsAccounts"]}

# ---- YTD filter: restrict every stream to the current calendar year so the
# flows stay balanced (Income == Spending + Savings). ISO UTC date strings and
# "YYYY-MM" budget months both start with the 4-digit year. ----
YEAR = str(datetime.now().year)
txns = [t for t in d["transactions"] if t["date"][:4] == YEAR]
budgets = [b for b in d["monthlyBudgets"] if b["month"][:4] == YEAR]
contribs = [c for c in d["savingsContributions"] if c["date"][:4] == YEAR]

CASH_SOURCES = ("bank_transfer", "other")  # affectsAvailable == True

# ---- spending per category (user share, exclude deleted + split parents) ----
def user_share(t):
    return (t["amount"] - t.get("partnerShare", 0)) if t.get("isShared") else t["amount"]

cat_spend = defaultdict(float)
for t in txns:
    if t.get("isDeleted") or t.get("isSplitParent"):
        continue
    cat_spend[t["categoryId"]] += user_share(t)

# ---- savings: cash contributions per account ----
acct_cash = defaultdict(float)
for c in contribs:
    if c["source"] in CASH_SOURCES:
        acct_cash[c["accountId"]] += c["amount"]

total_income = sum(b["income"] for b in budgets)
total_spend = round(sum(cat_spend.values()), 2)
total_savings = round(sum(acct_cash.values()), 2)
surplus = round(total_income - total_savings - total_spend, 2)

# total contributions (for footnote: non-cash growth)
total_contrib = sum(c["amount"] for c in contribs)
noncash_savings = round(total_contrib - total_savings, 2)

# ---- date range ----
months = sorted(b["month"] for b in budgets)
def month_label(m):
    return datetime.strptime(m, "%Y-%m").strftime("%b %Y")
date_range = f"{month_label(months[0])} – {month_label(months[-1])}"
n_months = len(months)

# ---- savings account color fallbacks (sage family) ----
SAGE = ["#5B8C5A", "#6FA06D", "#7FB07D", "#4E7A4D", "#8CBE8A"]

# ---- build nodes / links ----
nodes = []
links = []

# Surplus is folded into Savings as a "General Savings" node
savings_flow = round(total_savings + surplus, 2)

# Two middle "hubs" (Savings, Spending) so every right-column node is reached
# via a hub in the same column. No link bypasses a column -> no crossings.
# "group" drives vertical order within each column: savings side (0) above the
# spending side (1); within a group, nodes sort by amount descending.
nodes.append({"id": "income",   "name": "Income",   "icon": "\U0001F4B5", "color": "#C45D3A", "group": 0})
nodes.append({"id": "savings",  "name": "Savings",  "icon": "\U0001F3E6", "color": "#5B8C5A", "group": 0})
nodes.append({"id": "spending", "name": "Spending", "icon": "\U0001F4B3", "color": "#A8917F", "group": 1})

# income -> hubs
links.append({"source": "income", "target": "savings",  "value": savings_flow})
links.append({"source": "income", "target": "spending", "value": total_spend})

# savings -> accounts
for i, (aid, amt) in enumerate(sorted(acct_cash.items(), key=lambda x: -x[1])):
    a = accts[aid]
    color = a.get("color") or SAGE[i % len(SAGE)]
    nodes.append({"id": f"acct_{aid}", "name": a["name"], "icon": a.get("icon", ""), "color": color, "group": 0})
    links.append({"source": "savings", "target": f"acct_{aid}", "value": round(amt, 2)})

# savings -> general savings (the former surplus: leftover cash not yet allocated)
nodes.append({"id": "gen_savings", "name": "General Savings", "icon": "\U0001FA99", "color": "#C9A227", "group": 0})
links.append({"source": "savings", "target": "gen_savings", "value": surplus})

# spending -> categories (only positive spend)
for cid, amt in sorted(cat_spend.items(), key=lambda x: -x[1]):
    amt = round(amt, 2)
    if amt <= 0:
        continue
    c = cats[cid]
    nodes.append({"id": f"cat_{cid}", "name": c["name"], "icon": c.get("icon", ""),
                  "color": c.get("color") or "#C45D3A", "essential": bool(c.get("isEssential")), "group": 1})
    links.append({"source": "spending", "target": f"cat_{cid}", "value": amt})

n_categories = sum(1 for c in cat_spend.values() if c > 0)
right_col_count = n_categories + len(acct_cash) + 1  # +surplus

payload = {
    "nodes": nodes,
    "links": links,
    "income": total_income,
    "rightColCount": right_col_count,
}

meta = {
    "income": total_income,
    "spend": total_spend,
    "savings": savings_flow,        # total into savings hub (incl. general savings)
    "accountsCash": total_savings,  # intentional contributions to tracked accounts
    "genSavings": surplus,          # leftover folded in as General Savings
    "noncash": noncash_savings,
    "dateRange": date_range,
    "nMonths": n_months,
    "nTxns": sum(1 for t in txns if not t.get("isDeleted") and not t.get("isSplitParent")),
}

DATA_JSON = json.dumps(payload, ensure_ascii=False)
META_JSON = json.dumps(meta, ensure_ascii=False)

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ledger — Money Flow</title>
<style>
  :root {
    --cream: #FAF8F5; --surface: #FFFFFF; --charcoal: #2D2A26; --muted: #6B6660;
    --primary: #C45D3A; --sage: #5B8C5A; --gold: #C9A227; --border: #ECE6DE;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--cream); color: var(--charcoal);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 36px 28px 56px; }
  h1 {
    font-family: Georgia, "Times New Roman", serif; font-weight: 600;
    font-size: 30px; margin: 0 0 4px; letter-spacing: -0.01em;
  }
  .sub { color: var(--muted); font-size: 15px; margin: 0 0 24px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 28px; }
  .stat {
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
    padding: 16px 18px;
  }
  .stat .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .stat .val {
    font-family: "SF Mono", ui-monospace, Menlo, monospace;
    font-size: 23px; font-weight: 600; margin-top: 6px;
  }
  .stat .pct { font-size: 13px; color: var(--muted); margin-top: 2px; }
  .stat.income .val { color: var(--primary); }
  .stat.savings .val { color: var(--sage); }
  .stat.surplus .val { color: var(--gold); }
  .card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
    padding: 10px 8px 8px; box-shadow: 0 1px 3px rgba(45,42,38,0.04);
  }
  .node rect { cursor: default; rx: 3; }
  .node text { font-size: 12.5px; fill: var(--charcoal); pointer-events: none; }
  .node text.amt { fill: var(--muted); font-family: "SF Mono", ui-monospace, Menlo, monospace; font-size: 11px; }
  .link { fill: none; transition: stroke-opacity 0.15s; }
  .link:hover { stroke-opacity: 0.72 !important; }
  .tooltip {
    position: fixed; pointer-events: none; background: var(--charcoal); color: #fff;
    padding: 8px 11px; border-radius: 9px; font-size: 12.5px; line-height: 1.45;
    opacity: 0; transition: opacity 0.12s; box-shadow: 0 4px 16px rgba(0,0,0,0.22); max-width: 260px;
  }
  .tooltip b { font-family: "SF Mono", ui-monospace, Menlo, monospace; }
  .foot { color: var(--muted); font-size: 12.5px; line-height: 1.6; margin-top: 22px; max-width: 880px; }
  .foot b { color: var(--charcoal); font-weight: 600; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Money Flow</h1>
  <p class="sub" id="sub"></p>
  <div class="stats" id="stats"></div>
  <div class="card"><svg id="sankey"></svg></div>
  <p class="foot" id="foot"></p>
</div>
<div class="tooltip" id="tip"></div>
<script>__D3__</script>
<script>__D3SANKEY__</script>
<script>
const DATA = __DATA__;
const META = __META__;

const usd = n => "$" + Math.round(n).toLocaleString("en-US");
const usdc = n => n.toLocaleString("en-US", {style:"currency", currency:"USD"});
const pct = n => (n / META.income * 100).toFixed(1) + "%";

// ---- headline stats ----
document.getElementById("sub").textContent =
  "Year to date · " + META.dateRange + "  ·  " + META.nMonths + " months  ·  " + META.nTxns + " transactions";
const stats = [
  {cls:"income",  label:"Income",          val:META.income,     pct:null},
  {cls:"spend",   label:"Spending",        val:META.spend,      pct:pct(META.spend)},
  {cls:"savings", label:"Savings",         val:META.savings,    pct:pct(META.savings)},
  {cls:"surplus", label:"General Savings", val:META.genSavings, pct:pct(META.genSavings)},
];
document.getElementById("stats").innerHTML = stats.map(s =>
  `<div class="stat ${s.cls}"><div class="label">${s.label}</div>`+
  `<div class="val">${usd(s.val)}</div>`+
  `<div class="pct">${s.pct ? s.pct + " of income" : "&nbsp;"}</div></div>`
).join("");

document.getElementById("foot").innerHTML =
  "<b>How this is calculated.</b> Income is net (take-home) pay from your monthly budgets. "+
  "Shared expenses are counted at <b>your share</b> only (amount minus your partner's portion). "+
  "Tracked-account savings show only contributions drawn from cash — bank transfers and “other”; "+
  "pre-tax payroll deductions, employer match, and interest (" + usd(META.noncash) + " more) grow your "+
  "accounts <b>outside</b> this cash flow, so they're not drawn here. "+
  "<b>General Savings</b> (" + usd(META.genSavings) + ") is income that was neither spent nor moved into a "+
  "tracked account — leftover cash sitting in checking, folded into the Savings branch.";

// ---- sankey ----
const tip = document.getElementById("tip");
function showTip(htmlStr, e){ tip.innerHTML = htmlStr; tip.style.opacity = 1; moveTip(e); }
function moveTip(e){ tip.style.left = (e.clientX + 14) + "px"; tip.style.top = (e.clientY + 14) + "px"; }
function hideTip(){ tip.style.opacity = 0; }

const svg = d3.select("#sankey");
// generous left margin for the Income/Savings labels, wide right margin
// so terminal-node labels sit on clean background instead of over the links
const margin = {top: 22, right: 248, bottom: 22, left: 150};

function render() {
  svg.selectAll("*").remove();
  const card = svg.node().parentNode;
  const width = card.clientWidth - 16;
  // ~50px of vertical room per terminal node keeps two-line labels from colliding
  const height = Math.max(900, DATA.rightColCount * 50 + 40);
  svg.attr("width", width).attr("height", height)
     .attr("viewBox", `0 0 ${width} ${height}`);

  const sankey = d3.sankey()
    .nodeId(d => d.id)
    .nodeWidth(16)
    .nodePadding(32)
    .nodeAlign(d3.sankeyJustify)
    .nodeSort((a, b) => (a.group - b.group) || (b.value - a.value))
    .extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]]);

  const graph = sankey({
    nodes: DATA.nodes.map(d => Object.assign({}, d)),
    links: DATA.links.map(d => Object.assign({}, d)),
  });

  // links
  svg.append("g").selectAll("path")
    .data(graph.links).join("path")
      .attr("class", "link")
      .attr("d", d3.sankeyLinkHorizontal())
      .attr("stroke", d => d.target.color)
      .attr("stroke-opacity", 0.42)
      .attr("stroke-width", d => Math.max(1, d.width))
      .on("mousemove", (e, d) => showTip(
        `${d.source.icon||""} ${d.source.name} → ${d.target.icon||""} ${d.target.name}<br><b>${usdc(d.value)}</b> · ${pct(d.value)} of income`, e))
      .on("mouseleave", hideTip);

  // nodes
  const node = svg.append("g").selectAll("g")
    .data(graph.nodes).join("g").attr("class", "node");

  node.append("rect")
      .attr("x", d => d.x0).attr("y", d => d.y0)
      .attr("width", d => d.x1 - d.x0)
      .attr("height", d => Math.max(1, d.y1 - d.y0))
      .attr("rx", 3)
      .attr("fill", d => d.color)
      .on("mousemove", (e, d) => showTip(
        `${d.icon||""} <b>${d.name}</b><br><b>${usdc(d.value)}</b> · ${pct(d.value)} of income`, e))
      .on("mouseleave", hideTip);

  // labels: nodes WITH outgoing flows (Income, Savings) label to the left,
  // terminal nodes label to the right into the reserved margin
  const labelX = d => d.sourceLinks.length ? d.x0 - 11 : d.x1 + 11;
  const labelAnchor = d => d.sourceLinks.length ? "end" : "start";

  node.append("text")
      .attr("x", labelX)
      .attr("y", d => (d.y0 + d.y1) / 2)
      .attr("dy", "-0.15em")
      .attr("text-anchor", labelAnchor)
      .text(d => `${d.icon ? d.icon + " " : ""}${d.name}`);

  node.append("text")
      .attr("class", "amt")
      .attr("x", labelX)
      .attr("y", d => (d.y0 + d.y1) / 2)
      .attr("dy", "1.05em")
      .attr("text-anchor", labelAnchor)
      .text(d => `${usd(d.value)} · ${pct(d.value)}`);
}

render();
window.addEventListener("resize", render);
document.addEventListener("mousemove", e => { if (tip.style.opacity == 1) moveTip(e); });
</script>
</body>
</html>
"""

out = (TEMPLATE
       .replace("__D3SANKEY__", D3SANKEY)
       .replace("__D3__", D3)
       .replace("__DATA__", DATA_JSON)
       .replace("__META__", META_JSON))

with open(OUT, "w") as f:
    f.write(out)

print("Wrote", OUT, "(", len(out), "bytes )")
print(f"Income {total_income:.2f} | Spend {total_spend:.2f} | Savings {total_savings:.2f} | Surplus {surplus:.2f}")
print(f"Balance check: {total_savings + total_spend + surplus:.2f} == {total_income:.2f} -> {abs(total_savings+total_spend+surplus-total_income) < 0.01}")
print(f"Nodes: {len(nodes)} | Links: {len(links)} | Categories: {n_categories} | Right-col nodes: {right_col_count}")
