const $ = id => document.getElementById(id);
let state = { room:null, playerId:null, privateRound:null, result:null, revealedMine:false, selectedVote:null, events:null, leaveArmed:false, leaveTimer:null };
const els = {
  homeScreen:$('homeScreen'),roomScreen:$('roomScreen'),nameInput:$('nameInput'),roomInput:$('roomInput'),createBtn:$('createBtn'),joinBtn:$('joinBtn'),homeError:$('homeError'),copyCodeBtn:$('copyCodeBtn'),roundPill:$('roundPill'),playersList:$('playersList'),playerCount:$('playerCount'),settingsCard:$('settingsCard'),hostOnlyNote:$('hostOnlyNote'),modeSegment:$('modeSegment'),classicSettings:$('classicSettings'),promptSettings:$('promptSettings'),wordCategory:$('wordCategory'),promptCategory:$('promptCategory'),imposterHint:$('imposterHint'),startBtn:$('startBtn'),waitingCard:$('waitingCard'),roleCard:$('roleCard'),secretCover:$('secretCover'),secretContent:$('secretContent'),revealMineBtn:$('revealMineBtn'),gameActions:$('gameActions'),voteList:$('voteList'),voteStatus:$('voteStatus'),revealResultBtn:$('revealResultBtn'),resultsCard:$('resultsCard'),nextRoundBtn:$('nextRoundBtn'),scoreboardCard:$('scoreboardCard'),scoreboardList:$('scoreboardList'),leaveBtn:$('leaveBtn'),toast:$('toast')
};
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function toast(msg){els.toast.textContent=msg;els.toast.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>els.toast.classList.remove('show'),1800)}
function showRoom(){els.homeScreen.classList.remove('active');els.roomScreen.classList.add('active')}
function persist(){if(state.room&&state.playerId)localStorage.setItem('imposterSession',JSON.stringify({code:state.room.code,playerId:state.playerId}))}
function amHost(){return state.room?.hostId===state.playerId}
function setHomeError(msg=''){els.homeError.textContent=msg}
async function api(path,body={}){const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return r.json()}
function authBody(extra={}){return {code:state.room.code,playerId:state.playerId,...extra}}
function connectEvents(){
  state.events?.close();
  const es=new EventSource(`/events?code=${encodeURIComponent(state.room.code)}&playerId=${encodeURIComponent(state.playerId)}`);state.events=es;
  es.addEventListener('room',e=>{state.room=JSON.parse(e.data);persist();render()});
  es.addEventListener('private',e=>{state.privateRound=JSON.parse(e.data);state.result=null;state.revealedMine=false;state.selectedVote=null;render()});
  es.addEventListener('results',e=>{state.result=JSON.parse(e.data);render()});
  es.addEventListener('notice',e=>{try{toast(JSON.parse(e.data).message||'Game updated')}catch{toast('Game updated')}});
}
function enterSession(res){state.room=res.room;state.playerId=res.playerId;persist();showRoom();connectEvents();render()}
els.createBtn.onclick=async()=>{const name=els.nameInput.value.trim();if(!name)return setHomeError('Enter a nickname first.');setHomeError('');const r=await api('create',{name});r.ok?enterSession(r):setHomeError(r.error)};
els.joinBtn.onclick=async()=>{const name=els.nameInput.value.trim(),code=els.roomInput.value.trim().toUpperCase();if(!name||code.length<5)return setHomeError('Enter a nickname and 5-character room code.');setHomeError('');const r=await api('join',{name,code});r.ok?enterSession(r):setHomeError(r.error)};
els.roomInput.oninput=()=>els.roomInput.value=els.roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5);
els.copyCodeBtn.onclick=async()=>{const url=`${location.origin}/?room=${state.room.code}`;try{await navigator.clipboard.writeText(url);toast('Invite link copied')}catch{toast(`Room: ${state.room.code}`)}};
function sendSettings(patch){if(!amHost())return;api('settings',authBody({settings:{...state.room.settings,...patch}})).then(r=>{if(!r.ok)toast(r.error)})}
els.modeSegment.onclick=e=>{const b=e.target.closest('button[data-mode]');if(b&&amHost()&&state.room.phase==='lobby')sendSettings({mode:b.dataset.mode})};
els.wordCategory.onchange=()=>sendSettings({wordCategory:els.wordCategory.value});els.promptCategory.onchange=()=>sendSettings({promptCategory:els.promptCategory.value});els.imposterHint.onchange=()=>sendSettings({imposterHint:els.imposterHint.checked});
els.startBtn.onclick=async()=>{const r=await api('start',authBody());if(!r.ok)toast(r.error)};
els.revealMineBtn.onclick=()=>{state.revealedMine=true;renderSecret()};
els.revealResultBtn.onclick=async()=>{const r=await api('reveal',authBody());if(!r.ok)toast(r.error)};
els.nextRoundBtn.onclick=async()=>{const r=await api('next',authBody());if(!r.ok)toast(r.error)};
function resetLeaveButton(){state.leaveArmed=false;clearTimeout(state.leaveTimer);if(els.leaveBtn)els.leaveBtn.textContent='Leave session'}
function leaveLocally(){
  state.events?.close(); state.events=null;
  localStorage.removeItem('imposterSession');
  clearTimeout(state.leaveTimer);
  state={room:null,playerId:null,privateRound:null,result:null,revealedMine:false,selectedVote:null,events:null,leaveArmed:false,leaveTimer:null};
  els.roomScreen.classList.remove('active'); els.homeScreen.classList.add('active');
  history.replaceState({},'',location.pathname);
  els.roomInput.value=''; resetLeaveButton();
}
function sendLeaveReliable(payload){
  let sent=false;
  try{
    if(navigator.sendBeacon){
      const body=new URLSearchParams({code:payload.code,playerId:payload.playerId});
      sent=navigator.sendBeacon('/api/leave',body);
    }
  }catch{}
  if(!sent){
    fetch('/api/leave',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true}).catch(()=>{});
  }
}
els.leaveBtn.onclick=()=>{
  if(!state.room)return;
  if(!state.leaveArmed){
    state.leaveArmed=true; els.leaveBtn.textContent='Tap again to leave'; toast('Tap Leave again to confirm');
    clearTimeout(state.leaveTimer); state.leaveTimer=setTimeout(resetLeaveButton,3500); return;
  }
  const payload=authBody();
  sendLeaveReliable(payload);
  leaveLocally();
};
function render(){
  const room=state.room;if(!room)return;els.copyCodeBtn.textContent=room.code;els.roundPill.textContent=room.phase==='lobby'?(room.round?`Between rounds · ${room.round}`:'Lobby'):room.phase==='playing'?`Round ${room.round}`:`Results · ${room.round}`;
  const connected=room.players.filter(p=>p.connected).length;els.playerCount.textContent=`${connected}/16`;els.playersList.innerHTML=room.players.map(p=>`<div class="player-chip ${p.connected?'':'offline'}"><span class="dot"></span><span>${esc(p.name)}${p.id===state.playerId?' (you)':''}</span>${p.id===room.hostId?'<span class="crown">👑</span>':''}</div>`).join('');
  const host=amHost(), lobby=room.phase==='lobby',playing=room.phase==='playing',results=room.phase==='results';els.hostOnlyNote.textContent=host?'You are host':'Host controls this';els.settingsCard.querySelectorAll('button,input,select').forEach(x=>x.disabled=!host||!lobby);[...els.modeSegment.querySelectorAll('button')].forEach(b=>b.classList.toggle('selected',b.dataset.mode===room.settings.mode));els.classicSettings.classList.toggle('hidden',room.settings.mode!=='classic');els.promptSettings.classList.toggle('hidden',room.settings.mode!=='prompt');els.wordCategory.value=room.settings.wordCategory;els.promptCategory.value=room.settings.promptCategory;els.imposterHint.checked=room.settings.imposterHint;
  els.settingsCard.classList.toggle('hidden',!lobby);const showScores=room.round>0&&(lobby||results);els.scoreboardCard.classList.toggle('hidden',!showScores);els.startBtn.classList.toggle('hidden',!(lobby&&host));els.startBtn.disabled=connected<3;els.startBtn.textContent=connected<3?`Need ${3-connected} more player${3-connected===1?'':'s'}`:(room.round?'Start next round':'Start round');els.waitingCard.classList.toggle('hidden',!(lobby&&!host));els.roleCard.classList.toggle('hidden',!playing);els.gameActions.classList.toggle('hidden',!playing);els.revealResultBtn.classList.toggle('hidden',!(playing&&host));els.resultsCard.classList.toggle('hidden',!results);els.nextRoundBtn.classList.toggle('hidden',!(results&&host));if(showScores)renderScoreboard();if(playing){renderSecret();renderVotes()}if(results&&state.result)renderResults();
}

