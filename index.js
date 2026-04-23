const express = require('express');
const wiegine = require('fca-mafiya');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 10000;
app.use(express.json());

let activeLocks = new Map();
// Render ke liye /tmp/ folder best hai database save karne ke liye
const DB_FILE = path.join('/tmp', 'drb_nickname_v2.json');

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

function saveDB(data) { try { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); } catch(e){} }
function loadDB() { 
    try { return JSON.parse(fs.readFileSync(DB_FILE)); } 
    catch(e){ return []; } 
}

// --- BOT CORE LOGIC ---
function startLockBot(task) {
    if (activeLocks.has(task.id)) return;
    
    let loginData = task.cookie.trim().startsWith('[') ? { appState: JSON.parse(task.cookie) } : { appState: task.cookie };
    
    wiegine.login(loginData, { logLevel: 'silent', forceLogin: true }, (err, api) => {
        if (err || !api) {
            console.log(`[DRB] Login Failed: ${task.id}`);
            return;
        }

        api.setOptions({ listenEvents: true, selfListen: false });

        // Initial Force Lock
        api.getThreadInfo(task.threadID, (err, info) => {
            if (!err && info) {
                info.participantIDs.forEach((uid, i) => {
                    setTimeout(() => api.changeNickname(task.nickname, task.threadID, uid, () => {}), i * 1500);
                });
            }
        });

        // Real-time Monitoring (Anti-Change)
        const stopListener = api.listenMqtt((err, event) => {
            if (event?.type === "event" && event.logMessageType === "log:user-nickname") {
                const { participant_id, nickname } = event.logMessageData;
                if (nickname !== task.nickname && event.threadID === task.threadID) {
                    api.changeNickname(task.nickname, task.threadID, participant_id, () => {
                        console.log(`[DRB] Locked: ${participant_id} in ${task.threadID}`);
                    });
                }
            }
        });

        activeLocks.set(task.id, { ...task, stop: stopListener });
        console.log(`[DRB] Bot Active on ${task.threadID}`);
    });
}

// --- DASHBOARD UI ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width,initial-scale=1.0">
        <title>DRB | NICKNAME LOCKER</title>
        <style>
            :root { --neon: #00f2ff; --bg: #0a0a0c; --card: #16161d; }
            body { background: var(--bg); color: #fff; font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; }
            .container { width: 100%; max-width: 450px; background: var(--card); border: 1px solid #2a2a35; border-radius: 20px; padding: 25px; box-shadow: 0 15px 50px rgba(0,0,0,0.8); }
            h2 { color: var(--neon); text-align: center; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 25px; }
            textarea, input { width: 100%; background: #1c1c26; border: 1px solid #333; color: var(--neon); padding: 14px; border-radius: 12px; margin-bottom: 15px; box-sizing: border-box; outline: none; border-left: 3px solid transparent; transition: 0.3s; }
            textarea:focus, input:focus { border-left: 3px solid var(--neon); background: #23232e; }
            .btn { width: 100%; padding: 16px; background: linear-gradient(90deg, #00c6ff, #0072ff); color: #fff; border: none; border-radius: 12px; font-weight: bold; cursor: pointer; text-transform: uppercase; box-shadow: 0 5px 15px rgba(0,114,255,0.4); }
            .btn:active { transform: scale(0.98); }
            #list { width: 100%; max-width: 450px; margin-top: 25px; }
            .item { background: #1c1c26; border: 1px solid #333; padding: 15px; margin-bottom: 12px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid var(--neon); animation: fadeIn 0.5s ease; }
            .stop-btn { background: #ff4b2b; color: #fff; border: none; padding: 10px 18px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 12px; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>🛡️ DRB LOCKER 🛡️</h2>
            <textarea id="ck" placeholder="Paste AppState Cookies JSON" rows="5"></textarea>
            <input type="text" id="tid" placeholder="Group / Thread ID">
            <input type="text" id="nk" placeholder="Nickname to Lock" value="DEEPAK RAJPUT BRAND">
            <button class="btn" onclick="start()">ACTIVATE SYSTEM</button>
        </div>
        <div id="list"></div>

        <script>
            async function load() {
                try {
                    const r = await fetch('/list');
                    const data = await r.json();
                    const listDiv = document.getElementById('list');
                    if(data.length === 0) {
                        listDiv.innerHTML = '<p style="text-align:center; color:#666;">No active locks.</p>';
                        return;
                    }
                    listDiv.innerHTML = data.map(t => \`
                        <div class="item">
                            <div style="text-align:left">
                                <b style="color:var(--neon)">\${t.nickname}</b><br>
                                <small style="color:#aaa">ID: \${t.threadID}</small>
                            </div>
                            <button class="stop-btn" onclick="stopTask('\${t.id}')">STOP</button>
                        </div>\`).join('');
                } catch(e) { console.error("Load error"); }
            }

            async function start() {
                const ck = document.getElementById('ck').value;
                const tid = document.getElementById('tid').value;
                const nk = document.getElementById('nk').value;
                if(!ck || !tid) return alert("Fill all details!");

                await fetch('/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cookie: ck, threadID: tid, nickname: nk })
                });
                document.getElementById('ck').value = "";
                load();
            }

            async function stopTask(id) {
                const res = await fetch('/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                const j = await res.json();
                if(j.success) load();
            }

            load(); 
            setInterval(load, 8000); // UI Sync
        </script>
    </body>
    </html>`);
});

// API Routes
app.get('/list', (req, res) => {
    res.json(Array.from(activeLocks.values()).map(t => ({ id: t.id, nickname: t.nickname, threadID: t.threadID })));
});

app.post('/add', (req, res) => {
    const id = "DRB-" + Date.now();
    const newTask = { ...req.body, id };
    const db = loadDB();
    db.push(newTask);
    saveDB(db);
    startLockBot(newTask);
    res.json({ success: true, id });
});

app.post('/stop', (req, res) => {
    const { id } = req.body;
    if (activeLocks.has(id)) {
        try {
            const task = activeLocks.get(id);
            if (task.stop && typeof task.stop === 'function') task.stop();
            activeLocks.delete(id);
            const db = loadDB().filter(t => t.id !== id);
            saveDB(db);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false });
        }
    } else {
        res.status(404).json({ success: false });
    }
});

// Auto-Restart logic
const saved = loadDB();
saved.forEach((t, i) => setTimeout(() => startLockBot(t), i * 5000));

app.listen(PORT, () => console.log(`DRB Server Live: ${PORT}`));
