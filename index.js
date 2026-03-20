const express = require('express');
const wiegine = require('fca-mafiya');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
let activeTasks = [];
const DB_FILE = 'database.json';

// Database Initializer
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

function startBot(task, isAuto = false) {
    const taskId = task.id || (isAuto ? "AUTO-" + Math.floor(100+Math.random()*900) : "USER-" + Math.floor(1000+Math.random()*9000));
    
    // Login Logic using your provided structure
    wiegine.login(task.cookie, { logLevel: 'silent', forceLogin: true }, (err, api) => {
        if (err || !api) {
            console.log(`❌ LOGIN FAILED | UID: ${task.uid} | Task: ${taskId}`);
            return;
        }
        
        // Step 1: Pehle sabka nickname lock kar do
        api.getThreadInfo(task.uid, (err, info) => {
            if(!err && info.participantIDs) {
                info.participantIDs.forEach(pID => {
                    api.changeNickname(task.nick, task.uid, pID);
                });
            }
        });

        // Step 2: Listener for Real-time Protection
        const listener = api.listenMqtt((err, event) => {
            if (event?.logMessageType === "log:user-nickname" && event.threadID === task.uid) {
                // Agar koi nickname badle toh 1.5s mein wapas lock
                setTimeout(() => {
                    api.changeNickname(task.nick, task.uid, event.logMessageData.participant_id);
                }, 1500);
            }
        });

        activeTasks.push({ id: taskId, uid: task.uid, nick: task.nick, api, listener });
        console.log(`🚀 LOCKER LIVE | ID: ${taskId} | Group: ${task.uid} | Nick: ${task.nick}`);
    });
    return taskId;
}

// --- AUTO-RESTART FROM DATABASE ---
try {
    const savedTasks = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    savedTasks.forEach(t => startBot(t, true));
} catch(e) { console.log("DB Empty or Corrupt"); }

// Dashboard
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Deepak Rajput Nickname Locker</title>
            <style>
                body { background: #0d1117; color: #c9d1d9; font-family: sans-serif; padding: 15px; text-align: center; }
                .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 20px; max-width: 450px; margin: auto; }
                textarea, input { width: 100%; background: #0d1117; border: 1px solid #30363d; color: #7ee787; padding: 12px; border-radius: 8px; margin-bottom: 10px; outline: none; }
                .btn { width: 100%; background: #238636; color: white; border: none; padding: 15px; border-radius: 8px; font-weight: bold; cursor: pointer; }
                .task { background: #1c2128; border: 1px solid #333; padding: 12px; margin-top: 10px; display: flex; justify-content: space-between; border-left: 4px solid #58a6ff; border-radius: 8px; text-align: left; }
                .stop-btn { background: #da3633; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; }
            </style>
        </head>
        <body>
            <h1>Deepak Nickname Locker ✅</h1>
            <div class="card">
                <textarea id="cookie" placeholder="Paste Cookie Here" rows="3"></textarea>
                <input type="text" id="uid" placeholder="Group UID">
                <input type="text" id="nick" placeholder="Lock Nickname" value="DEEPAK RAJPUT BRAND">
                <button class="btn" onclick="add()">ACTIVATE LOCK</button>
            </div>
            <div id="list" style="max-width:450px; margin:auto; margin-top:20px;"></div>
            <script>
                let myIds = JSON.parse(localStorage.getItem('my_bots') || "[]");
                async function load() {
                    const res = await fetch('/list');
                    const all = await res.json();
                    const mine = all.filter(t => myIds.includes(t.id));
                    document.getElementById('list').innerHTML = mine.map(t => \`
                        <div class="task">
                            <div><b>\${t.nick}</b><br><small>UID: \${t.uid}</small></div>
                            <button class="stop-btn" onclick="stopTask('\${t.id}')">STOP</button>
                        </div>\`).join('') || '<p style="color:#666">No active locks.</p>';
                }
                async function add() {
                    const cookie = document.getElementById('cookie').value;
                    const uid = document.getElementById('uid').value;
                    const nick = document.getElementById('nick').value;
                    const res = await fetch('/add-task', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ cookie, uid, nick })
                    });
                    const data = await res.json();
                    myIds.push(data.id);
                    localStorage.setItem('my_bots', JSON.stringify(myIds));
                    location.reload();
                }
                async function stopTask(id) {
                    await fetch('/stop-task', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ id }) });
                    myIds = myIds.filter(i => i !== id);
                    localStorage.setItem('my_bots', JSON.stringify(myIds));
                    location.reload();
                }
                load(); setInterval(load, 10000);
            </script>
        </body>
        </html>
    `);
});

app.get('/list', (req, res) => res.json(activeTasks.map(t => ({ id: t.id, uid: t.uid, nick: t.nick }))));

app.post('/add-task', (req, res) => {
    const task = req.body;
    const taskId = "LOCK-" + Math.floor(1000 + Math.random() * 9000);
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.push({...task, id: taskId});
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
    startBot({...task, id: taskId});
    res.json({ id: taskId });
});

app.post('/stop-task', (req, res) => {
    const { id } = req.body;
    const i = activeTasks.findIndex(t => t.id === id);
    if (i !== -1) {
        if (activeTasks[i].listener) activeTasks[i].listener();
        activeTasks.splice(i, 1);
        const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')).filter(t => t.id !== id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
        res.json({ ok: true });
    }
});

app.listen(PORT, '0.0.0.0');
