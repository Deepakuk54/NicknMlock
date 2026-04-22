const express = require('express');
const wiegine = require('fca-mafiya');
const fs = require('fs');
const app = express();

// Railway automatically PORT environment variable deta hai
const PORT = process.env.PORT || 3000;
app.use(express.json());

let activeTasks = new Map();
const DB_FILE = 'all_members_db.json';

if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

// ... (Tera Baaki Dashboard Content same rahega) ...

function runBot(task) {
    if (activeTasks.has(task.id)) return;
    try {
        let loginData = task.cookie.startsWith('[') ? { appState: JSON.parse(task.cookie) } : task.cookie;
        wiegine.login(loginData, { 
            logLevel: 'silent', 
            forceLogin: true,
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        }, (err, api) => {
            if (err || !api) return console.log("Login fail for: " + task.threadID);
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

// Routes and Listen (Same as your Render code)
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

try {
    const saved = JSON.parse(fs.readFileSync(DB_FILE));
    saved.forEach((t, i) => setTimeout(() => runBot(t), (i + 1) * 5000));
} catch(e) {}

app.listen(PORT, '0.0.0.0', () => console.log(`Railway Server Live on ${PORT}`));
