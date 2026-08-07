const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const rooms = new Map();

const WORDS = {
  Food: ['Pizza','Sushi','Tacos','Pancakes','Poutine','Burger','Ramen','Ice Cream','Popcorn','Donut','Nachos','Waffles','Steak','French Fries','Mac and Cheese','Chicken Wings','Brownie','Caesar Salad'],
  Places: ['Airport','Beach','Mall','Movie Theatre','School','Hospital','Gym','Amusement Park','Museum','Hotel','Library','Coffee Shop','Grocery Store','Campground','Aquarium','Bowling Alley','Ski Hill','Stadium'],
  Objects: ['Toothbrush','Backpack','Headphones','Camera','Umbrella','Remote Control','Water Bottle','Wallet','Keyboard','Flashlight','Sunglasses','Pillow','Vacuum','Microwave','Watch','Charger','Mirror','Blanket'],
  Games: ['Minecraft','Fortnite','Valorant','Overwatch','Mario Kart','GTA V','Roblox','Among Us','Rocket League','Call of Duty','The Sims','Terraria','Skyrim','Red Dead Redemption','Pokémon','Forza Horizon','God of War','Spider-Man'],
  'Movies & TV': ['The Avengers','Shrek','Stranger Things','The Office','Frozen','Harry Potter','Breaking Bad','The Simpsons','Toy Story','Star Wars','Jurassic Park','Wednesday','The Batman','Avatar','Friends','The Hunger Games','Cars','SpongeBob'],
  Animals: ['Penguin','Dolphin','Giraffe','Shark','Panda','Elephant','Cheetah','Owl','Kangaroo','Octopus','Gorilla','Polar Bear','Raccoon','Wolf','Turtle','Peacock','Koala','Crocodile'],
  School: ['Homework','Cafeteria','Exam','Locker','Teacher','Field Trip','Gym Class','Group Project','School Bus','Detention','Graduation','Textbook','Presentation','Substitute Teacher','Fire Drill','Yearbook','Lunch Break','Library']
};

const PROMPT_PAIRS = {
  Funny: [
    ['Where would you hide during a zombie apocalypse?', 'Where would you go for the most relaxing vacation?'],
    ['What would be the worst thing to hear on an airplane?', 'What would be the best thing to hear on an airplane?'],
    ['What is something you would never want your parents to find?', 'What is something you would be excited to show your parents?'],
    ['What would you do first if you became invisible?', 'What would you do first if you became famous?'],
    ['What is the weirdest thing to bring on a first date?', 'What is the best thing to bring on a first date?'],
    ['Where would you bury a treasure chest?', 'Where would you plan a picnic?'],
    ['What would be a terrible superpower?', 'What would be an amazing superpower?'],
    ['What would you buy if you had $10,000 for one ridiculous purchase?', 'What would you buy if you had $10,000 for one useful purchase?']
  ],
  Friends: [
    ['Who in the group would survive longest on a deserted island?', 'Who in the group would get eliminated first on a reality show?'],
    ['Who in the group would be most likely to become famous?', 'Who in the group would be most likely to disappear from social media?'],
    ['Who would you trust to plan the entire road trip?', 'Who would you least trust to read the map on a road trip?'],
    ['Who would be best at talking their way out of trouble?', 'Who would be most likely to accidentally get everyone in trouble?'],
    ['Who would you call first if your car broke down?', 'Who would you call first if you wanted to do something spontaneous?'],
    ['Who is most likely to laugh at the worst possible moment?', 'Who is most likely to stay serious no matter what?']
  ],
  Opinions: [
    ['What food is massively overrated?', 'What food deserves way more hype?'],
    ['What is the most annoying thing people do at the movies?', 'What is the best part of going to the movies?'],
    ['What app could you live without?', 'What app would be hardest to live without?'],
    ['What trend needs to disappear?', 'What old trend should come back?'],
    ['What is the worst place to be stuck for three hours?', 'What place could you happily spend three hours?'],
    ['What is the most overrated school subject?', 'What school subject is more useful than people think?']
  ],
  Situations: [
    ['What would you grab first if your house had to be evacuated?', 'What would you grab first when packing for a weekend trip?'],
    ['What is the first thing you would do after winning the lottery?', 'What is the first thing you would do after losing your phone?'],
    ['What would you wear to sneak into a fancy event?', 'What would you wear to your dream concert?'],
    ['What would you do if you woke up in another country?', 'What would you do if you woke up with a completely free day?'],
    ['What item would help most in a power outage?', 'What item would help most at a beach day?'],
    ['Where would you go if you had to avoid everyone for a day?', 'Where would you go if you wanted to meet as many people as possible?']
  ]
};

