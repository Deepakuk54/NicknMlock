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

function parseRawCookie(raw) {
    if (raw.trim().startsWith('[')) return JSON.parse(raw);
    return raw.split(';').map(v => {
        const parts = v.split('=');
        if (parts.length < 2) return null;
        return { key: parts[0].trim(), value: parts.slice(1).join('=').trim(), domain: "facebook.com", path: "/", hostOnly: false };
    }).filter(v => v !== null);
}

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>DRB RAW LOCKER V2</title>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
            body { background: #05070a; color: #cfd8dc; font-family: 'Segoe UI', sans-serif; text-align: center; padding: 20px; }
            .card { background: #0d1117; border: 1px solid #30363d; border-radius: 15px; padding: 20px; max-width: 500px; margin: auto; }
            textarea, input { width: 100%; background: #010409; border: 1px solid #30363d; color: #58a6ff; padding: 12px; border-radius: 8px; margin-bottom: 10px; box-sizing: border-box; outline:none; }
            .btn { background: #238636; color: white; border: none; padding: 15px; width: 100%; border-radius: 8px; cursor: pointer; font-weight: bold; }
            .log-box { background: #000; color: #39ff14; font-family: monospace; padding: 10px; height: 180px; overflow-y: auto; border-radius: 8px; text-align: left; font-size: 11px; margin-top: 15px; border: 1px solid #333; line-height: 1.5; }
            .task-item { background: #161b22; padding: 15px; margin: 10px auto; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid #58a6ff; max-width: 500px; }
            .stop-btn { background: #da3633; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; }
        </style>
    </head>
    <body>
        <h2>🛡️ DRB RAW LOCKER V2 🛡️</h2>
        <div class="card">
            <textarea id="cookie" placeholder="Paste Full Raw Cookie (c_user, xs, datr must be there)" rows="5"></textarea>
            <input type="text" id="tid" placeholder="Group Thread ID">
            <input type="text" id="name" placeholder="Nickname to Lock" value="DEEPAK RAJPUT BRAND">
            <button class="btn" onclick="add()">ACTIVATE LOCK</button>
            <div class="log-box" id="logs">>> System Ready. Waiting for command...</div>
        </div>
        <div id="list"></div>
        <script>
            const logBox = document.getElementById('logs');
            function addLog(msg, color='#39ff14') {
                logBox.innerHTML += \`<br><span style="color:\${color}">>> \${msg}</span>\`;
                logBox.scrollTop = logBox.scrollHeight;
            }
            async function load() {
                const r = await fetch('/list-tasks').then(res => res.json());
                document.getElementById('list').innerHTML = r.map(t => \`
                    <div class="task-item">
                        <span><b>\${t.threadID}</b><br><small>\${t.name}</small></span>
                        <button class="stop-btn" onclick="stop('\${t.id}')">STOP</button>
                    </div>\`).join('');
            }
            async function add() {
                addLog("Attempting Login...", "#58a6ff");
                const d = { cookie: document.getElementById('cookie').value, threadID: document.getElementById('tid').value, name: document.getElementById('name').value };
                const res = await fetch('/add-task', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }).then(r=>r.json());
                if(res.success) addLog("Task added to queue. Checking FB response...", "#58a6ff");
                else addLog("Failed to send request!", "red");
                load();
            }
            async function stop(id) {
                await fetch('/stop-task', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}) });
                addLog("Monitoring Stopped."); load();
            }
            setInterval(async () => {
                const r = await fetch('/get-live-logs').then(res => res.json());
                if(r.log) addLog(r.log, r.type === 'err' ? 'red' : '#39ff14');
            }, 2000);
            load();
        </script>
    </body>
    </html>`);
});

let lastLog = "";
let logType = "info";
app.get('/get-live-logs', (req, res) => {
    res.json({ log: lastLog, type: logType });
    lastLog = ""; 
});

function runBot(task) {
    if (activeTasks.has(task.id)) return;
    try {
        let appState = parseRawCookie(task.cookie);
        wiegine.login({ appState }, { logLevel: 'silent', forceLogin: true }, (err, api) => {
            if (err) {
                lastLog = "Login Failed: Check your Cookie/AppState";
                logType = "err";
                return;
            }
            
            api.setOptions({ listenEvents: true, selfListen: false });
            lastLog = "Logged in! Fetching Group Members...";

            api.getThreadInfo(task.threadID, (err, info) => {
                if (err) {
                    lastLog = "Error: Cannot fetch group info. Check ID.";
                    logType = "err";
                    return;
                }

                const members = info.participantIDs;
                lastLog = `Found \${members.length} members. Starting 3s Lock...`;

                members.forEach((uid, i) => {
                    setTimeout(() => {
                        if (!activeTasks.has(task.id)) return;
                        api.changeNickname(task.name, task.threadID, uid, (e) => {
                            if(e) {
                                lastLog = "FB Blocked Nickname change for " + uid;
                                logType = "err";
                            } else {
                                console.log("Locked: " + uid);
                                lastLog = "Successfully Locked: " + uid;
                                logType = "info";
                            }
                        });
                    }, i * 3000); 
                });
            });

            const stopListen = api.listenMqtt((err, event) => {
                if (event?.logMessageType === "log:user-nickname" && event.logMessageData.nickname !== task.name && event.threadID === task.threadID) {
                    api.changeNickname(task.name, task.threadID, event.logMessageData.participant_id, () => {});
                }
            });
            activeTasks.set(task.id, { ...task, stopFunc: stopListen });
        });
    } catch (e) { lastLog = "Crash: " + e.message; logType = "err"; }
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
        if (task.stopFunc) task.stopFunc();
        activeTasks.delete(id);
        const db = JSON.parse(fs.readFileSync(DB_FILE)).filter(item => item.id !== id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
    }
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`DRB Server Live`));
