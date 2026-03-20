const express = require('express');
const wiegine = require('fca-mafiya');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
let activeTasks = new Map();
const DB_FILE = 'database.json';

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

function startBot(task) {
    const taskId = task.id || "LOCK-" + Math.floor(1000 + Math.random() * 9000);
    
    wiegine.login(task.cookie, { logLevel: 'silent', forceLogin: true }, (err, api) => {
        if (err || !api) return console.log(`❌ Login Fail: ${taskId}`);

        api.setOptions({ listenEvents: true, selfListen: false });

        api.getThreadInfo(task.uid, (err, info) => {
            if (!err && info?.participantIDs) {
                info.participantIDs.forEach((pID, index) => {
                    setTimeout(() => {
                        api.changeNickname(task.nick, task.uid, pID);
                    }, index * 3000); 
                });
            }
        });

        const listener = api.listenMqtt((err, event) => {
            if (event?.logMessageType === "log:user-nickname" && event.threadID === task.uid) {
                setTimeout(() => api.changeNickname(task.nick, task.uid, event.logMessageData.participant_id), 2000);
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

// --- DASHBOARD UI (Ab yahan se details dalenge) ---
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Deepak Brand Dashboard</title>
            <style>
                body { background: #0d1117; color: #c9d1d9; font-family: sans-serif; text-align: center; padding: 20px; }
                .box { background: #161b22; border: 1px solid #30363d; padding: 20px; border-radius: 12px; max-width: 400px; margin: auto; }
                input, textarea { width: 90%; padding: 12px; margin: 8px 0; background: #0d1117; border: 1px solid #30363d; color: #7ee787; border-radius: 6px; }
                button { width: 95%; padding: 15px; background: #238636; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; margin-top: 10px; }
                .footer { margin-top: 20px; font-size: 12px; color: #8b949e; }
            </style>
        </head>
        <body>
            <h1 style="color:#58a6ff;">DEEPAK BRAND MANAGER ✅</h1>
            <div class="box">
                <textarea id="cookie" placeholder="Paste Cookie (JSON/String)" rows="4"></textarea>
                <input id="uid" placeholder="Group UID (e.g. 2750...)" type="text">
                <input id="nick" placeholder="Nickname to Lock" value="DEEPAK RAJPUT BRAND">
                <button onclick="start()">START NICKNAME LOCK</button>
            </div>
            <div class="footer">Powered by Deepak Rajput Master V3</div>
            <script>
                async function start() {
                    const cookie = document.getElementById('cookie').value.trim();
                    const uid = document.getElementById('uid').value.trim();
                    const nick = document.getElementById('nick').value.trim();
                    if(!cookie || !uid) return alert("Bhai details toh dalo!");
                    
                    const res = await fetch('/add-task', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ cookie, uid, nick })
                    });
                    const data = await res.json();
                    alert("Task Started! ID: " + data.id);
                    location.reload();
                }
            </script>
        </body>
        </html>
    `);
});

app.post('/add-task', (req, res) => {
    const task = req.body;
    const taskId = "LOCK-" + Math.floor(1000 + Math.random() * 9000);
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.push({...task, id: taskId});
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
    startBot({...task, id: taskId});
    res.json({ id: taskId });
});

app.listen(PORT, '0.0.0.0');