const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml' };
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const id = () => crypto.randomBytes(8).toString('hex');
const cleanName = s => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 20);
const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}
function chooseCategory(requested, source) {
  if (requested && requested !== 'Random' && source[requested]) return requested;
  return pick(Object.keys(source));
}
function pub(room) {
  return {
    code: room.code, hostId: room.hostId, phase: room.phase, round: room.round,
    settings: room.settings,
    players: room.players.map(p => ({ id:p.id, name:p.name, connected:p.connected, score:p.score || 0 })),
    votesCast: Object.keys(room.votes || {}).length
  };
}
function sendSSE(player, type, data) {
  if (!player?.stream || player.stream.writableEnded) return;
  player.stream.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}
function broadcast(room, type, data) { room.players.forEach(p => sendSSE(p, type, data)); }
function emitRoom(room) { broadcast(room, 'room', pub(room)); room.updatedAt = Date.now(); }
function privateRound(room, player) {
  const d = room.roundData;
  if (!d) return null;
  if (d.mode === 'prompt') return player.id === d.imposterId
    ? { role:'IMPOSTER', category:d.category, prompt:d.imposterPrompt }
    : { role:'CREW', category:d.category, prompt:d.crewPrompt };
  return player.id === d.imposterId
    ? { role:'IMPOSTER', category:d.category, hint:room.settings.imposterHint ? d.category : null }
    : { role:'CREW', category:d.category, word:d.word };
}
function startRound(room) {
  const connected = room.players.filter(p => p.connected);
  if (connected.length < 3) throw new Error('You need at least 3 connected players.');
  const imposter = pick(connected);
  if (room.settings.mode === 'prompt') {
    const category = chooseCategory(room.settings.promptCategory, PROMPT_PAIRS);
    const pair = pick(PROMPT_PAIRS[category]);
    const flip = Math.random() < .5;
    room.roundData = { mode:'prompt', category, crewPrompt:flip?pair[0]:pair[1], imposterPrompt:flip?pair[1]:pair[0], imposterId:imposter.id };
  } else {
    const category = chooseCategory(room.settings.wordCategory, WORDS);
    room.roundData = { mode:'classic', category, word:pick(WORDS[category]), imposterId:imposter.id };
  }
  room.round += 1; room.phase = 'playing'; room.votes = {}; room.lastResult = null;
  room.players.filter(p => p.connected).forEach(p => sendSSE(p, 'private', privateRound(room, p)));
  emitRoom(room);
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Content-Length':Buffer.byteLength(body), 'Cache-Control':'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 100000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid request.')); } });
    req.on('error', reject);
  });
}
function auth(body) {
  const room = rooms.get(cleanCode(body.code));
  const player = room?.players.find(p => p.id === body.playerId);
  if (!room || !player) throw new Error('Room not found.');
  return { room, player };
}

