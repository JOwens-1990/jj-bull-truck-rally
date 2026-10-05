import { COLORS, getSurface } from './engine.js';

const INK = '#253145';
const TAU = Math.PI * 2;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const colorValue = (color) => typeof color === 'string' ? color : color?.hex || COLORS[color]?.hex || '#f36c36';
const mix = (hex, target, fraction) => {
  const parse = (v) => { const s = v.replace('#', ''); return s.length === 3 ? s.split('').map(c => parseInt(c + c, 16)) : [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)); };
  try { return `rgb(${parse(hex).map((v, i) => Math.round(v + (parse(target)[i] - v) * fraction)).join(',')})`; } catch { return hex; }
};
function path(ctx, points, fill, stroke, width = 2) {
  ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function round(ctx, x, y, w, h, radius, fill, stroke, lineWidth = 2) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}
function ellipse(ctx, x, y, rx, ry, fill, stroke, lineWidth = 2) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}
function line(ctx, pts, color, width = 2) {
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}
function star(ctx, x, y, r, color, rotation = 0) {
  const pts = Array.from({length: 10}, (_, i) => { const a = rotation + i * Math.PI / 5 - Math.PI / 2; const radius = i % 2 ? r * .45 : r; return [x + Math.cos(a) * radius, y + Math.sin(a) * radius]; });
  path(ctx, pts, color, '#dd8e21', Math.max(1, r * .09));
}
function cloud(ctx, x, y, s, opacity = .75) {
  ctx.save(); ctx.globalAlpha = opacity; ctx.fillStyle = '#fffbed';
  ellipse(ctx, x, y, 57 * s, 13 * s, '#fffbed'); ellipse(ctx, x - 21 * s, y - 9 * s, 25 * s, 20 * s, '#fffbed'); ellipse(ctx, x + 9 * s, y - 18 * s, 28 * s, 25 * s, '#fffbed'); ellipse(ctx, x + 34 * s, y - 5 * s, 24 * s, 16 * s, '#fffbed'); ctx.restore();
}
function wheel(ctx, x, y, r, rotation) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
  ellipse(ctx, 0, 0, r, r, '#182635', '#12212f', 3);
  for (let i = 0; i < 14; i++) {
    ctx.save(); ctx.rotate(i * TAU / 14); round(ctx, -8, -r - 1, 16, 9, 3, '#334452'); ctx.restore();
  }
  ellipse(ctx, 0, 0, r * .72, r * .72, '#344856', '#526674', 2);
  ellipse(ctx, 0, 0, r * .49, r * .49, '#e9efe7', '#122b3e', 3);
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ellipse(ctx, Math.cos(a) * r * .32, Math.sin(a) * r * .32, r * .071, r * .071, '#496274'); }
  ellipse(ctx, 0, 0, r * .17, r * .17, '#8babb0', '#ffffff', 1.5);
  ctx.restore();
  ctx.save(); ctx.globalAlpha = .5; ctx.beginPath(); ctx.arc(x, y, r * .82, -2.8, -1.3); ctx.strokeStyle = '#68777a'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
}

