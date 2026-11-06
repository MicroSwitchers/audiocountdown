/* Dependency-free timer and accessibility interaction smoke tests. Run: node tests/smoke.cjs */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

let now = 1740000000000;
let perf = 0;
let spoken = [];
let raf = [];
const handlers = {};
const storage = new Map();
class FakeElement {
  constructor(id) { this.id=id; this.handlers={}; this.dataset={}; this.textContent='';this.value='';this.disabled=false;this.attrs={};this.style={};this.classList={toggle(){}}; }
  addEventListener(type,handler){ (this.handlers[type] ||= []).push(handler); }
  fire(type,event={}){ (this.handlers[type] || []).forEach(fn => fn({preventDefault(){},stopPropagation(){},button:0,pointerType:'mouse',pointerId:1,clientY:225,key:'',...event})); }
  setAttribute(k,v){this.attrs[k]=v;}
  getAttribute(k){return this.attrs[k];}
  getBoundingClientRect(){return {top:0,left:0,width:400,height:450};}
  setPointerCapture(){}
  getContext(){return null;}
  closest(){return null;}
  setCustomValidity(){}
  reportValidity(){}
}
const ids='timerStage timerCanvas stageStatus stageScale scaleButton scaleValue timeKicker timeDigits timeDescription percentLabel finishAt startPause startPauseLabel startPauseIcon hearTime restart clear minusMinute plusMinute selectedReadout presets customForm customMinutes customSeconds voiceToggle voiceToggleLabel testVoice tonesToggle fullscreenButton fullscreenApp srAnnouncements srUrgent'.split(' ');
const el=Object.fromEntries(ids.map(id=>[id,new FakeElement(id)]));
el.customMinutes.valueAsNumber=10;el.customSeconds.valueAsNumber=0;
const cadence=['frequent','standard','quiet'].map(v=>{const b=new FakeElement('cadence-'+v);b.dataset.cadence=v;return b;});
const document={visibilityState:'visible',fullscreenElement:null,handlers:{},getElementById:id=>el[id],querySelectorAll:()=>cadence,addEventListener(type,h){(this.handlers[type] ||= []).push(h)}};
const synth={cancel(){},getVoices(){return []},speak(obj){spoken.push(obj.text)}};
const windowObj={speechSynthesis:synth,devicePixelRatio:1,requestAnimationFrame:h=>{raf.push(h);return raf.length},addEventListener(){},ResizeObserver:null};
const context={window:windowObj,document,navigator:{},location:{protocol:'file:',hostname:''},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
 Date:class extends Date {static now(){return now}},performance:{now(){return perf}},requestAnimationFrame:h=>{raf.push(h)},setTimeout,SpeechSynthesisUtterance:class{constructor(text){this.text=text}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf-8'),context);
function advance(ms){now+=ms;perf+=ms;const a=raf;raf=[];a.forEach(x=>x());}
function lastSpoken(){return spoken.at(-1)}
function check(label,fn){try{fn();console.log('PASS',label)}catch(err){console.error('FAIL',label,err);process.exitCode=1}}
check('Voice is on by default and visible',()=>{assert.equal(el.voiceToggle.attrs['aria-pressed'],'true');assert.equal(el.voiceToggleLabel.textContent,'Voice on')});
check('Drag speaks selected duration immediately',()=>{el.timerStage.fire('pointerdown',{clientY:225});assert.match(lastSpoken(),/minutes/);assert.equal(el.timeDigits.textContent,'07:30')});
check('Drag updates selected duration and speaks again',()=>{perf+=500;el.timerStage.fire('pointermove',{clientY:300});assert.match(lastSpoken(),/minutes/);assert.equal(el.timeDigits.textContent,'05:00')});
check('Release starts with spoken confirmation',()=>{el.timerStage.fire('pointerup',{clientY:300});assert.equal(el.stageStatus.textContent,'RUNNING');assert.match(lastSpoken(),/Countdown started/)});
check('Touch active timer reads remaining time without resetting',()=>{el.timerStage.fire('pointerdown',{clientY:60});assert.equal(el.stageStatus.textContent,'RUNNING');assert.match(lastSpoken(),/remaining/)});
check('Deadline-based timer advances correctly',()=>{advance(20000);assert.equal(el.timeDigits.textContent,'04:40')});
check('Hear time announces status on demand',()=>{el.hearTime.fire('click');assert.match(lastSpoken(),/4 minutes and 40 seconds remaining/)});
check('Add minute while running keeps running and speaks',()=>{el.plusMinute.fire('click');assert.equal(el.timeDigits.textContent,'05:40');assert.equal(el.stageStatus.textContent,'RUNNING');assert.match(lastSpoken(),/Added one minute/)});
check('Pause and resume give spoken status',()=>{el.startPause.fire('click');assert.equal(el.stageStatus.textContent,'PAUSED');assert.match(lastSpoken(),/Paused/);advance(10000);assert.equal(el.timeDigits.textContent,'05:40');el.startPause.fire('click');assert.equal(el.stageStatus.textContent,'RUNNING');assert.match(lastSpoken(),/Resumed/)});
check('Finish speaks final seconds then time up',()=>{el.clear.fire('click');el.presets.fire('click',{target:{closest(){return {dataset:{seconds:'60'}}}}});for(let i=0;i<51;i++)advance(1000);assert.equal(el.timeDigits.textContent,'00:09');assert.equal(lastSpoken(),'9');for(let i=0;i<9;i++)advance(1000);assert.equal(el.stageStatus.textContent,'FINISHED');assert.equal(lastSpoken(),'Time is up.')});
check('Restart and clear work',()=>{el.restart.fire('click');assert.equal(el.stageStatus.textContent,'RUNNING');el.clear.fire('click');assert.equal(el.timeDigits.textContent,'00:00');assert.equal(el.stageStatus.textContent,'READY')});
check('Voice-off suppresses background speech, hear-time still works on request',()=>{el.voiceToggle.fire('click');const n=spoken.length;el.presets.fire('click',{target:{closest(){return {dataset:{seconds:'60'}}}}});assert.equal(spoken.length,n);el.hearTime.fire('click');assert.equal(spoken.length,n+1)});
check('Ruler change does not silently truncate time',()=>{el.clear.fire('click');el.customMinutes.valueAsNumber=75;el.customSeconds.valueAsNumber=0;el.customForm.fire('submit');el.startPause.fire('click');el.scaleButton.fire('click');assert.equal(el.timeDigits.textContent,'1:15:00');assert.equal(el.scaleValue.textContent,'120 min')});
console.log('Tests complete');
