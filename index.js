const express = require('express');
const wiegine = require('fca-mafiya');
const fs = require('fs');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
let activeTasks = new Map();
const DB_FILE = 'tasks_db.json';

// Database initialize
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>D-RAJPUT NICKNAME LOCK</title>
    <style>
        body { background: #0d1117; color: #c9d1d9; font-family: sans-serif; padding: 10px; text-align: center; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 15px; max-width: 400px; margin: auto; }
        textarea, input { width: 100%; background: #0d1117; border: 1px solid #30363d; color: white; padding: 10px; border-radius: 8px; margin-bottom: 10px; box-sizing: border-box; }
        .btn { background: #238636; color: white; border: none; padding: 15px; width: 100%; border-radius: 8px; font-weight: bold; cursor: pointer; }
        .task-item { background: #1c2128; border: 1px solid #30363d; padding: 10px; margin: 10px auto; display: flex; justify-content: space-between; align-items: center; border-radius: 8px; border-left: 4px solid #238636; max-width: 400px; }
        .stop-btn { background: #da3633; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; }
    </style>
</head>
<body>
    <h1>Deepak Rajput Nickname Lock</h1>
    <div class="card">
        <textarea id="cookie" placeholder="Paste AppState/Cookie" rows="4"></textarea>
        <input type="text" id="targetUID" placeholder="Target User UID">
        <input type="text" id="threadID" placeholder="Group/Thread UID">
        <input type="text" id="lockName" placeholder="Lock Nickname" value="DEEPAK RAJPUT BRAND">
        <button class="btn" onclick="addTask()">START LOCKING</button>
    </div>
    <div id="list"></div>
    <script>
        async function loadTasks() {
            const res = await fetch('/list-tasks');
            const tasks = await res.json();
            document.getElementById('list').innerHTML = tasks.map(t => \`
                <div class="task-item">
                    <div style="text-align:left;"><b>\${t.name}</b><br><small>Target: \${t.targetUID}</small></div>
                    <button class="stop-btn" onclick="stopTask('\${t.id}')">STOP</button>
                </div>\`).join('');
        }
        async function addTask() {
            const data = {
                cookie: document.getElementById('cookie').value,
                targetUID: document.getElementById('targetUID').value,
                threadID: document.getElementById('threadID').value,
                name: document.getElementById('lockName').value
            };
            await fetch('/add-task', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
            loadTasks();
        }
        async function stopTask(id) {
            await fetch('/stop-task', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ id }) });
            loadTasks();
        }
        loadTasks(); setInterval(loadTasks, 5000);
    </script>
</body>
</html>`;

function runBot(task) {
    if (activeTasks.has(task.id)) return; // Duplicate check

    try {
        let loginData = task.cookie.trim().startsWith('[') ? { appState: JSON.parse(task.cookie) } : task.cookie;

        wiegine.login(loginData, { logLevel: 'silent', forceLogin: true }, (err, api) => {
            if (err || !api) return console.log(`❌ Login Failed: ${task.targetUID}`);

            api.setOptions({ listenEvents: true, selfListen: false });
            
            // First time set
            api.changeNickname(task.name, task.threadID, task.targetUID);

            let lastExecution = 0;
            const stopMqtt = api.listenMqtt((err, event) => {
                if (err) return;

                if (event.type === "event" && event.logMessageType === "log:user-nickname" && 
                    event.logMessageData.participant_id === task.targetUID && event.threadID === task.threadID) {
                    
                    const newNick = event.logMessageData.nickname;
                    const now = Date.now();

                    if (newNick !== task.name && (now - lastExecution > 5000)) {
                        lastExecution = now;
                        api.changeNickname(task.name, task.threadID, task.targetUID, (e) => {
                            if(e) console.log("⚠️ Action Blocked by FB");
                        });
                    }
                }
            });

            activeTasks.set(task.id, { 
                ...task, 
                stop: () => { if(typeof stopMqtt === 'function') stopMqtt(); } 
            });
            console.log(`✅ Nickname Lock Active: ${task.name}`);
        });
    } catch (e) { console.log("❌ Start Error"); }
}

// --- EXPRESS ROUTES ---
app.get('/', (req, res) => res.send(htmlContent));

app.get('/list-tasks', (req, res) => {
    res.json(Array.from(activeTasks.values()).map(t => ({ id: t.id, name: t.name, targetUID: t.targetUID })));
});

app.post('/add-task', (req, res) => {
    const id = "DRB-" + Math.floor(Math.random() * 8999 + 1000);
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
        const t = activeTasks.get(id);
        t.stop(); // Proper MQTT Stop
        activeTasks.delete(id);
        
        const db = JSON.parse(fs.readFileSync(DB_FILE)).filter(item => item.id !== id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
        console.log(`🛑 Task Stopped: ${id}`);
    }
    res.json({ success: true });
});

// Auto-Restart & Keep-Alive
const savedData = JSON.parse(fs.readFileSync(DB_FILE));
savedData.forEach(t => setTimeout(() => runBot(t), 3000));

// Self-Ping to prevent Render Sleep (Use your Render URL here)
setInterval(() => {
    if (process.env.RENDER_EXTERNAL_URL) {
        https.get(process.env.RENDER_EXTERNAL_URL, (res) => {});
    }
}, 5 * 60 * 1000);

app.listen(PORT, () => console.log('🚀 Server started on port ' + PORT));