async function handleApi(req, res, pathname) {
  try {
    const b = await readBody(req);
    if (pathname === '/api/create') {
      const name = cleanName(b.name); if (!name) throw new Error('Enter a nickname.');
      const code = makeCode(), player = { id:id(), name, connected:true, stream:null, streamToken:null, score:0 };
      const room = { code, hostId:player.id, players:[player], phase:'lobby', round:0, roundData:null, votes:{}, lastResult:null, settings:{ mode:'classic', wordCategory:'Random', promptCategory:'Random', imposterHint:true }, updatedAt:Date.now() };
      rooms.set(code, room); return json(res,200,{ok:true,room:pub(room),playerId:player.id});
    }
    if (pathname === '/api/join') {
      const name = cleanName(b.name), code = cleanCode(b.code); if (!name) throw new Error('Enter a nickname.');
      const room = rooms.get(code); if (!room) throw new Error('Room not found. Check the code.');
      if (room.phase !== 'lobby') throw new Error('A round is already running. Join after this round.');
      if (room.players.filter(p=>p.connected).length >= 16) throw new Error('This room is full.');
      if (room.players.some(p=>p.connected && p.name.toLowerCase()===name.toLowerCase())) throw new Error('That nickname is already in the room.');
      const player = { id:id(), name, connected:true, stream:null, streamToken:null, score:0 }; room.players.push(player); emitRoom(room);
      return json(res,200,{ok:true,room:pub(room),playerId:player.id});
    }
    if (pathname === '/api/rejoin') {
      const {room,player}=auth(b); player.connected=true; emitRoom(room); return json(res,200,{ok:true,room:pub(room),playerId:player.id});
    }
    if (pathname === '/api/settings') {
      const {room,player}=auth(b); if(player.id!==room.hostId) throw new Error('Only the host can change settings.'); if(room.phase!=='lobby') throw new Error('Change settings between rounds.');
      const s=b.settings||{}, next={...room.settings};
      if(['classic','prompt'].includes(s.mode)) next.mode=s.mode;
      if(s.wordCategory==='Random'||WORDS[s.wordCategory]) next.wordCategory=s.wordCategory;
      if(s.promptCategory==='Random'||PROMPT_PAIRS[s.promptCategory]) next.promptCategory=s.promptCategory;
      next.imposterHint=Boolean(s.imposterHint); room.settings=next; emitRoom(room); return json(res,200,{ok:true});
    }
    if (pathname === '/api/start') {
      const {room,player}=auth(b); if(player.id!==room.hostId) throw new Error('Only the host can start.'); startRound(room); return json(res,200,{ok:true});
    }
    if (pathname === '/api/vote') {
      const {room,player}=auth(b); if(room.phase!=='playing') throw new Error('No active round.');
      if(!room.players.some(p=>p.id===b.targetId&&p.connected)) throw new Error('Player not found.'); room.votes[player.id]=b.targetId; emitRoom(room); return json(res,200,{ok:true});
    }
    if (pathname === '/api/reveal') {
      const {room,player}=auth(b); if(player.id!==room.hostId) throw new Error('Only the host can reveal the result.'); if(room.phase!=='playing'||!room.roundData) throw new Error('No active round.');
      room.phase='results';
      const counts={}; Object.values(room.votes).forEach(v=>counts[v]=(counts[v]||0)+1); const d=room.roundData;
      const points={}; room.players.forEach(p=>points[p.id]=0);
      for(const p of room.players){
        if(p.id===d.imposterId){
          const fooled=Object.entries(room.votes).filter(([voterId,targetId])=>voterId!==d.imposterId&&targetId!==d.imposterId).length;
          points[p.id]=fooled;
        } else if(room.votes[p.id]===d.imposterId) points[p.id]=1;
        p.score=(p.score||0)+points[p.id];
      }
      const imposter=room.players.find(p=>p.id===d.imposterId);
      const result={ imposterId:d.imposterId, imposterName:imposter?.name||'Unknown', word:d.mode==='classic'?d.word:null, crewPrompt:d.mode==='prompt'?d.crewPrompt:null, imposterPrompt:d.mode==='prompt'?d.imposterPrompt:null, votes:counts, points };
      room.lastResult=result; emitRoom(room); broadcast(room,'results',result); return json(res,200,{ok:true});
    }
    if (pathname === '/api/next') {
      const {room,player}=auth(b); if(player.id!==room.hostId) throw new Error('Only the host can continue.'); if(room.phase!=='results') throw new Error('Reveal the result first.'); room.phase='lobby'; room.roundData=null; room.votes={}; room.lastResult=null; emitRoom(room); return json(res,200,{ok:true});
    }
    if (pathname === '/api/leave') {
      const {room,player}=auth(b);
      const wasHost=player.id===room.hostId;
      const wasImposter=room.phase==='playing'&&room.roundData?.imposterId===player.id;
      player.streamToken=id();
      if(player.stream&&!player.stream.writableEnded){ try{ player.stream.end(); }catch{} }
      player.stream=null; player.connected=false;
      room.players=room.players.filter(p=>p.id!==player.id);
      delete room.votes[player.id];
      for(const [voterId,targetId] of Object.entries(room.votes)) if(targetId===player.id) delete room.votes[voterId];
      if(room.players.length===0){ rooms.delete(room.code); return json(res,200,{ok:true}); }
      if(wasHost){ const next=room.players.find(p=>p.connected)||room.players[0]; room.hostId=next.id; }
      if(wasImposter || (room.phase==='playing'&&room.players.filter(p=>p.connected).length<3)){
        room.phase='lobby'; room.roundData=null; room.votes={}; room.lastResult=null;
        broadcast(room,'notice',{message:wasImposter?'The impostor left, so the round was cancelled.':'Not enough players remain, so the round was cancelled.'});
      }
      emitRoom(room); return json(res,200,{ok:true});
    }
    return json(res,404,{ok:false,error:'Not found.'});
  } catch (e) { return json(res,400,{ok:false,error:e.message || 'Request failed.'}); }
}

