from playwright.sync_api import sync_playwright
from pathlib import Path
content=(Path(__file__).resolve().parents[1]/'index.html').read_text()
init="""window.__spoken=[]; Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel(){},speak(u){window.__spoken.push(u.text)}}}); window.SpeechSynthesisUtterance=class{constructor(t){this.text=t}};"""
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':'/usr/bin/chromium'} if Path('/usr/bin/chromium').exists() else {}))
 c=b.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
 c.add_init_script(init);page=c.new_page();page.set_content(content)
 page.touchscreen.tap(160,630)
 assert page.locator('#timer').get_attribute('data-phase')=='running'
 page.touchscreen.tap(160,630)
 assert page.locator('#timer').get_attribute('data-phase')=='running'
 assert any('remaining' in t for t in page.evaluate('window.__spoken'))
 client=c.new_cdp_session(page)
 client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':160,'y':630,'id':11}]})
 page.wait_for_timeout(1250)
 assert page.locator('#holdNotice').is_visible()
 client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 assert page.locator('#timer').get_attribute('data-phase')=='running'
 client.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':160,'y':630,'id':12}]})
 page.wait_for_timeout(4150)
 assert page.locator('#timer').get_attribute('data-phase')=='ready'
 client.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 assert any('Timer cleared.'==t for t in page.evaluate('window.__spoken'))
 # Screen reader accessible fallback clear control, press twice
 page.touchscreen.tap(160,630)
 assert page.locator('#timer').get_attribute('data-phase')=='running'
 page.locator('#resetControl').focus();page.keyboard.press('Enter');page.keyboard.press('Enter')
 assert page.locator('#timer').get_attribute('data-phase')=='ready'
 print('touch + CDP touch-and-hold + accessible clear button: OK')
 b.close()
