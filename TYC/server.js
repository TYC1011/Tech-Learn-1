const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// ==========================================
// 中央資料庫持久化 (JSON 檔案儲存)
// 所有裝置 (電腦、手機、平板) 共用此資料庫
// ==========================================
function initDb() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
        const initial = {
            users: {},
            counter: 0,
            guestCounter: 1,
            reservations: {},
            serverConfigs: {}
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
        return initial;
    }
    try {
        const content = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(content);
        if (!parsed.users) parsed.users = {};
        if (typeof parsed.counter !== 'number') parsed.counter = 0;
        if (typeof parsed.guestCounter !== 'number') parsed.guestCounter = 1;
        if (!parsed.reservations) parsed.reservations = {};
        if (!parsed.serverConfigs) parsed.serverConfigs = {};
        return parsed;
    } catch (e) {
        console.error('讀取 db.json 失敗，初始化新資料庫:', e);
        return { users: {}, counter: 0, guestCounter: 1, reservations: {}, serverConfigs: {} };
    }
}

let db = initDb();

function saveDb() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error('儲存 db.json 失敗:', e);
    }
}

// ==========================================
// ID 生成演算法 (AAA11111 ~ ZZZ99999)
// ==========================================
const numbersPerPrefix = 88889; // 99999 - 11111 + 1

function indexToId(index) {
    const prefixIndex = Math.floor(index / numbersPerPrefix);
    const numOffset = (index % numbersPerPrefix) + 11111;
    const c1 = String.fromCharCode(65 + Math.floor(prefixIndex / (26 * 26)) % 26);
    const c2 = String.fromCharCode(65 + Math.floor(prefixIndex / 26) % 26);
    const c3 = String.fromCharCode(65 + (prefixIndex % 26));
    return `${c1}${c2}${c3}${numOffset}`;
}

function idToIndex(id) {
    if (!/^[A-Z]{3}[0-9]{5}$/.test(id)) return -1;
    const p1 = id.charCodeAt(0) - 65;
    const p2 = id.charCodeAt(1) - 65;
    const p3 = id.charCodeAt(2) - 65;
    const prefixIndex = p1 * 26 * 26 + p2 * 26 + p3;
    const num = parseInt(id.slice(3), 10);
    if (num < 11111 || num > 99999) return -1;
    return prefixIndex * 88889 + (num - 11111);
}

// 伺服器端原子分配 ID
function allocateNextIdServer() {
    const now = Date.now();
    const EXPIRY_MS = 5 * 60 * 1000;

    // 清理過期保留
    for (const id in db.reservations) {
        if (now - db.reservations[id] > EXPIRY_MS) {
            delete db.reservations[id];
        }
    }

    const existingIndices = new Set();
    for (const uid in db.users) {
        const idx = idToIndex(uid);
        if (idx >= 0) existingIndices.add(idx);
    }

    const reservedIndices = new Set();
    for (const id in db.reservations) {
        const idx = idToIndex(id);
        if (idx >= 0) reservedIndices.add(idx);
    }

    // 搜尋 0 ~ counter-1 範圍內的最小空缺
    for (let i = 0; i < db.counter; i++) {
        if (!existingIndices.has(i) && !reservedIndices.has(i)) {
            const freeId = indexToId(i);
            db.reservations[freeId] = now;
            saveDb();
            return freeId;
        }
    }

    // 若無空缺，使用當前 counter 並推進流水號
    const assignedId = indexToId(db.counter);
    db.counter += 1;
    db.reservations[assignedId] = now;
    saveDb();
    return assignedId;
}

// 智慧合併玩家紀錄 (保留最佳成績與最新進度)
function mergeUserRecords(existing, incoming) {
    if (!existing) return incoming;
    if (!incoming) return existing;

    const merged = { ...existing, ...incoming };

    // 合併關卡最佳數值
    if (existing.stats && incoming.stats) {
        merged.stats = { ...existing.stats };
        ['level1', 'level2', 'level3', 'boss'].forEach(lk => {
            const s1 = existing.stats[lk] || {};
            const s2 = incoming.stats[lk] || {};
            merged.stats[lk] = {
                bestScore: Math.max(s1.bestScore || 0, s2.bestScore || 0),
                bestStars: Math.max(s1.bestStars || 0, s2.bestStars || 0),
                minTime: (s1.minTime !== null && s2.minTime !== null) ? Math.min(s1.minTime, s2.minTime) : (s1.minTime ?? s2.minTime),
                minErrors: (s1.minErrors !== null && s2.minErrors !== null) ? Math.min(s1.minErrors, s2.minErrors) : (s1.minErrors ?? s2.minErrors),
                retryCount: Math.max(s1.retryCount || 0, s2.retryCount || 0),
                clearCount: Math.max(s1.clearCount || 0, s2.clearCount || 0)
            };
        });
    }

    // 合併錯題筆記本 (依錯題 id 去重)
    if (incoming.notebook || existing.notebook) {
        const nbMap = new Map();
        (existing.notebook || []).forEach(item => nbMap.set(item.id, item));
        (incoming.notebook || []).forEach(item => {
            const prev = nbMap.get(item.id);
            if (!prev || item.solved) {
                nbMap.set(item.id, item);
            }
        });
        merged.notebook = Array.from(nbMap.values());
    }

    // 合併成就
    merged.achievements = {
        general: { ...(existing.achievements?.general || {}), ...(incoming.achievements?.general || {}) },
        hidden: { ...(existing.achievements?.hidden || {}), ...(incoming.achievements?.hidden || {}) }
    };

    // 最佳通關紀錄
    if (incoming.bestRun && existing.bestRun) {
        if (incoming.bestRun.totalTime < existing.bestRun.totalTime ||
           (incoming.bestRun.totalTime === existing.bestRun.totalTime && incoming.bestRun.totalErrors < existing.bestRun.totalErrors)) {
            merged.bestRun = incoming.bestRun;
        } else {
            merged.bestRun = existing.bestRun;
        }
    } else {
        merged.bestRun = incoming.bestRun || existing.bestRun;
    }

    return merged;
}

