import sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); errs = []; logs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: logs.append(m.type + ": " + m.text) if m.type in ("error", "warning") else None)
    pg.goto("file://" + sys.argv[1]); pg.wait_for_timeout(60000)
    print("page errors:", errs[:5]); print("console:", logs[:5])
    print("header badge:", pg.inner_text("#hdrAllBadge"))
    print("sim badge:", pg.inner_text("#simStatusBadge"))
    print("tests tab badge:", pg.inner_text("#tab-tests .panel-title .badge"))
    print("tab labels:", [t.inner_text() for t in pg.query_selector_all(".tab-btn")])
    print("mutant label:", pg.inner_text("label[for=selMutant]"))
    print("kpi timing:", pg.inner_text("#kpiTiming"), "|", pg.inner_text("#kpiTimingSub"))
    print("corner rows:", [r.inner_text().replace("\t"," ") for r in pg.query_selector_all("#cornerTableBody tr")][:3])
    print("mutant options:", len(pg.query_selector_all("#selMutant option")) - 1)
    print("packet row 0:", pg.inner_text("#pktTableBody tr") if pg.query_selector("#pktTableBody tr") else None)
    pg.screenshot(path="/tmp/d7page.png", full_page=False); b.close()
