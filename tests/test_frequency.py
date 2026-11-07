"""Run: python tests/test_frequency.py. Exercises speech schedules with virtual time."""
from pathlib import Path
from playwright.sync_api import sync_playwright
SRC=(Path(__file__).resolve().parents[1]/'index.html').read_text()
MOCK="""() => {window.__said=[];Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel(){},speak(u){window.__said.push(u.text)}}});window.SpeechSynthesisUtterance=class{constructor(t){this.text=t}};}"""

def main():
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':'/usr/bin/chromium'} if Path('/usr/bin/chromium').exists() else {}))
  for mode in ['off','manual','fifteen','thirty','minute']:
   page=b.new_page(viewport={'width':390,'height':844})
   page.clock.install()
   page.evaluate(MOCK)
   page.set_content(SRC)
   page.locator('#settingsControl').click()
   page.locator(f'input[name="speechMode"][value="{mode}"]').check()
   page.locator('#closeSettings').click()
   page.mouse.click(200,822) # ~90 seconds, includes 75,60,30 second boundaries
   assert page.locator('#timer').get_attribute('data-phase')=='running'
   earlier=len(page.evaluate('window.__said'))
   page.clock.run_for(16100)
   msgs=page.evaluate('window.__said')
   if mode in ['off','manual']:
    assert len(msgs)==earlier,(mode,msgs)
   if mode=='fifteen':assert any('1 minute and 15 seconds remaining' in s for s in msgs),(mode,msgs)
   page.mouse.click(200,400)
   later=page.evaluate('window.__said')
   if mode=='off':assert len(later)==earlier,(mode,later)
   if mode=='manual':assert len(later)>earlier,(mode,later)
   print(mode,'OK')
   page.close()
  # A 24 hour scale represents a 12 hour duration at its midpoint; it isn't a fixed 24 hour timer.
  pg=b.new_page(viewport={'width':390,'height':844})
  pg.evaluate(MOCK);pg.set_content(SRC)
  pg.locator('#settingsControl').click()
  pg.locator('input[name="scaleHours"][value="24"]').check()
  pg.locator('#closeSettings').click()
  pg.mouse.click(200,422)
  original=pg.locator('#digits').inner_text()
  assert original.startswith('12:'),original
  pg.locator('#settingsControl').click()
  pg.locator('input[name="scaleHours"][value="1"]').check()
  unchanged=pg.locator('#digits').inner_text()
  assert unchanged.startswith('12:'),(original,unchanged)
  assert pg.locator('#timer').get_attribute('data-phase')=='running'
  print('24 hour ruler midpoint and live countdown preservation OK')
  b.close()

if __name__=='__main__':main()
