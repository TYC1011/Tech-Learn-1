// 遊戲核心邏輯控制器 (Game Controller) - 強化動態冒險版
// 支援：微軟正黑體、各關答對停頓1秒、自訂題數四捨五入計分、新星星規則、
//      5秒錯題檢討、背包(成就&錯題筆記本)、繼續冒險與全部重新、遊客0001~9999、電腦/平板/手機模式。

const GameApp = {
    currentUser: null,
    currentScreen: 'auth',
    currentDevice: 'tablet',
    timerId: null,
    timeLeft: 30,
    startTime: null,
    achievementToastTimer: null,
    l1MistakeTimer: null,

    // 關卡狀態
    l1State: null,
    l2State: null,
    l3State: null,
    bossState: null,

    async init() {
        this.setupDevice();
        this.bindGlobalEvents();
        this.setupAchievementListener();
        try {
            await StorageManager.syncWithServer();
        } catch (e) {}
        this.checkSession();
    },

    getUserKey() {
        if (!this.currentUser) return '';
        return this.currentUser.isGuest ? (this.currentUser.guestKey || this.currentUser.id) : this.currentUser.id;
    },

    // ==========================================
    // 裝置切換管理 (電腦、平板、手機，預設平板)
    // ==========================================
    setupDevice() {
        let savedDevice = 'tablet';
        try {
            savedDevice = localStorage.getItem('TYC_MATH_RPG_DEVICE') || 'tablet';
        } catch (e) {}
        this.setDevice(savedDevice);
    },

    setDevice(mode) {
        if (!['desktop', 'tablet', 'mobile'].includes(mode)) mode = 'tablet';
        this.currentDevice = mode;
        try {
            localStorage.setItem('TYC_MATH_RPG_DEVICE', mode);
        } catch (e) {}

        // 更新 body class
        document.body.classList.remove('device-desktop', 'device-tablet', 'device-mobile');
        document.body.classList.add(`device-${mode}`);

        // 更新頂部 navbar 切換按鈕
        document.querySelectorAll('.device-toggle-btn').forEach(btn => {
            if (btn.getAttribute('data-device') === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // 更新登入頁初始選擇卡片
        document.querySelectorAll('.device-select-card').forEach(btn => {
            if (btn.getAttribute('data-device') === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    },

    // 監聽成就解鎖事件並彈出通知
    setupAchievementListener() {
        window.addEventListener('achievementUnlocked', (e) => {
            if (e.detail) {
                this.showAchievementToast(e.detail);
            }
        });
    },

    showAchievementToast(def) {
        if (!def) return;
        soundCtrl.treasure();
        const popup = document.getElementById('achievement-popup');
        if (!popup) return;
        popup.classList.remove('hidden');

        // 建立專屬成就通知卡片並加進通知容器中，支援多個成就同時顯示堆疊
        const card = document.createElement('div');
        card.className = 'achievement-toast-card';
        const icon = def.type === 'hidden' ? '🏆' : '🏅';
        card.innerHTML = `
            <div class="achieve-toast-icon">${icon}</div>
            <div class="achieve-toast-content">
                <div class="toast-congrats">🎉 恭喜達成${def.type === 'hidden' ? '隱藏' : '冒險'}成就！</div>
                <div class="toast-name">${def.id} ${def.name}</div>
                <div class="toast-desc">${def.desc}</div>
            </div>
        `;

        popup.appendChild(card);

        // 每張成就卡片停留 4.5 秒後平滑淡出消除
        setTimeout(() => {
            card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            setTimeout(() => {
                card.remove();
                if (popup.children.length === 0) {
                    popup.classList.add('hidden');
                }
            }, 400);
        }, 4500);
    },

    bindGlobalEvents() {
        // 裝置切換監聽 (頂部與登入畫面)
        document.querySelectorAll('.device-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                soundCtrl.click();
                const d = btn.getAttribute('data-device');
                this.setDevice(d);
            });
        });

        document.querySelectorAll('.device-select-card').forEach(btn => {
            btn.addEventListener('click', () => {
                soundCtrl.click();
                const d = btn.getAttribute('data-device');
                this.setDevice(d);
            });
        });

        // 背包按鈕與開關
        const backpackBtn = document.getElementById('backpack-btn');
        if (backpackBtn) {
            backpackBtn.addEventListener('click', () => {
                soundCtrl.click();
                this.openBackpack();
            });
        }

        const backpackCloseBtn = document.getElementById('backpack-close-btn');
        if (backpackCloseBtn) {
            backpackCloseBtn.addEventListener('click', () => {
                soundCtrl.click();
                this.closeBackpack();
            });
        }

        // 背包分頁切換
        const tabAchieve = document.getElementById('btn-tab-achieve');
        const tabNotebook = document.getElementById('btn-tab-notebook');
        if (tabAchieve && tabNotebook) {
            tabAchieve.addEventListener('click', () => {
                soundCtrl.click();
                this.switchBackpackTab('achieve');
            });
            tabNotebook.addEventListener('click', () => {
                soundCtrl.click();
                this.switchBackpackTab('notebook');
            });
        }

        // 登入表單
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        // 註冊表單
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRegister();
            });
        }

        // 切換 登入 / 註冊 標籤
        const tabLogin = document.getElementById('tab-login');
        const tabRegister = document.getElementById('tab-register');
        if (tabLogin && tabRegister) {
            tabLogin.addEventListener('click', () => {
                this.switchAuthTab('login');
            });
            tabRegister.addEventListener('click', () => {
                this.switchAuthTab('register');
            });
        }

        // 遊客登入按鈕 (0001~9999，不給 ID)
        const guestBtn = document.getElementById('guest-btn');
        if (guestBtn) {
            guestBtn.addEventListener('click', async () => {
                soundCtrl.click();
                const serverId = document.getElementById('login-server-select')?.value || '001';
                const guest = await StorageManager.loginAsGuest(serverId);
                alert(`🎒 以遊客身分進入分區 [${guest.serverId}]，配發編號：【${guest.username}】！\n(遊客不發放正式 ID，仍可完整暢玩！)`);
                this.setCurrentUser(guest);
            });
        }

        // 登出按鈕 (回到初始畫面)
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                soundCtrl.click();
                StorageManager.logout();
                this.currentUser = null;

                // 重置登入註冊表單輸入欄位
                const loginAcc = document.getElementById('login-account');
                const loginPwd = document.getElementById('login-password');
                if (loginAcc) loginAcc.value = '';
                if (loginPwd) loginPwd.value = '';

                const regU = document.getElementById('reg-username');
                const regP = document.getElementById('reg-password');
                if (regU) regU.value = '';
                if (regP) regP.value = '';

                // 切換回登入分頁
                this.switchAuthTab('login');

                // 隱藏頂部勇者資訊徽章
                const userHeader = document.getElementById('user-header-info');
                if (userHeader) userHeader.classList.add('hidden');

                // 關閉背包與其他視窗
                this.closeBackpack();

                // 畫面滾動至頂部並切換到封面初始畫面
                window.scrollTo({ top: 0, behavior: 'instant' });
                this.showScreen('auth');
            });
        }

        // 音效開關按鈕
        const soundBtn = document.getElementById('sound-toggle-btn');
        if (soundBtn) {
            soundBtn.addEventListener('click', () => {
                const enabled = soundCtrl.toggle();
                soundBtn.innerText = enabled ? '🔊 音效: 開' : '🔇 音效: 關';
            });
        }

        // 重生按鈕 (Navbar)
        const rebirthBtn = document.getElementById('reset-adventure-btn');
        if (rebirthBtn) {
            rebirthBtn.addEventListener('click', () => {
                this.promptResetAllAdventure();
            });
        }

        // 下載電子獎狀按鈕
        const downloadCertBtn = document.getElementById('download-cert-btn');
        if (downloadCertBtn) {
            downloadCertBtn.addEventListener('click', () => {
                this.downloadCertificate();
            });
        }

        // 排行榜按鈕 (登入畫面)
        const lbOpenBtn = document.getElementById('leaderboard-open-btn');
        if (lbOpenBtn) {
            lbOpenBtn.addEventListener('click', () => {
                this.openLeaderboard();
            });
        }

        // 返回大地圖按鈕
        const backToMapBtns = document.querySelectorAll('.back-to-map-btn');
        backToMapBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                soundCtrl.click();
                this.stopTimer();
                this.showScreen('map');
            });
        });

        // 鍵盤快捷鍵
        window.addEventListener('keydown', (e) => {
            // Level 1: 迷霧森林選擇道路 A/B/C 或 1/2/3
            if (this.currentScreen === 'level1') {
                if (this.l1State && this.l1State.isAnswering) {
                    if (e.key === '1' || e.key === 'a' || e.key === 'A') {
                        this.triggerLevel1OptionByIndex(0);
                    } else if (e.key === '2' || e.key === 'b' || e.key === 'B') {
                        this.triggerLevel1OptionByIndex(1);
                    } else if (e.key === '3' || e.key === 'c' || e.key === 'C') {
                        this.triggerLevel1OptionByIndex(2);
                    }
                }
            }
            // Level 3: 神殿祕寶數字輸入與開門
            else if (this.currentScreen === 'level3') {
                if (e.key >= '0' && e.key <= '9') {
                    this.appendL3Input(e.key);
                } else if (e.key === 'Backspace') {
                    this.backspaceL3Input();
                } else if (e.key === 'Enter') {
                    this.submitL3Answer();
                }
            }
            // Boss 關: 快捷鍵 1 / 2 / 3 施展招式
            else if (this.currentScreen === 'boss') {
                if (this.bossState && !this.bossState.isAttacking && this.bossState.currentQ) {
                    if (e.key === '1' && this.bossState.currentQ.attacks[0]) {
                        this.handleBossAttack(this.bossState.currentQ.attacks[0]);
                    } else if (e.key === '2' && this.bossState.currentQ.attacks[1]) {
                        this.handleBossAttack(this.bossState.currentQ.attacks[1]);
                    } else if (e.key === '3' && this.bossState.currentQ.attacks[2]) {
                        this.handleBossAttack(this.bossState.currentQ.attacks[2]);
                    }
                }
            }
        });
    },

    checkSession() {
        const user = StorageManager.getCurrentUser();
        if (user) {
            this.setCurrentUser(user);
        } else {
            this.showScreen('auth');
        }
    },

    setCurrentUser(user) {
        this.currentUser = user;
        const nameBadge = document.getElementById('current-username-badge');
        if (nameBadge) {
            const idPart = user.isGuest ? '無 (遊客)' : user.id;
            nameBadge.innerText = `[${user.serverId || '001'}] ${user.username} (${idPart})`;
        }
        const userHeader = document.getElementById('user-header-info');
        if (userHeader) userHeader.classList.remove('hidden');
        this.showScreen('map');
    },

    switchAuthTab(tab) {
        const tabLogin = document.getElementById('tab-login');
        const tabRegister = document.getElementById('tab-register');
        const loginBox = document.getElementById('login-box');
        const registerBox = document.getElementById('register-box');
        if (tab === 'login') {
            tabLogin?.classList.add('active');
            tabRegister?.classList.remove('active');
            loginBox?.classList.remove('hidden');
            registerBox?.classList.add('hidden');
        } else {
            tabRegister?.classList.add('active');
            tabLogin?.classList.remove('active');
            registerBox?.classList.remove('hidden');
            loginBox?.classList.add('hidden');
        }
    },

    async handleLogin() {
        soundCtrl.click();
        const serverId = document.getElementById('login-server-select').value;
        const account = document.getElementById('login-account').value;
        const password = document.getElementById('login-password').value;

        let res = StorageManager.login(serverId, account, password);
        if (!res.success) {
            // 向中央伺服器同步其他裝置最新註冊的名單後再試一次
            await StorageManager.syncWithServer();
            res = StorageManager.login(serverId, account, password);
        }

        if (res.success) {
            this.setCurrentUser(res.user);
        } else {
            soundCtrl.wrong();
            alert(res.message);
        }
    },

    async handleRegister() {
        soundCtrl.click();
        const serverId = document.getElementById('reg-server-select').value;
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;

        const res = await StorageManager.register(serverId, username, password);
        if (res.success) {
            alert(`🎉 註冊成功！\n您的伺服器：[${res.user.serverId}]\n系統配發 ID：【${res.assignedId}】\n勇者名：${res.user.username}\n請牢記您的 ID 與密碼！`);
            this.setCurrentUser(res.user);
        } else {
            soundCtrl.wrong();
            alert(res.message);
        }
    },

    showScreen(screenId) {
        this.currentScreen = screenId;
        this.stopTimer();

        const screens = document.querySelectorAll('.game-screen');
        screens.forEach(s => s.classList.add('hidden'));

        const target = document.getElementById(`screen-${screenId}`);
        if (target) {
            target.classList.remove('hidden');
        }

        if (screenId === 'map') {
            this.renderMap();
        }
    },

    renderMap() {
        if (!this.currentUser) return;
        const user = StorageManager.getUser(this.getUserKey()) || this.currentUser;
        this.currentUser = user;

        const uL = user.unlockedLevels;
        const stats = user.stats;
        const cfg = StorageManager.getServerConfig(user.serverId || '001');

        const swordBadge = document.getElementById('map-badge-sword');
        const shieldBadge = document.getElementById('map-badge-shield');
        if (swordBadge) swordBadge.style.opacity = user.inventory.swordOfDoom ? '1' : '0.25';
        if (shieldBadge) shieldBadge.style.opacity = user.inventory.shieldOfRebirth ? '1' : '0.25';

        // 動態更新各卡片規則敘述
        const l1Rule = document.getElementById('card-rule-l1');
        if (l1Rule) l1Rule.innerText = `共 ${cfg.l1Count} 題需全對 ｜ 0重來3星, 5次內2星, 5次以上1星`;

        const l2Rule = document.getElementById('card-rule-l2');
        const l2Req = Math.ceil(cfg.l2Count * 4 / 5);
        if (l2Rule) l2Rule.innerText = `共 ${cfg.l2Count} 題需對 ${l2Req} 題 ｜ 全對3星, 錯1題2星, 錯2題1星 ｜ 獲【傳說之劍】`;

        const l3Rule = document.getElementById('card-rule-l3');
        const l3Req = Math.ceil(cfg.l3Count * 4 / 5);
        if (l3Rule) l3Rule.innerText = `共 ${cfg.l3Count} 題需對 ${l3Req} 題 ｜ 全對3星, 錯1題2星, 錯2題1星 ｜ 獲【重生之盾】`;

        // Level 1
        const l1Card = document.getElementById('card-level1');
        if (l1Card) {
            l1Card.className = 'level-card unlocked';
            document.getElementById('l1-stars').innerHTML = this.renderStarsHtml(stats.level1.bestStars);
            document.getElementById('l1-status').innerText = stats.level1.clearCount > 0 ? `已通關 (最佳分: ${stats.level1.bestScore})` : '進行中';
        }

        // Level 2
        const l2Card = document.getElementById('card-level2');
        if (l2Card) {
            if (uL.level2) {
                l2Card.className = 'level-card unlocked';
                document.getElementById('l2-lock-overlay').classList.add('hidden');
                document.getElementById('l2-stars').innerHTML = this.renderStarsHtml(stats.level2.bestStars);
                document.getElementById('l2-status').innerText = stats.level2.clearCount > 0 ? `已通關 (${stats.level2.bestScore}分)` : `可挑戰 (需對 ${l2Req} 題)`;
            } else {
                l2Card.className = 'level-card locked';
                document.getElementById('l2-lock-overlay').classList.remove('hidden');
                document.getElementById('l2-stars').innerHTML = '☆☆☆';
                document.getElementById('l2-status').innerText = '未解鎖 (需先通過第1關)';
            }
        }

        // Level 3
        const l3Card = document.getElementById('card-level3');
        if (l3Card) {
            if (uL.level3) {
                l3Card.className = 'level-card unlocked';
                document.getElementById('l3-lock-overlay').classList.add('hidden');
                document.getElementById('l3-stars').innerHTML = this.renderStarsHtml(stats.level3.bestStars);
                document.getElementById('l3-status').innerText = stats.level3.clearCount > 0 ? `已通關 (${stats.level3.bestScore}分)` : `可挑戰 (需對 ${l3Req} 題)`;
            } else {
                l3Card.className = 'level-card locked';
                document.getElementById('l3-lock-overlay').classList.remove('hidden');
                document.getElementById('l3-stars').innerHTML = '☆☆☆';
                document.getElementById('l3-status').innerText = '未解鎖 (需獲得傳說之劍)';
            }
        }

        // Boss
        const bossCard = document.getElementById('card-boss');
        if (bossCard) {
            if (uL.boss) {
                bossCard.className = 'level-card unlocked boss-card';
                document.getElementById('boss-lock-overlay').classList.add('hidden');
                document.getElementById('boss-stars').innerHTML = this.renderStarsHtml(stats.boss.bestStars);
                document.getElementById('boss-status').innerText = stats.boss.clearCount > 0 ? `已討伐 (${stats.boss.bestScore}分)` : '魔龍決戰！(勇者3命)';
            } else {
                bossCard.className = 'level-card locked boss-card';
                document.getElementById('boss-lock-overlay').classList.remove('hidden');
                document.getElementById('boss-stars').innerHTML = '☆☆☆';
                document.getElementById('boss-status').innerText = '未解鎖 (需獲得重生之盾)';
            }
        }
    },

    continueAdventure() {
        soundCtrl.click();
        const user = StorageManager.getUser(this.getUserKey()) || this.currentUser;
        if (!user) return;
        const uL = user.unlockedLevels;
        if (uL.boss) {
            this.startBoss();
        } else if (uL.level3) {
            this.startLevel3();
        } else if (uL.level2) {
            this.startLevel2();
        } else {
            this.startLevel1();
        }
    },

    promptResetAllAdventure() {
        soundCtrl.click();
        const modal = document.getElementById('rebirth-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    },

    closeRebirthModal() {
        soundCtrl.click();
        const modal = document.getElementById('rebirth-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },

    confirmResetAdventure() {
        soundCtrl.click();
        this.closeRebirthModal();
        StorageManager.resetAdventureProgress(this.getUserKey());
        this.currentUser = StorageManager.getUser(this.getUserKey());
        this.renderMap();
        this.showPopupModal(
            '🔄 重新出發！',
            `
            <div style="font-size: 42px; margin-bottom: 8px;">🔄🏃‍♂️🎒</div>
            <div style="font-size: 16px; color: #10b981; font-weight: bold; margin-bottom: 8px;">冒險進度已重置！</div>
            <div style="color: #cbd5e1; font-size: 14px;">請從第 1 關【迷霧森林】重新啟程，向著王國最強勇者再次進發！</div>
            `,
            '踏上征途 ➔',
            () => {
                this.startLevel1();
            }
        );
    },

    // ==========================================
    // 背包系統 (冒險成就 & 錯題筆記本)
    // ==========================================
    openBackpack() {
        const modal = document.getElementById('backpack-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        this.renderAchievements();
        this.renderNotebook();
    },

    closeBackpack() {
        const modal = document.getElementById('backpack-modal');
        if (modal) modal.classList.add('hidden');
    },

    switchBackpackTab(tab) {
        const tabAchieve = document.getElementById('btn-tab-achieve');
        const tabNotebook = document.getElementById('btn-tab-notebook');
        const panelAchieve = document.getElementById('panel-achievements');
        const panelNotebook = document.getElementById('panel-notebook');

        if (tab === 'achieve') {
            tabAchieve.classList.add('active');
            tabNotebook.classList.remove('active');
            panelAchieve.classList.remove('hidden');
            panelNotebook.classList.add('hidden');
            this.renderAchievements();
        } else {
            tabNotebook.classList.add('active');
            tabAchieve.classList.remove('active');
            panelNotebook.classList.remove('hidden');
            panelAchieve.classList.add('hidden');
            this.renderNotebook();
        }
    },

    renderAchievements() {
        if (this.getUserKey()) {
            StorageManager.checkHiddenAchievement1(this.getUserKey());
            StorageManager.checkAchievement7(this.getUserKey());
        }
        const user = StorageManager.getUser(this.getUserKey()) || this.currentUser;
        if (!user) return;
        const genContainer = document.getElementById('general-achievements-list');
        const hidContainer = document.getElementById('hidden-achievements-list');
        if (!genContainer || !hidContainer) return;

        genContainer.innerHTML = '';
        hidContainer.innerHTML = '';

        const defs = StorageManager.ACHIEVEMENTS_DEF;
        const userGen = user.achievements?.general || {};
        const userHid = user.achievements?.hidden || {};

        for (const code in defs) {
            const def = defs[code];
            const isHidden = def.type === 'hidden';
            const unlockedData = isHidden ? userHid[code] : userGen[code];
            const isUnlocked = !!unlockedData;

            const card = document.createElement('div');

            if (isUnlocked) {
                // 已解鎖成就：顯示圖示、名稱、達成條件說明與解鎖日期
                card.className = 'achieve-card unlocked';
                const timeStr = unlockedData.unlockedAt ? new Date(unlockedData.unlockedAt).toLocaleDateString() : '';
                card.innerHTML = `
                    <div class="achieve-card-header">
                        <span class="achieve-card-icon">${isHidden ? '🏆' : '🏅'}</span>
                        <div class="achieve-card-code">${code}</div>
                    </div>
                    <div class="achieve-card-info">
                        <div class="achieve-card-title">${def.name}</div>
                        <div class="achieve-card-desc">${def.desc}</div>
                        <div class="achieve-card-time">✅ 已解鎖 ${timeStr}</div>
                    </div>
                `;
            } else {
                if (isHidden) {
                    // 隱藏成就未得到前：只保留鎖住符號，🏆 及編號；隱藏成就則不顯示達成條件
                    card.className = 'achieve-card locked achieve-hidden-locked';
                    card.innerHTML = `
                        <div class="achieve-locked-simple">
                            <span class="achieve-lock-icon">🔒</span>
                            <span class="achieve-locked-code">${code}</span>
                        </div>
                    `;
                } else {
                    // 一般成就未得到前：只保留鎖住符號，🏅 及編號；可點擊說明達到條件
                    card.className = 'achieve-card locked achieve-clickable';
                    card.setAttribute('title', '點擊查看達成條件');
                    card.innerHTML = `
                        <div class="achieve-locked-simple">
                            <span class="achieve-lock-icon">🔒</span>
                            <span class="achieve-locked-code">${code}</span>
                            <span class="achieve-hint-pill">❓ 點擊看條件</span>
                        </div>
                    `;
                    card.onclick = () => this.showAchievementHint(code);
                }
            }

            if (isHidden) {
                hidContainer.appendChild(card);
            } else {
                genContainer.appendChild(card);
            }
        }
    },

    showAchievementHint(code) {
        const def = StorageManager.ACHIEVEMENTS_DEF[code];
        if (!def || def.type === 'hidden') return;
        soundCtrl.click();
        this.showPopupModal(
            `🏅 成就達成條件提示`,
            `
            <div style="font-size: 40px; margin-bottom: 8px;">📜🏅</div>
            <div style="font-size: 18px; font-weight: bold; color: #fbbf24; margin-bottom: 8px;">【${code} ${def.name}】</div>
            <div style="font-size: 14px; color: #cbd5e1; background: #1c152d; border: 2px dashed #6366f1; border-radius: 8px; padding: 14px; line-height: 1.6;">
                <strong style="color: #38bdf8;">達成條件說明：</strong><br>${def.desc}
            </div>
            `,
            '知道了',
            null
        );
    },

    renderNotebook() {
        const user = StorageManager.getUser(this.getUserKey()) || this.currentUser;
        if (!user) return;
        const listContainer = document.getElementById('notebook-list');
        if (!listContainer) return;

        const entries = user.notebook || [];
        if (entries.length === 0) {
            listContainer.innerHTML = `
                <div class="notebook-empty">
                    <div class="empty-icon" style="font-size: 40px; text-align: center; margin: 12px 0;">📖✨</div>
                    <div class="empty-text" style="text-align: center; color: #a5b4fc; font-size: 14px;">太厲害了！目前沒有任何錯題紀錄！<br>保持全對，你就是王國的算術大師！</div>
                </div>
            `;
            return;
        }

        let html = '';
        entries.slice().reverse().forEach((entry) => {
            const isSolved = !!entry.solved;
            const timeStr = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';
            const statusClass = isSolved ? 'solved' : 'unsolved';
            const statusBadge = isSolved
                ? `<span class="nb-status-badge badge-solved">✅ 已訂正完成</span>`
                : `<span class="nb-status-badge badge-unsolved">❌ 尚未訂正</span>`;

            html += `
                <div class="notebook-card ${statusClass}" id="nb-card-${entry.id}">
                    <div class="notebook-card-header">
                        <span>🏷️ ${entry.levelName || entry.levelKey || '冒險關卡'} ｜ ⏰ ${timeStr}</span>
                        ${statusBadge}
                    </div>
                    <div class="notebook-expr">題目：${entry.expr} ＝ ？</div>
                    <div class="notebook-detail-row">
                        <div>你的選擇：<strong style="color: #f87171;">${entry.userChoice || '超時未選'}</strong></div>
                        ${isSolved ? `<div>正確答案：<strong style="color: #34d399;">${entry.answer}</strong></div>` : ''}
                    </div>
                    <div class="notebook-tip">
                        💡 觀念提醒：${entry.explanation || '先乘除後加減、括號要先算！'}
                    </div>
                    <div class="notebook-retry-action-row">
                        <div class="nb-retry-label">${isSolved ? '🎉 本題已成功訂正！可再次驗證：' : '✏️ 重新挑戰（計算正確後送出）：'}</div>
                        <div class="nb-input-group">
                            <input type="number" id="nb-input-${entry.id}" class="pixel-input nb-retry-input" placeholder="輸入答案" value="${isSolved ? entry.answer : ''}" onkeydown="if(event.key==='Enter') GameApp.retryNotebookEntry('${entry.id}')">
                            <button class="pixel-btn pixel-btn-primary nb-retry-submit-btn" onclick="GameApp.retryNotebookEntry('${entry.id}')">${isSolved ? '重新驗證' : '驗證答案'}</button>
                        </div>
                        <div id="nb-feedback-${entry.id}" class="nb-feedback-msg"></div>
                    </div>
                </div>
            `;
        });
        listContainer.innerHTML = html;
    },

    retryNotebookEntry(entryId) {
        soundCtrl.click();
        const user = StorageManager.getUser(this.getUserKey()) || this.currentUser;
        if (!user || !user.notebook) return;
        const entry = user.notebook.find(item => item.id === entryId);
        if (!entry) return;

        const inputEl = document.getElementById(`nb-input-${entryId}`);
        if (!inputEl) return;
        const rawVal = inputEl.value.trim();
        if (rawVal === '') {
            const feedbackEl = document.getElementById(`nb-feedback-${entryId}`);
            if (feedbackEl) feedbackEl.innerHTML = `<span style="color:#f87171;">⚠️ 請輸入數字答案！</span>`;
            return;
        }

        const userVal = parseInt(rawVal, 10);
        if (isNaN(userVal)) {
            const feedbackEl = document.getElementById(`nb-feedback-${entryId}`);
            if (feedbackEl) feedbackEl.innerHTML = `<span style="color:#f87171;">⚠️ 請輸入有效整數答案！</span>`;
            return;
        }

        let expectedAnswer = null;
        if (entry.answer !== undefined && entry.answer !== null && !isNaN(parseInt(entry.answer, 10))) {
            expectedAnswer = parseInt(entry.answer, 10);
        } else {
            expectedAnswer = MathEngine.evalMathExpr(entry.expr);
        }

        if (userVal === expectedAnswer) {
            soundCtrl.correct();
            StorageManager.updateNotebookEntry(this.getUserKey(), entryId, {
                solved: true,
                solvedAt: Date.now()
            });
            this.currentUser = StorageManager.getUser(this.getUserKey());
            // 檢查成就 🏅07 不放棄的精神 (擊敗魔龍後，將錯題重新完成)
            StorageManager.checkAchievement7(this.getUserKey());
            this.renderNotebook();
            this.renderAchievements();
        } else {
            soundCtrl.wrong();
            const feedbackEl = document.getElementById(`nb-feedback-${entryId}`);
            if (feedbackEl) {
                feedbackEl.innerHTML = `<span style="color:#f87171;">❌ 答案 ${userVal} 不正確，請再算一次！(提示：先乘除後加減、括號先算)</span>`;
            }
        }
    },

    renderStarsHtml(stars) {
        if (!stars || stars === 0) return '☆☆☆';
        return `<span style="color:#fbbf24;">${'★'.repeat(stars)}</span>${'☆'.repeat(3 - stars)}`;
    },

    startTimer(seconds, onTick, onTimeUp) {
        this.stopTimer();
        this.timeLeft = seconds;
        onTick(this.timeLeft);

        this.timerId = setInterval(() => {
            this.timeLeft--;
            onTick(this.timeLeft);
            if (this.timeLeft <= 0) {
                this.stopTimer();
                onTimeUp();
            }
        }, 1000);
    },

    stopTimer() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    },

    // ==========================================
    // Level 1: 迷霧森林 (動態奔跑、分岔路、答對停頓1秒、錯題5秒檢討)
    // ==========================================
    startLevel1() {
        const cfg = StorageManager.getServerConfig(this.currentUser?.serverId || '001');
        const qCount = cfg.l1Count || 5;

        this.l1State = {
            totalQuestions: qCount,
            currentIndex: 0,
            errorCount: 0,
            startTime: Date.now(),
            questions: [],
            isAnswering: false
        };
        for (let i = 0; i < qCount; i++) {
            this.l1State.questions.push(MathEngine.generateLevel1Question());
        }
        this.showScreen('level1');
        this.resetL1HeroPosition();
        this.runLevel1Question();
    },

    resetL1HeroPosition() {
        const hero = document.getElementById('l1-hero-sprite');
        const bear = document.getElementById('l1-bear-sprite');
        const obstacle = document.getElementById('l1-obstacle');
        const passNotice = document.getElementById('l1-pass-notice');

        if (hero) hero.className = 'hero-char-box hero-running';
        if (bear) bear.className = 'bear-char-box bear-running';
        if (obstacle) obstacle.classList.add('hidden');
        if (passNotice) passNotice.classList.add('hidden');
    },

    runLevel1Question() {
        const state = this.l1State;
        state.isAnswering = true;
        const qIndex = state.currentIndex;
        const qData = state.questions[qIndex];

        document.getElementById('l1-progress-text').innerText = `迷霧森林：第 ${qIndex + 1} / ${state.totalQuestions} 題 (錯一題則重來)`;
        // 題目顯示在背景舞台下方
        document.getElementById('l1-question-expr').innerText = qData.expr + ' ＝ ？';

        this.resetL1HeroPosition();

        // 道路選項統一顯示在下方答題面板
        const optionsContainer = document.getElementById('l1-options');
        if (optionsContainer) {
            optionsContainer.innerHTML = '';
            const letters = ['A', 'B', 'C'];

            qData.options.forEach((opt, idx) => {
                const btn = document.createElement('button');
                btn.className = 'pixel-btn l1-opt-btn';
                btn.innerHTML = `<span class="opt-label">🛣️ ${letters[idx]} 路 [按 ${idx+1}]</span> ${opt.text}`;
                btn.onclick = () => this.handleLevel1Choice(letters[idx], opt.isCorrect, opt.text, qData.answer, qData);
                optionsContainer.appendChild(btn);
            });
        }

        // 若有舊版告示牌元素則安全隱藏
        const signpost = document.getElementById('l1-signpost');
        if (signpost) signpost.classList.add('hidden');

        // 30 秒倒數計時
        const timerBar = document.getElementById('l1-timer-bar');
        const timerText = document.getElementById('l1-timer-text');
        this.startTimer(
            30,
            (sec) => {
                timerText.innerText = `${sec} 秒`;
                timerBar.style.width = `${(sec / 30) * 100}%`;
                timerBar.style.backgroundColor = sec <= 5 ? '#ef4444' : '#10b981';
            },
            () => {
                this.handleLevel1Fail(qData, '超時未選', qData.answer);
            }
        );
    },

    triggerLevel1OptionByIndex(idx) {
        if (!this.l1State || !this.l1State.isAnswering) return;
        const qData = this.l1State.questions[this.l1State.currentIndex];
        if (!qData || !qData.options[idx]) return;
        const letters = ['A', 'B', 'C'];
        const opt = qData.options[idx];
        this.handleLevel1Choice(letters[idx], opt.isCorrect, opt.text, qData.answer, qData);
    },

    handleLevel1Choice(roadLetter, isCorrect, chosenVal, correctAns, qData) {
        if (!this.l1State.isAnswering) return;
        this.l1State.isAnswering = false;
        this.stopTimer();

        // 禁用按鈕防止重複點擊
        const optBtns = document.querySelectorAll('.l1-opt-btn');
        optBtns.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.7';
            btn.style.cursor = 'default';
        });

        const signpost = document.getElementById('l1-signpost');
        if (signpost) signpost.classList.add('hidden');

        const hero = document.getElementById('l1-hero-sprite');
        const bear = document.getElementById('l1-bear-sprite');
        const obstacle = document.getElementById('l1-obstacle');

        hero.className = `hero-char-box hero-running go-road-${roadLetter}`;

        if (isCorrect) {
            // 答對：順暢穿越道路！停頓 1 秒鐘以確保能正確到下一題
            soundCtrl.correct();
            hero.classList.add('hero-road-passed');

            const passNotice = document.getElementById('l1-pass-notice');
            if (passNotice) {
                passNotice.classList.remove('hidden');
                passNotice.innerHTML = `🌟 選擇正確！成功通過 ${roadLetter} 路線！前往下一題...`;
            }

            // 嚴格停頓 1 秒鐘 (1000ms)
            setTimeout(() => {
                if (passNotice) passNotice.classList.add('hidden');
                this.l1State.currentIndex++;
                if (this.l1State.currentIndex >= this.l1State.totalQuestions) {
                    this.finishLevel1Success();
                } else {
                    this.runLevel1Question();
                }
            }, 1000);
        } else {
            // 答錯：遇到死路，被卡住，黑熊追上攻擊！
            setTimeout(() => {
                soundCtrl.crack();
                obstacle.className = `forest-dead-end dead-end-${roadLetter}`;
                obstacle.innerText = '🪨 死路';
                obstacle.classList.remove('hidden');
                hero.className = `hero-char-box hero-stuck go-road-${roadLetter}`;

                // 黑熊撲向勇者
                setTimeout(() => {
                    soundCtrl.wrong();
                    bear.className = `bear-char-box bear-attack-jump go-road-${roadLetter}`;

                    setTimeout(() => {
                        this.handleLevel1Fail(qData, chosenVal, correctAns);
                    }, 500);
                }, 400);
            }, 400);
        }
    },

    // 第一關回答錯誤：死路、以題目、你的選擇、正確答案檢討，無需等五秒，按鈕為「再次挑戰」
    handleLevel1Fail(qData, chosenVal, correctAns) {
        soundCtrl.wrong();
        this.stopTimer();
        this.l1State.errorCount++;

        const userKey = this.getUserKey();
        StorageManager.recordRetry(userKey, 'level1');

        // 記錄到筆記本
        StorageManager.addNotebookEntry(userKey, {
            levelKey: 'level1',
            levelName: '第1關 迷霧森林',
            expr: qData.expr,
            userChoice: chosenVal,
            answer: correctAns,
            explanation: '先乘除後加減、括號要先算！'
        });

        const htmlContent = `
            <div style="font-size: 40px; margin-bottom: 8px;">🐻💥🪨</div>
            <div style="color: #ef4444; font-size: 16px; font-weight: bold; margin-bottom: 10px;">遇到死路被黑熊追上了！請檢討題目：</div>
            <div class="mistake-info-box">
                <div class="mistake-line">題目：<strong>${qData.expr} ＝ ？</strong></div>
                <div class="mistake-line">你的選擇：<strong style="color: #f87171;">${chosenVal}</strong></div>
                <div class="mistake-line">正確答案：<strong style="color: #34d399;">${correctAns}</strong></div>
            </div>
            <div style="color: #fcd34d; font-size: 13px; margin-top: 6px;">(迷霧森林規則：必須連續全對才能逃出迷霧森林！)</div>
        `;

        this.showPopupModal(
            '🌲 逃脫失敗！遭遇黑熊！',
            htmlContent,
            '🔄 再次挑戰',
            () => {
                this.startLevel1();
            },
            0 // 答錯時不用等五秒
        );
    },

    finishLevel1Success() {
        soundCtrl.victory();
        const durationSec = Math.round((Date.now() - this.l1State.startTime) / 1000);
        const user = StorageManager.getUser(this.getUserKey()) || this.currentUser;
        const retries = (user?.stats?.level1?.retryCount || 0);

        // 星星規則：重來0次3星；重來5以內2星；重來5次以上1星
        let stars = 1;
        if (retries === 0) stars = 3;
        else if (retries <= 5) stars = 2;
        else stars = 1;

        StorageManager.recordLevelResult(this.getUserKey(), 'level1', {
            score: 100,
            stars,
            timeSeconds: durationSec,
            errorCount: retries,
            passed: true
        });

        this.showPopupModal(
            '🎉 成功逃離迷霧森林！',
            `
            <div style="font-size: 48px; margin-bottom: 8px;">🏃‍♂️💨💨🌲</div>
            <div style="font-size: 30px; color: #fbbf24; margin-bottom: 6px;">${this.renderStarsHtml(stars)}</div>
            <div style="font-size: 18px; color: #10b981; font-weight: bold; margin-bottom: 10px;">
                太厲害了！勇者甩開黑熊，順利抵達魔法村莊！
            </div>
            <div style="font-size: 14px; color: #cbd5e1; margin-bottom: 8px;">
                耗時：${durationSec} 秒 ｜ 答題：${this.l1State.totalQuestions}/${this.l1State.totalQuestions} 全對 ｜ 重來次數：${retries} 次
            </div>
            <div style="color: #fbbf24; font-size: 14px;">
                【魔法村莊】已經解鎖！請前往村莊為【傳說之劍】進行附魔！
            </div>
            `,
            '前往魔法村莊 ➔',
            () => {
                this.startLevel2();
            }
        );
    },

    // ==========================================
    // Level 2: 魔法村莊 (附魔與融合，答對閃黃光，答錯閃紅光，停頓1秒)
    // ==========================================
    startLevel2() {
        const cfg = StorageManager.getServerConfig(this.currentUser?.serverId || '001');
        const totalQ = cfg.l2Count || 10;
        const passReq = Math.ceil(totalQ * 4 / 5);

        this.l2State = {
            totalQuestions: totalQ,
            passThreshold: passReq,
            currentIndex: 0,
            correctCount: 0,
            cracks: 0,
            startTime: Date.now(),
            currentTokens: [],
            selectedTokenIds: [],
            currentInitialExpr: ''
        };
        this.showScreen('level2');
        this.runLevel2Question();
    },

    runLevel2Question() {
        const state = this.l2State;
        const qIndex = state.currentIndex;
        const qObj = MathEngine.generateLevel2Question();
        state.currentTokens = qObj.initialTokens;
        state.selectedTokenIds = [];
        state.currentInitialExpr = qObj.initialTokens.map(t => t.val).join(' ');

        document.getElementById('l2-progress-text').innerText = `魔法附魔：第 ${qIndex + 1} / ${state.totalQuestions} 道鎖 (需對 ${state.passThreshold} 題過關)`;
        this.updateL2DurabilityUi();
        this.renderL2LocksTrack();
        this.renderL2Expression();

        const swordEl = document.getElementById('l2-altar-sword');
        if (swordEl) swordEl.className = 'altar-sword-sprite';

        // 30 秒計時
        const timerBar = document.getElementById('l2-timer-bar');
        const timerText = document.getElementById('l2-timer-text');
        this.startTimer(
            30,
            (sec) => {
                timerText.innerText = `${sec} 秒`;
                timerBar.style.width = `${(sec / 30) * 100}%`;
                timerBar.style.backgroundColor = sec <= 5 ? '#ef4444' : '#3b82f6';
            },
            () => {
                this.handleLevel2Mistake('超過 30 秒未融合，神劍承受不住魔法而破裂！', '先乘除後加減、括號要先算');
            }
        );
    },

    updateL2DurabilityUi() {
        const cracks = this.l2State.cracks;
        const dots = document.getElementById('l2-durability-dots');
        if (dots) {
            let html = '';
            for (let i = 0; i < 3; i++) {
                if (i < (3 - cracks)) {
                    html += `<span class="heart-icon">⚔️</span>`;
                } else {
                    html += `<span class="heart-icon broken">💔</span>`;
                }
            }
            dots.innerHTML = html;
        }
    },

    renderL2LocksTrack() {
        const track = document.getElementById('l2-locks-track');
        if (!track) return;
        let html = '';
        for (let i = 0; i < this.l2State.totalQuestions; i++) {
            if (i < this.l2State.currentIndex) {
                html += `<span class="lock-step passed">🔓</span>`;
            } else if (i === this.l2State.currentIndex) {
                html += `<span class="lock-step current">🔒</span>`;
            } else {
                html += `<span class="lock-step">🔒</span>`;
            }
        }
        track.innerHTML = html;
    },

    renderL2Expression() {
        const container = document.getElementById('l2-expr-container');
        if (!container) return;
        container.innerHTML = '';

        const tokens = this.l2State.currentTokens;
        tokens.forEach(t => {
            const item = document.createElement('div');
            if (t.type === 'num') {
                item.className = 'token-box token-num';
                item.innerText = t.val;
                if (this.l2State.selectedTokenIds.includes(t.id)) {
                    item.classList.add('selected');
                }
                if (t.isNew) {
                    item.classList.add('fused-highlight');
                    t.isNew = false;
                }
                item.onclick = () => this.handleL2NumClick(t.id);
            } else if (t.type === 'op') {
                item.className = 'token-box token-op';
                item.innerText = t.val;
            } else if (t.type === 'paren_left' || t.type === 'paren_right') {
                item.className = 'token-box token-paren';
                item.innerText = t.val;
            }
            container.appendChild(item);
        });

        const eqBox = document.createElement('div');
        eqBox.className = 'token-box token-op';
        eqBox.innerText = '＝ ？';
        container.appendChild(eqBox);
    },

    handleL2NumClick(numId) {
        const state = this.l2State;
        soundCtrl.click();

        const idx = state.selectedTokenIds.indexOf(numId);
        if (idx !== -1) {
            state.selectedTokenIds.splice(idx, 1);
            this.renderL2Expression();
            return;
        }

        state.selectedTokenIds.push(numId);
        this.renderL2Expression();

        if (state.selectedTokenIds.length === 2) {
            const [id1, id2] = state.selectedTokenIds;
            const res = MathEngine.validateAndFuseTokens(state.currentTokens, id1, id2);

            if (res.success) {
                // 答對融合：劍閃爍黃金光芒！
                soundCtrl.fusion();
                const swordEl = document.getElementById('l2-altar-sword');
                if (swordEl) {
                    swordEl.className = 'altar-sword-sprite flash-yellow';
                }

                state.currentTokens = res.tokens;
                state.selectedTokenIds = [];

                if (res.isCompleted) {
                    soundCtrl.correct();
                    this.stopTimer();
                    state.correctCount++;
                    this.renderL2Expression();

                    // 每一關回答正確時都停頓 1 秒鐘以確保能正確到下一題
                    setTimeout(() => {
                        this.advanceL2NextLock();
                    }, 1000);
                } else {
                    this.renderL2Expression();
                }
            } else {
                // 順序錯誤：劍閃爍紅光並破裂！
                this.handleLevel2Mistake(`順序錯誤！${res.reason}`, '先乘除後加減、括號要先算');
            }
        }
    },

    handleLevel2Mistake(reasonText, hintRule) {
        soundCtrl.crack();
        this.stopTimer();
        this.l2State.cracks++;
        this.l2State.selectedTokenIds = [];
        this.updateL2DurabilityUi();

        // 劍閃紅光特效
        const swordEl = document.getElementById('l2-altar-sword');
        if (swordEl) {
            swordEl.className = 'altar-sword-sprite flash-red';
        }

        const screenEl = document.getElementById('screen-level2');
        screenEl.classList.add('screen-shake');
        setTimeout(() => screenEl.classList.remove('screen-shake'), 400);

        // 記錄到筆記本
        StorageManager.addNotebookEntry(this.getUserKey(), {
            levelKey: 'level2',
            levelName: '第2關 魔法村莊',
            expr: this.l2State.currentInitialExpr,
            userChoice: '融合運算順序失誤',
            answer: '先乘除後加減、括號要先算',
            explanation: reasonText
        });

        // 滿 3 次神劍破裂重來
        if (this.l2State.cracks >= 3) {
            StorageManager.recordRetry(this.getUserKey(), 'level2');
            this.showPopupModal(
                '💥 武器徹底壞掉！',
                `
                <div style="font-size: 46px; margin-bottom: 8px;">🗡️💔💥</div>
                <div style="color: #ef4444; font-size: 17px; font-weight: bold; margin-bottom: 10px;">
                    武器破裂累積滿 3 次，傳說之劍斷裂了！
                </div>
                <div style="background: #2a1818; padding: 12px; border-radius: 8px; border: 2px dashed #ef4444; margin-bottom: 10px;">
                    <div style="font-size: 15px; color: #fbbf24; font-weight: bold;">口訣守則：${hintRule}！</div>
                    <div style="font-size: 13px; color: #cbd5e1; margin-top: 4px;">乘除運算或括號內運算必須最先計算！</div>
                </div>
                <div style="color: #94a3b8; font-size: 13px;">鐵匠重新拿出了新的坯料，請重新再來一遍！</div>
                `,
                '🔄 重新嘗試附魔',
                () => {
                    this.startLevel2();
                }
            );
        } else {
            this.showPopupModal(
                '⚠️ 附魔失誤！武器破裂！',
                `
                <div style="font-size: 42px; margin-bottom: 8px;">⚔️⚡💔</div>
                <div style="color: #f87171; font-size: 16px; font-weight: bold; margin-bottom: 10px;">${reasonText}</div>
                <div style="background: #272138; padding: 10px; border-radius: 8px; border: 2px dashed #f59e0b; margin-bottom: 10px;">
                    <div style="color: #fbbf24; font-size: 15px; font-weight: bold;">記住口訣：${hintRule}！</div>
                </div>
                <div style="font-size: 14px; color: #cbd5e1;">目前武器破裂：<strong>${this.l2State.cracks} / 3</strong> 次 (滿3次整把壞掉)</div>
                `,
                '繼續解下一個鎖 ➔',
                () => {
                    this.advanceL2NextLock();
                }
            );
        }
    },

    advanceL2NextLock() {
        this.l2State.currentIndex++;
        if (this.l2State.currentIndex >= this.l2State.totalQuestions) {
            this.finishLevel2Evaluation();
        } else {
            this.runLevel2Question();
        }
    },

    finishLevel2Evaluation() {
        this.stopTimer();
        const state = this.l2State;
        // 分數改為每題 (100/題數) 分，最終得分以四捨五入到個位數
        const score = Math.round(state.correctCount * (100 / state.totalQuestions));
        const durationSec = Math.round((Date.now() - state.startTime) / 1000);
        const passed = state.correctCount >= state.passThreshold;

        // 星星改為：全對3星；錯一題2星；錯兩題1星
        let stars = 1;
        const mistakes = state.totalQuestions - state.correctCount;
        if (mistakes === 0) stars = 3;
        else if (mistakes === 1) stars = 2;
        else stars = 1;

        StorageManager.recordLevelResult(this.getUserKey(), 'level2', {
            score,
            stars: passed ? stars : 0,
            timeSeconds: durationSec,
            errorCount: state.cracks,
            passed
        });

        if (passed) {
            soundCtrl.treasure();
            this.showPopupModal(
                '✨ 附魔成功！獲得【傳說之劍】！',
                `
                <div style="font-size: 44px; margin-bottom: 8px;">🗡️✨⚡</div>
                <div style="font-size: 32px; color: #fbbf24; margin-bottom: 6px;">${this.renderStarsHtml(stars)}</div>
                <div style="font-size: 20px; font-weight: bold; color: #10b981; margin-bottom: 10px;">最終得分：${score} 分！</div>
                <div style="background: #2b2210; border: 2px dashed #f59e0b; padding: 12px; border-radius: 8px; margin-bottom: 10px;">
                    <strong style="color: #fbbf24; font-size: 17px;">獲得傳奇裝備：【傳說之劍】！</strong>
                    <div style="font-size: 13px; color: #fde68a; margin-top: 4px;">劍身已注滿神聖附魔之力，第 3 關【神殿祕寶】已解鎖！</div>
                </div>
                <div style="font-size: 13px; color: #cbd5e1;">耗時：${durationSec} 秒 ｜ 成功解鎖：${state.correctCount}/${state.totalQuestions} 道</div>
                `,
                '前往神殿祕寶 ➔',
                () => {
                    this.startLevel3();
                }
            );
        } else {
            soundCtrl.wrong();
            this.showPopupModal(
                '😢 附魔能量不足！',
                `
                <div style="font-size: 40px; margin-bottom: 8px;">🗡️💨</div>
                <div style="color: #ef4444; font-size: 18px; margin-bottom: 8px;">得分：${score} 分 (需答對至少 ${state.passThreshold} 題過關)</div>
                <div style="font-size: 14px; color: #cbd5e1; margin-bottom: 8px;">至少要解開 ${state.passThreshold} 道魔法鎖才能完成神劍附魔！</div>
                <div style="color: #fbbf24; font-size: 13px;">牢記口訣：先乘除後加減、括號要先算！</div>
                `,
                '🔄 重新挑戰',
                () => {
                    this.startLevel2();
                }
            );
        }
    },

    // ==========================================
    // Level 3: 神殿祕寶 (勇者不動、火消掉、標示第幾號門、停頓1秒、彈跳視窗未輸入提示)
    // ==========================================
    startLevel3() {
        const cfg = StorageManager.getServerConfig(this.currentUser?.serverId || '001');
        const totalQ = cfg.l3Count || 10;
        const passReq = Math.ceil(totalQ * 4 / 5);

        this.l3State = {
            totalQuestions: totalQ,
            passThreshold: passReq,
            currentIndex: 0,
            correctCount: 0,
            brokenDoors: 0,
            startTime: Date.now(),
            currentQ: null,
            inputVal: ''
        };
        this.showScreen('level3');
        this.runLevel3Question();
    },

    runLevel3Question() {
        const state = this.l3State;
        state.isSubmitting = false;
        const qIndex = state.currentIndex;
        state.currentQ = MathEngine.generateLevel3Question();
        state.inputVal = '';

        const doorEl = document.getElementById('l3-stone-door');
        const doorFrame = document.getElementById('l3-door-frame');
        const doorCrest = document.getElementById('l3-door-crest');
        const submitBtn = document.getElementById('l3-submit-btn');
        const treasureBox = document.getElementById('l3-treasure-chest-anim');
        const heroEl = document.getElementById('l3-hero-sprite');

        // 勇者保持固定不動
        if (heroEl) heroEl.className = 'hero-temple-sprite';
        if (doorEl) doorEl.className = 'stone-door-container';
        if (treasureBox) treasureBox.classList.add('hidden');
        if (doorFrame) doorFrame.classList.remove('hidden');

        // 標示第幾號門；最後一題是開啟寶藏
        const doorNumber = qIndex + 1;
        if (qIndex === state.totalQuestions - 1) {
            document.getElementById('l3-progress-text').innerText = `👑 最終試煉：第 ${doorNumber} / ${state.totalQuestions} 題 (開啟遠古祕寶！)`;
            if (doorCrest) doorCrest.innerText = `💎 第 ${doorNumber} 號門 (最後寶藏)`;
            if (doorFrame) doorFrame.className = 'door-frame door-frame-treasure';
            if (submitBtn) submitBtn.innerHTML = `💎 開啟寶藏！`;
        } else {
            document.getElementById('l3-progress-text').innerText = `神殿石門：第 ${doorNumber} / ${state.totalQuestions} 扇門 (需對 ${state.passThreshold} 題)`;
            if (doorCrest) doorCrest.innerText = `🏛️ 第 ${doorNumber} 號門`;
            if (doorFrame) doorFrame.className = 'door-frame';
            if (submitBtn) submitBtn.innerHTML = `🚪 開門`;
        }

        document.getElementById('l3-door-expr').innerText = state.currentQ.expr + ' ＝ ？';
        document.getElementById('l3-input-display').value = '';
        this.updateL3DurabilityUi();

        // 30 秒計時
        const timerBar = document.getElementById('l3-timer-bar');
        const timerText = document.getElementById('l3-timer-text');
        this.startTimer(
            30,
            (sec) => {
                timerText.innerText = `${sec} 秒`;
                timerBar.style.width = `${(sec / 30) * 100}%`;
                timerBar.style.backgroundColor = sec <= 5 ? '#ef4444' : '#10b981';
            },
            () => {
                this.handleLevel3Mistake('時間到！房間向內擠壓，石門崩裂！', state.currentQ.answer);
            }
        );
    },

    updateL3DurabilityUi() {
        const broken = this.l3State.brokenDoors;
        const dots = document.getElementById('l3-durability-dots');
        if (dots) {
            let html = '';
            for (let i = 0; i < 3; i++) {
                if (i < (3 - broken)) {
                    html += `<span class="heart-icon">🚪</span>`;
                } else {
                    html += `<span class="heart-icon broken">💥</span>`;
                }
            }
            dots.innerHTML = html;
        }
    },

    appendL3Input(digit) {
        soundCtrl.click();
        if (this.l3State.inputVal.length < 6) {
            this.l3State.inputVal += digit;
            document.getElementById('l3-input-display').value = this.l3State.inputVal;
        }
    },

    backspaceL3Input() {
        soundCtrl.click();
        if (this.l3State.inputVal.length > 0) {
            this.l3State.inputVal = this.l3State.inputVal.slice(0, -1);
            document.getElementById('l3-input-display').value = this.l3State.inputVal;
        }
    },

    clearL3Input() {
        soundCtrl.click();
        this.l3State.inputVal = '';
        document.getElementById('l3-input-display').value = '';
    },

    submitL3Answer() {
        if (this.l3State.isSubmitting) return;

        const valStr = this.l3State.inputVal.trim();
        // 未輸入數字時，改為彈跳視窗
        if (!valStr) {
            soundCtrl.wrong();
            this.showPopupModal(
                '⚠️ 請輸入石門密碼',
                `
                <div style="font-size: 38px; margin-bottom: 8px;">🔢❓🚪</div>
                <div style="font-size: 16px; color: #fbbf24; font-weight: bold;">勇者尚未輸入任何密碼號碼！</div>
                <div style="font-size: 14px; color: #cbd5e1; margin-top: 6px;">請點擊畫面上的數字鍵盤或敲擊鍵盤輸入答案，再點擊開門！</div>
                `,
                '我知道了',
                null
            );
            return;
        }

        this.l3State.isSubmitting = true;
        const userNum = parseInt(valStr, 10);
        this.stopTimer();

        if (userNum === this.l3State.currentQ.answer) {
            this.l3State.correctCount++;

            // 檢查是否是最後一題 (開啟寶藏)
            if (this.l3State.currentIndex === this.l3State.totalQuestions - 1) {
                soundCtrl.treasure();
                const doorFrame = document.getElementById('l3-door-frame');
                const treasureBox = document.getElementById('l3-treasure-chest-anim');
                if (doorFrame) doorFrame.classList.add('hidden');
                if (treasureBox) treasureBox.classList.remove('hidden');

                // 即便回答正確，勇者也不要動！
                const heroEl = document.getElementById('l3-hero-sprite');
                if (heroEl) heroEl.className = 'hero-temple-sprite';

                // 停頓 1 秒鐘
                setTimeout(() => {
                    this.advanceL3NextDoor();
                }, 1000);
            } else {
                soundCtrl.correct();
                // 石門升起開啟，勇者不要動
                const doorEl = document.getElementById('l3-stone-door');
                const heroEl = document.getElementById('l3-hero-sprite');
                doorEl.className = 'stone-door-container door-open-anim';
                if (heroEl) heroEl.className = 'hero-temple-sprite';

                // 停頓 1 秒鐘以確保能正確到下一題
                setTimeout(() => {
                    this.advanceL3NextDoor();
                }, 1000);
            }
        } else {
            this.handleLevel3Mistake(`密碼錯誤！你輸入的是 ${userNum}。`, this.l3State.currentQ.answer);
        }
    },

    handleLevel3Mistake(reason, correctAns) {
        soundCtrl.crack();
        this.stopTimer();
        this.l3State.isSubmitting = false;
        this.l3State.brokenDoors++;
        this.updateL3DurabilityUi();

        const doorEl = document.getElementById('l3-stone-door');
        if (doorEl) doorEl.className = 'stone-door-container door-cracked';

        const screenEl = document.getElementById('screen-level3');
        screenEl.classList.add('screen-shake');
        setTimeout(() => screenEl.classList.remove('screen-shake'), 400);

        // 記錄到筆記本
        StorageManager.addNotebookEntry(this.getUserKey(), {
            levelKey: 'level3',
            levelName: '第3關 神殿祕寶',
            expr: this.l3State.currentQ.expr,
            userChoice: this.l3State.inputVal || '未輸入',
            answer: correctAns,
            explanation: '先乘除後加減、括號要先算！'
        });

        // 滿 3 次神殿崩塌重來
        if (this.l3State.brokenDoors >= 3) {
            StorageManager.recordRetry(this.getUserKey(), 'level3');
            this.showPopupModal(
                '🏛️ 神殿徹底垮掉！',
                `
                <div style="font-size: 46px; margin-bottom: 8px;">🏛️💥🪨</div>
                <div style="color: #ef4444; font-size: 17px; font-weight: bold; margin-bottom: 10px;">
                    石門破碎累積滿 3 次，神殿房間劇烈擠壓崩塌了！
                </div>
                <div style="background: #2a1818; padding: 12px; border-radius: 8px; border: 2px dashed #ef4444; margin-bottom: 10px;">
                    <div style="color: #fbbf24; font-size: 15px; font-weight: bold;">口訣提醒：先乘除後加減、括號要先算！</div>
                    <div style="color: #38bdf8; font-size: 15px; margin-top: 4px;">本門正確答案：<strong>${correctAns}</strong></div>
                </div>
                <div style="color: #94a3b8; font-size: 13px;">神殿機關已重置，請重新再來一遍！</div>
                `,
                '🔄 重新探索神殿',
                () => {
                    this.startLevel3();
                }
            );
        } else {
            this.showPopupModal(
                '💥 石門破碎！房間被擠壓！',
                `
                <div style="font-size: 42px; margin-bottom: 8px;">🚪💥🪨</div>
                <div style="color: #f87171; font-size: 16px; font-weight: bold; margin-bottom: 10px;">${reason}</div>
                <div style="background: #1e293b; padding: 10px; border-radius: 8px; border: 2px dashed #38bdf8; margin-bottom: 10px;">
                    <div style="color: #38bdf8; font-size: 16px;">正確號碼是：<strong style="color: #10b981; font-size: 20px;">${correctAns}</strong></div>
                    <div style="color: #fbbf24; font-size: 13px; margin-top: 4px;">提示：先乘除後加減、括號要先算！</div>
                </div>
                <div style="font-size: 14px; color: #cbd5e1;">目前門破碎：<strong>${this.l3State.brokenDoors} / 3</strong> 次</div>
                `,
                '開啟下一扇石門 ➔',
                () => {
                    this.advanceL3NextDoor();
                }
            );
        }
    },

    advanceL3NextDoor() {
        this.l3State.currentIndex++;
        if (this.l3State.currentIndex >= this.l3State.totalQuestions) {
            this.finishLevel3Evaluation();
        } else {
            this.runLevel3Question();
        }
    },

    finishLevel3Evaluation() {
        this.stopTimer();
        const state = this.l3State;
        // 分數改為每題 (100/題數) 分，最終得分以四捨五入到個位數
        const score = Math.round(state.correctCount * (100 / state.totalQuestions));
        const durationSec = Math.round((Date.now() - state.startTime) / 1000);
        const passed = state.correctCount >= state.passThreshold;

        // 星星改為：全對3星；錯一題2星；錯兩題1星
        let stars = 1;
        const mistakes = state.totalQuestions - state.correctCount;
        if (mistakes === 0) stars = 3;
        else if (mistakes === 1) stars = 2;
        else stars = 1;

        StorageManager.recordLevelResult(this.getUserKey(), 'level3', {
            score,
            stars: passed ? stars : 0,
            timeSeconds: durationSec,
            errorCount: state.brokenDoors,
            passed
        });

        if (passed) {
            soundCtrl.treasure();
            this.showPopupModal(
                '🛡️ 發現神殿祕寶！獲得【重生之盾】！',
                `
                <div style="font-size: 46px; margin-bottom: 8px;">🛡️✨💎</div>
                <div style="font-size: 32px; color: #fbbf24; margin-bottom: 6px;">${this.renderStarsHtml(stars)}</div>
                <div style="font-size: 20px; font-weight: bold; color: #10b981; margin-bottom: 10px;">神殿通關得分：${score} 分！</div>
                <div style="background: #172554; border: 2px dashed #3b82f6; padding: 12px; border-radius: 8px; margin-bottom: 10px;">
                    <strong style="color: #60a5fa; font-size: 17px;">獲得傳奇裝備：【重生之盾】！</strong>
                    <div style="font-size: 13px; color: #bfdbfe; margin-top: 4px;">古老傳送門已開啟！勇者已被傳送到魔龍巢穴，準備迎接最終決戰！</div>
                </div>
                <div style="font-size: 13px; color: #cbd5e1;">耗時：${durationSec} 秒 ｜ 答對：${state.correctCount}/${state.totalQuestions} 扇門</div>
                `,
                '前往魔王關決戰 ➔',
                () => {
                    this.startBoss();
                }
            );
        } else {
            soundCtrl.wrong();
            this.showPopupModal(
                '😢 未能打開祕寶之門！',
                `
                <div style="font-size: 40px; margin-bottom: 8px;">🏛️🔒</div>
                <div style="color: #ef4444; font-size: 18px; margin-bottom: 8px;">得分：${score} 分 (需答對至少 ${state.passThreshold} 題過關)</div>
                <div style="font-size: 14px; color: #cbd5e1; margin-bottom: 8px;">需要答對 ${state.passThreshold} 扇門才能取得【重生之盾】前往魔王關！</div>
                <div style="color: #fbbf24; font-size: 13px;">先乘除後加減、括號要先算！再試一次吧！</div>
                `,
                '🔄 重新挑戰',
                () => {
                    this.startLevel3();
                }
            );
        }
    },

    // ==========================================
    // Boss 關: 討伐魔龍 (勇者3命、火球重置不倒退、答錯火球疾衝且數值解析、停頓1秒)
    // ==========================================
    startBoss() {
        this.bossState = {
            dragonHp: 5,
            heroLives: 3, // 勇者血量改為三
            mistakeCount: 0,
            startTime: Date.now(),
            currentRound: 0,
            currentQ: null,
            isAttacking: false
        };
        this.showScreen('boss');
        this.runBossRound();
    },

    runBossRound() {
        const state = this.bossState;
        state.isAttacking = false;
        state.currentQ = MathEngine.generateBossQuestion();
        this.updateBossHpUi();

        document.getElementById('boss-dragon-expr').innerText = state.currentQ.dragonExpr;
        document.getElementById('boss-round-info').innerText = `魔王決戰：魔龍剩餘 ${state.dragonHp} 點血量 ｜ 勇者剩餘 ${state.heroLives} 命`;

        // 渲染攻擊招式卡片 (包含快捷鍵提示)
        const attackContainer = document.getElementById('boss-attacks-container');
        attackContainer.innerHTML = '';
        state.currentQ.attacks.forEach((atk, idx) => {
            const card = document.createElement('div');
            card.className = 'boss-skill-card';
            card.innerHTML = `
                <div class="skill-tag">⚔️ 攻擊招式 ${idx + 1}</div>
                <div class="skill-expr">${atk.expr}</div>
            `;
            card.onclick = () => this.handleBossAttack(atk);
            attackContainer.appendChild(card);
        });

        // 火焰回到原位重發火焰，不要讓火焰倒退回去！
        const fireball = document.getElementById('boss-floating-fireball');
        const slashWave = document.getElementById('boss-slash-wave');
        if (slashWave) slashWave.className = 'slash-wave-sprite hidden';

        if (fireball) {
            // 瞬間重設位置回到魔龍口中，不產生倒退滑動
            fireball.className = 'floating-fireball-sprite fireball-reset-instant';
            fireball.style.right = '10%';
            void fireball.offsetWidth; // 強制重繪
            fireball.className = 'floating-fireball-sprite fire-floating';
        }

        // 60 秒計時，火球隨著時間由右飄向左
        const timerBar = document.getElementById('boss-timer-bar');
        const timerText = document.getElementById('boss-timer-text');

        this.startTimer(
            60,
            (sec) => {
                timerText.innerText = `${sec} 秒`;
                const progressRatio = (60 - sec) / 60; // 0 ~ 1
                timerBar.style.width = `${(sec / 60) * 100}%`;
                timerBar.style.backgroundColor = sec <= 10 ? '#ef4444' : '#f59e0b';

                // 火球飄向勇者 (右側 10% 飄移到 75%)
                if (fireball && !state.isAttacking) {
                    const currentRight = 10 + progressRatio * 65;
                    fireball.style.right = `${currentRight}%`;
                }
            },
            () => {
                this.handleHeroHit('時間到！超過 60 秒未滅火，龍焰火球直接擊中勇者！', null);
            }
        );
    },

    updateBossHpUi() {
        const state = this.bossState;
        const dragonHpEl = document.getElementById('boss-dragon-hp');
        if (dragonHpEl) {
            let html = '';
            for (let i = 0; i < 5; i++) {
                if (i < state.dragonHp) {
                    html += `<span class="dragon-hp-pip">🐉</span>`;
                } else {
                    html += `<span class="dragon-hp-pip dead">💀</span>`;
                }
            }
            dragonHpEl.innerHTML = html;
        }

        const heroHpEl = document.getElementById('boss-hero-hp');
        if (heroHpEl) {
            let html = '';
            // 勇者改為 3 命
            for (let i = 0; i < 3; i++) {
                if (i < state.heroLives) {
                    html += `<span class="hero-life-pip">❤️</span>`;
                } else {
                    html += `<span class="hero-life-pip dead">🖤</span>`;
                }
            }
            heroHpEl.innerHTML = html;
        }
    },

    handleBossAttack(attackObj) {
        const state = this.bossState;
        if (state.isAttacking) return;
        state.isAttacking = true;
        this.stopTimer();

        const fireball = document.getElementById('boss-floating-fireball');
        const slashWave = document.getElementById('boss-slash-wave');
        const heroSprite = document.getElementById('boss-hero-sprite');
        const dragonSprite = document.getElementById('boss-dragon-sprite');

        if (attackObj.isMatch) {
            // 答對：勇者揮動傳說之劍，劍氣滅火並斬擊魔龍！
            soundCtrl.heroAttack();
            if (heroSprite) heroSprite.className = 'hero-battle-box hero-swing-sword';

            // 釋放劍氣
            if (slashWave) {
                slashWave.className = 'slash-wave-sprite slash-flying';
            }

            // 劍氣飛行撞上火球，火球消滅！
            setTimeout(() => {
                if (fireball) fireball.className = 'floating-fireball-sprite fire-extinguished';

                // 劍氣繼續疾斬魔龍
                setTimeout(() => {
                    soundCtrl.correct();
                    state.dragonHp--;
                    this.updateBossHpUi();

                    if (dragonSprite) dragonSprite.className = 'dragon-battle-box dragon-hit-shake';

                    // 每一關回答正確時都停頓 1 秒鐘以確保能正確到下一題
                    setTimeout(() => {
                        if (dragonSprite) dragonSprite.className = 'dragon-battle-box';
                        if (heroSprite) heroSprite.className = 'hero-battle-box';

                        if (state.dragonHp <= 0) {
                            this.finishBossVictory();
                        } else {
                            this.showPopupModal(
                                '⚔️ 劍氣破火！重創魔龍！',
                                `
                                <div style="font-size: 44px; margin-bottom: 8px;">⚔️💨💥🐲</div>
                                <div style="color: #10b981; font-size: 17px; font-weight: bold; margin-bottom: 8px;">
                                    招式數值吻合 (${state.currentQ.targetVal})！神劍劍氣一刀斬滅龍火，重創魔龍 1 點生命！
                                </div>
                                <div style="color: #cbd5e1; font-size: 14px;">魔龍剩餘生命：<strong>${state.dragonHp} / 5</strong></div>
                                `,
                                '繼續迎戰魔龍 ➔',
                                () => {
                                    this.runBossRound();
                                }
                            );
                        }
                    }, 1000);
                }, 300);
            }, 300);
        } else {
            // 答錯：招式不符，火焰快速飛向勇者！
            if (fireball) {
                fireball.className = 'floating-fireball-sprite fire-fly-fast';
            }

            // 計算並產生所有招式的數值解釋
            let breakdownHtml = `<div class="boss-calc-breakdown">`;
            breakdownHtml += `<div class="calc-line">🔥 魔龍招式：<strong>${state.currentQ.dragonExpr} ＝ <span class="calc-highlight">${state.currentQ.targetVal}</span></strong></div><hr style="border:none; border-top:1px dashed #64748b; margin:6px 0;">`;
            state.currentQ.attacks.forEach((atk, idx) => {
                const matchTag = atk.isMatch ? '✅ (正確吻合)' : '❌';
                breakdownHtml += `<div class="calc-line">⚔️ 招式 ${idx + 1}：${atk.expr} ＝ <strong>${atk.value}</strong> ${matchTag}</div>`;
            });
            breakdownHtml += `</div>`;

            // 記錄到筆記本
            StorageManager.addNotebookEntry(this.getUserKey(), {
                levelKey: 'boss',
                levelName: '魔王關 討伐魔龍',
                expr: state.currentQ.dragonExpr,
                userChoice: `${attackObj.expr} ＝ ${attackObj.value}`,
                answer: `目標數值 ${state.currentQ.targetVal}`,
                explanation: '找出與魔龍相同數值的招式！'
            });

            setTimeout(() => {
                this.handleHeroHit(`招式數值為 ${attackObj.value}，與魔龍數值 (${state.currentQ.targetVal}) 不符！火球快速飛向並命中勇者！`, breakdownHtml);
            }, 250);
        }
    },

    handleHeroHit(reason, breakdownHtml) {
        soundCtrl.dragonAttack();
        const state = this.bossState;
        state.heroLives--;
        state.mistakeCount++;
        this.updateBossHpUi();

        const fireball = document.getElementById('boss-floating-fireball');
        const heroSprite = document.getElementById('boss-hero-sprite');

        if (fireball) fireball.className = 'floating-fireball-sprite fire-explode-hit';
        if (heroSprite) heroSprite.className = 'hero-battle-box hero-hit-shake';

        setTimeout(() => {
            if (state.heroLives <= 0) {
                // 命數歸零，觸發【重生之盾】涅槃重生！
                soundCtrl.rebirth();
                StorageManager.recordRetry(this.getUserKey(), 'boss');

                this.showPopupModal(
                    '🛡️【重生之盾】神力庇護！',
                    `
                    <div style="font-size: 46px; margin-bottom: 8px;">🛡️✨❤️</div>
                    <div style="color: #ef4444; font-size: 17px; font-weight: bold; margin-bottom: 8px;">${reason}</div>
                    ${breakdownHtml || ''}
                    <div style="background: #0c4a6e; border: 2px dashed #38bdf8; padding: 12px; border-radius: 8px; margin-bottom: 10px;">
                        <strong style="color: #38bdf8; font-size: 17px;">受到【重生之盾】的神力庇護，勇者涅槃重生！</strong>
                        <div style="font-size: 13px; color: #bae6fd; margin-top: 4px;">生命值全部恢復！魔龍正在狂暴，請重整旗鼓再次討伐！</div>
                    </div>
                    `,
                    '🛡️ 重新討伐魔龍',
                    () => {
                        this.startBoss();
                    }
                );
            } else {
                this.showPopupModal(
                    '🔥 受到魔龍龍焰攻擊！',
                    `
                    <div style="font-size: 42px; margin-bottom: 8px;">🔥💥🧙‍♂️</div>
                    <div style="color: #f87171; font-size: 16px; font-weight: bold; margin-bottom: 8px;">${reason}</div>
                    ${breakdownHtml || ''}
                    <div style="font-size: 14px; color: #cbd5e1;">勇者失去 1 點生命 (剩餘 <strong>${state.heroLives} / 3</strong> 心)！下一波龍焰即將到來！</div>
                    `,
                    '迎戰下一波攻勢 ➔',
                    () => {
                        this.runBossRound();
                    }
                );
            }
        }, 500);
    },

    finishBossVictory() {
        soundCtrl.victory();
        const state = this.bossState;
        const durationSec = Math.round((Date.now() - state.startTime) / 1000);

        // BOSS關星星改為：勇者扣0血量3星；勇者扣1血量2星；勇者扣2血量1星
        const damageTaken = state.mistakeCount;
        let stars = 1;
        if (damageTaken === 0) stars = 3;
        else if (damageTaken === 1) stars = 2;
        else stars = 1;

        const score = Math.max(20, 100 - damageTaken * 20);

        StorageManager.recordLevelResult(this.getUserKey(), 'boss', {
            score,
            stars,
            timeSeconds: durationSec,
            errorCount: damageTaken,
            passed: true
        });

        // 取得結算後的專屬稱號
        const updatedUser = StorageManager.getUser(this.getUserKey());
        const title = updatedUser?.title || StorageManager.evaluateTitle(updatedUser || this.currentUser);
        this.currentUser = updatedUser || this.currentUser;

        // 渲染專屬稱號徽章
        const titleBadge = document.getElementById('victory-title-badge');
        if (titleBadge) {
            titleBadge.innerText = title;
        }

        // 頒發國王特級榮譽勳章證書內容
        const certBody = document.getElementById('victory-cert-body');
        if (certBody) {
            certBody.innerHTML = `茲證明勇者 <strong>${this.currentUser.username}</strong>（編號：${this.currentUser.id || '遊客'}）徹底精通「先乘除後加減」、「括號要先算」整數四則運算奧義，勇破迷霧森林、魔法村莊、神殿祕寶並徹底討伐深淵魔龍，國王親封王國最高榮銜：<br><span style="color:#f59e0b; font-weight:bold; font-size:16px;">【${title}】</span>！`;
        }

        document.getElementById('victory-stars').innerHTML = this.renderStarsHtml(stars);
        document.getElementById('victory-score').innerText = `${score} 分`;
        document.getElementById('victory-time').innerText = `${Math.floor(durationSec / 60)}分${durationSec % 60}秒`;
        document.getElementById('victory-errors').innerText = `${damageTaken} 次 (扣 ${damageTaken} 血)`;
        document.getElementById('victory-hero-name').innerText = this.currentUser.username;

        this.showScreen('victory');
    },

    // ==========================================
    // 電子榮譽獎狀 (HTML5 Canvas 繪製並下載 PNG 圖片)
    // ==========================================
    downloadCertificate() {
        soundCtrl.click();
        const user = StorageManager.getUser(this.getUserKey()) || this.currentUser || { username: '勇者', serverId: '001' };
        const title = user.title || StorageManager.evaluateTitle(user);
        const username = user.username || '王國勇者';
        const userId = user.isGuest ? '遊客體驗' : (user.id || '—');
        const serverId = user.serverId || '001';

        // 建立離屏高解析度畫布 (1200 x 850)
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 850;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 1. 底色：羊皮紙漸層背景
        const bgGrad = ctx.createLinearGradient(0, 0, 1200, 850);
        bgGrad.addColorStop(0, '#fefbf3');
        bgGrad.addColorStop(0.5, '#fef3c7');
        bgGrad.addColorStop(1, '#fde68a');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 1200, 850);

        // 羊皮紙暗角裝飾
        const vignette = ctx.createRadialGradient(600, 425, 300, 600, 425, 680);
        vignette.addColorStop(0, 'rgba(254, 243, 199, 0)');
        vignette.addColorStop(1, 'rgba(180, 83, 9, 0.15)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, 1200, 850);

        // 2. 華麗外框與金邊 (Microsoft JhengHei 微軟正黑體)
        // 外金邊
        ctx.lineWidth = 14;
        ctx.strokeStyle = '#b45309';
        ctx.strokeRect(30, 30, 1140, 790);

        ctx.lineWidth = 4;
        ctx.strokeStyle = '#f59e0b';
        ctx.strokeRect(42, 42, 1116, 766);

        // 內細框
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#78350f';
        ctx.strokeRect(52, 52, 1096, 746);

        // 四角裝飾花紋
        const drawCorner = (x, y, flipX, flipY) => {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(flipX, flipY);
            ctx.fillStyle = '#b45309';
            ctx.fillRect(0, 0, 32, 6);
            ctx.fillRect(0, 0, 6, 32);
            ctx.beginPath();
            ctx.arc(16, 16, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        };
        drawCorner(56, 56, 1, 1);
        drawCorner(1144, 56, -1, 1);
        drawCorner(56, 794, 1, -1);
        drawCorner(1144, 794, -1, -1);

        // 3. 頂部王國徽記與抬頭 (微軟正黑體)
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = 'bold 24px "Microsoft JhengHei", "微軟正黑體", "Noto Sans TC", sans-serif';
        ctx.fillStyle = '#92400e';
        ctx.fillText('🏰 王 國 算 術 冒 險 評 定 委 員 會 🏰', 600, 95);

        ctx.font = '900 48px "Microsoft JhengHei", "微軟正黑體", "Noto Sans TC", sans-serif';
        ctx.fillStyle = '#78350f';
        ctx.shadowColor = 'rgba(180, 83, 9, 0.3)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillText('★ 榮 譽 勇 者 獎 狀 ★', 600, 160);
        ctx.shadowColor = 'transparent';

        ctx.font = 'bold 15px "Arial", sans-serif';
        ctx.fillStyle = '#b45309';
        ctx.fillText('CERTIFICATE OF ROYAL VALOR & MATHEMATICAL MASTERY', 600, 205);

        // 金色裝飾橫線
        const lineGrad = ctx.createLinearGradient(200, 0, 1000, 0);
        lineGrad.addColorStop(0, 'rgba(217, 119, 6, 0)');
        lineGrad.addColorStop(0.5, '#d97706');
        lineGrad.addColorStop(1, 'rgba(217, 119, 6, 0)');
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(200, 225);
        ctx.lineTo(1000, 225);
        ctx.stroke();

        // 4. 正文內容 (微軟正黑體)
        ctx.font = '22px "Microsoft JhengHei", "微軟正黑體", "Noto Sans TC", sans-serif';
        ctx.fillStyle = '#334155';
        ctx.fillText('茲 證 明 勇 者', 600, 265);

        // 勇者大名
        ctx.font = '900 44px "Microsoft JhengHei", "微軟正黑體", "Noto Sans TC", sans-serif';
        ctx.fillStyle = '#1e3a8a';
        ctx.fillText(username, 600, 325);

        // 下底線
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#3b82f6';
        const nameWidth = ctx.measureText(username).width;
        ctx.beginPath();
        ctx.moveTo(600 - nameWidth / 2 - 20, 355);
        ctx.lineTo(600 + nameWidth / 2 + 20, 355);
        ctx.stroke();

        // 玩家編號與伺服器資訊
        ctx.font = 'bold 18px "Microsoft JhengHei", "微軟正黑體", "Noto Sans TC", sans-serif';
        ctx.fillStyle = '#475569';
        ctx.fillText(`冒險編號：【${userId}】 ｜ 伺服分區：【${serverId}】`, 600, 390);

        // 榮譽讚詞
        ctx.font = '20px "Microsoft JhengHei", "微軟正黑體", "Noto Sans TC", sans-serif';
        ctx.fillStyle = '#1e293b';
        ctx.fillText('於【勇者算術大冒險】中展現卓越非凡之智慧與剛毅勇氣，', 600, 440);
        ctx.fillText('精通國小四年級整數四則運算「先乘除後加減」、「括號先算」之奧義，', 600, 475);
        ctx.fillText('順利突破迷霧森林、魔法村莊附魔、重重神殿石門，最終成功討伐深淵魔龍、拯救王國！', 600, 510);

        // 5. 封號榮譽徽章框
        ctx.fillStyle = '#fffbeb';
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 3;
        const boxX = 350;
        const boxY = 545;
        const boxW = 500;
        const boxH = 90;
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        ctx.font = 'bold 18px "Microsoft JhengHei", "微軟正黑體", "Noto Sans TC", sans-serif';
        ctx.fillStyle = '#b45309';
        ctx.fillText('國 王 敕 封 最 高 榮 銜', 600, 570);

        ctx.font = '900 36px "Microsoft JhengHei", "微軟正黑體", "Noto Sans TC", sans-serif';
        ctx.fillStyle = '#b91c1c';
        ctx.fillText(`【 ${title} 】`, 600, 608);

        // 6. 底部印章與簽署
        // 左下角：王國皇家蠟印
        ctx.save();
        ctx.translate(220, 715);
        ctx.beginPath();
        ctx.arc(0, 0, 52, 0, Math.PI * 2);
        ctx.fillStyle = '#dc2626';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#991b1b';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, 45, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fef08a';
        ctx.stroke();

        ctx.font = 'bold 13px "Microsoft JhengHei", "微軟正黑體", sans-serif';
        ctx.fillStyle = '#fef08a';
        ctx.fillText('王國皇家特許', 0, -18);
        ctx.font = 'bold 24px "Microsoft JhengHei", "微軟正黑體", sans-serif';
        ctx.fillText('👑', 0, 3);
        ctx.font = 'bold 11px "Microsoft JhengHei", "微軟正黑體", sans-serif';
        ctx.fillText('ROYAL SEAL', 0, 24);
        ctx.restore();

        // 右下角：簽署與日期
        ctx.textAlign = 'right';
        ctx.font = 'bold 19px "Microsoft JhengHei", "微軟正黑體", "Noto Sans TC", sans-serif';
        ctx.fillStyle = '#78350f';
        ctx.fillText('王國最高算術大臣 敬頒', 1050, 690);

        const now = new Date();
        const dateStr = `西元 ${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`;
        ctx.font = '16px "Microsoft JhengHei", "微軟正黑體", "Noto Sans TC", sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText(dateStr, 1050, 725);

        // 下載 PNG 圖片
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `勇者算術大冒險_榮譽獎狀_${username}_${title}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        alert(`🎖️ 電子榮譽獎狀已成功生成並下載！\n\n【${title}】${username}，恭喜你成為拯救王國的英雄！`);
    },

    // ==========================================
    // 排行榜系統 (名次1~100，超過100為未上榜；僅顯示名次、玩家名稱、ID；遊客不列入)
    // ==========================================
    lbState: {
        type: 'count', // 'count' | 'time'
        scope: 'all'   // 'all' | 'server'
    },

    async openLeaderboard() {
        soundCtrl.click();
        const modal = document.getElementById('leaderboard-modal');
        if (modal) {
            modal.classList.remove('hidden');
            await StorageManager.syncWithServer();
            this.refreshLeaderboard();
        }
    },

    closeLeaderboard() {
        soundCtrl.click();
        const modal = document.getElementById('leaderboard-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },

    switchLeaderboardType(type) {
        soundCtrl.click();
        this.lbState.type = type;
        const btnCount = document.getElementById('lb-type-count');
        const btnTime = document.getElementById('lb-type-time');
        if (btnCount && btnTime) {
            if (type === 'count') {
                btnCount.classList.add('active');
                btnCount.style.background = '#6366f1';
                btnCount.style.color = '#ffffff';
                btnTime.classList.remove('active');
                btnTime.style.background = 'transparent';
                btnTime.style.color = '#a5b4fc';
            } else {
                btnCount.classList.remove('active');
                btnCount.style.background = 'transparent';
                btnCount.style.color = '#a5b4fc';
                btnTime.classList.add('active');
                btnTime.style.background = '#6366f1';
                btnTime.style.color = '#ffffff';
            }
        }
        this.refreshLeaderboard();
    },

    switchLeaderboardScope(scope) {
        soundCtrl.click();
        this.lbState.scope = scope;
        const btnAll = document.getElementById('lb-scope-all');
        const btnServer = document.getElementById('lb-scope-server');
        const wrapServer = document.getElementById('lb-server-filter-wrap');
        if (btnAll && btnServer) {
            if (scope === 'all') {
                btnAll.classList.add('active');
                btnAll.style.background = '#6366f1';
                btnAll.style.color = '#ffffff';
                btnServer.classList.remove('active');
                btnServer.style.background = 'transparent';
                btnServer.style.color = '#a5b4fc';
                if (wrapServer) wrapServer.style.display = 'none';
            } else {
                btnAll.classList.remove('active');
                btnAll.style.background = 'transparent';
                btnAll.style.color = '#a5b4fc';
                btnServer.classList.add('active');
                btnServer.style.background = '#6366f1';
                btnServer.style.color = '#ffffff';
                if (wrapServer) wrapServer.style.display = 'flex';
                const input = document.getElementById('lb-server-input');
                if (input && this.currentUser?.serverId) {
                    input.value = this.currentUser.serverId;
                }
            }
        }
        this.refreshLeaderboard();
    },

    refreshLeaderboard() {
        const contentEl = document.getElementById('leaderboard-content');
        if (!contentEl) return;

        const type = this.lbState.type || 'count';
        const scope = this.lbState.scope || 'all';
        let serverId = null;
        if (scope === 'server') {
            const input = document.getElementById('lb-server-input');
            serverId = input?.value?.trim() || '001';
        }

        let entries = [];
        if (type === 'count') {
            entries = StorageManager.getLeaderboardClearCount(serverId);
        } else {
            entries = StorageManager.getLeaderboardClearTime(serverId);
        }

        const typeTitle = type === 'count' ? '通關次數' : '通關時間 (耗時最短/失誤最少)';
        const scopeTitle = scope === 'all' ? '全伺服器' : `限定伺服器 [${StorageManager.formatServerId(serverId)}]`;

        // 檢查當前登入者是否在榜上
        const curUser = this.currentUser;
        let myBanner = '';
        if (curUser && !curUser.isGuest && curUser.id) {
            const myEntry = entries.find(e => e.id === curUser.id);
            if (myEntry) {
                const rankDisplay = myEntry.displayRank === '未上榜' ? '未上榜 (超過前100名)' : `第 ${myEntry.rank} 名`;
                myBanner = `
                    <div class="my-rank-banner">
                        <span>👤 我的勇者：<strong>${curUser.username}</strong> (${curUser.id})</span>
                        <span style="color: #fbbf24; font-weight: bold;">${rankDisplay}</span>
                    </div>
                `;
            } else {
                myBanner = `
                    <div class="my-rank-banner">
                        <span>👤 我的勇者：<strong>${curUser.username}</strong> (${curUser.id})</span>
                        <span class="badge-unranked">未上榜 (尚未擊敗魔龍通關)</span>
                    </div>
                `;
            }
        } else if (curUser && curUser.isGuest) {
            myBanner = `
                <div class="my-rank-banner" style="color: #94a3b8;">
                    <span>🎒 目前為遊客模式 (${curUser.username})</span>
                    <span>遊客不列入排行榜</span>
                </div>
            `;
        }

        if (entries.length === 0) {
            contentEl.innerHTML = `
                ${myBanner}
                <div style="font-size: 13px; color: #a5b4fc; margin-bottom: 8px;">
                    📋 榜單：【${scopeTitle}】的【${typeTitle}】
                </div>
                <div class="lb-empty">
                    <div style="font-size: 38px; margin-bottom: 8px;">📜⚔️</div>
                    <div style="color: #cbd5e1; font-weight: bold; font-size: 15px;">目前尚無玩家上榜！</div>
                    <div style="color: #64748b; font-size: 12px; margin-top: 4px;">只要擊敗魔龍完成冒險，即可榮登排行榜！</div>
                </div>
            `;
            return;
        }

        let rowsHtml = '';
        entries.forEach((entry) => {
            const isMe = curUser && !curUser.isGuest && curUser.id === entry.id;
            let rankHtml = '';
            if (entry.displayRank === '未上榜') {
                rankHtml = `<span class="badge-unranked">未上榜</span>`;
            } else if (entry.rank === 1) {
                rankHtml = `<span style="color: #fbbf24; font-weight: bold; font-size: 15px;">🥇 1</span>`;
            } else if (entry.rank === 2) {
                rankHtml = `<span style="color: #e2e8f0; font-weight: bold; font-size: 15px;">🥈 2</span>`;
            } else if (entry.rank === 3) {
                rankHtml = `<span style="color: #f97316; font-weight: bold; font-size: 15px;">🥉 3</span>`;
            } else {
                rankHtml = `<span style="color: #cbd5e1; font-weight: bold;">${entry.rank}</span>`;
            }

            const trClass = isMe ? ' class="lb-my-row"' : '';
            const nameHtml = isMe ? `<strong style="color: #fbbf24;">${entry.username} (你)</strong>` : entry.username;

            rowsHtml += `
                <tr${trClass}>
                    <td style="font-size: 14px;">${rankHtml}</td>
                    <td style="font-size: 14px; font-weight: bold;">${nameHtml}</td>
                    <td style="font-size: 13px; color: #38bdf8; font-family: monospace;">${entry.id}</td>
                </tr>
            `;
        });

        contentEl.innerHTML = `
            ${myBanner}
            <div style="font-size: 12px; color: #a5b4fc; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                <span>📋 榜單：【${scopeTitle}】的【${typeTitle}】</span>
                <span style="color: #94a3b8; font-size: 11px;">(名次1~100，超過100呈現未上榜)</span>
            </div>
            <table class="leaderboard-table">
                <thead>
                    <tr>
                        <th style="width: 25%;">名次</th>
                        <th style="width: 45%;">玩家名稱</th>
                        <th style="width: 30%;">ID</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        `;
    },

    // ==========================================
    // 統一彈跳視窗展示 (支援 lockSeconds 倒數鎖定停留)
    // ==========================================
    showPopupModal(title, htmlContent, btnText, onConfirm, lockSeconds = 0) {
        if (this.l1MistakeTimer) {
            clearInterval(this.l1MistakeTimer);
            this.l1MistakeTimer = null;
        }

        const modal = document.getElementById('game-result-modal');
        document.getElementById('result-modal-title').innerText = title;
        document.getElementById('result-modal-msg').innerHTML = htmlContent;

        const btn = document.getElementById('result-modal-btn');

        if (lockSeconds > 0) {
            let remain = lockSeconds;
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.innerText = `${btnText} (${remain}秒)`;

            this.l1MistakeTimer = setInterval(() => {
                remain--;
                const timerEl = document.getElementById('l1-fail-lock-timer');
                if (timerEl) {
                    timerEl.innerText = `⏳ 請仔細檢討，停留 5 秒後方可重新挑戰 (${remain})`;
                }

                if (remain <= 0) {
                    clearInterval(this.l1MistakeTimer);
                    this.l1MistakeTimer = null;
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                    btn.innerText = btnText;
                    if (timerEl) {
                        timerEl.innerText = `✅ 已完成檢討，可以點擊下方按鈕重新挑戰！`;
                        timerEl.style.color = '#34d399';
                    }
                } else {
                    btn.innerText = `${btnText} (${remain}秒)`;
                }
            }, 1000);
        } else {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.innerText = btnText;
        }

        btn.onclick = () => {
            if (btn.disabled) return;
            if (this.l1MistakeTimer) {
                clearInterval(this.l1MistakeTimer);
                this.l1MistakeTimer = null;
            }
            modal.classList.add('hidden');
            if (onConfirm) onConfirm();
        };

        modal.classList.remove('hidden');
    }
};

window.GameApp = GameApp;
