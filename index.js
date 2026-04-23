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

// Cookie Parser for Normal & AppState Cookies
function parseCookie(cookieString) {
    if (cookieString.trim().startsWith('[')) return JSON.parse(cookieString);
    return cookieString.split(';').map(i => {
        const [name, ...value] = i.split('=');
        return {
            key: name.trim(),
            value: value.join('=').trim(),
            domain: "facebook.com",
            path: "/",
            hostOnly: false,
            creation: new Date().toISOString(),
            lastAccessed: new Date().toISOString()
        };
    }).filter(i => i.key && i.value);
}

// Dashboard UI
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>DRB NICKNAME LOCK</title>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
            body { background: #080a0f; color: #e1e1e1; font-family: 'Segoe UI', sans-serif; text-align: center; padding: 20px; }
            .card { background: #11141d; border: 1px solid #1f2633; border-radius: 20px; padding: 25px; max-width: 450px; margin: auto; box-shadow: 0 15px 35px rgba(0,0,0,0.6); }
            textarea, input { width: 100%; background: #000; border: 1px solid #1f2633; color: #00ff88; padding: 14px; border-radius: 12px; margin-bottom: 15px; box-sizing: border-box; outline: none; font-family: monospace; }
            .btn { background: linear-gradient(135deg, #00d2ff, #3a7bd5); color: white; border: none; padding: 16px; width: 100%; border-radius: 12px; font-weight: bold; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; }
            .task-item { background: #11141d; border: 1px solid #1f2633; padding: 15px; margin: 15px auto; display: flex; justify-content: space-between; align-items: center; border-radius: 12px; border-left: 5px solid #00d2ff; max-width: 450px; }
            .stop-btn { background: #ff4b2b; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: bold; }
            h2 { color: #00d2ff; text-transform: uppercase; letter-spacing: 2px; }
        </style>
    </head>
    <body>
        <h2>🛡️ DRB MASTER LOCK 🛡️</h2>
        <div class="card">
            <textarea id="cookie" placeholder="Paste AppState JSON or Normal Cookie" rows="5"></textarea>
            <input type="text" id="tid" placeholder="Group Thread ID">
            <input type="text" id="name" placeholder="Lock Nickname" value="DEEPAK RAJPUT BRAND">
            <button class="btn" onclick="add()">START 3s LOCK</button>
        </div>
        <div id="list"></div>
        <script>
            async function load() {
                const r = await fetch('/list-tasks');
                const tasks = await r.json();
                document.getElementById('list').innerHTML = tasks.map(t => \`
                    <div class="task-item">
                        <div style="text-align:left;"><b>\${t.name}</b><br><small>TID: \${t.threadID}</small></div>
                        <button class="stop-btn" onclick="stop('\${t.id}')">STOP</button>
                    </div>\`).join('');
            }
            async function add() {
                const d = { cookie: document.getElementById('cookie').value, threadID: document.getElementById('tid').value, name: document.getElementById('name').value };
                await fetch('/add-task', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) });
                alert("Lock Activated! Speed: 3 Seconds");
                load();
            }
            async function stop(id) {
                await fetch('/stop-task', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}) });
                load();
            }
            load(); setInterval(load, 5000);
        </script>
    </body>
    </html>`);
});

function runBot(task) {
    if (activeTasks.has(task.id)) return;
    try {
        let appState = parseCookie(task.cookie);
        wiegine.login({ appState }, { logLevel: 'silent', forceLogin: true }, (err, api) => {
            if (err || !api) return console.log("[DRB] Login Failed: " + task.id);
            
            api.setOptions({ listenEvents: true, selfListen: false });

            // --- INSTANT LOCK (3 SEC DELAY) ---
            api.getThreadInfo(task.threadID, (err, info) => {
                if (!err && info) {
                    const nickMap = info.nicknames || {};
                    info.participantIDs.forEach((uid, i) => {
                        // Agar nickname pehle se sahi nahi hai, tabhi change karega
                        if (nickMap[uid] !== task.name) {
                            setTimeout(() => {
                                api.changeNickname(task.name, task.threadID, uid, (e) => {
                                    if(!e) console.log(`[DRB] Locked: ${uid}`);
                                });
                            }, i * 3000); // 3 Seconds Interval
                        }
                    });
                }
            });

            // Permanent Listener
            const stopListen = api.listenMqtt((err, event) => {
                if (err) return;
                if (event.type === "event" && event.logMessageType === "log:user-nickname") {
                    const { participant_id, nickname } = event.logMessageData;
                    if (nickname !== task.name && event.threadID === task.threadID) {
                        api.changeNickname(task.name, task.threadID, participant_id, () => {
                            console.log(`[DRB] Re-locked: ${participant_id}`);
                        });
                    }
                }
            });

            activeTasks.set(task.id, { ...task, stopFunc: stopListen });
            console.log(`[DRB] Monitoring Thread: ${task.threadID}`);
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
        if (typeof task.stopFunc === 'function') task.stopFunc();
        activeTasks.delete(id);
        const db = JSON.parse(fs.readFileSync(DB_FILE)).filter(item => item.id !== id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
    }
    res.json({ success: true });
});

const saved = JSON.parse(fs.readFileSync(DB_FILE));
saved.forEach((t, i) => setTimeout(() => runBot(t), i * 8000));

app.listen(PORT, () => console.log(`DRB MASTER 3s LIVE ON ${PORT}`));
