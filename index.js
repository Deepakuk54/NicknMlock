const express = require('express');
const wiegine = require('fca-mafiya');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

let activeTasks = new Map();
let logs = [];

// Logs ko format karne ke liye function
function addLog(msg) {
    const time = new Date().toLocaleTimeString();
    logs.unshift(`[${time}] ${msg}`);
    if (logs.length > 15) logs.pop(); 
}

app.get('/', (req, res) => {
    let taskRows = "";
    activeTasks.forEach((val, key) => {
        taskRows += `
            <div style="background:#1c2128; border:1px solid #30363d; padding:12px; margin-top:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; border-left: 5px solid #238636;">
                <div style="text-align:left;">
                    <b style="color:#58a6ff;">TASK ID: ${key}</b><br>
                    <small style="color:#8b949e;">Group: ${val.uid}<br>Nick: ${val.nick}</small>
                </div>
                <button onclick="stopTask('${key}')" style="background:#da3633; color:white; border:none; padding:10px 18px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:13px;">STOP & KILL</button>
            </div>`;
    });

    let logHtml = logs.map(l => `<div style="border-bottom:1px solid #21262d; padding:5px; color:#7ee787;">${l}</div>`).join('');

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Deepak Rajput Brand Control</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { background: #0d1117; color: #c9d1d9; font-family: 'Segoe UI', sans-serif; text-align: center; padding: 20px; margin:0; }
                .main-box { background: #161b22; padding: 20px; border-radius: 15px; border: 1px solid #30363d; display: inline-block; width: 95%; max-width: 480px; box-shadow: 0 10px 40px rgba(0,0,0,0.6); }
                input, textarea { width: 92%; margin: 10px 0; padding: 12px; background: #0d1117; border: 1px solid #30363d; color: #7ee787; border-radius: 8px; font-size:14px; outline:none; }
                .btn-start { width: 100%; background: #238636; color: white; padding: 15px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 16px; margin-top: 10px; transition: 0.3s; }
                .btn-start:hover { background: #2ea043; transform: translateY(-2px); }
                .terminal { background: #000; padding: 15px; border-radius: 10px; text-align: left; font-size: 11px; border: 1px solid #30363d; height: 150px; overflow-y: auto; margin: 25px auto; max-width: 500px; box-shadow: inset 0 0 10px #000; }
                .task-list { max-width: 500px; margin: 20px auto; text-align: left; }
            </style>
        </head>
        <body>
            <h1 style="color:#58a6ff; text-transform:uppercase; letter-spacing:2px;">Deepak Brand Manager ✅</h1>
            
            <div class="main-box">
                <input id="u" placeholder="Target Group UID">
                <input id="n" placeholder="Nickname to Lock (e.g. Deepak Brand)">
                <textarea id="c" rows="4" placeholder="Paste Your Cookie (Any Format)"></textarea>
                <button class="btn-start" onclick="start()">START PROTECTION</button>
            </div>

            <div class="task-list">
                <h3 style="color:#f0883e; margin-left:5px;">📜 System Logs</h3>
                <div class="terminal">${logHtml || "Waiting for task..." }</div>

                <h3 style="color:#58a6ff; margin-left:5px;">🛡️ Active Protections</h3>
                <div id="tasks">${taskRows || "<p style='color:#8b949e; text-align:center;'>No active locks running.</p>"}</div>
            </div>

            <script>
                async function start() {
                    const u = document.getElementById('u').value.trim();
                    const n = document.getElementById('n').value.trim();
                    const c = document.getElementById('c').value.trim();
                    if(!u || !n || !c) return alert("Bhai saari details bharo!");

                    const res = await fetch('/add', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({uid: u, nick: n, cookie: c})
                    });
                    const data = await res.json();
                    alert("Task Initialized: ID " + data.taskId);
                    location.reload();
                }

                async function stopTask(id) {
                    if(!confirm("Kya aap Task #" + id + " ko band karna chahte hain?")) return;
                    await fetch('/stop', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({id: id})
                    });
                    location.reload();
                }
                
                // Refresh logs every 10 seconds automatically
                setTimeout(() => { location.reload(); }, 30000);
            </script>
        </body>
        </html>
    `);
});

app.post('/add', (req, res) => {
    let { uid, nick, cookie } = req.body;
    const taskId = Math.floor(1000 + Math.random() * 9000).toString();
    
    let appState;
    try {
        if (cookie.trim().startsWith('[')) { appState = JSON.parse(cookie); } 
        else {
            appState = cookie.split(';').map(item => {
                const parts = item.split('=');
                if (parts.length >= 2) return { key: parts[0].trim(), value: parts.slice(1).join('=').trim(), domain: "facebook.com", path: "/" };
                return null;
            }).filter(Boolean);
        }

        wiegine({ appState }, { logLevel: 'silent', forceLogin: true }, (err, api) => {
            if(err) {
                addLog(`❌ Task #${taskId} LOGIN FAILED! Check Cookie.`);
                return;
            }

            const lockAll = () => {
                api.getThreadInfo(uid, (err, info) => {
                    if(!err && info.participantIDs) {
                        info.participantIDs.forEach(pID => api.changeNickname(nick, uid, pID));
                    }
                });
            };

            lockAll();
            
            const stop = api.listenMqtt((err, event) => {
                if(event?.logMessageType === "log:user-nickname" && event.threadID === uid){
                    addLog(`🔄 Task #${taskId}: Nickname Reset Detect! Reverting...`);
                    setTimeout(() => api.changeNickname(nick, uid, event.logMessageData.participant_id), 2000);
                }
            });

            activeTasks.set(taskId, { uid, nick, stop, api });
            addLog(`✅ Task #${taskId} Started! Protecting Group ${uid}`);
        });
        res.json({ msg: "Started", taskId });
    } catch(e) { res.json({ msg: "Error" }); }
});

app.post('/stop', (req, res) => {
    const { id } = req.body;
    if (activeTasks.has(id)) {
        const t = activeTasks.get(id);
        if (typeof t.stop === 'function') t.stop(); 
        activeTasks.delete(id);
        addLog(`🛑 Task #${id} Manually Stopped.`);
        res.json({ msg: "Stopped" });
    } else {
        res.json({ msg: "Not found" });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log("Manager Online"));
