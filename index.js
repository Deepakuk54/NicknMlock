const express = require('express');
const wiegine = require('fca-mafiya');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 10000;
app.use(express.json());

let activeLocks = new Map();
const DB_FILE = path.join('/tmp', 'drb_nickname_db.json');

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

function saveDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }
function loadDB() { return JSON.parse(fs.readFileSync(DB_FILE)); }

// --- BOT LOGIC ---
function startLockBot(task) {
    if (activeLocks.has(task.id)) return;
    
    let loginData = task.cookie.startsWith('[') ? { appState: JSON.parse(task.cookie) } : task.cookie;
    
    wiegine.login(loginData, { logLevel: 'silent', forceLogin: true }, (err, api) => {
        if (err || !api) return console.log("Login Failed for: " + task.id);

        api.setOptions({ listenEvents: true, selfListen: false });

        // 1. Pehli baar mein sabka lock karna
        api.getThreadInfo(task.threadID, (err, info) => {
            if (!err && info) {
                info.participantIDs.forEach((uid, i) => {
                    setTimeout(() => api.changeNickname(task.nickname, task.threadID, uid, () => {}), i * 1500);
                });
            }
        });

        // 2. Monitoring Logic (Anti-Change)
        const stopListener = api.listenMqtt((err, event) => {
            if (event?.type === "event" && event.logMessageType === "log:user-nickname") {
                const { participant_id, nickname } = event.logMessageData;
                // Agar badla hua nickname mere lock name se alag hai, toh panga hai
                if (nickname !== task.nickname && event.threadID === task.threadID) {
                    api.changeNickname(task.nickname, task.threadID, participant_id, (e) => {
                        if(!e) console.log(`[DRB] Re-locked: ${participant_id}`);
                    });
                }
            }
        });

        activeLocks.set(task.id, { ...task, stop: stopListener });
    });
}

// --- DASHBOARD UI ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>DRB | NICKNAME LOCKER</title>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
            body { background: #0a0a0c; color: #fff; font-family: sans-serif; padding: 20px; text-align: center; }
            .box { background: #16161d; border: 1px solid #2a2a35; border-radius: 20px; padding: 25px; max-width: 450px; margin: auto; box-shadow: 0 10px 40px #000; }
            input, textarea { width: 100%; background: #1c1c26; border: 1px solid #333; color: #00f2ff; padding: 12px; border-radius: 10px; margin-bottom: 12px; box-sizing: border-box; outline: none; }
            .btn { background: linear-gradient(90deg, #00c6ff, #0072ff); color: #fff; border: none; padding: 15px; width: 100%; border-radius: 10px; font-weight: bold; cursor: pointer; }
            .item { background: #1c1c26; border-left: 5px solid #00f2ff; padding: 15px; margin-top: 15px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; }
            .stop { background: #ff4b2b; color: #fff; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; }
            h2 { color: #00f2ff; letter-spacing: 1px; }
        </style>
    </head>
    <body>
        <h2>🛡️ DEEPAK RAJPUT BRAND 🛡️</h2>
        <div class="box">
            <textarea id="ck" placeholder="Paste AppState Cookies" rows="4"></textarea>
            <input type="text" id="tid" placeholder="Group Thread ID">
            <input type="text" id="nk" placeholder="Lock Nickname" value="DEEPAK RAJPUT BRAND">
            <button class="btn" onclick="start()">ACTIVATE LOCK</button>
        </div>
        <div id="list"></div>
        <script>
            async function load() {
                const r = await fetch('/list');
                const data = await r.json();
                document.getElementById('list').innerHTML = data.map(t => \`
                    <div class="item">
                        <div style="text-align:left"><b>\${t.nickname}</b><br><small>Group: \${t.threadID}</small></div>
                        <button class="stop" onclick="stop('\${t.id}')">STOP</button>
                    </div>\`).join('');
            }
            async function start() {
                const d = { cookie: document.getElementById('ck').value, threadID: document.getElementById('tid').value, nickname: document.getElementById('nk').value };
                await fetch('/add', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) });
                load();
            }
            async function stop(id) {
                await fetch('/stop', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}) });
                load();
            }
            load(); setInterval(load, 5000);
        </script>
    </body>
    </html>`);
});

app.get('/list', (req, res) => res.json(Array.from(activeLocks.values()).map(t => ({ id: t.id, nickname: t.nickname, threadID: t.threadID }))));

app.post('/add', (req, res) => {
    const id = "DRB-LOCK-" + Date.now();
    const newTask = { ...req.body, id };
    const db = loadDB();
    db.push(newTask);
    saveDB(db);
    startLockBot(newTask);
    res.json({ success: true });
});

app.post('/stop', (req, res) => {
    const { id } = req.body;
    if (activeLocks.has(id)) {
        activeLocks.get(id).stop(); // Stop MQTT
        activeLocks.delete(id);
        const db = loadDB().filter(t => t.id !== id);
        saveDB(db);
    }
    res.json({ success: true });
});

// Auto-restart
loadDB().forEach((t, i) => setTimeout(() => startLockBot(t), i * 4000));

app.listen(PORT, () => console.log(`DRB LOCKER Live on ${PORT}`));
