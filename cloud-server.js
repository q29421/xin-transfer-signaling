const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 9763;

const ICE_SERVERS = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.miwifi.com:3478' },
    { urls: 'stun:stun.chat.bilibili.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:a.relay.metered.ca:80', username: 'e8dd65b92f7b828b1d79c8e0', credential: 'fRjpnOLv0yX7T1pI' },
    { urls: 'turn:a.relay.metered.ca:443', username: 'e8dd65b92f7b828b1d79c8e0', credential: 'fRjpnOLv0yX7T1pI' },
    { urls: 'turn:a.relay.metered.ca:443?transport=tcp', username: 'e8dd65b92f7b828b1d79c8e0', credential: 'fRjpnOLv0yX7T1pI' }
];

const rooms = new Map();

function extractIpv4(remoteAddress) {
    if (!remoteAddress) return 'unknown';
    if (remoteAddress.startsWith('::ffff:')) return remoteAddress.substring(7);
    if (remoteAddress === '::1') return '127.0.0.1';
    return remoteAddress;
}

const WEB_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>杀人平安 - 跨网互传</title>
<style>
:root{--green:#07C160;--bg:#EDEDED;--sent:#95EC69;--recv:#fff;--text:#333;--muted:#999;--border:#ddd}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;background:var(--bg);color:var(--text);height:100vh;display:flex;flex-direction:column}
.header{background:var(--green);padding:12px 16px;display:flex;align-items:center;justify-content:space-between}
.header h1{color:#fff;font-size:17px;font-weight:500}
.header .status{color:rgba(255,255,255,.7);font-size:12px}
.step{flex:1;display:flex;align-items:center;justify-content:center;padding:24px}
.step-card{background:#fff;border-radius:8px;padding:40px;text-align:center;max-width:400px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.step-card h2{font-size:22px;margin-bottom:6px}
.step-card p{color:var(--muted);font-size:13px;margin-bottom:24px}
.input{width:100%;padding:10px 14px;background:#f5f5f5;border:1px solid var(--border);border-radius:6px;font-size:18px;text-align:center;outline:none}
.input:focus{border-color:var(--green)}
.input::placeholder{font-size:13px;color:#bbb}
.btn{width:100%;padding:10px;background:var(--green);color:#fff;border:none;border-radius:6px;font-size:15px;cursor:pointer;margin-top:12px}
.btn:hover{background:#06ad56}
.btn:disabled{opacity:.5;cursor:not-allowed}
.msg{font-size:13px;min-height:20px;margin-top:12px}
.msg.error{color:#e17055}.msg.success{color:var(--green)}.msg.info{color:#576B95}
.chat{flex:1;display:flex;flex-direction:column;overflow:hidden}
.chat-list{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:10px}
.chat-empty{text-align:center;padding:60px 20px;color:var(--muted)}
.chat-empty .hint{font-size:12px;margin-top:6px;color:#bbb}
.bubble{max-width:70%;padding:10px 12px;position:relative;min-width:180px}
.bubble.sent{align-self:flex-end;background:var(--sent);border-radius:4px 4px 12px 4px}
.bubble.recv{align-self:flex-start;background:var(--recv);border-radius:4px 4px 4px 12px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.bubble-file{display:flex;align-items:center;gap:8px}
.bubble-icon{font-size:28px;line-height:1}
.bubble-info{flex:1;min-width:0}
.bubble-name{font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bubble-size{font-size:11px;color:var(--muted);margin-top:2px}
.progress-bar{height:4px;background:rgba(0,0,0,.08);border-radius:2px;overflow:hidden;margin-top:8px}
.progress-fill{height:100%;border-radius:2px;transition:width .3s;background:var(--green)}
.progress-text{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:4px}
.bubble-status{font-size:11px;margin-top:4px;color:var(--green)}
.bubble-time{font-size:10px;color:#bbb;text-align:right;margin-top:4px}
.bottom-bar{padding:10px 16px;background:#f7f7f7;border-top:1px solid #e0e0e0;display:flex;align-items:center}
.btn-file{padding:8px 16px;background:var(--green);color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px}
.btn-file:hover{background:#06ad56}
.hidden{display:none!important}
.features{margin-top:16px;padding-top:16px;border-top:1px solid #f0f0f0;display:flex;justify-content:center;gap:20px}
.feature{text-align:center;font-size:11px;color:var(--muted)}
.feature span{font-size:18px}
</style>
</head>
<body>
<div class="header">
<h1 id="title">杀人平安</h1>
<span class="status" id="statusText">未连接</span>
</div>
<div id="joinSection" class="step">
<div class="step-card">
<h2>跨网互传</h2>
<p>输入配对码加入房间，与手机端互传文件</p>
<input type="text" id="roomCode" class="input" placeholder="输入配对码" maxlength="20" autocomplete="off">
<button id="joinBtn" class="btn" onclick="joinRoom()">加入房间</button>
<div id="joinMsg" class="msg"></div>
<div class="features">
<div class="feature"><span>🔒</span><br>端到端加密</div>
<div class="feature"><span>⚡</span><br>P2P直连</div>
<div class="feature"><span>🌐</span><br>跨网传输</div>
</div>
</div>
</div>
<div id="chatSection" class="chat hidden">
<div id="chatList" class="chat-list">
<div id="chatEmpty" class="chat-empty"><p>暂无传输记录</p><p class="hint">点击下方按钮发送文件，或等待对方发送</p></div>
</div>
<div class="bottom-bar">
<button class="btn-file" onclick="sendFiles()">📎 选择文件发送</button>
</div>
</div>
<script>
let ws=null,pc=null,dc=null,fc=null,peerId='',hasInit=false,iceServers=[];
const transfers=new Map();

function joinRoom(){
const code=document.getElementById('roomCode').value.trim().toUpperCase();
if(code.length<4){setMsg('请输入4位以上配对码','error');return}
document.getElementById('joinBtn').disabled=true;
setMsg('正在连接服务器...','info');
const proto=location.protocol==='https:'?'wss:':'ws:';
ws=new WebSocket(proto+'//'+location.host);
ws.onopen=()=>{
setMsg('已连接，正在加入房间...','info');
ws.send(JSON.stringify({type:'join',room:code,clientType:'browser'}));
};
ws.onmessage=e=>onMessage(JSON.parse(e.data));
ws.onerror=()=>{setMsg('连接服务器失败','error');document.getElementById('joinBtn').disabled=false};
ws.onclose=()=>{
if(pc){pc.close();pc=null}
if(!document.getElementById('chatSection').classList.contains('hidden')){showJoin('连接已断开','error')}
};
}

function onMessage(msg){
if(msg.type==='joined'){
iceServers=msg.iceServers||[];
const others=msg.peers.filter(p=>p.id!==msg.clientId);
if(others.length>0){
peerId=others[0].id;
setMsg('发现对端，正在建立P2P连接...','info');
initiate();
}else{
setMsg('已加入房间，等待对端加入...','info');
}
}else if(msg.type==='peer-joined'){
const others=msg.peers.filter(p=>p.id!==msg.clientId);
if(others.length>0)peerId=others[0].id;
if(!hasInit){hasInit=true;initiate()}
}else if(msg.type==='signal'){
if(!peerId)peerId=msg.fromId;
handleSignal(msg.fromId,msg.signal)
}else if(msg.type==='peer-left'){
showJoin('对端已断开','error');if(pc){pc.close();pc=null}
}else if(msg.type==='error'){
setMsg('错误: '+msg.message,'error');document.getElementById('joinBtn').disabled=false;
}
}

function initiate(){
hasInit=true;
pc=new RTCPeerConnection({iceServers:iceServers});
setupPC();
const ci={ordered:true};fc=pc.createDataChannel('control',ci);setupDC(fc,'control');
const fi={ordered:false,maxRetransmits:0};dc=pc.createDataChannel('file-transfer',fi);setupDC(dc,'file-transfer');
pc.createOffer().then(o=>pc.setLocalDescription(o)).then(()=>sendSignal({type:'offer',sdp:pc.localDescription.sdp})).catch(e=>setMsg('连接失败: '+e.message,'error'));
}

function handleSignal(fromId,signal){
if(signal.type==='offer'){
if(pc)return;
pc=new RTCPeerConnection({iceServers:iceServers});setupPC();
pc.setRemoteDescription({type:'offer',sdp:signal.sdp}).then(()=>pc.createAnswer()).then(a=>pc.setLocalDescription(a)).then(()=>sendSignal({type:'answer',sdp:pc.localDescription.sdp}));
}else if(signal.type==='answer'){
if(pc)pc.setRemoteDescription({type:'answer',sdp:signal.sdp});
}else if(signal.type==='ice-candidate'){
if(pc)pc.addIceCandidate(new RTCIceCandidate({candidate:signal.candidate,sdpMid:signal.sdpMid,sdpMLineIndex:signal.sdpMLineIndex}));
}
}

function setupPC(){
pc.onicecandidate=e=>{if(e.candidate)sendSignal({type:'ice-candidate',candidate:e.candidate.candidate,sdpMid:e.candidate.sdpMid,sdpMLineIndex:e.candidate.sdpMLineIndex})};
pc.onconnectionstatechange=()=>{if(pc.connectionState==='connected'){showChat()}else if(pc.connectionState==='failed'){if(pc){pc.close();pc=null}showJoin('P2P连接失败，请重试','error')}else if(pc.connectionState==='disconnected'){if(pc){pc.close();pc=null}showJoin('连接已断开','error')}};
pc.ondatachannel=e=>{const ch=e.channel;setupDC(ch,ch.label)};
}

function setupDC(ch,label){
ch.binaryType='arraybuffer';
ch.onopen=()=>console.log('DC open:',label);
ch.onclose=()=>console.log('DC close:',label);
ch.onmessage=e=>{
if(label==='control'){
try{onControl(JSON.parse(new TextDecoder().decode(e.data)))}catch(err){}
}else{onFileData(e.data)}
};
}

let pendingReceive=null,receiveBuffer=[],receiveSize=0;
const pendingAccepts={};

function onControl(msg){
if(msg.type==='file-offer'){
pendingReceive={id:msg.transferId,fileName:msg.fileName,fileSize:msg.fileSize};
receiveBuffer=[];receiveSize=0;
addBubble(pendingReceive.id,msg.fileName,msg.fileSize,'receiving');
fc.send(JSON.stringify({type:'file-accept',transferId:msg.transferId}));
}else if(msg.type==='file-accept'){
if(pendingAccepts[msg.transferId]){pendingAccepts[msg.transferId]();delete pendingAccepts[msg.transferId]}
}else if(msg.type==='file-complete'){
const t=transfers.get(msg.transferId);
if(t){t.status='complete';updateBubble(t.id,t.transferred,t.fileSize,'complete')}
}
}

function onFileData(data){
if(!pendingReceive)return;
receiveBuffer.push(data);
receiveSize+=data.byteLength;
const t=transfers.get(pendingReceive.id);
if(t){t.transferred=receiveSize;t.status='transferring';updateBubble(t.id,receiveSize,t.fileSize,'transferring')}
if(receiveSize>=pendingReceive.fileSize){
const blob=new Blob(receiveBuffer);
const url=URL.createObjectURL(blob);
const a=document.createElement('a');a.href=url;a.download=pendingReceive.fileName;a.click();
if(t){t.status='complete';updateBubble(t.id,receiveSize,t.fileSize,'complete')}
fc.send(JSON.stringify({type:'file-complete',transferId:pendingReceive.id}));
pendingReceive=null;receiveBuffer=[];receiveSize=0;
}
}

function sendFiles(){
const input=document.createElement('input');input.type='file';input.multiple=true;
input.onchange=async()=>{
for(const file of input.files){
const id=Math.random().toString(36).substring(2,10);
addBubble(id,file.name,file.size,'sending');
await new Promise(r=>{const check=setInterval(()=>{if(fc&&fc.readyState==='open'){clearInterval(check);r()}},100)});
await new Promise(r=>{const check=setInterval(()=>{if(dc&&dc.readyState==='open'){clearInterval(check);r()}},100)});
const acceptPromise=new Promise(r=>{pendingAccepts[id]=r});
fc.send(JSON.stringify({type:'file-offer',transferId:id,fileName:file.name,fileSize:file.size}));
await acceptPromise;
const chunkSize=16384;let offset=0;
while(offset<file.size){
const end=Math.min(offset+chunkSize,file.size);
const slice=file.slice(offset,end);
const buf=await slice.arrayBuffer();
dc.send(buf);
offset=end;
const t=transfers.get(id);if(t){t.transferred=offset;t.status='transferring';updateBubble(id,offset,file.size,'transferring')}
}
fc.send(JSON.stringify({type:'file-complete',transferId:id}));
const t=transfers.get(id);if(t){t.status='complete';updateBubble(id,file.size,file.size,'complete')}
}
};
input.click();
}

function addBubble(id,fileName,fileSize,dir){
transfers.set(id,{id,fileName,fileSize,transferred:0,status:'pending',direction:dir});
const list=document.getElementById('chatList');
const empty=document.getElementById('chatEmpty');if(empty)empty.remove();
const d=document.createElement('div');d.id='b-'+id;d.className='bubble '+(dir==='sending'?'sent':'recv');
d.innerHTML=bubbleHTML(fileName,fileSize,0,'pending');
list.appendChild(d);list.scrollTop=list.scrollHeight;
}

function updateBubble(id,transferred,total,status){
const d=document.getElementById('b-'+id);if(!d)return;
const t=transfers.get(id);if(!t)return;
const p=total>0?(transferred/total*100):0;
const now=new Date();const ts=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
let statusHtml='';
if(status==='complete')statusHtml='<div class="bubble-status">✓ 已'+(t.direction==='sending'?'发送':'接收')+'</div>';
else statusHtml='<div class="progress-bar"><div class="progress-fill" style="width:'+p+'%"></div></div><div class="progress-text"><span>'+fmtSize(transferred)+' / '+fmtSize(total)+'</span><span>'+p.toFixed(1)+'%</span></div>';
d.innerHTML='<div class="bubble-file"><div class="bubble-icon">📄</div><div class="bubble-info"><div class="bubble-name">'+t.fileName+'</div><div class="bubble-size">'+fmtSize(total)+'</div></div></div>'+statusHtml+'<div class="bubble-time">'+ts+'</div>';
const list=document.getElementById('chatList');list.scrollTop=list.scrollHeight;
}

function bubbleHTML(fileName,fileSize){return '<div class="bubble-file"><div class="bubble-icon">📄</div><div class="bubble-info"><div class="bubble-name">'+fileName+'</div><div class="bubble-size">'+fmtSize(fileSize)+'</div></div></div><div class="bubble-time"></div>'}
function fmtSize(b){if(b<=0)return'0 B';const u=['B','KB','MB','GB'];const i=Math.min(Math.floor(Math.log(b)/Math.log(1024)),u.length-1);return(b/Math.pow(1024,i)).toFixed(1)+' '+u[i]}
function sendSignal(signal){if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'signal',targetId:peerId,signal}))}
function setMsg(t,c){const e=document.getElementById('joinMsg');e.textContent=t;e.className='msg '+(c||'')}
function showChat(){document.getElementById('joinSection').classList.add('hidden');document.getElementById('chatSection').classList.remove('hidden');document.getElementById('title').textContent='手机';document.getElementById('statusText').textContent='在线'}
function showJoin(msg,type){document.getElementById('joinSection').classList.remove('hidden');document.getElementById('chatSection').classList.add('hidden');document.getElementById('title').textContent='杀人平安';document.getElementById('statusText').textContent='未连接';document.getElementById('joinBtn').disabled=false;hasInit=false;pc=null;dc=null;fc=null;peerId='';if(msg)setMsg(msg,type||'info')}
document.getElementById('roomCode').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom()});
document.getElementById('roomCode').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'')});
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/web' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(WEB_HTML);
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    const clientIp = extractIpv4(req.headers['x-forwarded-for'] || req.socket.remoteAddress);

    let currentRoom = null;
    let clientId = null;
    let clientType = 'unknown';

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            console.log(`[Message] ${clientId || 'unknown'} -> ${msg.type}`, msg.room || '', msg.targetId || '');

            switch (msg.type) {
                case 'join': {
                    const roomCode = msg.room;
                    if (!roomCode || roomCode.length < 2) {
                        ws.send(JSON.stringify({ type: 'error', message: '配对码无效' }));
                        return;
                    }

                    clientId = msg.clientId || generateId();
                    clientType = msg.clientType || 'unknown';
                    currentRoom = roomCode;

                    if (!rooms.has(roomCode)) {
                        rooms.set(roomCode, new Map());
                    }
                    const room = rooms.get(roomCode);

                    const existingById = room.get(clientId);
                    if (existingById) {
                        console.log(`[Room ${roomCode}] Same clientId ${clientId} reconnecting, replacing old socket`);
                        try { existingById.ws.close(); } catch(e) {}
                        room.delete(clientId);
                    } else {
                        const existingByType = Array.from(room.entries()).find(([id, c]) => c.type === clientType && c.ip === clientIp && id !== clientId);
                        if (existingByType) {
                            const [oldId, oldClient] = existingByType;
                            console.log(`[Room ${roomCode}] Replacing stale ${clientType} client ${oldId}`);
                            try { oldClient.ws.close(); } catch(e) {}
                            room.delete(oldId);
                        }
                    }

                    if (room.size >= 2) {
                        console.log(`[Room ${roomCode}] REJECTED - room full (${room.size}/2)`);
                        ws.send(JSON.stringify({ type: 'error', message: 'Room is full (2/2)' }));
                        return;
                    }

                    let displayIp = clientIp;
                    if (clientIp === '127.0.0.1') {
                        const localIps = getLocalIps();
                        if (localIps.length > 0) displayIp = localIps[0];
                    }

                    room.set(clientId, { ws, ip: displayIp, type: clientType });
                    console.log(`[Room ${roomCode}] ${clientId} (${clientType}) joined from ${displayIp} (${room.size}/2)`);

                    const peers = Array.from(room.keys());
                    const peerInfos = peers.map(id => ({
                        id: id,
                        ip: room.get(id).ip,
                        type: room.get(id).type
                    }));

                    ws.send(JSON.stringify({
                        type: 'joined',
                        room: roomCode,
                        clientId,
                        peers: peerInfos,
                        iceServers: ICE_SERVERS
                    }));

                    if (room.size === 2) {
                        console.log(`[Room ${roomCode}] PAIRED! Peers: ${peers.join(' <-> ')}`);
                        room.forEach((client) => {
                            client.ws.send(JSON.stringify({
                                type: 'peer-joined',
                                peers: peerInfos
                            }));
                        });
                    } else {
                        console.log(`[Room ${roomCode}] Waiting for peer...`);
                    }
                    break;
                }

                case 'signal': {
                    if (!currentRoom || !rooms.has(currentRoom)) return;
                    const room = rooms.get(currentRoom);
                    const targetId = msg.targetId;
                    if (room.has(targetId)) {
                        console.log(`[Signal] ${clientId} -> ${targetId} (type: ${msg.signal?.type})`);
                        room.get(targetId).ws.send(JSON.stringify({
                            type: 'signal',
                            fromId: clientId,
                            signal: msg.signal
                        }));
                    }
                    break;
                }

                case 'leave': {
                    leaveRoom();
                    break;
                }

                case 'ping': {
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
                }
            }
        } catch (e) {
            console.error('[Error] Parse failed:', e.message);
        }
    });

    ws.on('close', () => {
        leaveRoom();
        console.log(`[Disconnect] ${clientId || 'unknown'} from ${clientIp}`);
    });

    ws.on('error', (err) => {
        console.error(`[Error] WebSocket error for ${clientId}:`, err.message);
    });

    function leaveRoom() {
        if (currentRoom && rooms.has(currentRoom)) {
            const room = rooms.get(currentRoom);
            room.delete(clientId);

            const peers = Array.from(room.keys());
            const peerInfos = peers.map(id => ({
                id: id,
                ip: room.get(id).ip,
                type: room.get(id).type
            }));

            room.forEach((client) => {
                client.ws.send(JSON.stringify({ type: 'peer-left', peerId: clientId, peers: peerInfos }));
            });

            if (room.size === 0) {
                rooms.delete(currentRoom);
                console.log(`[Room ${currentRoom}] Deleted (empty)`);
            }
            console.log(`[Room ${currentRoom}] ${clientId} left (${room.size}/2)`);
            currentRoom = null;
        }
    }
});

function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

function getLocalIps() {
    const interfaces = require('os').networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    return ips;
}

setInterval(() => {
    for (const [roomCode, room] of rooms) {
        if (room.size === 0) {
            rooms.delete(roomCode);
        }
    }
}, 60000);

server.listen(PORT, () => {
    console.log(`[Xin Transfer] Cloud server started on port ${PORT}`);
    console.log(`[Xin Transfer] Web client: http://localhost:${PORT}`);
});
