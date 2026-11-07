"""Validates screen-reader live-region countdown without app TTS or alert floods."""
from pathlib import Path
from playwright.sync_api import sync_playwright
HTML=(Path(__file__).resolve().parents[1]/'index.html').read_text()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,forced_colors='active',reduced_motion='reduce')
 # Simulate a device where Web Speech is unavailable.
 ctx.add_init_script("Object.defineProperty(window,'speechSynthesis',{configurable:true,value:undefined});Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:undefined});")
 pg=ctx.new_page();errors=[]
 pg.on('pageerror',lambda e:errors.append(str(e)))
 pg.set_content(HTML)
 pg.locator('#settingsControl').click()
 assert 'browser speech unavailable' in pg.locator('#speechStatus').inner_text().lower()
 pg.locator('#screenReaderModeToggle').check()
 pg.locator('#exactHours').fill('0');pg.locator('#exactMinutes').fill('0');pg.locator('#exactSeconds').fill('12')
 pg.locator('#exactStart').click()
 assert pg.locator('#timer').get_attribute('role')=='button'
 pg.locator('#closeSettings').click()
 assert pg.locator('#settingsDrawer').is_hidden()
 assert pg.locator('#timerReadout').get_attribute('aria-live')=='off'
 # Listen to actual live announcements, not only app-generated speech mocks.
 pg.evaluate('''() => { window.__srEvents=[];for(let id of ['announcement','urgent'])new MutationObserver(()=>{const x=document.getElementById(id).textContent;if(x)window.__srEvents.push(x)}).observe(document.getElementById(id),{childList:true,characterData:true,subtree:true});}''')
 pg.wait_for_timeout(12300)
 assert pg.locator('#timer').get_attribute('data-phase')=='finished'
 events=pg.evaluate('window.__srEvents')
 assert any('10 seconds' in s for s in events),events
 assert any('5 seconds' in s for s in events),events
 assert any('1 second' in s for s in events),events
 assert any('Time is up' in s for s in events),events
 assert not any('9 seconds' in s for s in events),events
 assert not errors,errors
 print('screen reader cues: 10, 5, 1, complete; browser TTS unavailable fallback; forced colors and reduced motion: OK')
 ctx.close();browser.close()
