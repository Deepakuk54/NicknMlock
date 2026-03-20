const express = require('express');
const wiegine = require('fca-mafiya');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
let activeTasks = new Map();
let logs = []; 

const DB_FILE = 'database.json';
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

function addLog(msg) {
    const time = new Date().toLocaleTimeString();
    logs.push(`[${time}] ${msg}`);
    if (logs.length > 20) logs.shift();
    console.log(msg);
}

function startBot(task) {
    const taskId = task.id || "LOCK-" + Math.floor(1000 + Math.random() * 9000);
    
    wiegine.login(task.cookie, { logLevel: 'silent', forceLogin: true }, (err, api) => {
        if (err || !api) return addLog(`❌ Login Fail: ${taskId}`);

        api.setOptions({ listenEvents: true, selfListen: false });
        addLog(`🚀 Bot Started for Group: ${task.uid}`);

        // Initial Sync with Smart Check
        api.getThreadInfo(task.uid, (err, info) => {
            if (!err && info?.participantIDs) {
                const nicknames = info.nicknames || {};
                info.participantIDs.forEach((pID, index) => {
                    // Agar nickname pehle se sahi hai toh skip karo
                    if (nicknames[pID] === task.nick) return;

                    setTimeout(() => {
                        api.changeNickname(task.nick, task.uid, pID, (err) => {
                            if(!err) addLog(`✅ Fixed Nickname: ${pID}`);
                        });
                    }, index * 3000); 
                });
            }
        });

        const listener = api.listenMqtt((err, event) => {
            if (event?.logMessageType === "log:user-nickname" && event.threadID === task.uid) {
                const targetID = event.logMessageData.participant_id;
                const newNick = event.logMessageData.nickname;

                // Repeat change rokne ke liye check
                if (newNick !== task.nick) {
                    addLog(`🔄 Resetting: ${targetID} tried to change.`);
                    setTimeout(() => api.changeNickname(task.nick, task.uid, targetID), 2000);
                }
            }
        });

        activeTasks.set(taskId, { uid: task.uid, nick: task.nick, api, listener });
    });
}

// Auto-Restart
try {
    const saved = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    saved.forEach(t => startBot(t));
} catch(e) {}

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Deepak Brand Pro</title>
            <style>
                body { background: #0d1117; color: #c9d1d9; font-family: sans-serif; text-align: center; padding: 20px; }
                .box { background: #161b22; border: 1px solid #30363d; padding: 20px; border-radius: 12px; max-width: 450px; margin: auto; }
                input, textarea { width: 90%; padding: 12px; margin: 8px 0; background: #0d1117; border: 1px solid #30363d; color: #7ee787; border-radius: 6px; }
                button { width: 95%; padding: 15px; background: #238636; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
                .stop-btn { background: #da3633; margin-top: 10px; }
                #logBox { background: black; color: #00ff00; padding: 10px; text-align: left; height: 150px; overflow-y: scroll; border-radius: 8px; margin-top: 20px; font-size: 12px; }
            </style>
        </head>
        <body>
            <h1>DEEPAK BRAND MANAGER PRO ✅</h1>
            <div class="box">
                <textarea id="cookie" placeholder="Cookie" rows="3"></textarea>
                <input id="uid" placeholder="Group UID">
                <input id="nick" placeholder="Nickname" value="DEEPAK RAJPUT BRAND">
                <button onclick="start()">START LOCK</button>
                <div id="activeTasks"></div>
            </div>
            <div class="box" style="margin-top:20px;">
                <h3>System Logs</h3>
                <div id="logBox">Waiting for logs...</div>
            </div>
            <script>
                async function start() {
                    const res = await fetch('/add-task', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            cookie: document.getElementById('cookie').value,
                            uid: document.getElementById('uid').value,
                            nick: document.getElementById('nick').value
                        })
                    });
                    location.reload();
                }
                async function stopTask(id) {
                    await fetch('/stop-task', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ id }) });
                    location.reload();
                }
                async function updateData() {
                    const lRes = await fetch('/logs');
                    const lData = await lRes.json();
                    document.getElementById('logBox').innerHTML = lData.join('<br>');
                    
                    const tRes = await fetch('/list');
                    const tData = await tRes.json();
                    document.getElementById('activeTasks').innerHTML = tData.map(t => \`
                        <div style="border-top:1px solid #333; padding-top:10px; margin-top:10px;">
                            <small>UID: \${t.uid}</small><br>
                            <button class="stop-btn" onclick="stopTask('\${t.id}')">STOP THIS TASK</button>
                        </div>
                    \`).join('');
                }
                setInterval(updateData, 3000);
            </script>
        </body>
        </html>
    `);
});

app.get('/logs', (req, res) => res.json(logs));
app.get('/list', (req, res) => {
    const list = [];
    activeTasks.forEach((v, k) => list.push({ id: k, uid: v.uid }));
    res.json(list);
});

app.post('/add-task', (req, res) => {
    const taskId = "LOCK-" + Math.floor(1000 + Math.random() * 9000);
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.push({...req.body, id: taskId});
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
    startBot({...req.body, id: taskId});
    res.json({ id: taskId });
});

app.post('/stop-task', (req, res) => {
    const { id } = req.body;
    if (activeTasks.has(id)) {
        const t = activeTasks.get(id);
        if (t.listener) t.listener();
        activeTasks.delete(id);
        const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')).filter(t => t.id !== id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
        res.json({ ok: true });
    }
});

app.listen(PORT, '0.0.0.0');