/** Draw a toy bull truck. Anchor x/y is midway between tires, at the wheel bottoms. */
export function drawBull(ctx, x, y, scale, color, angle = 0, wheelRotation = 0) {
  const paint = colorValue(color);
  ctx.save(); ctx.translate(x, y); ctx.rotate(-angle); ctx.scale(scale, scale); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // Far wheels and a sturdy little suspension.
  wheel(ctx, -71, -48, 37, wheelRotation); wheel(ctx, 89, -48, 37, wheelRotation);
  line(ctx, [[-99,-56],[103,-56]], '#162b3c', 17);
  line(ctx, [[-91,-57],[-56,-98],[56,-98],[91,-57]], '#a4bcc0', 8);
  for (const axle of [-79, 79]) {
    line(ctx, [[axle-10,-95],[axle+10,-79],[axle-10,-69],[axle+10,-58]], '#f8cf65', 5);
  }
  // Far ear, horn and tail establish the unmistakable bull silhouette.
  ctx.beginPath(); ctx.moveTo(54,-151); ctx.bezierCurveTo(74,-180,75,-204,101,-209); ctx.bezierCurveTo(96,-190,101,-167,76,-143); ctx.closePath(); ctx.fillStyle = '#f6e1b1'; ctx.fill(); ctx.strokeStyle = '#253145'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-107,-111); ctx.bezierCurveTo(-144,-133,-151,-110,-143,-151); ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-143,-149); ctx.quadraticCurveTo(-158,-153,-150,-166); ctx.quadraticCurveTo(-132,-166,-137,-149); ctx.fillStyle = mix(paint, '#ffffff', .1); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
  // Rounded pickup body, cabin, and head are one toy sculpt.
  const bodyGradient = ctx.createLinearGradient(0, -160, 0, -72); bodyGradient.addColorStop(0, mix(paint, '#ffffff', .23)); bodyGradient.addColorStop(.6, paint); bodyGradient.addColorStop(1, mix(paint, '#000000', .13));
  ctx.beginPath(); ctx.moveTo(-116,-75); ctx.lineTo(-120,-119); ctx.quadraticCurveTo(-121,-133,-102,-134); ctx.lineTo(-55,-134); ctx.lineTo(-39,-163); ctx.quadraticCurveTo(-31,-173,-11,-173); ctx.lineTo(52,-173); ctx.quadraticCurveTo(68,-170,79,-147); ctx.lineTo(108,-142); ctx.quadraticCurveTo(127,-139,129,-118); ctx.lineTo(133,-83); ctx.quadraticCurveTo(133,-70,117,-70); ctx.lineTo(-101,-70); ctx.quadraticCurveTo(-116,-70,-116,-75); ctx.closePath(); ctx.fillStyle = bodyGradient; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke();
  // Bed top, side stripe, door and star badge.
  round(ctx, -116,-131, 63, 13, 5, mix(paint,'#ffffff',.42), INK, 3);
  path(ctx, [[-112,-107],[-61,-107],[-61,-88],[-112,-88]], mix(paint,'#ffffff',.16));
  line(ctx,[[-44,-126],[-44,-79],[27,-79],[27,-132]],mix(paint,'#000000',.23),2);
  line(ctx,[[-106,-83],[45,-83]],'#ffdb80',5);
  star(ctx,-16,-109,16,'#fff0b8',.13);
  round(ctx,-33,-134,15,5,2,'#344255');
  // Cabin window with tiny reflected clouds. It also reads as the bull's friendly eyes.
  const glass = ctx.createLinearGradient(0,-160,0,-130); glass.addColorStop(0,'#c3f2ed'); glass.addColorStop(1,'#57bfc0');
  path(ctx,[[-35,-159],[-23,-165],[18,-165],[20,-139],[-46,-139]],glass,INK,3);
  line(ctx,[[-26,-158],[0,-158]],'#eafff0',4);
  // Ear to the left of the face.
  ctx.beginPath(); ctx.moveTo(27,-158); ctx.bezierCurveTo(9,-187,-13,-185,-15,-173); ctx.bezierCurveTo(-11,-153,10,-148,27,-150); ctx.closePath(); ctx.fillStyle = paint; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth=3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(15,-160); ctx.quadraticCurveTo(-1,-174,-7,-170); ctx.quadraticCurveTo(0,-158,15,-158); ctx.fillStyle = '#f8b6a0'; ctx.fill();
  // Near horn: thick ivory base, smooth curved tip.
  ctx.beginPath(); ctx.moveTo(36,-166); ctx.bezierCurveTo(8,-174,-2,-190,0,-215); ctx.bezierCurveTo(9,-202,17,-196,24,-195); ctx.bezierCurveTo(25,-181,36,-181,49,-177); ctx.closePath(); ctx.fillStyle = '#fff3d0'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth=3; ctx.stroke();
  line(ctx,[[9,-195],[18,-184],[31,-177]],'#dac49d',2);
  // Big bright eyes under playful eyebrows.
  ellipse(ctx,53,-149,14,19,'#fffdf2',INK,2.5);
  ellipse(ctx,89,-146,12,17,'#fffdf2',INK,2.5);
  ellipse(ctx,58,-146,6.2,9,'#263549'); ellipse(ctx,93,-143,5.7,8.3,'#263549');
  ellipse(ctx,60,-150,2.5,3,'#fff'); ellipse(ctx,95,-147,2.2,2.6,'#fff');
  line(ctx,[[39,-172],[53,-176],[65,-170]],mix(paint,'#000000',.35),4);
  line(ctx,[[80,-166],[91,-168],[99,-163]],mix(paint,'#000000',.35),3);
  // Soft muzzle is the bumper. Nostrils and a smile make a friendly bull.
  const muzzleGradient = ctx.createLinearGradient(0,-129,0,-88); muzzleGradient.addColorStop(0,'#ffdfad'); muzzleGradient.addColorStop(1,'#eab479');
  round(ctx,52,-128,90,42,[17,20,18,18],muzzleGradient,INK,3.5);
  ellipse(ctx,78,-112,7,5,'#725446'); ellipse(ctx,117,-112,7,5,'#725446');
  ctx.beginPath(); ctx.moveTo(90,-99); ctx.quadraticCurveTo(98,-93,107,-100); ctx.strokeStyle='#755344'; ctx.lineWidth=2.4; ctx.stroke();
  ellipse(ctx,61,-114,4,7,'#ffe7bc');
  round(ctx,113,-84,28,10,4,'#a6c2bf',INK,3);
  round(ctx,-126,-89,14,17,4,'#ed8d68',INK,2);
  // Wheel arches are behind the chunky foreground tires.
  for (const axle of [-78, 84]) { ctx.beginPath(); ctx.arc(axle,-44,48,Math.PI,0); ctx.fillStyle=mix(paint,'#000000',.23); ctx.fill(); ctx.strokeStyle=INK; ctx.lineWidth=5; ctx.stroke(); }
  wheel(ctx,-78,-42,42,wheelRotation); wheel(ctx,84,-42,42,wheelRotation);
  ctx.restore();
}

