const express = require('express');
const wiegine = require('fca-mafiya');
const fs = require('fs');
const https = require('https');
const app = express();

// Northflank ke liye Port 8080 best hai
const PORT = process.env.PORT || 8080; 

app.use(express.json());
let activeTasks = new Map();
const DB_FILE = '/tmp/all_members_db.json'; // Northflank tmp storage

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DRB - STEALTH LOCK</title>
    <style>
        body { background: #0d1117; color: #c9d1d9; font-family: 'Segoe UI', sans-serif; padding: 10px; text-align: center; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 20px; max-width: 450px; margin: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
        h1 { color: #58a6ff; font-size: 22px; margin-bottom: 5px; }
        textarea, input { width: 100%; background: #0d1117; border: 1px solid #30363d; color: #7ee787; padding: 12px; border-radius: 8px; margin-bottom: 12px; box-sizing: border-box; outline: none; }
        .btn { background: #238636; color: white; border: none; padding: 15px; width: 100%; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.3s; }
        .btn:hover { background: #2ea043; }
        .task-item { background: #1c2128; border: 1px solid #30363d; padding: 12px; margin: 10px auto; display: flex; justify-content: space-between; align-items: center; border-radius: 8px; border-left: 5px solid #58a6ff; max-width: 450px; }
        .stop-btn { background: #da3633; color: white; border: none; padding: 8px 15px; border-radius: 6px; cursor: pointer; font-size: 12px; }
        .status-badge { font-size: 10px; background: #21262d; padding: 2px 8px; border-radius: 10px; color: #8b949e; }
    </style>
</head>
<body>
    <h1>Deepak Rajput Brand</h1>
    <p style="color:#8b949e; margin-bottom:20px;">No-Admin Member Nickname Lock (V21 Stealth)</p>
    <div class="card">
        <textarea id="cookie" placeholder="Paste AppState/Cookie JSON" rows="4"></textarea>
        <input type="text" id="threadID" placeholder="Target Group UID">
        <input type="text" id="lockName" placeholder="Lock Nickname" value="DEEPAK RAJPUT BRAND">
        <button class="btn" onclick="addTask()">ACTIVATE STEALTH LOCK</button>
    </div>
    <div id="list" style="margin-top:20px;"></div>
    <script>
        async function loadTasks() {
            try {
                const res = await fetch('/list-tasks');
                const tasks = await res.json();
                document.getElementById('list').innerHTML = tasks.map(t => \`
                    <div class="task-item">
                        <div style="text-align:left;">
                            <b style="color:#58a6ff">\${t.name}</b> <br>
                            <span class="status-badge">Target ID: \${t.threadID}</span>
                        </div>
                        <button class="stop-btn" onclick="stopTask('\${t.id}')">TERMINATE</button>
                    </div>\`).join('');
            } catch(e) {}
        }
        async function addTask() {
            const data = {
                cookie: document.getElementById('cookie').value,
                threadID: document.getElementById('threadID').value,
                name: document.getElementById('lockName').value
            };
            if(!data.cookie || !data.threadID) return alert("Details bharna zaroori hai!");
            await fetch('/add-task', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
            document.getElementById('cookie').value = '';
            loadTasks();
        }
        async function stopTask(id) {
            await fetch('/stop-task', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ id }) });
            loadTasks();
        }
        loadTasks(); setInterval(loadTasks, 8000);
    </script>
</body>
</html>`;

function runBot(task) {
    if (activeTasks.has(task.id)) return;

    try {
        let loginData = task.cookie.trim().startsWith('[') ? { appState: JSON.parse(task.cookie) } : { appState: JSON.parse(task.cookie) };

        wiegine.login(loginData, { logLevel: 'silent', forceLogin: true }, (err, api) => {
            if (err || !api) return console.log(`Login Failed for ${task.id}`);

            api.setOptions({ listenEvents: true, selfListen: false });

            // Initial Lock Sequence
            api.getThreadInfo(task.threadID, (err, info) => {
                if (err || !info) return;
                let members = info.participantIDs;
                members.forEach((id, index) => {
                    setTimeout(() => {
                        api.changeNickname(task.name, task.threadID, id, (e) => {});
                    }, index * 2500); // 2.5s safe delay for Northflank
                });
            });

            const stopMqtt = api.listenMqtt((err, event) => {
                if (err) return;
                if (event.type === "event" && event.logMessageType === "log:user-nickname" && event.threadID === task.threadID) {
                    const targetID = event.logMessageData.participant_id;
                    if (event.logMessageData.nickname !== task.name) {
                        api.changeNickname(task.name, task.threadID, targetID, (e) => {});
                    }
                }
            });

            activeTasks.set(task.id, { 
                ...task, 
                stop: () => { if(typeof stopMqtt === 'function') stopMqtt(); } 
            });
            console.log(`✅ Stealth Lock Active: ${task.threadID}`);
        });
    } catch (e) { console.log("Bot Error:", e.message); }
}

app.get('/', (req, res) => res.send(htmlContent));

app.get('/list-tasks', (req, res) => {
    res.json(Array.from(activeTasks.values()).map(t => ({ id: t.id, name: t.name, threadID: t.threadID })));
});

app.post('/add-task', (req, res) => {
    const id = "DRB-" + Math.floor(Math.random() * 90000 + 10000);
    const newTask = { ...req.body, id };
    const db = JSON.parse(fs.readFileSync(DB_FILE));
    db.push(newTask);
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
    runBot(newTask);
    res.json({ success: true, id });
});

app.post('/stop-task', (req, res) => {
    const { id } = req.body;
    if (activeTasks.has(id)) {
        activeTasks.get(id).stop();
        activeTasks.delete(id);
        const db = JSON.parse(fs.readFileSync(DB_FILE)).filter(item => item.id !== id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
    }
    res.json({ success: true });
});

// Restart pe purane tasks load karna
setTimeout(() => {
    const saved = JSON.parse(fs.readFileSync(DB_FILE));
    saved.forEach(t => runBot(t));
}, 5000);

// Northflank Binding Fix
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Deepak Rajput Brand Server Live on Port ${PORT}`);
});
