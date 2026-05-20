const WebSocket = require('ws');

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

function createSignalingServer(port = 9763) {
    const wss = new WebSocket.Server({ port });
    const rooms = new Map();

    console.log(`[Xin Transfer] 信令服务器启动在端口 ${port}`);

    wss.on('connection', (ws, req) => {
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        console.log(`[连接] 新客户端: ${clientIp}`);

        let currentRoom = null;
        let clientId = null;

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());

                switch (msg.type) {
                    case 'join': {
                        const roomCode = msg.room;
                        clientId = msg.clientId || generateId();
                        currentRoom = roomCode;

                        if (!rooms.has(roomCode)) {
                            rooms.set(roomCode, new Map());
                        }
                        const room = rooms.get(roomCode);

                        if (room.size >= 2) {
                            ws.send(JSON.stringify({ type: 'error', message: '房间已满' }));
                            return;
                        }

                        room.set(clientId, ws);
                        console.log(`[房间 ${roomCode}] ${clientId} 加入 (${room.size}/2)`);

                        ws.send(JSON.stringify({ type: 'joined', room: roomCode, clientId, iceServers: ICE_SERVERS }));

                        if (room.size === 2) {
                            const peerIds = Array.from(room.keys());
                            room.forEach((client) => {
                                client.send(JSON.stringify({ type: 'peer-joined', peers: peerIds }));
                            });
                        }
                        break;
                    }

                    case 'signal': {
                        if (!currentRoom || !rooms.has(currentRoom)) return;
                        const room = rooms.get(currentRoom);
                        const targetId = msg.targetId;
                        if (room.has(targetId)) {
                            room.get(targetId).send(JSON.stringify({
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
                }
            } catch (e) {
                console.error('[错误] 消息解析失败:', e.message);
            }
        });

        ws.on('close', () => {
            leaveRoom();
            console.log(`[断开] ${clientId || '未知'}`);
        });

        function leaveRoom() {
            if (currentRoom && rooms.has(currentRoom)) {
                const room = rooms.get(currentRoom);
                room.delete(clientId);
                room.forEach((client) => {
                    client.send(JSON.stringify({ type: 'peer-left', peerId: clientId }));
                });
                if (room.size === 0) {
                    rooms.delete(currentRoom);
                }
                console.log(`[房间 ${currentRoom}] ${clientId} 离开`);
                currentRoom = null;
            }
        }
    });

    return wss;
}

function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

if (require.main === module) {
    const PORT = process.env.SIGNAL_PORT || 9763;
    createSignalingServer(PORT);
}

module.exports = { createSignalingServer };