function drawKid(ctx, x, y, scale, time = 0) {
  ctx.save(); ctx.translate(x,y); ctx.scale(scale,scale);
  ellipse(ctx,0,0,27,5,'#80594433');
  line(ctx,[[-9,-39],[-12,-9]],'#263a51',12); line(ctx,[[10,-39],[12,-9]],'#334862',12);
  round(ctx,-22,-11,23,10,4,'#fff2cd',INK,2); round(ctx,4,-11,22,10,4,'#fff2cd',INK,2);
  round(ctx,-20,-78,40,42,[13,13,6,6],'#2babb1',INK,2);
  path(ctx,[[-6,-77],[0,-63],[7,-77]],'#fff0c9'); star(ctx,1,-54,8,'#ffce56');
  line(ctx,[[-16,-67],[-30,-51],[-14,-45]],'#c48961',10); line(ctx,[[16,-67],[30,-55],[14,-46]],'#c48961',10);
  round(ctx,-18,-52,36,17,6,'#344354',INK,2); line(ctx,[[8,-52],[13,-72]],INK,2);
  ellipse(ctx,-9,-46,4,4,'#ca946b'); ellipse(ctx,10,-46,4,4,'#ca946b');
  round(ctx,-6,-87,12,15,4,'#c98c64'); ellipse(ctx,0,-99,23,26,'#dbab7a',INK,2);
  ellipse(ctx,-23,-99,4,7,'#d79c70'); ellipse(ctx,23,-99,4,7,'#d79c70');
  ctx.beginPath(); ctx.moveTo(-22,-100); ctx.bezierCurveTo(-29,-129,1,-135,22,-116); ctx.lineTo(21,-102); ctx.quadraticCurveTo(9,-122,-18,-111); ctx.closePath(); ctx.fillStyle='#583d34';ctx.fill();
  ellipse(ctx,-8,-100,2.3,3,'#263145'); ellipse(ctx,9,-100,2.3,3,'#263145');
  ctx.beginPath();ctx.moveTo(-6,-88);ctx.quadraticCurveTo(1,-81,9,-89);ctx.strokeStyle='#824e3b';ctx.lineWidth=2;ctx.stroke();
  ctx.save();ctx.globalAlpha=.75;for(let i=0;i<2;i++){ctx.beginPath();ctx.arc(13,-72,9+i*7,-1.1,.2);ctx.strokeStyle='#ffcc57';ctx.lineWidth=2;ctx.stroke();}ctx.restore();
  ctx.restore();
}
function cactus(ctx,x,y,s,color='#467e72') {
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);line(ctx,[[0,0],[0,-66]],color,11);line(ctx,[[-1,-23],[-23,-23],[-23,-44]],color,9);line(ctx,[[1,-38],[20,-38],[20,-56]],color,8);line(ctx,[[-2,-58],[-2,-8]],'#92b886',2);ctx.restore();
}
function pine(ctx,x,y,s,color) {
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);line(ctx,[[0,0],[0,-44]],'#665d60',7);path(ctx,[[-28,-22],[0,-65],[28,-22]],color);path(ctx,[[-22,-40],[0,-79],[22,-40]],color);ctx.restore();
}
function flag(ctx,x,y,s=1,finish=false) {
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);line(ctx,[[0,0],[0,-110]],INK,5);
  if(finish){ round(ctx,0,-110,64,42,3,'#fff9e9',INK,2); for(let r=0;r<3;r++)for(let c=0;c<5;c++)if((r+c)%2===0){ctx.fillStyle=INK;ctx.fillRect(c*12.8,-110+r*14,12.8,14);} }
  else{path(ctx,[[0,-110],[54,-96],[0,-78]],'#f28653',INK,2);star(ctx,17,-94,8,'#ffe9a4');}ctx.restore();
}
function cone(ctx,x,y,s=1){ctx.save();ctx.translate(x,y);ctx.scale(s,s);round(ctx,-13,-4,26,5,2,'#5d635c');path(ctx,[[-10,-4],[-4,-29],[4,-29],[10,-4]],'#f87845','#b9583b',1);path(ctx,[[-7,-16],[-5,-23],[5,-23],[7,-16]],'#fff3d2');ctx.restore();}

