const express = require('express');
const wiegine = require('fca-mafiya');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 10000;
app.use(express.json());

let activeTasks = new Map();
const DB_FILE = path.join('/tmp', 'drb_lock_db.json');

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

// Dashboard UI
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>DRB NICKNAME LOCK</title>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
            body { background: #0a0a0c; color: #e1e1e1; font-family: 'Segoe UI', sans-serif; text-align: center; padding: 20px; }
            .card { background: #16161d; border: 1px solid #2a2a35; border-radius: 15px; padding: 20px; max-width: 450px; margin: auto; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            input, textarea { width: 100%; background: #1c1c26; border: 1px solid #333; color: #00f2ff; padding: 12px; border-radius: 10px; margin-bottom: 12px; box-sizing: border-box; outline: none; }
            .btn { background: linear-gradient(90deg, #00c6ff, #0072ff); color: white; border: none; padding: 15px; width: 100%; border-radius: 10px; font-weight: bold; cursor: pointer; text-transform: uppercase; }
            .task-item { background: #1c1c26; border: 1px solid #333; padding: 15px; margin: 12px auto; display: flex; justify-content: space-between; align-items: center; border-radius: 10px; border-left: 5px solid #00f2ff; max-width: 450px; }
            .stop-btn { background: #ff4b2b; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-size: 12px; }
            h2 { color: #00f2ff; text-shadow: 0 0 10px rgba(0,242,255,0.3); }
        </style>
    </head>
    <body>
        <h2>🛡️ DRB NICKNAME LOCK 🛡️</h2>
        <div class="card">
            <textarea id="cookie" placeholder="Paste AppState JSON" rows="4"></textarea>
            <input type="text" id="tid" placeholder="Group Thread ID">
            <input type="text" id="name" placeholder="Lock Nickname" value="DEEPAK RAJPUT BRAND">
            <button class="btn" onclick="add()">LOCK NICKNAMES</button>
        </div>
        <div id="list"></div>
        <script>
            async function load() {
                const r = await fetch('/list-tasks');
                const tasks = await r.json();
                document.getElementById('list').innerHTML = tasks.map(t => \`
                    <div class="task-item">
                        <div style="text-align:left;"><b>\${t.name}</b><br><small>TID: \${t.threadID}</small></div>
                        <button class="stop-btn" onclick="stop('\${t.id}')">STOP & UNLOCK</button>
                    </div>\`).join('');
            }
            async function add() {
                const d = { cookie: document.getElementById('cookie').value, threadID: document.getElementById('tid').value, name: document.getElementById('name').value };
                await fetch('/add-task', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) });
                load();
            }
            async function stop(id) {
                await fetch('/stop-task', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}) });
                load();
            }
            load(); setInterval(load, 4000);
        </script>
    </body>
    </html>`);
});

function runBot(task) {
    if (activeTasks.has(task.id)) return;
    try {
        let loginData = task.cookie.startsWith('[') ? { appState: JSON.parse(task.cookie) } : { appState: task.cookie };
        wiegine.login(loginData, { logLevel: 'silent', forceLogin: true }, (err, api) => {
            if (err || !api) return console.log("Login Error for " + task.id);
            
            api.setOptions({ listenEvents: true, selfListen: false });

            // Initial Lock: Sabka nickname ek saath change karo
            api.getThreadInfo(task.threadID, (err, info) => {
                if (!err && info) {
                    info.participantIDs.forEach((uid, i) => {
                        setTimeout(() => api.changeNickname(task.name, task.threadID, uid, () => {}), i * 2000);
                    });
                }
            });

            // Permanent Lock: Agar koi badle toh wapas set karo
            const stopListen = api.listenMqtt((err, event) => {
                if (err) return;
                if (event.type === "event" && event.logMessageType === "log:user-nickname") {
                    const { participant_id, nickname } = event.logMessageData;
                    if (nickname !== task.name && event.threadID === task.threadID) {
                        api.changeNickname(task.name, task.threadID, participant_id, () => {
                            console.log(`[DRB] Re-locked nickname for ${participant_id}`);
                        });
                    }
                }
            });

            // Store the stop function in the Map
            activeTasks.set(task.id, { ...task, stopFunc: stopListen });
            console.log(`[DRB] Lock Active: ${task.threadID}`);
        });
    } catch (e) { console.log("Runtime Error: " + e.message); }
}

app.get('/list-tasks', (req, res) => res.json(Array.from(activeTasks.values()).map(t => ({ id: t.id, name: t.name, threadID: t.threadID }))));

app.post('/add-task', (req, res) => {
    const id = "LOCK-" + Date.now();
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
        if (typeof task.stopFunc === 'function') {
            task.stopFunc(); // This stops the MQTT listener
        }
        activeTasks.delete(id);
        const db = JSON.parse(fs.readFileSync(DB_FILE)).filter(item => item.id !== id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
        console.log(`[DRB] Task Stopped: ${id}`);
    }
    res.json({ success: true });
});

// Auto-restart logic
const saved = JSON.parse(fs.readFileSync(DB_FILE));
saved.forEach((t, i) => setTimeout(() => runBot(t), i * 5000));

app.listen(PORT, () => console.log(`DRB LOCK Server Live on ${PORT}`));
