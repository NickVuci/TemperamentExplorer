import assert from 'node:assert/strict';
import {encodeEnter,encodeExit,encodeLeds,decodeKey,decodeEncoder,hexToLed,BUTTON_COUNT} from '../dist/hexboard-protocol.mjs';

// Byte examples are the ones documented in HexBoard docs/delegated-control.md.
assert.deepEqual(encodeEnter(''),[0xf0,0x7d,0x01,0xf7]);
assert.deepEqual(encodeEnter('Hi'),[0xf0,0x7d,0x01,0x48,0x69,0xf7]);
assert.equal(encodeEnter().length,4+'Temperament Lab'.length,'default app name is sent');
assert.deepEqual(encodeExit(),[0xf0,0x7d,0x02,0xf7]);
assert.throws(()=>encodeEnter('x'.repeat(21)),RangeError);
assert.throws(()=>encodeEnter('é'),RangeError);

assert.deepEqual(encodeLeds([{led:5,h:0,s:127,v:127}]),[0xf0,0x7d,0x03,0,5,0,0x7f,0x7f,0xf7],'LED 5 red');
assert.deepEqual(encodeLeds([{led:130,h:0,s:127,v:127}]),[0xf0,0x7d,0x03,1,2,0,0x7f,0x7f,0xf7],'LED 130 splits into 7+7 bits');
assert.deepEqual(encodeLeds([{led:0,h:1,s:2,v:3},{led:1,h:4,s:5,v:6}]),[0xf0,0x7d,0x03,0,0,1,2,3,0,1,4,5,6,0xf7],'records batch into one frame');
assert.deepEqual(encodeLeds([]),[0xf0,0x7d,0x03,0xf7]);
for(const bad of [{led:140,h:0,s:0,v:0},{led:-1,h:0,s:0,v:0},{led:0,h:128,s:0,v:0},{led:0,h:0,s:0.5,v:0},{led:0,h:0,s:0,v:-1}])assert.throws(()=>encodeLeds([bad]),RangeError);
assert.equal(BUTTON_COUNT,140);

assert.deepEqual(decodeKey([0x90,0,127]),{index:0,down:true});
assert.deepEqual(decodeKey([0x90,60,127]),{index:60,down:true});
assert.deepEqual(decodeKey([0x91,30,127]),{index:130,down:true},'channel 2 note 30 is button 130');
assert.deepEqual(decodeKey([0x81,30,0]),{index:130,down:false});
assert.deepEqual(decodeKey([0x90,60,0]),{index:60,down:false},'NoteOn with velocity 0 is a release');
assert.equal(decodeKey([0xb0,1,2]),null);assert.equal(decodeKey([0x93,50,127]),null,'index 350 is not a key');assert.equal(decodeKey([0x90]),null);assert.equal(decodeKey(null),null);
assert.deepEqual(decodeKey([0x91,39,127]),{index:139,down:true});assert.equal(decodeKey([0x91,40,127]),null,'index 140 is out of range');

for(const [byte,name] of [[1,'up'],[2,'down'],[3,'press'],[4,'release']])assert.equal(decodeEncoder([0xf0,0x7d,0x06,byte,0xf7]),name);
assert.equal(decodeEncoder([0xf0,0x7d,0x06,9,0xf7]),null);assert.equal(decodeEncoder([0xf0,0x7d,0x03,1,0xf7]),null);assert.equal(decodeEncoder([0xf0,0x7e,0x06,1,0xf7]),null);

// Colour conversion: primary colours land on the documented 0..127 hue scale; level scales brightness only.
assert.deepEqual(hexToLed('#ff0000'),{h:0,s:127,v:127});
assert.deepEqual(hexToLed('#ffffff'),{h:0,s:0,v:127});
assert.deepEqual(hexToLed('#00ff00'),{h:43,s:127,v:127},'green is 120 degrees = 42.7 of 128');
assert.deepEqual(hexToLed('#0000ff'),{h:85,s:127,v:127});
assert.deepEqual(hexToLed('#000000'),{h:0,s:0,v:0});
assert.equal(hexToLed('#ff0000',0.5).v,64);assert.equal(hexToLed('#ff0000',0.5).s,127);
assert.equal(hexToLed('#ff0000',2).v,127,'level is clamped');assert.equal(hexToLed('#ff0000',-1).v,0);
// The app's own palette colours all convert to valid LED records.
for(const hex of ['#83cebe','#f5c76e','#a855ca','#ad6262','#e6dfcb','#414957'])encodeLeds([{led:0,...hexToLed(hex,0.6)}]);

console.log('hexboard-protocol: ok');