const PALETTES = [
  {top:'#b4e0df',bottom:'#fff0c6',far:'#e7c08d',mid:'#cc936d',rock:'#b77652',ground:'#d9915a',edge:'#ffe1a0',lava:'#ef633c',hot:'#ffc35c',plants:'#4f8470'},
  {top:'#d8bfed',bottom:'#ffe2d6',far:'#e5a9ce',mid:'#c68bbb',rock:'#ac78a7',ground:'#d2a0bb',edge:'#fff1cb',lava:'#f07761',hot:'#ffce79',plants:'#987db1'},
  {top:'#a0dfe1',bottom:'#eff1c4',far:'#b5d3a1',mid:'#70ab91',rock:'#5f8e72',ground:'#8fac64',edge:'#dfdf8b',lava:'#f87946',hot:'#ffd15b',plants:'#3d7e66'},
  {top:'#252750',bottom:'#7976a9',far:'#79729c',mid:'#645e86',rock:'#524d73',ground:'#7f729e',edge:'#c6bde6',lava:'#f7775c',hot:'#ffc596',plants:'#aaa1ca'},
  {top:'#a6dbf0',bottom:'#fcf3d6',far:'#c9c6da',mid:'#a1b0c4',rock:'#829baf',ground:'#8caaa9',edge:'#fff3bf',lava:'#ff714e',hot:'#ffd575',plants:'#658d91'}
];
function scenery(ctx,w,h,p, camera, time, reducedMotion, worldIndex=0) {
  const sky=ctx.createLinearGradient(0,0,0,h); sky.addColorStop(0,p.top);sky.addColorStop(1,p.bottom);ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  const sunX=w*.77, sunY=h*.21;
  ellipse(ctx,sunX,sunY,46,46,worldIndex===3?'#e3d7ff22':'#fff0bc55');ellipse(ctx,sunX,sunY,34,34,worldIndex===3?'#e1d8ef':'#fff4c9');
  if(worldIndex===3){
    ellipse(ctx,sunX-9,sunY-5,8,9,'#bdb1d166');ellipse(ctx,sunX+13,sunY+11,6,6,'#bdb1d177');
    for(let i=0;i<35;i++){const x=(i*127.3-camera*.012+w*8)%w;const y=17+(i*39.7)%(h*.49);ellipse(ctx,x,y,i%4===0?2:1,i%4===0?2:1,'#fff7dbbb');}
  }
  if(worldIndex===4){ctx.save();ctx.globalAlpha=.37;for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(w*.65,h*.73,h*(.47-i*.02),Math.PI,TAU);ctx.strokeStyle=['#ef7a84','#f8bb76','#ffe998','#87cbb0','#a898dc'][i];ctx.lineWidth=h*.02;ctx.stroke();}ctx.restore();}
  const drift=reducedMotion?0:time*1.7;
  for(let i=0;i<5;i++){const x=((i*317-camera*.045+drift)%(w+350)+(w+350))%(w+350)-100;cloud(ctx,x,h*(.17+(i%3)*.12),.55+(i%2)*.24,worldIndex===3?.10:.58);}
  // Deterministic distant mesas repeat beyond both edges; parallax keeps motion calm.
  const farBase=h*.66;
  for(let layer=0;layer<3;layer++){
    const span=layer===0?420:340;const scroll=camera*(.05+layer*.07);const offset=((scroll%span)+span)%span;
    for(let i=-2;i<Math.ceil(w/span)+3;i++){
      const x=i*span-offset; const top=farBase-h*(.11+layer*.045)-((i+40)%3)*h*.035; const base=farBase+layer*h*.08;
      const fill=layer===0?p.far:layer===1?p.mid:p.rock;
      if(worldIndex===1){
        ctx.beginPath();ctx.moveTo(x-70,base);ctx.bezierCurveTo(x-25,base-20,x+5,top-30,x+93,top);ctx.bezierCurveTo(x+183,top-51,x+202,base-15,x+300,base);ctx.closePath();ctx.fillStyle=fill;ctx.fill();
        ctx.beginPath();ctx.moveTo(x+36,top+15);ctx.bezierCurveTo(x+73,top-9,x+82,top+18,x+97,top+7);ctx.bezierCurveTo(x+143,top-15,x+160,top+7,x+182,top+28);ctx.strokeStyle='#fff0eb44';ctx.lineWidth=9;ctx.stroke();
      }else if(worldIndex===2){path(ctx,[[x-70,base],[x+28,top+71],[x+84,top+26],[x+114,top],[x+180,top+62],[x+210,top+58],[x+300,base]],fill);}
      else if(worldIndex===4){path(ctx,[[x-70,base],[x+92,top-32],[x+300,base]],fill);path(ctx,[[x+49,top+33],[x+92,top-32],[x+149,top+35],[x+106,top+17],[x+91,top+39],[x+77,top+24]],'#fff3ddaa');}
      else path(ctx,[[x-70,base],[x+23,top+36],[x+59,top+36],[x+75,top],[x+167,top],[x+192,top+57],[x+224,top+57],[x+300,base]],fill);
      path(ctx,[[x+131,top],[x+167,top],[x+192,top+57],[x+224,top+57],[x+300,base],[x+161,base]],layer===0?'#ffffff0c':'#452f4417');
      line(ctx,[[x+76,top+12],[x+162,top+12]],'#fff2cf22',3);
      if(layer===2){line(ctx,[[x+39,top+73],[x+184,top+73]],'#ffe5be24',2);line(ctx,[[x+10,top+104],[x+222,top+104]],'#ffe5be20',2);}
    }
  }
  const plantY=h*.73;
  for(let i=-1;i<Math.ceil(w/260)+2;i++) { const px=i*260-((camera*.27)%260); if(worldIndex===2||worldIndex===4)pine(ctx,px,plantY,.6,p.plants);else if(worldIndex!==3)cactus(ctx,px,plantY,.5+(i%2)*.15,p.plants); }
  path(ctx,[[0,h*.77],[w*.2,h*.74],[w*.46,h*.8],[w*.72,h*.74],[w,h*.77],[w,h],[0,h]],p.mid);
}
function lava(ctx, x1, x2, floor, h, p, time, reducedMotion) {
  const glow=ctx.createLinearGradient(0,floor,0,h);glow.addColorStop(0,p.hot);glow.addColorStop(.2,p.lava);glow.addColorStop(1,mix(p.lava,'#7b324e',.4));
  ctx.fillStyle=glow;ctx.fillRect(x1,floor,x2-x1,h-floor);
  ctx.save();ctx.beginPath();ctx.rect(x1,floor,x2-x1,h-floor);ctx.clip();
  for(let row=0;row<5;row++){
    const y=floor+13+row*24;const shift=reducedMotion?0:time*(row%2?14:-11);
    for(let j=-1;j<Math.ceil((x2-x1)/97)+1;j++){const x=x1+j*97+(shift%97);ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+13,y-5,x+22,y+5,x+42,y);ctx.strokeStyle=row%2?'#ffd48488':'#ffedb477';ctx.lineWidth=4;ctx.lineCap='round';ctx.stroke();}
  }
  if(!reducedMotion)for(let i=0;i<6;i++){const phase=(time*.27+i*.167)%1;const x=x1+(x2-x1)*(i+.5)/6;ellipse(ctx,x,floor-8-phase*29,2+phase*2,2+phase*2,`rgba(255,204,95,${(1-phase)*.7})`);}
  ctx.restore();
}
function earthChunk(ctx,x1,x2,floor,h,p) {
  if(x2<x1) return;
  ctx.fillStyle=p.ground;ctx.fillRect(x1,floor,x2-x1,h-floor+1);
  path(ctx,[[x1,floor+10],[x1+14,floor+25],[x1+27,h],[x1,h]],'#7c4c431c');
  line(ctx,[[x1,floor+5],[x2,floor+5]],p.edge,10);
  line(ctx,[[x1,floor+13],[x2,floor+13]],mix(p.ground,'#000000',.12),3);
  for(let row=0;row<3;row++){
    const y=floor+34+row*35;line(ctx,[[x1+10,y],[x2-10,y+4]],'#764f3e15',2);
    for(let j=0;j<Math.min(24,(x2-x1)/34);j++){const x=x1+20+j*43+row*11;if(x<x2-10)ellipse(ctx,x,y+13,(j%3)+2,1.5,'#77574129');}
  }
}
function ramp(ctx,x1,x2,base,height,p) {
  if(x2-x1<2)return;path(ctx,[[x1,base],[x2,base-height],[x2,base]],'#b96c48',INK,2);
  // Braced wooden stunt ramp, broad cream riding surface.
  for(let i=1;i<5;i++){const x=x1+(x2-x1)*i/5;const y=base-height*i/5;line(ctx,[[x,y+5],[x,base]],'#8e503c',3);}
  line(ctx,[[x1,base],[x2,base-height]],'#ffe6b0',7);line(ctx,[[x1+3,base+5],[x2,base-height+5]],'#d49462',3);
  line(ctx,[[x1+15,base],[x2-5,base-height+9]],'#fff4cc66',2);
}
function finishGate(ctx,x,y,s=1) {
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);
  line(ctx,[[-9,0],[-9,-210]],'#f6dfb4',10);line(ctx,[[166,0],[166,-210]],'#f6dfb4',10);
  round(ctx,-18,-223,193,48,8,INK);
  ctx.fillStyle='#fff8df';ctx.font='900 19px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText('FINISH!',78,-193);
  for(let j=0;j<12;j++)for(let row=0;row<2;row++){ctx.fillStyle=(j+row)%2?'#fff6dc':INK;ctx.fillRect(-9+j*14.6,-174+row*9,14.6,9);}
  ctx.restore();
}
function garageScene(ctx,w,h,state,time,reducedMotion) {
  const worldIndex=Number(state?.level?.world)||0;const p=PALETTES[worldIndex%PALETTES.length];
  scenery(ctx,w,h,p,0,time,reducedMotion,worldIndex);
  const floor=h*.81; const mobile=w<600;
  // A little glimpse of the first lava jump, beyond the safe garage platform.
  const gapStart=w*(mobile?.86:.77);
  lava(ctx,gapStart,w,floor+27,h,p,time,reducedMotion);earthChunk(ctx,0,gapStart,floor,h,p);
  ramp(ctx,w*.71,w*.79,floor,h*.12,p);
  flag(ctx,w*.87,floor-7,mobile?.6:.95);
  const scale=Math.min(w/650,h/310)*(mobile?1.65:1.11);
  const bx=w*(mobile?.43:.395),by=floor-7;
  ellipse(ctx,bx,by+6,146*scale,14*scale,'#6d4e4131');
  drawBull(ctx,bx,by,scale,colorValue(state?.color||0),0,0);
  const kidScale=Math.min(h/280,w/610)*(mobile?1.4:.85);
  drawKid(ctx,w*(mobile?.81:.67),floor-3,kidScale,time);
  cone(ctx,w*.13,floor+5,mobile?.66:1);cone(ctx,w*.59,floor+9,mobile?.6:.85);
  const spark=mobile?[[.10,.37],[.84,.39]]:[[.18,.30],[.55,.29],[.71,.41]];
  for(let i=0;i<spark.length;i++){const [sx,sy]=spark[i];ctx.save();ctx.globalAlpha=.85;star(ctx,w*sx,h*sy,5+i*2,'#ffefab',.15);ctx.restore();}
  // Track foreground and pebbles give the scene an illustrated diorama edge.
  path(ctx,[[0,h-17],[w*.28,h-28],[w*.54,h-14],[gapStart,h-19],[gapStart,h],[0,h]],'#be7a4e25');
}

