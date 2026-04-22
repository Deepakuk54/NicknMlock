const express = require('express');
const wiegine = require('fca-mafiya');
const fs = require('fs');
const app = express();

const PORT = process.env.PORT || 3000;
app.use(express.json());

let activeTasks = new Map();
const DB_FILE = 'all_members_db.json';

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DRB LOCK - RENDER SERVER</title>
    <style>
        body { background: #0d1117; color: #c9d1d9; font-family: sans-serif; padding: 15px; text-align: center; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 20px; max-width: 450px; margin: auto; }
        textarea, input { width: 100%; background: #0d1117; border: 1px solid #30363d; color: white; padding: 12px; border-radius: 8px; margin-bottom: 12px; box-sizing: border-box; outline: none; }
        .btn { background: #238636; color: white; border: none; padding: 15px; width: 100%; border-radius: 8px; font-weight: bold; cursor: pointer; }
        .task-item { background: #1c2128; border: 1px solid #30363d; padding: 12px; margin: 12px auto; display: flex; justify-content: space-between; align-items: center; border-radius: 8px; border-left: 4px solid #238636; max-width: 450px; }
        .stop-btn { background: #da3633; color: white; border: none; padding: 8px 15px; border-radius: 6px; cursor: pointer; }
        h1 { color: #58a6ff; }
    </style>
</head>
<body>
    <h1>Deepak Rajput Brand</h1>
    <p style="color:#8b949e">Server Status: <span style="color:#238636">ONLINE</span></p>
    <div class="card">
        <textarea id="cookie" placeholder="Paste AppState/Cookie" rows="4"></textarea>
        <input type="text" id="threadID" placeholder="Group UID">
        <input type="text" id="lockName" placeholder="Nickname" value="DEEPAK RAJPUT BRAND">
        <button class="btn" onclick="addTask()">START LOCK</button>
    </div>
    <div id="list"></div>
    <script>
        async function loadTasks() {
            try {
                const res = await fetch('/list-tasks');
                const tasks = await res.json();
                document.getElementById('list').innerHTML = tasks.map(t => \`
                    <div class="task-item">
                        <div style="text-align:left;"><b>\${t.name}</b><br><small>UID: \${t.threadID}</small></div>
                        <button class="stop-btn" onclick="stopTask('\${t.id}')">STOP</button>
                    </div>\`).join('');
            } catch(e) {}
        }
        async function addTask() {
            const data = {
                cookie: document.getElementById('cookie').value.trim(),
                threadID: document.getElementById('threadID').value.trim(),
                name: document.getElementById('lockName').value.trim()
            };
            if(!data.cookie || !data.threadID) return alert("Fill all fields!");
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
    if (activeTasks.has(task.id)) return;
    try {
        let loginData = task.cookie.startsWith('[') ? { appState: JSON.parse(task.cookie) } : task.cookie;
        wiegine.login(loginData, { 
            logLevel: 'silent', 
            forceLogin: true,
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        }, (err, api) => {
            if (err || !api) return console.log("Login fail: " + task.threadID);
            api.setOptions({ listenEvents: true, selfListen: false });
            
            api.getThreadInfo(task.threadID, (err, info) => {
                if (err || !info) return;
                info.participantIDs.forEach((id, i) => {
                    setTimeout(() => api.changeNickname(task.name, task.threadID, id, () => {}), i * 1500);
                });
            });

            const stopMqtt = api.listenMqtt((err, event) => {
                if (event?.type === "event" && event.logMessageType === "log:user-nickname" && event.threadID === task.threadID) {
                    if (event.logMessageData.nickname !== task.name) {
                        api.changeNickname(task.name, task.threadID, event.logMessageData.participant_id, () => {});
                    }
                }
            });

            activeTasks.set(task.id, { ...task, stop: stopMqtt });
        });
    } catch (e) {}
}

app.get('/', (req, res) => res.send(htmlContent));
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
        activeTasks.get(id).stop();
        activeTasks.delete(id);
        const db = JSON.parse(fs.readFileSync(DB_FILE)).filter(item => item.id !== id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
    }
    res.json({ success: true });
});

// Restart saved tasks
try {
    const saved = JSON.parse(fs.readFileSync(DB_FILE));
    saved.forEach((t, i) => setTimeout(() => runBot(t), (i + 1) * 4000));
} catch(e) {}

app.listen(PORT, '0.0.0.0', () => console.log(`Server live on ${PORT}`));
