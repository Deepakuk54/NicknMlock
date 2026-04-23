const express = require('express');
const wiegine = require('fca-mafiya');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 10000;
app.use(express.json());

let activeTasks = new Map();
const DB_FILE = path.join('/tmp', 'drb_raw_db.json');

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

// Raw Cookie String Parser
function parseRawCookie(raw) {
    if (raw.trim().startsWith('[')) return JSON.parse(raw); // Agar JSON hai
    // Raw String conversion
    return raw.split(';').map(v => {
        const parts = v.split('=');
        if (parts.length < 2) return null;
        return {
            key: parts[0].trim(),
            value: parts.slice(1).join('=').trim(),
            domain: "facebook.com",
            path: "/",
            hostOnly: false
        };
    }).filter(v => v !== null);
}

// Dashboard UI
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>DRB RAW LOCKER</title>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
            body { background: #05070a; color: #cfd8dc; font-family: 'Segoe UI', sans-serif; text-align: center; padding: 20px; }
            .card { background: #0d1117; border: 1px solid #30363d; border-radius: 15px; padding: 20px; max-width: 500px; margin: auto; }
            textarea, input { width: 100%; background: #010409; border: 1px solid #30363d; color: #58a6ff; padding: 12px; border-radius: 8px; margin-bottom: 10px; box-sizing: border-box; }
            .btn { background: #238636; color: white; border: none; padding: 15px; width: 100%; border-radius: 8px; cursor: pointer; font-weight: bold; }
            .log-box { background: #000; color: #39ff14; font-family: monospace; padding: 10px; height: 150px; overflow-y: auto; border-radius: 8px; text-align: left; font-size: 12px; margin-top: 15px; border: 1px solid #333; }
            .task-item { background: #161b22; padding: 15px; margin: 10px auto; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid #58a6ff; max-width: 500px; }
            .stop-btn { background: #da3633; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; }
        </style>
    </head>
    <body>
        <h2>🛡️ DRB RAW COOKIE LOCKER 🛡️</h2>
        <div class="card">
            <textarea id="cookie" placeholder="Paste Raw String Cookie (c_user=...; xs=...;)" rows="5"></textarea>
            <input type="text" id="tid" placeholder="Group ID">
            <input type="text" id="name" placeholder="Lock Name" value="DEEPAK RAJPUT BRAND">
            <button class="btn" onclick="add()">START MONITORING</button>
            <div class="log-box" id="logs">System Ready... Logs will appear here.</div>
        </div>
        <div id="list"></div>
        <script>
            function addLog(msg) {
                const lb = document.getElementById('logs');
                lb.innerHTML += "><br>" + msg;
                lb.scrollTop = lb.scrollHeight;
            }
            async function load() {
                const r = await fetch('/list-tasks');
                const tasks = await r.json();
                document.getElementById('list').innerHTML = tasks.map(t => \`
                    <div class="task-item">
                        <span><b>\${t.threadID}</b><br><small>\${t.name}</small></span>
                        <button class="stop-btn" onclick="stop('\${t.id}')">STOP LOCK</button>
                    </div>\`).join('');
            }
            async function add() {
                const d = { cookie: document.getElementById('cookie').value, threadID: document.getElementById('tid').value, name: document.getElementById('name').value };
                addLog("Connecting to FCA-Mafiya...");
                const res = await fetch('/add-task', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }).then(r=>r.json());
                if(res.success) addLog("Bot Activated Successfully!");
                load();
            }
            async function stop(id) {
                await fetch('/stop-task', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}) });
                addLog("Task Stopped & Unlocked.");
                load();
            }
            load();
        </script>
    </body>
    </html>`);
});

function runBot(task) {
    if (activeTasks.has(task.id)) return;
    try {
        let appState = parseRawCookie(task.cookie);
        wiegine.login({ appState }, { logLevel: 'silent', forceLogin: true }, (err, api) => {
            if (err || !api) return console.log(`[LOG] Login Failed: ${task.id}`);
            
            api.setOptions({ listenEvents: true, selfListen: false });

            // Sabse Pehle Instant Action (3s Delay)
            api.getThreadInfo(task.threadID, (err, info) => {
                if (!err && info) {
                    console.log(`[LOG] Starting Initial Lock for TID: ${task.threadID}`);
                    info.participantIDs.forEach((uid, i) => {
                        setTimeout(() => {
                            if (!activeTasks.has(task.id)) return; // Agar band kar diya toh stop
                            api.changeNickname(task.name, task.threadID, uid, (e) => {
                                if(!e) console.log(`[LOG] Nickname Set: ${uid}`);
                            });
                        }, i * 3000); 
                    });
                }
            });

            // Re-lock Listener
            const stopListen = api.listenMqtt((err, event) => {
                if (event?.logMessageType === "log:user-nickname" && event.logMessageData.nickname !== task.name && event.threadID === task.threadID) {
                    api.changeNickname(task.name, task.threadID, event.logMessageData.participant_id, () => {
                        console.log(`[RE-LOCK] Corrected: ${event.logMessageData.participant_id}`);
                    });
                }
            });

            activeTasks.set(task.id, { ...task, stopFunc: stopListen, api: api });
        });
    } catch (e) { console.log("[ERR] " + e.message); }
}

app.get('/list-tasks', (req, res) => res.json(Array.from(activeTasks.values()).map(t => ({ id: t.id, name: t.name, threadID: t.threadID }))));

app.post('/add-task', (req, res) => {
    const id = "DRB-" + Date.now();
    const newTask = { ...req.body, id };
    const db = JSON.parse(fs.readFileSync(DB_FILE));
    db.push(newTask);
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
    runBot(newTask);
    res.json({ success: true });
});

app.post('/stop-task', (req, res) => {
    const { id } = req.body;
    if (activeTasks.has(id)) {
        const task = activeTasks.get(id);
        if (task.stopFunc) task.stopFunc(); // MQTT band
        activeTasks.delete(id);
        const db = JSON.parse(fs.readFileSync(DB_FILE)).filter(item => item.id !== id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
        console.log(`[LOG] Task ${id} Killed.`);
    }
    res.json({ success: true });
});

const saved = JSON.parse(fs.readFileSync(DB_FILE));
saved.forEach((t, i) => setTimeout(() => runBot(t), i * 5000));

app.listen(PORT, () => console.log(`DRB RAW MASTER LIVE: ${PORT}`));
