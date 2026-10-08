// 玩家資料儲存、伺服器分流、ID自動分配、伺服器題數設定與後台匯出模組 (LocalStorage 持久化)

// 成就定義表 (🏅一般成就 8 項、🏆隱藏成就 2 項)
const ACHIEVEMENTS_DEF = {
    '🏅01': { id: '🏅01', name: '逃離森林與熊', desc: '通過迷霧森林', type: 'general' },
    '🏅02': { id: '🏅02', name: '迷林中的導航', desc: '迷霧森林拿到3星', type: 'general' },
    '🏅03': { id: '🏅03', name: '獲得最強武器', desc: '通過魔法村莊 (獲得傳說之劍)', type: 'general' },
    '🏅04': { id: '🏅04', name: '附魔師的祝福', desc: '魔法村莊拿到3星', type: 'general' },
    '🏅05': { id: '🏅05', name: '獲得最強防具', desc: '通過神殿秘寶 (獲得重生之盾)', type: 'general' },
    '🏅06': { id: '🏅06', name: '突破重重石門', desc: '神殿秘寶拿到3星', type: 'general' },
    '🏅07': { id: '🏅07', name: '不放棄的精神', desc: '擊敗魔龍後，將錯題重新完成 (若沒錯題則自動獲得)', type: 'general' },
    '🏅08': { id: '🏅08', name: '王國的真勇者', desc: '擊敗魔龍解救人質', type: 'general' },
    '🏆01': { id: '🏆01', name: '傳說級勇者', desc: '全部關卡皆三星', type: 'hidden' },
    '🏆02': { id: '🏆02', name: '超快速勇者', desc: '第一關到第三關通關時間總和小於題數總和*5秒', type: 'hidden' }
};

