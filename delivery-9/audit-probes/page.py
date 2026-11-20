import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1400,'height':1000})
        errs=[]; pg.on('console', lambda m: errs.append(m.type+': '+m.text) if m.type in ('error','warning') else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file:///home/claude/claude-persistant-1/ideas/trit-latch-sim/card-computer/usb-argon/delivery-9/page-9.html', wait_until='domcontentloaded', timeout=120000); await pg.wait_for_timeout(8000)
        for k in ['kpiChips','kpiTiming','kpiViolations','kpiFsBudget','kpiMutants']:
            t = await pg.evaluate(f"(() => {{ const e=document.getElementById('{k}'); return e ? e.parentElement.innerText.replace(/\\n/g,' | ') : null }})()"); print(k, '=>', t)
        body = await pg.evaluate("document.body.innerText"); print("undefined in page:", [l for l in body.split("\n") if "undefined" in l][:4], "| NaN:", "NaN" in body)
        await pg.screenshot(path='/home/claude/shots/u9.png'); print('errors:', errs[:5]); await b.close()
asyncio.run(main())