/** Stateless scene drawing; caller owns animation, DPR sizing, controls and camera consent. */
export function drawScene(ctx,width,height,state,{time=0,garage=false,reducedMotion=false}={}) {
  const w=Math.max(1,width),h=Math.max(1,height);ctx.save();ctx.clearRect(0,0,w,h);
  if(garage || !state?.player || !state?.level){garageScene(ctx,w,h,state,time,reducedMotion);ctx.restore();return;}
  const level=state.level;const worldIndex=Number(level.world)||0;const p=PALETTES[worldIndex%PALETTES.length];
  const scale=clamp(w/1050,.62,1);const floor=h*.77;const playerX=state.player.x||0;
  const camera=Math.max(-80,playerX-(w<600?w*.34:w*.30)/scale);
  const sx=x=>(x-camera)*scale; const sy=y=>floor-(y||0)*scale;
  scenery(ctx,w,h,p,camera,time,reducedMotion,worldIndex);
  // Continuous lava below ground makes every visible gap unambiguous.
  lava(ctx,0,w,floor+30*scale,h,p,time,reducedMotion);
  const left=camera-50/scale,right=camera+(w+50)/scale;
  let segment=left;
  const visibleGaps=(level.gaps||[]).filter(g=>g.end>left&&g.start<right).sort((a,b)=>a.start-b.start);
  for(const gap of visibleGaps){if(gap.start>segment)earthChunk(ctx,sx(segment),sx(Math.min(gap.start,right)),floor,h,p);segment=Math.max(segment,gap.end);}
  if(segment<right)earthChunk(ctx,sx(segment),sx(right),floor,h,p);
  // Low plants, cheering flags, and rocks belong behind the trucks.
  const decorStart=Math.floor(left/330)*330;
  for(let x=decorStart;x<right;x+=330){
    const surface=getSurface(level,x);if(surface!==null&&surface<8){if(Math.floor(x/330)%3===0)flag(ctx,sx(x),floor,.48*scale);else if(worldIndex===2||worldIndex===4)pine(ctx,sx(x),floor,.43*scale,p.plants);else if(worldIndex!==3)cactus(ctx,sx(x),floor,.42*scale,p.plants);else ellipse(ctx,sx(x),floor,14*scale,5*scale,'#3e39534d');}
  }
  for(const r of level.ramps||[])if(r.end>=left&&r.start<=right)ramp(ctx,sx(r.start),sx(r.end),floor,r.height*scale,p);
  if(sx(level.length)>-220&&sx(level.length)<w+220)finishGate(ctx,sx(level.length),floor,scale);
  // Warm collectable stars bob gently; already collected stars disappear.
  (level.stars||[]).forEach((s,i)=>{
    if(state.collected?.has(i)||state.collected?.has(s.id))return;
    const x=sx(s.x);if(x<-25||x>w+25)return;const y=sy(s.y)-(!reducedMotion?Math.sin(time*3+i)*3:0);
    ellipse(ctx,x,y,19*scale,19*scale,'#ffe39238');star(ctx,x,y,12*scale,'#ffe079',.08);
    ellipse(ctx,x-3*scale,y-4*scale,2*scale,2*scale,'#fff9d8');
  });
  const drawTruck=(truck,color,isPlayer)=>{
    const x=sx(truck.x);if(x<-200||x>w+200)return;const y=sy(truck.y);
    const truckScale=scale*(isPlayer?.55:.50);const elevation=Math.max(0,truck.y||0);
    ellipse(ctx,x,floor+3,76*truckScale*(1-clamp(elevation/500,0,.4)),8*truckScale,'#503f4633');
    if(!truck.grounded&&isPlayer&&!reducedMotion){line(ctx,[[x-85*scale,y-25*scale],[x-104*scale,y-22*scale]],'#fff4d399',3);line(ctx,[[x-77*scale,y-39*scale],[x-103*scale,y-35*scale]],'#fff4d388',2);}
    drawBull(ctx,x,y,truckScale,color,truck.angle||0,truck.x*.037);
    if(isPlayer){ctx.fillStyle=INK;ctx.font=`800 ${Math.max(10,11*scale)}px system-ui,sans-serif`;ctx.textAlign='center';round(ctx,x-22,y-134*scale,44,19,9,'#fff6dc',INK,1.5);ctx.fillStyle=INK;ctx.fillText('YOU',x,y-121*scale);}
  };
  // Rivals have a small lane offset; the selected truck is always foreground.
  for(const rival of state.rivals||[]){ctx.save();ctx.globalAlpha=.87;ctx.translate(0,-7*scale);drawTruck(rival,colorValue(rival.color),false);ctx.restore();}
  drawTruck(state.player,colorValue(state.color),true);
  for(const effect of state.effects||[]){
    const x=sx(effect.x??playerX),y=sy(effect.y??state.player.y);const life=effect.life??effect.ttl??.5;
    if(effect.type==='star'){for(let i=0;i<5;i++)star(ctx,x+Math.cos(i*TAU/5)*24,y+Math.sin(i*TAU/5)*24,5,'#ffdd6e',time);}
    else if(effect.type==='dust'){ctx.save();ctx.globalAlpha=clamp(life,0,.4);ellipse(ctx,x,y,12,7,'#ffedc9');ctx.restore();}
  }
  // Tiny foreground flecks are decorative and never obstruct the track.
  ctx.restore();
}
