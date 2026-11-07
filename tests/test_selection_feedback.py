"""Regression: the spoken preview and the actual started timer must agree.
Run: python tests/test_selection_feedback.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'index.html').read_text()
VOICE = '''
window.__spoken=[];window.__cancelCalls=0;
Object.defineProperty(window, 'speechSynthesis', {configurable:true,value:{
 cancel(){window.__cancelCalls++}, speak(u){window.__spoken.push(u.text)},getVoices(){return[]}
}});
window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;this.rate=1;this.volume=1}};
'''

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for hours in (1, 24):
        context = browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
        context.add_init_script(VOICE)
        page = context.new_page()
        errors=[]
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(HTML, wait_until='load')
        if hours == 24:
            page.locator('#settingsControl').click()
            page.locator('input[name="scaleHours"][value="24"]').check()
            page.locator('#closeSettings').click()
        page.evaluate('window.__spoken=[]')
        # Press and settle: should speak only after position has stabilized.
        x, y = 190, 425
        page.mouse.move(x,y)
        page.mouse.down()
        initial = page.locator('#digits').inner_text()
        page.wait_for_timeout(200)
        assert not any(s.endswith('selected.') for s in page.evaluate('window.__spoken'))
        page.wait_for_timeout(320)
        selections= [s for s in page.evaluate('window.__spoken') if s.endswith('selected.')]
        assert len(selections)==1, selections
        spoken = selections[-1].removesuffix(' selected.')
        # Natural finger wobble while text is being synthesized does not change time.
        page.mouse.move(x,y+7,steps=2)
        page.wait_for_timeout(500)
        assert page.locator('#digits').inner_text()==initial, ('tiny movement changed the value',hours)
        assert len([s for s in page.evaluate('window.__spoken') if s.endswith('selected.')])==1
        # Deliberate movement changes the selection, but no stale voice while moving.
        page.mouse.move(x,y+56,steps=4)
        changed=page.locator('#digits').inner_text()
        assert changed!=initial, (hours,initial,changed)
        spoken_count=len([s for s in page.evaluate('window.__spoken') if s.endswith('selected.')])
        page.wait_for_timeout(180)
        assert len([s for s in page.evaluate('window.__spoken') if s.endswith('selected.')])==spoken_count
        page.wait_for_timeout(320)
        selections=[s for s in page.evaluate('window.__spoken') if s.endswith('selected.')]
        assert len(selections)==spoken_count+1, selections
        spoken=selections[-1].removesuffix(' selected.')
        page.mouse.move(x,y+63)
        assert page.locator('#digits').inner_text()==changed, 'final jitter changed the selected time'
        page.mouse.up()
        assert page.locator('#timer').get_attribute('data-phase')=='running'
        started=[s for s in page.evaluate('window.__spoken') if s.endswith('Countdown started.')]
        assert started and started[-1]==spoken+'. Countdown started.',(hours,spoken,started)
        assert page.locator('#digits').inner_text()==changed, ('started unexpected time',hours)
        assert not errors,errors
        print(f'{hours}h: settle, jitter tolerance, deliberate change, exact spoken start OK')
        context.close()
    browser.close()