const StorageManager = {
    USERS_KEY: 'TYC_MATH_RPG_USERS_V2',
    COUNTER_KEY: 'TYC_MATH_RPG_ID_COUNTER_V2',
    GUEST_COUNTER_KEY: 'TYC_MATH_RPG_GUEST_COUNTER_V2',
    SERVER_CONFIGS_KEY: 'TYC_MATH_RPG_SERVER_CONFIGS_V2',
    RESERVATIONS_KEY: 'TYC_MATH_RPG_RESERVATIONS_V2',
    SESSION_KEY: 'TYC_MATH_RPG_CURRENT_USER_V2',
    ADMIN_PWD: 'TYC1011',
    ACHIEVEMENTS_DEF,

    // ==========================================
    // ID 生成器：AAA11111 ~ ZZZ99999 (僅供正式註冊玩家使用)
    // 每組英文字母前綴包含 11111 ~ 99999 共 88,889 個數字
    // ==========================================
    indexToId(index) {
        const numbersPerPrefix = 88889; // 99999 - 11111 + 1
        const prefixIndex = Math.floor(index / numbersPerPrefix);
        const numOffset = (index % numbersPerPrefix) + 11111;

        const c1 = String.fromCharCode(65 + Math.floor(prefixIndex / (26 * 26)) % 26);
        const c2 = String.fromCharCode(65 + Math.floor(prefixIndex / 26) % 26);
        const c3 = String.fromCharCode(65 + (prefixIndex % 26));

        return `${c1}${c2}${c3}${numOffset}`;
    },

    idToIndex(id) {
        if (!/^[A-Z]{3}[0-9]{5}$/.test(id)) return -1;
        const p1 = id.charCodeAt(0) - 65;
        const p2 = id.charCodeAt(1) - 65;
        const p3 = id.charCodeAt(2) - 65;
        const prefixIndex = p1 * 26 * 26 + p2 * 26 + p3;
        const num = parseInt(id.slice(3), 10);
        if (num < 11111 || num > 99999) return -1;
        return prefixIndex * 88889 + (num - 11111);
    },

    // 取得當前全域流水號計數器
    getIdCounter() {
        try {
            const val = localStorage.getItem(this.COUNTER_KEY);
            return val ? parseInt(val, 10) : 0;
        } catch (e) {
            return 0;
        }
    },

    setIdCounter(val) {
        try {
            localStorage.setItem(this.COUNTER_KEY, String(val));
        } catch (e) {}
    },

    getReservations() {
        try {
            const data = localStorage.getItem(this.RESERVATIONS_KEY);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            return {};
        }
    },

    saveReservations(res) {
        try {
            localStorage.setItem(this.RESERVATIONS_KEY, JSON.stringify(res));
        } catch (e) {}
    },

    // 自動分配下一個正式玩家 ID (空缺遞補、未註冊前進、後按註冊為後一位)
    async allocateNextId() {
        // 先嘗試向中央伺服器請求原子分配，避免不同裝置同時分配到相同 ID
        try {
            if (typeof fetch !== 'undefined') {
                const res = await fetch('/api/allocate-id', { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.assignedId) {
                        if (typeof data.counter === 'number') {
                            this.setIdCounter(data.counter);
                        }
                        const reservations = this.getReservations();
                        reservations[data.assignedId] = Date.now();
                        this.saveReservations(reservations);
                        return data.assignedId;
                    }
                }
            }
        } catch (e) {}

        const users = this.getUsers();
        const reservations = this.getReservations();
        const now = Date.now();
        const EXPIRY_MS = 5 * 60 * 1000; // 5分鐘保留期

        // 清理過期保留
        for (const id in reservations) {
            if (now - reservations[id] > EXPIRY_MS) {
                delete reservations[id];
            }
        }

        const existingIndices = new Set();
        for (const uid in users) {
            const idx = this.idToIndex(uid);
            if (idx >= 0) existingIndices.add(idx);
        }

        const reservedIndices = new Set();
        for (const id in reservations) {
            const idx = this.idToIndex(id);
            if (idx >= 0) reservedIndices.add(idx);
        }

        let counter = this.getIdCounter();

        // 搜尋 0 ~ counter-1 範圍內的最小空缺 (未被註冊且未被保留)
        for (let i = 0; i < counter; i++) {
            if (!existingIndices.has(i) && !reservedIndices.has(i)) {
                const freeId = this.indexToId(i);
                reservations[freeId] = now;
                this.saveReservations(reservations);
                return freeId;
            }
        }

        // 若無空缺，使用當前 counter 並推進流水號
        const assignedId = this.indexToId(counter);
        this.setIdCounter(counter + 1);
        reservations[assignedId] = now;
        this.saveReservations(reservations);
        return assignedId;
    },

    // 取得下一個遊客編號 (向伺服器請求或本機遞增)
    async allocateGuestNum() {
        try {
            if (typeof fetch !== 'undefined') {
                const res = await fetch('/api/allocate-guest', { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.guestNum) {
                        if (typeof data.guestCounter === 'number') {
                            this.setGuestCounter(data.guestCounter);
                        }
                        return data.guestNum;
                    }
                }
            }
        } catch (e) {}
        const currentCounter = this.getGuestCounter();
        const guestNum = String(currentCounter).padStart(4, '0');
        const nextCounter = currentCounter >= 9999 ? 1 : currentCounter + 1;
        this.setGuestCounter(nextCounter);
        return guestNum;
    },

    // ==========================================
    // 遊客編號管理 (0001 ~ 9999，不給 ID)
    // ==========================================
    getGuestCounter() {
        try {
            const val = localStorage.getItem(this.GUEST_COUNTER_KEY);
            return val ? parseInt(val, 10) : 1;
        } catch (e) {
            return 1;
        }
    },

    setGuestCounter(val) {
        try {
            localStorage.setItem(this.GUEST_COUNTER_KEY, String(val));
        } catch (e) {}
    },

    // ==========================================
    // 伺服器各關題數設定 (預設 5 / 10 / 10，每關至少 5 題)
    // ==========================================
    getServerConfigs() {
        try {
            const val = localStorage.getItem(this.SERVER_CONFIGS_KEY);
            return val ? JSON.parse(val) : {};
        } catch (e) {
            return {};
        }
    },

    getServerConfig(serverId) {
        serverId = this.formatServerId(serverId);
        const configs = this.getServerConfigs();
        const cfg = configs[serverId] || {};
        return {
            l1Count: Math.max(5, parseInt(cfg.l1Count, 10) || 5),
            l2Count: Math.max(5, parseInt(cfg.l2Count, 10) || 10),
            l3Count: Math.max(5, parseInt(cfg.l3Count, 10) || 10)
        };
    },

    setServerConfig(serverId, cfg) {
        serverId = this.formatServerId(serverId);
        const configs = this.getServerConfigs();
        const confObj = {
            l1Count: Math.max(5, parseInt(cfg.l1Count, 10) || 5),
            l2Count: Math.max(5, parseInt(cfg.l2Count, 10) || 10),
            l3Count: Math.max(5, parseInt(cfg.l3Count, 10) || 10)
        };
        configs[serverId] = confObj;
        try {
            localStorage.setItem(this.SERVER_CONFIGS_KEY, JSON.stringify(configs));
        } catch (e) {}

        if (typeof fetch !== 'undefined') {
            fetch('/api/server-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverId, config: confObj })
            }).catch(() => {});
        }
    },

    // 規範化伺服器編號 (001~999)
    formatServerId(s) {
        let num = parseInt(s, 10);
        if (isNaN(num) || num < 1) num = 1;
        if (num > 999) num = 999;
        return String(num).padStart(3, '0');
    },

    // 補齊使用者預設欄位以避免舊資料或未初始化欄位報錯
    ensureUserDefaults(u) {
        if (!u || typeof u !== 'object') return u;
        if (!u.unlockedLevels) {
            u.unlockedLevels = { level1: true, level2: false, level3: false, boss: false };
        }
        if (!u.inventory) {
            u.inventory = { swordOfDoom: false, shieldOfRebirth: false };
        }
        if (!u.stats) {
            u.stats = {
                level1: { bestScore: 0, bestStars: 0, minTime: null, minErrors: null, retryCount: 0, clearCount: 0 },
                level2: { bestScore: 0, bestStars: 0, minTime: null, minErrors: null, retryCount: 0, clearCount: 0 },
                level3: { bestScore: 0, bestStars: 0, minTime: null, minErrors: null, retryCount: 0, clearCount: 0 },
                boss:   { bestScore: 0, bestStars: 0, minTime: null, minErrors: null, retryCount: 0, clearCount: 0 }
            };
        } else {
            ['level1', 'level2', 'level3', 'boss'].forEach(lk => {
                if (!u.stats[lk]) {
                    u.stats[lk] = { bestScore: 0, bestStars: 0, minTime: null, minErrors: null, retryCount: 0, clearCount: 0 };
                }
            });
        }
        if (!u.notebook) u.notebook = [];
        if (!u.achievements) u.achievements = { general: {}, hidden: {} };
        if (!u.achievements.general) u.achievements.general = {};
        if (!u.achievements.hidden) u.achievements.hidden = {};
        if (!u.latestRecords) u.latestRecords = {};
        if (!u.history) u.history = [];
        return u;
    },

    // 取得所有使用者清單
    getUsers() {
        try {
            const data = localStorage.getItem(this.USERS_KEY);
            const users = data ? JSON.parse(data) : {};
            for (const k in users) {
                users[k] = this.ensureUserDefaults(users[k]);
            }
            return users;
        } catch (e) {
            console.error('Failed to load users', e);
            return {};
        }
    },

    resolveUserKey(idOrKey) {
        if (!idOrKey) {
            const cur = this.getCurrentUser();
            if (cur) return cur.isGuest ? (cur.guestKey || cur.id) : cur.id;
            return '';
        }
        if (typeof idOrKey === 'object') {
            return idOrKey.isGuest ? (idOrKey.guestKey || idOrKey.id) : idOrKey.id;
        }
        const users = this.getUsers();
        if (users[idOrKey]) return idOrKey;
        for (const k in users) {
            if (users[k].id === idOrKey || users[k].guestKey === idOrKey) return k;
        }
        return idOrKey;
    },

    getUser(userId) {
        const key = this.resolveUserKey(userId);
        const users = this.getUsers();
        const user = users[key] || users[userId] || null;
        return this.ensureUserDefaults(user);
    },

    saveUsers(users) {
        try {
            localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
        } catch (e) {
            console.error('Failed to save users', e);
        }
        this.pushUsersToServer(users);
    },

    // 異步推播資料至後台中央伺服器，讓所有裝置 (電腦/手機/平板) 資料共用
    pushUsersToServer(users) {
        if (typeof fetch === 'undefined') return;
        try {
            fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    users: users || this.getUsers(),
                    counter: this.getIdCounter(),
                    guestCounter: this.getGuestCounter(),
                    serverConfigs: this.getServerConfigs()
                })
            }).catch(() => {});
        } catch (e) {}
    },

    // 異步向中央伺服器同步完整資料庫 (拉取所有裝置註冊的最新玩家名單)
    async syncWithServer() {
        if (typeof fetch === 'undefined') return this.getUsers();
        try {
            const localUsers = this.getUsers();
            const localCounter = this.getIdCounter();
            const localGuestCounter = this.getGuestCounter();
            const localConfigs = this.getServerConfigs();
            const localReservations = this.getReservations();

            const res = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    users: localUsers,
                    counter: localCounter,
                    guestCounter: localGuestCounter,
                    serverConfigs: localConfigs,
                    reservations: localReservations
                })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.success && data.users) {
                    localStorage.setItem(this.USERS_KEY, JSON.stringify(data.users));
                    if (typeof data.counter === 'number') localStorage.setItem(this.COUNTER_KEY, String(data.counter));
                    if (typeof data.guestCounter === 'number') localStorage.setItem(this.GUEST_COUNTER_KEY, String(data.guestCounter));
                    if (data.serverConfigs) localStorage.setItem(this.SERVER_CONFIGS_KEY, JSON.stringify(data.serverConfigs));
                    if (data.reservations) localStorage.setItem(this.RESERVATIONS_KEY, JSON.stringify(data.reservations));
                    return data.users;
                }
            }
        } catch (e) {
            // 離線模式或連線失敗時略過
        }
        return this.getUsers();
    },

    isValidUsername(name) {
        return typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= 5;
    },

    isValidPassword(pwd) {
        return /^[a-zA-Z0-9]{1,10}$/.test(pwd);
    },

    // 註冊玩家：自動配發 ID (AAA11111 ~ ZZZ99999)
    async register(serverId, username, password) {
        serverId = this.formatServerId(serverId);
        username = (username || '').trim();
        password = (password || '').trim();

        if (!this.isValidUsername(username)) {
            return { success: false, message: '用戶名必須在 5 個字以內！' };
        }
        if (!this.isValidPassword(password)) {
            return { success: false, message: '密碼必須為 10 位以內的英文或數字組合！' };
        }

        // 先與中央伺服器同步以獲取所有裝置註冊的名單
        await this.syncWithServer();

        const users = this.getUsers();

        // 同伺服器內檢查用戶名是否重複
        for (const uid in users) {
            if (users[uid].serverId === serverId && users[uid].username === username) {
                return { success: false, message: `伺服器 [${serverId}] 內已有同名勇者「${username}」，請換一個名字！` };
            }
        }

        // 先推進流水號 (支援中央伺服器原子配發)
        const assignedId = await this.allocateNextId();

        const newUser = {
            id: assignedId,
            serverId,
            username,
            password,
            isGuest: false,
            createdAt: new Date().toISOString(),
            stats: {
                level1: { bestScore: 0, bestStars: 0, minTime: null, minErrors: null, retryCount: 0, clearCount: 0 },
                level2: { bestScore: 0, bestStars: 0, minTime: null, minErrors: null, retryCount: 0, clearCount: 0 },
                level3: { bestScore: 0, bestStars: 0, minTime: null, minErrors: null, retryCount: 0, clearCount: 0 },
                boss:   { bestScore: 0, bestStars: 0, minTime: null, minErrors: null, retryCount: 0, clearCount: 0 }
            },
            latestRecords: {},
            history: [],
            notebook: [],
            achievements: {
                general: {},
                hidden: {}
            },
            unlockedLevels: {
                level1: true,
                level2: false,
                level3: false,
                boss: false
            },
            inventory: {
                swordOfDoom: false, // 傳說之劍
                shieldOfRebirth: false // 重生之盾
            }
        };

        users[assignedId] = newUser;
        this.saveUsers(users);
        this.setCurrentUser(newUser);

        // 確保立即更新中央資料庫
        if (typeof fetch !== 'undefined') {
            fetch('/api/user/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: newUser })
            }).catch(() => {});
        }

        return { success: true, user: newUser, assignedId };
    },

    // 登入驗證 (支援 ID+密碼 或 伺服器+用戶名+密碼)
    login(serverId, account, password) {
        serverId = this.formatServerId(serverId);
        account = (account || '').trim();
        password = (password || '').trim();
        const users = this.getUsers();

        // 1. 若輸入的是 ID (大寫)
        const idKey = account.toUpperCase();
        if (users[idKey] && users[idKey].password === password) {
            this.setCurrentUser(users[idKey]);
            return { success: true, user: users[idKey] };
        }

        // 2. 若輸入的是 伺服器 + 用戶名
        for (const uid in users) {
            const u = users[uid];
            if (u.serverId === serverId && u.username === account && u.password === password) {
                this.setCurrentUser(u);
                return { success: true, user: u };
            }
        }

        return { success: false, message: '伺服器、帳號(ID/用戶名)或密碼不正確，請重新確認！' };
    },

    // 遊客登入 (編號 0001 ~ 9999，不給 ID，不佔用 AAA11111)
    async loginAsGuest(serverId) {
        serverId = this.formatServerId(serverId);
        const guestNum = await this.allocateGuestNum();

        const guestKey = `GUEST_${guestNum}_${Date.now()}`;
        const guestUser = {
            id: '', // 不給 ID
            guestKey: guestKey,
            guestNum: guestNum,
            serverId,
            username: `遊客${guestNum}`,
            isGuest: true,
            createdAt: new Date().toISOString(),
            stats: {
                level1: { bestScore: 0, bestStars: 0, minTime: null, minErrors: null, retryCount: 0, clearCount: 0 },
                level2: { bestScore: 0, bestStars: 0, minTime: null, minErrors: null, retryCount: 0, clearCount: 0 },
                level3: { bestScore: 0, bestStars: 0, minTime: null, minErrors: null, retryCount: 0, clearCount: 0 },
                boss:   { bestScore: 0, bestStars: 0, minTime: null, minErrors: null, retryCount: 0, clearCount: 0 }
            },
            latestRecords: {},
            history: [],
            notebook: [],
            achievements: {
                general: {},
                hidden: {}
            },
            unlockedLevels: {
                level1: true,
                level2: false,
                level3: false,
                boss: false
            },
            inventory: {
                swordOfDoom: false,
                shieldOfRebirth: false
            }
        };

        const users = this.getUsers();
        users[guestKey] = guestUser;
        this.saveUsers(users);
        this.setCurrentUser(guestUser);

        if (typeof fetch !== 'undefined') {
            fetch('/api/user/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: guestUser })
            }).catch(() => {});
        }

        return guestUser;
    },


    setCurrentUser(user) {
        try {
            sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
        } catch (e) {}
    },

    getCurrentUser() {
        try {
            const data = sessionStorage.getItem(this.SESSION_KEY);
            if (!data) return null;
            const parsed = JSON.parse(data);
            const users = this.getUsers();
            const key = parsed.isGuest ? (parsed.guestKey || parsed.id) : parsed.id;
            return users[key] || parsed;
        } catch (e) {
            return null;
        }
    },

    logout() {
        try {
            sessionStorage.removeItem(this.SESSION_KEY);
        } catch (e) {}
    },

    // 累計重來次數
    recordRetry(userIdOrKey, levelKey) {
        const key = this.resolveUserKey(userIdOrKey);
        const users = this.getUsers();
        const u = users[key];
        if (!u || !u.stats[levelKey]) return;
        u.stats[levelKey].retryCount = (u.stats[levelKey].retryCount || 0) + 1;

        this.saveUsers(users);
        this.setCurrentUser(u);
    },

    // 紀錄錯題至筆記本 (在玩家未全部重新前可隨時查看)
    addNotebookEntry(userIdOrKey, entry) {
        const key = this.resolveUserKey(userIdOrKey);
        const users = this.getUsers();
        const u = users[key];
        if (!u) return;
        if (!u.notebook) u.notebook = [];
        u.notebook.push({
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            timestamp: new Date().toISOString(),
            levelKey: entry.levelKey || '',
            levelName: entry.levelName || '',
            expr: entry.expr || '',
            userChoice: entry.userChoice !== undefined ? String(entry.userChoice) : '',
            answer: entry.answer !== undefined ? String(entry.answer) : '',
            explanation: entry.explanation || '先乘除後加減、括號要先算！',
            solved: false
        });
        this.saveUsers(users);
        this.setCurrentUser(u);
    },

    // 更新錯題筆記狀態 (例如重新作答訂正完成)
    updateNotebookEntry(userIdOrKey, entryId, updates) {
        const key = this.resolveUserKey(userIdOrKey);
        const users = this.getUsers();
        const u = users[key];
        if (!u || !u.notebook) return false;
        const item = u.notebook.find(e => e.id === entryId);
        if (!item) return false;
        Object.assign(item, updates);
        this.saveUsers(users);
        this.setCurrentUser(u);
        return true;
    },

    // 檢查成就 🏅07 不放棄的精神 (擊敗魔龍後，將錯題重新完成。若沒錯題則自動得到)
    checkAchievement7(userIdOrKey) {
        const key = this.resolveUserKey(userIdOrKey);
        const users = this.getUsers();
        const u = users[key];
        if (!u) return false;
        const bossCleared = (u.stats?.boss?.clearCount || 0) > 0;
        if (!bossCleared) return false;

        // 若沒錯題則自動得到
        if (!u.notebook || u.notebook.length === 0) {
            return this.unlockAchievement(key, '🏅07');
        }

        // 若有錯題，檢查是否全部已訂正完成
        const allSolved = u.notebook.every(e => e.solved === true);
        if (allSolved) {
            return this.unlockAchievement(key, '🏅07');
        }
        return false;
    },

    // 檢查隱藏成就 🏆01 傳說級勇者 (全部關卡皆三星，獲得12個星時)
    checkHiddenAchievement1(userIdOrKey) {
        const key = this.resolveUserKey(userIdOrKey);
        const users = this.getUsers();
        const u = users[key];
        if (!u || !u.stats) return false;

        const totalStars = (u.stats.level1?.bestStars || 0) +
                           (u.stats.level2?.bestStars || 0) +
                           (u.stats.level3?.bestStars || 0) +
                           (u.stats.boss?.bestStars || 0);

        if (totalStars >= 12) {
            return this.unlockAchievement(key, '🏆01');
        }
        return false;
    },

    // 解鎖成就 (一般成就 🏅 在全部重新後會消失，隱藏成就 🏆 永久保留)
    unlockAchievement(userIdOrKey, code) {
        const def = ACHIEVEMENTS_DEF[code];
        if (!def) return { newlyUnlocked: false };

        const key = this.resolveUserKey(userIdOrKey);
        const users = this.getUsers();
        const u = users[key];
        if (!u) return { newlyUnlocked: false };

        if (!u.achievements) {
            u.achievements = { general: {}, hidden: {} };
        }
        if (!u.achievements.general) u.achievements.general = {};
        if (!u.achievements.hidden) u.achievements.hidden = {};

        const targetBucket = def.type === 'hidden' ? u.achievements.hidden : u.achievements.general;
        if (targetBucket[code]) {
            return { newlyUnlocked: false, achievement: def }; // 已解鎖過
        }

        targetBucket[code] = {
            unlockedAt: new Date().toISOString(),
            name: def.name,
            desc: def.desc
        };

        this.saveUsers(users);
        this.setCurrentUser(u);

        if (typeof window !== 'undefined' && window.dispatchEvent) {
            try {
                window.dispatchEvent(new CustomEvent('achievementUnlocked', { detail: def }));
            } catch (e) {}
        }

        return { newlyUnlocked: true, achievement: def };
    },

    // 玩家選擇「全部重新」開始冒險 (重置當前進度、一般成就、筆記本；但保留最佳記錄、歷史遊玩紀錄、隱藏成就)
    resetAdventureProgress(userIdOrKey) {
        const key = this.resolveUserKey(userIdOrKey);
        const users = this.getUsers();
        const u = users[key];
        if (!u) return null;

        // 重置當前地圖解鎖狀態
        u.unlockedLevels = {
            level1: true,
            level2: false,
            level3: false,
            boss: false
        };

        // 重置裝備
        u.inventory = {
            swordOfDoom: false,
            shieldOfRebirth: false
        };

        // 清空當前輪錯題筆記本
        u.notebook = [];

        // 依要求：隱藏成就保留，一般成就清空重置
        if (u.achievements) {
            u.achievements.general = {};
        }

        // 依要求：通關次數在擊敗魔龍算1次，要重生後才能再繼續加
        u.canGainClearCount = true;

        this.saveUsers(users);
        this.setCurrentUser(u);
        return u;
    },

    // 紀錄關卡成績與遊玩歷史
    recordLevelResult(userIdOrKey, levelKey, result) {
        const key = this.resolveUserKey(userIdOrKey);
        const users = this.getUsers();
        const u = users[key];
        if (!u) return;
        const s = u.stats[levelKey];
        if (!s) return;

        // 更新最佳紀錄
        if (result.score > (s.bestScore || 0)) {
            s.bestScore = result.score;
        }
        if (result.stars > (s.bestStars || 0)) {
            s.bestStars = result.stars;
        }
        if (result.passed) {
            if (s.minErrors === null || result.errorCount < s.minErrors) {
                s.minErrors = result.errorCount;
            }
            if (s.minTime === null || result.timeSeconds < s.minTime) {
                s.minTime = result.timeSeconds;
            }

            // 通關次數：擊敗魔龍算1次，要重生後才能再繼續加，無上限
            if (levelKey === 'boss') {
                if (u.canGainClearCount !== false) {
                    s.clearCount = (s.clearCount || 0) + 1;
                    u.canGainClearCount = false; // 本輪已計算，必須重生後才能再加！
                }

                // 記錄此輪總通關時間與錯題數（1~3關 + 魔龍關）
                const l1Time = u.latestRecords?.level1?.timeSeconds ?? u.stats?.level1?.minTime ?? 0;
                const l2Time = u.latestRecords?.level2?.timeSeconds ?? u.stats?.level2?.minTime ?? 0;
                const l3Time = u.latestRecords?.level3?.timeSeconds ?? u.stats?.level3?.minTime ?? 0;
                const bTime = result.timeSeconds || 0;
                const totalRunTime = l1Time + l2Time + l3Time + bTime;

                const l1Err = u.latestRecords?.level1?.errorCount ?? u.stats?.level1?.minErrors ?? 0;
                const l2Err = u.latestRecords?.level2?.errorCount ?? u.stats?.level2?.minErrors ?? 0;
                const l3Err = u.latestRecords?.level3?.errorCount ?? u.stats?.level3?.minErrors ?? 0;
                const bErr = result.errorCount || 0;
                const totalRunErrors = l1Err + l2Err + l3Err + bErr;

                if (!u.bestRun) {
                    u.bestRun = { totalTime: totalRunTime, totalErrors: totalRunErrors, timestamp: new Date().toISOString() };
                } else {
                    if (totalRunTime < u.bestRun.totalTime || (totalRunTime === u.bestRun.totalTime && totalRunErrors < u.bestRun.totalErrors)) {
                        u.bestRun = { totalTime: totalRunTime, totalErrors: totalRunErrors, timestamp: new Date().toISOString() };
                    }
                }
            } else {
                s.clearCount = (s.clearCount || 0) + 1;
            }

            if (levelKey === 'level1') {
                u.unlockedLevels.level2 = true;
            } else if (levelKey === 'level2' && result.passed) {
                u.unlockedLevels.level3 = true;
                u.inventory.swordOfDoom = true;
            } else if (levelKey === 'level3' && result.passed) {
                u.unlockedLevels.boss = true;
                u.inventory.shieldOfRebirth = true;
            } else if (levelKey === 'boss' && result.passed) {
                u.title = this.evaluateTitle(u, result.stars);
            }
        }

        // 紀錄最新一次紀錄
        if (!u.latestRecords) u.latestRecords = {};
        u.latestRecords[levelKey] = {
            score: result.score,
            stars: result.stars,
            timeSeconds: result.timeSeconds,
            errorCount: result.errorCount,
            passed: result.passed,
            timestamp: new Date().toISOString()
        };

        // 紀錄至歷史列表
        if (!u.history) u.history = [];
        const levelNames = {
            level1: '第1關 迷霧森林',
            level2: '第2關 魔法村莊',
            level3: '第3關 神殿祕寶',
            boss: '魔王關 討伐魔龍'
        };
        u.history.unshift({
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            timestamp: new Date().toISOString(),
            levelKey,
            levelName: levelNames[levelKey] || levelKey,
            score: result.score,
            stars: result.stars,
            timeSeconds: result.timeSeconds,
            errorCount: result.errorCount,
            passed: result.passed
        });

        // 先儲存基礎關卡成績與統計資料
        this.saveUsers(users);
        this.setCurrentUser(u);

        // 觸發成就解鎖 (unlockAchievement 會讀取並持久化成就資料)
        if (result.passed) {
            if (levelKey === 'level1') {
                this.unlockAchievement(key, '🏅01'); // 通過迷霧森林
                if (result.stars === 3) this.unlockAchievement(key, '🏅02'); // 迷霧森林3星
            } else if (levelKey === 'level2') {
                this.unlockAchievement(key, '🏅03'); // 通過魔法村莊 (獲得傳說之劍)
                if (result.stars === 3) this.unlockAchievement(key, '🏅04'); // 魔法村莊3星
            } else if (levelKey === 'level3') {
                this.unlockAchievement(key, '🏅05'); // 通過神殿秘寶 (獲得重生之盾)
                if (result.stars === 3) this.unlockAchievement(key, '🏅06'); // 神殿秘寶3星
            } else if (levelKey === 'boss') {
                this.unlockAchievement(key, '🏅08'); // 擊敗魔龍解救人質
                // 成就 🏅07: 擊敗魔龍後，將錯題重新完成 (若沒錯題則自動得到)
                this.checkAchievement7(key);
            }

            // 隱藏成就 🏆01: 全部關卡皆三星 (獲得 12 個星時)
            this.checkHiddenAchievement1(key);

            // 隱藏成就 🏆02: {第一關到第三關的通關時間總和} < {第一關到第三關的題數 * 5秒}
            const cfg = this.getServerConfig(u.serverId || '001');
            const totalReqQuestions = cfg.l1Count + cfg.l2Count + cfg.l3Count;
            const freshU = this.getUser(key) || u;
            const l1Time = freshU.stats.level1.minTime;
            const l2Time = freshU.stats.level2.minTime;
            const l3Time = freshU.stats.level3.minTime;
            if (l1Time !== null && l2Time !== null && l3Time !== null) {
                const sumTime = l1Time + l2Time + l3Time;
                if (sumTime < totalReqQuestions * 5) {
                    this.unlockAchievement(key, '🏆02');
                }
            }
        }
    },

    // 評定勇者專屬稱號 (3星通關：傳說級勇者；2星通關：稀有級勇者；1星通關：普通級勇者)
    evaluateTitle(user, overrideStars = null) {
        if (!user || !user.stats) return '王國見習勇者';
        const boss = user.stats.boss || {};
        const stars = overrideStars !== null ? overrideStars : (boss.bestStars || 0);
        const clearCount = boss.clearCount || 0;

        if (clearCount > 0 || overrideStars !== null) {
            if (stars >= 3) return '傳說級勇者';
            if (stars === 2) return '稀有級勇者';
            return '普通級勇者';
        }
        return '王國見習勇者';
    },

    // 取得使用者錯題統計 (錯題數、已訂正、未訂正)
    getUserNotebookStats(user) {
        if (!user || !user.notebook || !Array.isArray(user.notebook)) {
            return { total: 0, solved: 0, unsolved: 0 };
        }
        const total = user.notebook.length;
        const solved = user.notebook.filter(e => !!e.solved).length;
        const unsolved = total - solved;
        return { total, solved, unsolved };
    },

    // ==========================================
    // 排行榜資料計算
    // ==========================================

    // 排行榜1：通關次數（擊敗魔龍算1次；重生後才能再算下一次，無上限）
    // 以 user.stats.boss.clearCount 為準
    getLeaderboardClearCount(serverId = null) {
        const users = this.getUsers();
        const entries = [];
        for (const key in users) {
            const u = users[key];
            if (!u || u.isGuest) continue; // 遊客不列入
            if (!u.id) continue; // 無 ID 者不列入
            if (serverId && this.formatServerId(u.serverId || '001') !== this.formatServerId(serverId)) continue;
            const clearCount = u.stats?.boss?.clearCount || 0;
            if (clearCount <= 0) continue; // 從未通關不顯示
            entries.push({
                username: u.username || u.id,
                id: u.id,
                serverId: u.serverId || '001',
                value: clearCount
            });
        }
        // 降序排列 (次數越多名次越靠前)
        entries.sort((a, b) => b.value - a.value);

        // 加入名次（同通關次數並列）
        return this._assignRanks(entries, (a, b) => a.value === b.value);
    },

    // 排行榜2：通關時間（以最短的時間完成且錯題最少的名次靠前，同時間且同錯題數則並列）
    getLeaderboardClearTime(serverId = null) {
        const users = this.getUsers();
        const entries = [];
        for (const key in users) {
            const u = users[key];
            if (!u || u.isGuest) continue; // 遊客不列入
            if (!u.id) continue; // 無 ID 者不列入
            if (serverId && this.formatServerId(u.serverId || '001') !== this.formatServerId(serverId)) continue;
            // 必須擊敗魔龍通關才計入排行
            const boss = u.stats?.boss;
            if (!boss || (boss.clearCount || 0) <= 0) continue;

            let totalTime = 0;
            let totalErrors = 0;

            if (u.bestRun && typeof u.bestRun.totalTime === 'number') {
                totalTime = u.bestRun.totalTime;
                totalErrors = u.bestRun.totalErrors || 0;
            } else {
                const t1 = u.stats?.level1?.minTime;
                const t2 = u.stats?.level2?.minTime;
                const t3 = u.stats?.level3?.minTime;
                const tb = u.stats?.boss?.minTime;
                if (t1 === null || t1 === undefined || t2 === null || t2 === undefined || t3 === null || t3 === undefined) continue;
                totalTime = t1 + t2 + t3 + (tb || 0);
                const e1 = u.stats?.level1?.minErrors || 0;
                const e2 = u.stats?.level2?.minErrors || 0;
                const e3 = u.stats?.level3?.minErrors || 0;
                const eb = u.stats?.boss?.minErrors || 0;
                totalErrors = e1 + e2 + e3 + eb;
            }

            entries.push({
                username: u.username || u.id,
                id: u.id,
                serverId: u.serverId || '001',
                value: totalTime,
                errors: totalErrors
            });
        }
        // 最短的時間完成且錯題最少的名次靠前
        entries.sort((a, b) => {
            if (a.value !== b.value) return a.value - b.value;
            return a.errors - b.errors;
        });

        // 加入名次（同時間且同錯題數並列，比方2個第12名，下一個是第14名）
        return this._assignRanks(entries, (a, b) => a.value === b.value && a.errors === b.errors);
    },

    // 輔助：為已排序列表分配名次
    // 名次從1開始排到100，超過100的呈現未上榜。
    // 同時間且同錯題數（或同次數）並列，比方2個第12名之類的，但下一個就不是第13名，而是第14名。
    _assignRanks(sortedEntries, isEqual) {
        const result = [];
        let rank = 1;
        let count = 0;
        for (let i = 0; i < sortedEntries.length; i++) {
            count++;
            if (i === 0 || !isEqual(sortedEntries[i], sortedEntries[i - 1])) {
                rank = count;
            }
            const displayRank = rank <= 100 ? String(rank) : '未上榜';
            result.push({
                rank,
                displayRank,
                ...sortedEntries[i]
            });
        }
        return result;
    },

    verifyAdmin(password) {
        return password === this.ADMIN_PWD;
    },

    deleteUser(userIdOrKey) {
        const key = this.resolveUserKey(userIdOrKey);
        const users = this.getUsers();
        if (users[key]) {
            const uid = users[key].id;
            delete users[key];
            this.saveUsers(users);

            if (uid) {
                const reservations = this.getReservations();
                delete reservations[uid];
                this.saveReservations(reservations);
            }

            const cur = this.getCurrentUser();
            const curKey = cur ? (cur.isGuest ? (cur.guestKey || cur.id) : cur.id) : '';
            if (curKey === key) {
                this.logout();
            }

            if (typeof fetch !== 'undefined') {
                fetch('/api/user/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key, id: uid })
                }).catch(() => {});
            }

            return true;
        }
        return false;
    },

    // 清空所有資料，流水號重設回 0 (重新從 AAA11111 開始，遊客重設回 0001)
    clearAllData() {
        localStorage.removeItem(this.USERS_KEY);
        localStorage.removeItem(this.RESERVATIONS_KEY);
        this.setIdCounter(0);
        this.setGuestCounter(1);
        this.logout();

        if (typeof fetch !== 'undefined') {
            fetch('/api/admin/clear-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }).catch(() => {});
        }
    },

    // 匯出 CSV 格式字串 (帶有 UTF-8 BOM，Excel 直接開啟不亂碼)
    exportCsv(serverFilter = 'all') {
        const users = Object.values(this.getUsers());
        const filtered = (serverFilter === 'all') 
            ? users 
            : users.filter(u => u.serverId === serverFilter);

        const headers = [
            '伺服器',
            '勇者ID',
            '用戶名',
            '身分',
            '獲封稱號',
            '第1關最高分',
            '第1關星數',
            '第1關最少秒數',
            '第1關最少錯誤',
            '第1關重來次數',
            '第1關通關次數',
            '第2關最高分',
            '第2關星數',
            '第2關最少秒數',
            '第2關最少錯誤',
            '第2關重來次數',
            '第2關通關次數',
            '第3關最高分',
            '第3關星數',
            '第3關最少秒數',
            '第3關最少錯誤',
            '第3關重來次數',
            '第3關通關次數',
            'Boss關最高分',
            'Boss關星數',
            'Boss關最少秒數',
            'Boss關最少錯誤',
            'Boss關重來次數',
            'Boss關通關次數',
            '累計重來總數',
            '全破救出人質',
            '錯題總數',
            '已訂正數',
            '未訂正數',
            '建立時間'
        ];

        const rows = filtered.map(u => {
            const l1 = u.stats.level1;
            const l2 = u.stats.level2;
            const l3 = u.stats.level3;
            const b = u.stats.boss;
            const totalRetries = (l1.retryCount || 0) + (l2.retryCount || 0) + (l3.retryCount || 0) + (b.retryCount || 0);
            const isCompletedAll = (b.clearCount || 0) > 0 ? '是' : '否';
            const userTitle = u.title || this.evaluateTitle(u);
            const displayId = u.isGuest ? '無' : (u.id || '無');
            const nb = this.getUserNotebookStats(u);

            return [
                u.serverId || '001',
                displayId,
                `"${(u.username || '').replace(/"/g, '""')}"`,
                u.isGuest ? '遊客' : '正式勇者',
                `"${userTitle.replace(/"/g, '""')}"`,
                l1.bestScore || 0,
                l1.bestStars || 0,
                l1.minTime !== null ? l1.minTime : '',
                l1.minErrors !== null ? l1.minErrors : '',
                l1.retryCount || 0,
                l1.clearCount || 0,
                l2.bestScore || 0,
                l2.bestStars || 0,
                l2.minTime !== null ? l2.minTime : '',
                l2.minErrors !== null ? l2.minErrors : '',
                l2.retryCount || 0,
                l2.clearCount || 0,
                l3.bestScore || 0,
                l3.bestStars || 0,
                l3.minTime !== null ? l3.minTime : '',
                l3.minErrors !== null ? l3.minErrors : '',
                l3.retryCount || 0,
                l3.clearCount || 0,
                b.bestScore || 0,
                b.bestStars || 0,
                b.minTime !== null ? b.minTime : '',
                b.minErrors !== null ? b.minErrors : '',
                b.retryCount || 0,
                b.clearCount || 0,
                totalRetries,
                isCompletedAll,
                nb.total,
                nb.solved,
                nb.unsolved,
                u.createdAt || ''
            ].join(',');
        });

        // 加上 UTF-8 BOM \uFEFF
        return '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    }
};

if (typeof window !== 'undefined') {
    window.StorageManager = StorageManager;
    window.ACHIEVEMENTS_DEF = ACHIEVEMENTS_DEF;
    setTimeout(() => {
        StorageManager.syncWithServer().catch(() => {});
    }, 150);
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
}