function handleEvents(req, res, url) {
  const code=cleanCode(url.searchParams.get('code')), playerId=url.searchParams.get('playerId');
  const room=rooms.get(code), player=room?.players.find(p=>p.id===playerId);
  if(!room||!player){res.writeHead(404);return res.end();}
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
  res.write('retry: 1000\n\n');
  const token=id(); player.stream=res; player.streamToken=token; player.connected=true; sendSSE(player,'room',pub(room));
  if(room.phase==='playing'&&room.roundData) sendSSE(player,'private',privateRound(room,player));
  if(room.phase==='results'&&room.lastResult) sendSSE(player,'results',room.lastResult);
  req.on('close',()=>setTimeout(()=>{
    if(player.streamToken!==token) return;
    player.stream=null; player.connected=false;
    if(room.hostId===player.id){const next=room.players.find(p=>p.connected);if(next)room.hostId=next.id;}
    emitRoom(room);
  },5000));
}

function serveStatic(res, pathname) {
  let rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  let file = path.resolve(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { file=path.join(PUBLIC,'index.html'); }
    fs.readFile(file,(e,data)=>{ if(e){res.writeHead(404);return res.end('Not found');} res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':path.basename(file)==='index.html'?'no-cache':'public, max-age=3600'}); res.end(data); });
  });
}

const server=http.createServer((req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET'&&url.pathname==='/events') return handleEvents(req,res,url);
  if(req.method==='POST'&&url.pathname.startsWith('/api/')) return handleApi(req,res,url.pathname);
  if(req.method==='GET') return serveStatic(res,url.pathname);
  res.writeHead(405); res.end('Method not allowed');
});

setInterval(()=>{
  const cutoff=Date.now()-6*60*60*1000;
  for(const [code,room] of rooms) if(room.updatedAt<cutoff&&room.players.every(p=>!p.connected)) rooms.delete(code);
},30*60*1000).unref();

setInterval(()=>{ for(const room of rooms.values()) for(const p of room.players) if(p.stream&&!p.stream.writableEnded) p.stream.write(': ping\n\n'); },20000).unref();

server.listen(PORT,()=>console.log(`Imposter Party running on port ${PORT}`));