function sortedScores(){return [...state.room.players].sort((a,b)=>(b.score||0)-(a.score||0)||a.name.localeCompare(b.name))}
function scoreRows(points={}){return sortedScores().map((p,i)=>`<div class="score-row ${p.id===state.playerId?'me':''}"><div class="score-rank">${i+1}</div><div class="score-name">${esc(p.name)}${p.id===state.playerId?' (you)':''}${p.id===state.room.hostId?' 👑':''}</div><div class="score-value">${points[p.id]>0?`<span class="round-gain">+${points[p.id]}</span>`:''}<span>${p.score||0}</span><small>pts</small></div></div>`).join('')}
function renderScoreboard(){els.scoreboardList.innerHTML=scoreRows()||'<p class="help">No scores yet.</p>'}

function renderSecret(){if(!state.privateRound){els.secretCover.classList.remove('hidden');els.secretContent.classList.add('hidden');return}els.secretCover.classList.toggle('hidden',state.revealedMine);els.secretContent.classList.toggle('hidden',!state.revealedMine);if(!state.revealedMine)return;const d=state.privateRound,imp=d.role==='IMPOSTER';let body;if('prompt'in d)body=`<div class="secret-prompt">${esc(d.prompt)}</div><p class="role-tip">Answer naturally. Don't read the question out loud.</p>`;else if(imp)body=`<div class="secret-value">${d.hint?esc(d.hint):'No hint'}</div><p class="role-tip">${d.hint?'That is your one-word hint. ':''}You still do not know the crew word — blend in and figure it out from their clues.</p>`;else body=`<div class="secret-value">${esc(d.word)}</div><p class="role-tip">Give a clue that proves you know it without making the word obvious.</p>`;els.secretContent.innerHTML=`<span class="role-label ${imp?'imposter':'crew'}">${imp?'IMPOSTER':'CREW'}</span><div class="category">Category · ${esc(d.category)}</div>${body}`}
function renderVotes(){const room=state.room,eligible=room.players.filter(p=>p.connected&&p.id!==state.playerId);els.voteStatus.textContent=`${room.votesCast} vote${room.votesCast===1?'':'s'} cast`;els.voteList.innerHTML=eligible.map(p=>`<button class="vote-btn ${state.selectedVote===p.id?'selected':''}" data-id="${p.id}">${esc(p.name)}</button>`).join('');els.voteList.querySelectorAll('button').forEach(b=>b.onclick=async()=>{state.selectedVote=b.dataset.id;const r=await api('vote',authBody({targetId:b.dataset.id}));if(!r.ok)toast(r.error);else{toast('Vote locked in');renderVotes()}})}
function renderResults(){const r=state.result,room=state.room,imp=room.players.find(p=>p.id===r.imposterId);const lines=Object.entries(r.votes||{}).sort((a,b)=>b[1]-a[1]).map(([id,c])=>`<div class="vote-line"><span>${esc(room.players.find(p=>p.id===id)?.name||'Player who left')}</span><b>${c}</b></div>`).join('');let secret='';if(r.word)secret=`<div class="result-secret"><span class="eyebrow">SECRET WORD</span><div class="secret-value">${esc(r.word)}</div></div>`;if(r.crewPrompt)secret=`<div class="result-secret"><span class="eyebrow">CREW QUESTION</span><div class="secret-prompt">${esc(r.crewPrompt)}</div><hr style="border-color:var(--line);border-style:solid;border-width:1px 0 0;margin:16px 0"><span class="eyebrow">IMPOSTER QUESTION</span><div class="secret-prompt">${esc(r.imposterPrompt)}</div></div>`;els.resultsCard.innerHTML=`<div class="result-icon">🎭</div><div class="eyebrow">THE IMPOSTER WAS</div><div class="result-name">${esc(imp?.name||r.imposterName||'Unknown')}</div>${secret}<div class="section-title"><h2>Votes</h2><span>${Object.values(r.votes||{}).reduce((a,b)=>a+b,0)} total</span></div><div class="votes-summary">${lines||'<p class="help">No votes were cast.</p>'}</div><div class="results-scoreboard"><div class="section-title"><h2>This round</h2><span>Points earned</span></div><div class="scoreboard-list">${scoreRows(r.points||{})}</div><p class="help score-help">The totals shown here already include this round. The Overall Scoreboard above carries across every round.</p></div>`}
const prefill=new URLSearchParams(location.search).get('room');if(prefill)els.roomInput.value=prefill.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5);
(async()=>{try{const saved=JSON.parse(localStorage.getItem('imposterSession')||'null');if(saved){const r=await api('rejoin',saved);if(r.ok)enterSession(r);else localStorage.removeItem('imposterSession')}}catch{}})();