// 讀取請求內文 JSON
function readJsonBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                resolve({});
            }
        });
        req.on('error', () => resolve({}));
    });
}

// ==========================================
// HTTP 伺服器主邏輯
// ==========================================
const server = http.createServer(async (req, res) => {
    // 設置 CORS 與無快取標頭，確保跨裝置 (電腦/手機/平板) 連線順暢
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;

    // ==========================================
    // API 路由 (跨裝置中央資料同步與後台共用)
    // ==========================================
    if (pathname.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json; charset=UTF-8');

        // GET /api/sync: 取得中央伺服器最新完整資料
        if (pathname === '/api/sync' && req.method === 'GET') {
            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                users: db.users,
                counter: db.counter,
                guestCounter: db.guestCounter,
                reservations: db.reservations,
                serverConfigs: db.serverConfigs
            }));
            return;
        }

        // POST /api/sync: 雙向同步 (合併各裝置玩家資料並持久化)
        if (pathname === '/api/sync' && req.method === 'POST') {
            const body = await readJsonBody(req);
            let hasChanged = false;

            if (body.users && typeof body.users === 'object') {
                for (const key in body.users) {
                    const incomingUser = body.users[key];
                    if (!incomingUser) continue;
                    db.users[key] = mergeUserRecords(db.users[key], incomingUser);
                    hasChanged = true;
                }
            }

            if (typeof body.counter === 'number' && body.counter > db.counter) {
                db.counter = body.counter;
                hasChanged = true;
            }

            if (typeof body.guestCounter === 'number' && body.guestCounter > db.guestCounter) {
                db.guestCounter = body.guestCounter;
                hasChanged = true;
            }

            if (body.serverConfigs && typeof body.serverConfigs === 'object') {
                Object.assign(db.serverConfigs, body.serverConfigs);
                hasChanged = true;
            }

            if (body.reservations && typeof body.reservations === 'object') {
                Object.assign(db.reservations, body.reservations);
                hasChanged = true;
            }

            if (hasChanged) {
                saveDb();
            }

            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                users: db.users,
                counter: db.counter,
                guestCounter: db.guestCounter,
                reservations: db.reservations,
                serverConfigs: db.serverConfigs
            }));
            return;
        }

        // POST /api/allocate-id: 伺服器端原子分配唯一 ID (防止多裝置併發重複)
        if (pathname === '/api/allocate-id' && req.method === 'POST') {
            const assignedId = allocateNextIdServer();
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, assignedId, counter: db.counter }));
            return;
        }

        // POST /api/allocate-guest: 伺服器端分配遊客編號
        if (pathname === '/api/allocate-guest' && req.method === 'POST') {
            const guestNum = String(db.guestCounter).padStart(4, '0');
            db.guestCounter = (db.guestCounter % 9999) + 1;
            saveDb();
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, guestNum, guestCounter: db.guestCounter }));
            return;
        }

        // POST /api/user/save: 儲存或更新單一玩家資料
        if (pathname === '/api/user/save' && req.method === 'POST') {
            const body = await readJsonBody(req);
            if (body.user) {
                const u = body.user;
                const key = u.isGuest ? (u.guestKey || u.id) : u.id;
                db.users[key] = mergeUserRecords(db.users[key], u);
                saveDb();
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, user: db.users[key] }));
                return;
            }
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, message: '缺少 user 資料' }));
            return;
        }

        // POST /api/user/delete: 刪除玩家
        if (pathname === '/api/user/delete' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const key = body.key || body.id;
            if (key && db.users[key]) {
                delete db.users[key];
                saveDb();
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
                return;
            }
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
            return;
        }

        // POST /api/server-config: 設定個別伺服器題數
        if (pathname === '/api/server-config' && req.method === 'POST') {
            const body = await readJsonBody(req);
            if (body.serverId && body.config) {
                db.serverConfigs[body.serverId] = body.config;
                saveDb();
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, serverConfigs: db.serverConfigs }));
                return;
            }
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, message: '參數錯誤' }));
            return;
        }

        // POST /api/admin/clear-all: 後台清空全部玩家資料
        if (pathname === '/api/admin/clear-all' && req.method === 'POST') {
            db.users = {};
            db.counter = 0;
            db.guestCounter = 1;
            db.reservations = {};
            saveDb();
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
            return;
        }

        // GET /api/admin/users: 後台查詢所有玩家資料
        if (pathname === '/api/admin/users' && req.method === 'GET') {
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, users: db.users }));
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ success: false, message: 'API 不存在' }));
        return;
    }

    // ==========================================
    // 靜態檔案服務
    // ==========================================
    let reqPath = decodeURIComponent(pathname);
    if (reqPath === '/' || reqPath === '') {
        reqPath = '/index.html';
    }

    const filePath = path.join(ROOT_DIR, reqPath);

    // 防止路徑遍歷攻擊
    if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
            res.end('404 找不到檔案');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache'
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIp();
    console.log('========================================================');
    console.log('🎮 勇者四則運算大冒險 本機/區域網路伺服器已啟動！');
    console.log(`💻 電腦本機遊玩網址： http://localhost:${PORT}`);
    console.log(`📱 手機/平板連線網址： http://${localIp}:${PORT}`);
    console.log('👉 請確保手機/平板與此電腦連接在同一個 Wi-Fi 網路！');
    console.log('📂 中央資料庫位置： data/db.json (所有裝置玩家資料共用同步)');
    console.log('========================================================');
});
