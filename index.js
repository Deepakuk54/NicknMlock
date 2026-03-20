const express = require('express');
const wiegine = require('fca-mafiya');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

let activeTasks = new Map();
let logs = [];

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
                <button onclick="stopTask('${key}')" style="background:#da3633; color:white; border:none; padding:10px 18px; border-radius:6px; cursor:pointer; font-weight:bold;">STOP</button>
            </div>`;
    });

    let logHtml = logs.map(l => `<div style="border-bottom:1px solid #21262d; padding:5px; color:#7ee787; font-family:monospace;">${l}</div>`).join('');

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Deepak Rajput Brand Control</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { background: #0d1117; color: #c9d1d9; font-family: sans-serif; text-align: center; padding: 20px; }
                .main-box { background: #161b22; padding: 20px; border-radius: 15px; border: 1px solid #30363d; display: inline-block; width: 95%; max-width: 480px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
                input, textarea { width: 92%; margin: 10px 0; padding: 12px; background: #0d1117; border: 1px solid #30363d; color: #7ee787; border-radius: 8px; font-size: 14px; }
                .btn-start { width: 100%; background: #238636; color: white; padding: 15px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; margin-top: 10px; font-size: 16px; }
                .terminal { background: #000; padding: 15px; border-radius: 10px; text-align: left; font-size: 11px; border: 1px solid #30363d; height: 140px; overflow-y: auto; margin: 20px auto; max-width: 500px; }
            </style>
        </head>
        <body>
            <h1 style="color:#58a6ff;">DEEPAK BRAND MANAGER ✅</h1>
            <div class="main-box">
                <input id="u" placeholder="Target Group UID">
                <input id="n" placeholder="Nickname to Lock">
                <textarea id="c" rows="4" placeholder="Paste Cookie (Any Format)"></textarea>
                <button class="btn-start" onclick="start()">START PROTECTION</button>
            </div>
            <div style="max-width:500px; margin:auto; text-align:left;">
                <h3 style="color:#f0883e; margin-top:20px;">📜 System Logs</h3>
                <div class="terminal">${logHtml || "System Ready and Waiting..."}</div>
                <h3 style="color:#58a6ff; margin-top:20px;">🛡️ Active Protections</h3>
                <div id="tasks">${taskRows || "<p style='color:#8b949e; text-align:center;'>No active tasks running.</p>"}</div>
            </div>
            <script>
                async function start() {
                    const u = document.getElementById('u').value;
                    const n = document.getElementById('n').value;
                    const c = document.getElementById('c').value;
                    if(!u || !n || !c) return alert("Pehle details bharo bhai!");
                    
                    const res = await fetch('/add', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({uid: u, nick: n, cookie: c})
                    });
                    const data = await res.json();
                    alert(data.msg);
                    location.reload();
                }
                async function stopTask(id) {
                    await fetch('/stop', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: id}) });
                    location.reload();
                }
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
        const cleanCookie = cookie.trim();
        if (cleanCookie.startsWith('[')) { 
            appState = JSON.parse(cleanCookie); 
        } else {
            // Strong String Parser
            appState = cleanCookie.split(';').map(item => {
                const index = item.indexOf('=');
                if (index !== -1) {
                    return { 
                        key: item.substring(0, index).trim(), 
                        value: item.substring(index + 1).trim(), 
                        domain: "facebook.com", 
                        path: "/" 
                    };
                }
                return null;
            }).filter(Boolean);
        }

        if (appState.length === 0) throw new Error("Format error");

        wiegine({ appState }, { logLevel: 'silent', forceLogin: true }, (err, api) => {
            if(err) {
                addLog(`❌ Task #${taskId} LOGIN FAILED! Check if account is locked.`);
                return;
            }

            api.getThreadInfo(uid, (err, info) => {
                if(!err && info.participantIDs) {
                    info.participantIDs.forEach(pID => api.changeNickname(nick, uid, pID));
                    addLog(`✅ Task #${taskId} Initial Lock Done!`);
                }
            });

            const stop = api.listenMqtt((err, event) => {
                if(event?.logMessageType === "log:user-nickname" && event.threadID === uid){
                    addLog(`🔄 Task #${taskId}: Reset Nickname for User`);
                    setTimeout(() => api.changeNickname(nick, uid, event.logMessageData.participant_id), 2000);
                }
            });

            activeTasks.set(taskId, { uid, nick, stop });
            addLog(`🚀 Task #${taskId} Protecting Group ${uid}`);
        });

        res.json({ msg: "Task #" + taskId + " Started!", taskId: taskId });
    } catch(e) { 
        res.json({ msg: "Error: Cookie ka format sahi nahi hai!" }); 
    }
});

app.post('/stop', (req, res) => {
    const { id } = req.body;
    if (activeTasks.has(id)) {
        const t = activeTasks.get(id);
        if (typeof t.stop === 'function') t.stop(); 
        activeTasks.delete(id);
        addLog(`🛑 Task #${id} Stopped.`);
    }
    res.json({ msg: "Stopped" });
});

app.listen(PORT, '0.0.0.0');
