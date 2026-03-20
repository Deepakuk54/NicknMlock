const express = require('express');
const wiegine = require('fca-mafiya');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
let activeTasks = new Map();
const DB_FILE = 'database.json';

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

// Render Keep-Alive (Self-Ping)
setInterval(() => {
    console.log("Deepak Brand: Server Pulse OK... 🟢");
}, 30000);

function startBot(task) {
    const taskId = task.id || "LOCK-" + Math.floor(1000 + Math.random() * 9000);
    
    // Aapka provide kiya hua login logic
    wiegine.login(task.cookie, { logLevel: 'silent', forceLogin: true }, (err, api) => {
        if (err || !api) {
            console.log(`❌ Login Fail for Task: ${taskId}`);
            return;
        }

        api.setOptions({ listenEvents: true, selfListen: false });

        // --- SLOW SYNC LOGIC (To prevent 502/Crash) ---
        api.getThreadInfo(task.uid, (err, info) => {
            if (!err && info && info.participantIDs) {
                console.log(`Locking ${info.participantIDs.length} members for ${taskId}...`);
                
                info.participantIDs.forEach((pID, index) => {
                    // 3.5 seconds gap to be 100% safe
                    setTimeout(() => {
                        api.changeNickname(task.nick, task.uid, pID, (err) => {
                            if(!err) console.log(`✅ Fixed: ${pID}`);
                        });
                    }, index * 3500); 
                });
            }
        });

        // Protection Listener (No Kick, Just Reset)
        const listener = api.listenMqtt((err, event) => {
            if (event?.logMessageType === "log:user-nickname" && event.threadID === task.uid) {
                const targetID = event.logMessageData.participant_id;
                console.log(`🔄 Resetting changed nickname for ${targetID}`);
                
                setTimeout(() => {
                    api.changeNickname(task.nick, task.uid, targetID);
                }, 2000); // 2 second delay before fixing back
            }
        });

        activeTasks.set(taskId, { uid: task.uid, nick: task.nick, api, listener });
        console.log(`🚀 Task ${taskId} is now monitoring Group ${task.uid}`);
    });
}

// Auto-Restart from Database
try {
    const saved = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    saved.forEach(t => startBot(t));
} catch(e) { console.log("DB Load Error"); }

// Dashboard Home
app.get('/', (req, res) => {
    res.send(`<body style="background:#0d1117;color:#58a6ff;text-align:center;padding-top:50px;font-family:sans-serif;">
        <h1>DEEPAK RAJPUT BRAND IS LIVE ✅</h1>
        <p style="color:#8b949e;">UptimeRobot should ping this URL every 5 minutes.</p>
    </body>`);
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

app.post('/stop-task', (req, res) => {
    const { id } = req.body;
    if (activeTasks.has(id)) {
        const t = activeTasks.get(id);
        if (t.listener) t.listener();
        activeTasks.delete(id);
        const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')).filter(t => t.id !== id);
        fs.writeFileSync(DB_FILE, JSON.stringify(db));
        res.json({ ok: true });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server on ${PORT}`));
