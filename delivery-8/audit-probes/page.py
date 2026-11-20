import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1400,'height':1000})
        errs=[]; pg.on('console', lambda m: errs.append(m.type+': '+m.text) if m.type in ('error','warning') else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file:///home/claude/claude-persistant-1/ideas/trit-latch-sim/card-computer/usb-argon/delivery-8/bare-usb.html', wait_until='domcontentloaded', timeout=120000); await pg.wait_for_timeout(8000)
        for k in ['kpiChips','kpiTiming','kpiViolations','kpiFsBudget','kpiMutants']:
            t = await pg.evaluate(f"(() => {{ const e=document.getElementById('{k}'); return e ? e.parentElement.innerText.replace(/\\n/g,' | ') : null }})()"); print(k, '=>', t)
        body = await pg.evaluate("document.body.innerText"); print('"+-" in page:', '+-' in body, '| badge:', [l for l in body.split('\n') if 'PASS' in l.upper() and '/' in l][:2])
        await pg.screenshot(path='/home/claude/shots/u8.png'); print('errors:', errs[:5]); await b.close()
asyncio.run(main())
