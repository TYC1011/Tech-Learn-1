// 後台管理系統邏輯 (Admin Dashboard)
// 密碼：TYC1011

const AdminDashboard = {
    viewMode: 'score', // 'score' (分數) 或 'stars' (星數)
    currentServerFilter: 'all', // 'all' 或 '001'~'999'

    init() {
        this.bindEvents();
    },

    bindEvents() {
        // 後台入口按鈕
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) {
            adminBtn.addEventListener('click', () => {
                this.promptLogin();
            });
        }

        // 後台關閉按鈕
        const closeAdminBtn = document.getElementById('admin-close-btn');
        if (closeAdminBtn) {
            closeAdminBtn.addEventListener('click', () => {
                this.stopAutoSync();
                document.getElementById('admin-modal').classList.add('hidden');
            });
        }

        // 單一玩家詳細紀錄關閉按鈕
        const detailCloseBtn = document.getElementById('admin-detail-close-btn');
        if (detailCloseBtn) {
            detailCloseBtn.addEventListener('click', () => {
                document.getElementById('admin-user-detail-modal').classList.add('hidden');
            });
        }

        // 伺服器各關題數保存按鈕
        const cfgSaveBtn = document.getElementById('admin-cfg-save-btn');
        if (cfgSaveBtn) {
            cfgSaveBtn.addEventListener('click', () => {
                const serverId = document.getElementById('admin-cfg-server')?.value.trim() || '001';
                const l1 = parseInt(document.getElementById('admin-cfg-l1')?.value, 10) || 5;
                const l2 = parseInt(document.getElementById('admin-cfg-l2')?.value, 10) || 10;
                const l3 = parseInt(document.getElementById('admin-cfg-l3')?.value, 10) || 10;
                
                StorageManager.setServerConfig(serverId, { l1Count: l1, l2Count: l2, l3Count: l3 });
                const statusEl = document.getElementById('admin-cfg-status');
                if (statusEl) {
                    statusEl.innerText = `✅ 伺服器 [${StorageManager.formatServerId(serverId)}] 題數已保存 (${Math.max(5, l1)}/${Math.max(5, l2)}/${Math.max(5, l3)})！`;
                    setTimeout(() => { if (statusEl) statusEl.innerText = ''; }, 3000);
                }
            });
        }

        const cfgServerInput = document.getElementById('admin-cfg-server');
        if (cfgServerInput) {
            cfgServerInput.addEventListener('change', () => {
                this.loadServerConfigInputs(cfgServerInput.value.trim());
            });
        }

        // 即時同步按鈕
        const syncBtn = document.getElementById('admin-sync-btn');
        if (syncBtn) {
            syncBtn.addEventListener('click', async () => {
                syncBtn.disabled = true;
                syncBtn.innerText = '⏳ 同步中...';
                await this.refresh();
                syncBtn.innerText = '✅ 同步完成！';
                setTimeout(() => {
                    syncBtn.disabled = false;
                    syncBtn.innerText = '🔄 即時同步所有裝置資料';
                }, 1500);
            });
        }

        // 切換 分數 / 星數 模式
        const toggleModeBtn = document.getElementById('admin-toggle-mode-btn');
        if (toggleModeBtn) {
            toggleModeBtn.addEventListener('click', () => {
                this.viewMode = this.viewMode === 'score' ? 'stars' : 'score';
                toggleModeBtn.innerText = this.viewMode === 'score' ? '切換為：顯示星數 (★)' : '切換為：顯示最高分 (分)';
                this.renderUserTable();
            });
        }

        // 伺服器篩選按鈕與輸入框
        const serverFilterInput = document.getElementById('admin-server-filter-input');
        const serverFilterBtn = document.getElementById('admin-server-filter-btn');
        const serverFilterAllBtn = document.getElementById('admin-server-filter-all-btn');

        if (serverFilterBtn && serverFilterInput) {
            serverFilterBtn.addEventListener('click', () => {
                const rawVal = serverFilterInput.value.trim();
                if (rawVal) {
                    this.currentServerFilter = StorageManager.formatServerId(rawVal);
                    serverFilterInput.value = this.currentServerFilter;
                } else {
                    this.currentServerFilter = 'all';
                }
                this.refresh();
            });
        }

        if (serverFilterAllBtn) {
            serverFilterAllBtn.addEventListener('click', () => {
                this.currentServerFilter = 'all';
                if (serverFilterInput) serverFilterInput.value = '';
                this.refresh();
            });
        }

        // 下載 CSV 資料按鈕
        const downloadCsvBtn = document.getElementById('admin-download-csv-btn');
        if (downloadCsvBtn) {
            downloadCsvBtn.addEventListener('click', () => {
                this.downloadDataCsv();
            });
        }

        // 清空所有資料按鈕
        const clearAllBtn = document.getElementById('admin-clear-all-btn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', async () => {
                if (confirm('【警告】確定要清空所有遊玩者資料嗎？此動作將重置 ID 流水號，下次將重新從 AAA11111 開始！')) {
                    if (confirm('請再次確認：真的要刪除全部資料嗎？')) {
                        StorageManager.clearAllData();
                        alert('已成功清空所有資料！ID 流水號已重設為 AAA11111！');
                        await this.refresh();
                        if (window.GameApp) {
                            window.GameApp.checkSession();
                        }
                    }
                }
            });
        }
        // 後台密碼彈窗事件
        const pwdSubmitBtn = document.getElementById('admin-pwd-submit-btn');
        const pwdCancelBtn = document.getElementById('admin-pwd-cancel-btn');
        const pwdInput = document.getElementById('admin-login-pwd-input');

        if (pwdSubmitBtn) {
            pwdSubmitBtn.addEventListener('click', () => this.submitLoginPassword());
        }
        if (pwdCancelBtn) {
            pwdCancelBtn.addEventListener('click', () => {
                document.getElementById('admin-pwd-modal')?.classList.add('hidden');
            });
        }
        if (pwdInput) {
            pwdInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.submitLoginPassword();
            });
        }
    },

    loadServerConfigInputs(serverId) {
        serverId = StorageManager.formatServerId(serverId || '001');
        const cfg = StorageManager.getServerConfig(serverId);
        const l1El = document.getElementById('admin-cfg-l1');
        const l2El = document.getElementById('admin-cfg-l2');
        const l3El = document.getElementById('admin-cfg-l3');
        const sEl = document.getElementById('admin-cfg-server');
        if (sEl) sEl.value = serverId;
        if (l1El) l1El.value = cfg.l1Count;
        if (l2El) l2El.value = cfg.l2Count;
        if (l3El) l3El.value = cfg.l3Count;
    },

    promptLogin() {
        const modal = document.getElementById('admin-pwd-modal');
        const input = document.getElementById('admin-login-pwd-input');
        const errMsg = document.getElementById('admin-pwd-error-msg');
        if (input) input.value = '';
        if (errMsg) errMsg.innerText = '';
        if (modal) {
            modal.classList.remove('hidden');
            setTimeout(() => input?.focus(), 100);
        }
    },

    submitLoginPassword() {
        const input = document.getElementById('admin-login-pwd-input');
        const errMsg = document.getElementById('admin-pwd-error-msg');
        const val = input ? input.value.trim() : '';

        if (StorageManager.verifyAdmin(val)) {
            const modal = document.getElementById('admin-pwd-modal');
            if (modal) modal.classList.add('hidden');
            this.showModal();
        } else {
            if (errMsg) {
                errMsg.innerText = '❌ 密碼錯誤！請重新輸入。';
            }
        }
    },

    async showModal() {
        const modal = document.getElementById('admin-modal');
        if (modal) {
            modal.classList.remove('hidden');
            await StorageManager.syncWithServer();
            await this.refresh();
            this.startAutoSync();
        }
    },

    async refresh() {
        await StorageManager.syncWithServer();
        this.renderUserTable();
        this.renderGlobalStats();
        const activeServer = this.currentServerFilter === 'all' ? '001' : this.currentServerFilter;
        this.loadServerConfigInputs(activeServer);
    },

    // 下載 CSV 檔案 (下載前先與伺服器同步所有裝置最新紀錄)
    async downloadDataCsv() {
        await StorageManager.syncWithServer();
        const csvContent = StorageManager.exportCsv(this.currentServerFilter);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const timeStr = new Date().toISOString().slice(0, 10);
        const serverLabel = (this.currentServerFilter === 'all') ? '全部伺服器' : `伺服器_${this.currentServerFilter}`;

        link.setAttribute('href', url);
        link.setAttribute('download', `勇者數學冒險_${serverLabel}_答題成果_${timeStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    renderUserTable() {
        const tbody = document.getElementById('admin-user-tbody');
        if (!tbody) return;

        const users = StorageManager.getUsers();
        let userList = Object.entries(users); // [key, user]

        // 伺服器篩選
        if (this.currentServerFilter !== 'all') {
            userList = userList.filter(([k, u]) => (u.serverId || '001') === this.currentServerFilter);
        }

        const filterStatusText = document.getElementById('admin-current-filter-status');
        if (filterStatusText) {
            filterStatusText.innerText = (this.currentServerFilter === 'all') 
                ? '目前顯示：全部伺服器' 
                : `目前顯示：伺服器 [${this.currentServerFilter}]`;
        }

        if (userList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding: 24px; color: #888;">目前尚無符合伺服器條件之遊玩者資料</td></tr>`;
            return;
        }

        const formatTime = (secs) => {
            if (secs === null || secs === undefined) return '--';
            const m = Math.floor(secs / 60);
            const s = secs % 60;
            return `${m}分${s < 10 ? '0' : ''}${s}秒`;
        };

        const formatLevelAchieve = (stat) => {
            if (!stat) return '--';
            if (this.viewMode === 'stars') {
                const stars = stat.bestStars || 0;
                if (stars === 0) return '<span style="color:#777;">未獲星</span>';
                return `<span style="color:#f59e0b; font-weight:bold;">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
            } else {
                return `<span style="font-weight:bold; color:#10b981;">${stat.bestScore || 0}</span> 分`;
            }
        };

        tbody.innerHTML = userList.map(([userKey, u]) => {
            const l1 = u.stats.level1;
            const l2 = u.stats.level2;
            const l3 = u.stats.level3;
            const boss = u.stats.boss;

            const totalRetries = (l1.retryCount || 0) + (l2.retryCount || 0) + (l3.retryCount || 0) + (boss.retryCount || 0);
            const totalClears = (boss.clearCount || 0);

            const minTimeStr = `L1: ${formatTime(l1.minTime)}<br>L2: ${formatTime(l2.minTime)}<br>L3: ${formatTime(l3.minTime)}<br>Boss: ${formatTime(boss.minTime)}`;
            const minErrorsStr = `L1: ${l1.minErrors ?? '--'}次<br>L2: ${l2.minErrors ?? '--'}次<br>L3: ${l3.minErrors ?? '--'}次<br>Boss: ${boss.minErrors ?? '--'}次`;
            const userTitle = u.title || StorageManager.evaluateTitle(u);
            const idDisplay = u.isGuest ? '無 (遊客)' : (u.id || '無');

            // 錯題訂正狀況統計
            const nb = StorageManager.getUserNotebookStats(u);
            const nbHtml = nb.total === 0 
                ? `<span style="color: #10b981; font-weight: bold; font-size: 12px;">🌟 0 錯題 (全對)</span>`
                : `
                    <div style="font-size: 12px; line-height: 1.4;">
                        <span>總錯：<strong>${nb.total}</strong> 題</span><br>
                        <span style="color: #10b981; font-weight: bold;">已訂正：${nb.solved}</span> ｜ 
                        <span style="color: ${nb.unsolved > 0 ? '#ef4444' : '#10b981'}; font-weight: bold;">未訂正：${nb.unsolved}</span>
                    </div>
                `;

            return `
                <tr style="cursor: pointer;" onclick="AdminDashboard.showUserDetail('${userKey}')" title="點選查看此玩家各次紀錄、最佳紀錄、最新紀錄與錯題訂正明細">
                    <td style="text-align:center;">
                        <span class="server-tag-badge">${escapeHtml(u.serverId || '001')}</span>
                    </td>
                    <td>
                        <strong>${escapeHtml(u.username)}</strong>
                        <div style="font-size: 11px; color: #fbbf24; font-weight: bold; margin-top: 2px;">🏅 ${escapeHtml(userTitle)}</div>
                        <div style="font-size: 11px; color: #a5b4fc; font-family: monospace;">ID: ${escapeHtml(idDisplay)}</div>
                    </td>
                    <td>${formatLevelAchieve(l1)}</td>
                    <td>${formatLevelAchieve(l2)}</td>
                    <td>${formatLevelAchieve(l3)}</td>
                    <td>${formatLevelAchieve(boss)}</td>
                    <td style="font-size: 12px; line-height: 1.4;">${minTimeStr}</td>
                    <td style="font-size: 12px; line-height: 1.4;">${minErrorsStr}</td>
                    <td>${nbHtml}</td>
                    <td style="text-align:center;">
                        <span style="color:#ef4444; font-weight:bold;">${totalRetries}</span> 次
                        <div style="font-size:11px; color:#888;">(L1:${l1.retryCount||0}/L2:${l2.retryCount||0}/L3:${l3.retryCount||0}/B:${boss.retryCount||0})</div>
                    </td>
                    <td style="text-align:center;">
                        <span style="color:#3b82f6; font-weight:bold;">${totalClears}</span> 次
                    </td>
                    <td style="text-align:center;" onclick="event.stopPropagation();">
                        <button class="pixel-btn-secondary" style="padding: 4px 8px; font-size: 11px; margin-right: 4px;" onclick="AdminDashboard.showUserDetail('${userKey}')">🔍 明細</button>
                        <button class="pixel-btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="AdminDashboard.deleteSingleUser('${userKey}')">刪除</button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    // 點選玩家以查詢該玩家每次紀錄、最佳紀錄、最新紀錄
    showUserDetail(userKey) {
        const users = StorageManager.getUsers();
        const u = users[userKey];
        if (!u) return;

        const modal = document.getElementById('admin-user-detail-modal');
        if (!modal) return;

        const titleText = document.getElementById('detail-user-title');
        if (titleText) titleText.innerText = `🔍 勇者【${u.username}】詳細冒險歷程`;

        const headerBox = document.getElementById('detail-user-header');
        const userTitle = u.title || StorageManager.evaluateTitle(u);
        const idDisplay = u.isGuest ? '無 (遊客編號 ' + (u.guestNum || '--') + ')' : (u.id || '無');
        if (headerBox) {
            headerBox.innerHTML = `
                <div style="font-size: 16px; font-weight: 900; color: #fbbf24; margin-bottom: 4px;">
                    🏰 伺服器 [${escapeHtml(u.serverId || '001')}] ｜ ${escapeHtml(u.username)}
                    <span style="font-size: 12px; color: #a5b4fc; margin-left: 8px;">(${u.isGuest ? '遊客模式' : '正式註冊勇者'})</span>
                </div>
                <div style="font-size: 13px; color: #cbd5e1; display: flex; gap: 16px; flex-wrap: wrap;">
                    <span><strong>勇者 ID：</strong>${escapeHtml(idDisplay)}</span>
                    <span><strong>獲封稱號：</strong><span style="color:#fef08a;">${escapeHtml(userTitle)}</span></span>
                    <span><strong>建立時間：</strong>${u.createdAt ? new Date(u.createdAt).toLocaleString() : '--'}</span>
                </div>
            `;
        }

        const formatSecs = (sec) => {
            if (sec === null || sec === undefined) return '--';
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            return `${m}分${s < 10 ? '0' : ''}${s}秒`;
        };

        const renderStars = (stars) => {
            if (!stars) return '☆☆☆';
            return `<span style="color:#fbbf24;">${'★'.repeat(stars)}</span>${'☆'.repeat(3 - stars)}`;
        };

        // 渲染最佳紀錄
        const bestContainer = document.getElementById('detail-best-records');
        if (bestContainer) {
            const levels = [
                { key: 'level1', name: '第1關 迷霧森林' },
                { key: 'level2', name: '第2關 魔法村莊' },
                { key: 'level3', name: '第3關 神殿祕寶' },
                { key: 'boss', name: '魔王關 討伐魔龍' }
            ];
            bestContainer.innerHTML = levels.map(lv => {
                const s = u.stats[lv.key] || {};
                return `
                    <div class="detail-stat-card">
                        <div class="detail-stat-label">${lv.name}</div>
                        <div class="detail-stat-val">${s.bestScore || 0} 分 ${renderStars(s.bestStars)}</div>
                        <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">
                            最快：${formatSecs(s.minTime)} ｜ 最少錯：${s.minErrors ?? '--'}次<br>
                            通關：${s.clearCount || 0}次 ｜ 重來：${s.retryCount || 0}次
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 渲染最新紀錄
        const latestContainer = document.getElementById('detail-latest-records');
        if (latestContainer) {
            const levels = [
                { key: 'level1', name: '第1關 迷霧森林' },
                { key: 'level2', name: '第2關 魔法村莊' },
                { key: 'level3', name: '第3關 神殿祕寶' },
                { key: 'boss', name: '魔王關 討伐魔龍' }
            ];
            latestContainer.innerHTML = levels.map(lv => {
                const lr = (u.latestRecords && u.latestRecords[lv.key]) || null;
                if (!lr) {
                    return `
                        <div class="detail-stat-card" style="opacity: 0.6;">
                            <div class="detail-stat-label">${lv.name}</div>
                            <div style="font-size: 13px; color: #888; margin-top: 4px;">尚未挑戰</div>
                        </div>
                    `;
                }
                return `
                    <div class="detail-stat-card">
                        <div class="detail-stat-label">${lv.name}</div>
                        <div class="detail-stat-val">${lr.score} 分 ${renderStars(lr.stars)}</div>
                        <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">
                            耗時：${formatSecs(lr.timeSeconds)} ｜ 失誤：${lr.errorCount}次<br>
                            狀態：${lr.passed ? '<span style="color:#10b981;">通關成功</span>' : '<span style="color:#ef4444;">挑戰中斷</span>'} ｜ ${new Date(lr.timestamp).toLocaleTimeString()}
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 渲染每次遊玩紀錄詳細清單
        const historyTbody = document.getElementById('detail-history-tbody');
        if (historyTbody) {
            const hList = u.history || [];
            if (hList.length === 0) {
                historyTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 14px; color:#888;">尚未有歷次遊玩日誌記錄</td></tr>`;
            } else {
                historyTbody.innerHTML = hList.map(h => {
                    const timeFormatted = h.timestamp ? new Date(h.timestamp).toLocaleString() : '--';
                    const passBadge = h.passed ? '<span style="color:#10b981; font-weight:bold;">通關 ✅</span>' : '<span style="color:#ef4444;">失敗 ❌</span>';
                    return `
                        <tr>
                            <td style="font-size: 11px; color: #94a3b8;">${timeFormatted}</td>
                            <td><strong>${escapeHtml(h.levelName || h.levelKey)}</strong></td>
                            <td style="color:#10b981; font-weight:bold;">${h.score} 分</td>
                            <td>${renderStars(h.stars)}</td>
                            <td>${formatSecs(h.timeSeconds)}</td>
                            <td>${h.errorCount} 次</td>
                            <td>${passBadge}</td>
                        </tr>
                    `;
                }).join('');
            }
        }

        // 渲染錯題筆記本詳細清單
        const notebookTbody = document.getElementById('detail-notebook-tbody');
        if (notebookTbody) {
            const nbList = u.notebook || [];
            if (nbList.length === 0) {
                notebookTbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 14px; color:#10b981; font-weight:bold;">🌟 該勇者無任何錯題記錄（全對）！</td></tr>`;
            } else {
                notebookTbody.innerHTML = nbList.map(n => {
                    const timeFormatted = n.timestamp ? new Date(n.timestamp).toLocaleString() : '--';
                    const statusBadge = n.solved
                        ? '<span style="color:#10b981; font-weight:bold;">✅ 已訂正完成</span>'
                        : '<span style="color:#ef4444; font-weight:bold;">❌ 尚未訂正</span>';
                    return `
                        <tr>
                            <td style="font-size: 11px; color: #94a3b8;">${timeFormatted}</td>
                            <td><strong>${escapeHtml(n.levelName || n.levelKey)}</strong></td>
                            <td style="color:#38bdf8; font-weight:bold; font-family:monospace;">${escapeHtml(n.expr)} ＝ ？</td>
                            <td style="color:#f87171;">${escapeHtml(n.userChoice || '--')}</td>
                            <td style="color:#34d399; font-weight:bold;">${escapeHtml(n.answer || '--')}</td>
                            <td>${statusBadge}</td>
                        </tr>
                    `;
                }).join('');
            }
        }

        modal.classList.remove('hidden');
    },

    autoSyncTimer: null,

    startAutoSync() {
        this.stopAutoSync();
        this.autoSyncTimer = setInterval(async () => {
            const modal = document.getElementById('admin-modal');
            if (!modal || modal.classList.contains('hidden')) {
                this.stopAutoSync();
                return;
            }
            await StorageManager.syncWithServer();
            this.renderUserTable();
            this.renderGlobalStats();
        }, 5000);
    },

    stopAutoSync() {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
            this.autoSyncTimer = null;
        }
    },

    async deleteSingleUser(userKey) {
        const users = StorageManager.getUsers();
        const u = users[userKey];
        const name = u ? u.username : userKey;
        if (confirm(`確定要刪除玩家「${name}」的所有紀錄嗎？`)) {
            StorageManager.deleteUser(userKey);
            alert('已成功刪除該玩家！');
            await this.refresh();
            if (window.GameApp) {
                window.GameApp.checkSession();
            }
        }
    },

    renderGlobalStats() {
        let users = Object.values(StorageManager.getUsers());
        if (this.currentServerFilter !== 'all') {
            users = users.filter(u => (u.serverId || '001') === this.currentServerFilter);
        }

        const totalCount = users.length;

        let l1Pass = 0, l2Pass = 0, l3Pass = 0, bossPass = 0;
        let l2TotalScore = 0, l3TotalScore = 0, bossTotalScore = 0;
        let l2Stars3 = 0, l3Stars3 = 0, bossStars3 = 0;
        let totalRetriesAll = 0;

        users.forEach(u => {
            const s = u.stats;
            if (s.level1.clearCount > 0) l1Pass++;
            if (s.level2.clearCount > 0) l2Pass++;
            if (s.level3.clearCount > 0) l3Pass++;
            if (s.boss.clearCount > 0) bossPass++;

            l2TotalScore += (s.level2.bestScore || 0);
            l3TotalScore += (s.level3.bestScore || 0);
            bossTotalScore += (s.boss.bestScore || 0);

            if (s.level2.bestStars === 3) l2Stars3++;
            if (s.level3.bestStars === 3) l3Stars3++;
            if (s.boss.bestStars === 3) bossStars3++;

            totalRetriesAll += (s.level1.retryCount || 0) + (s.level2.retryCount || 0) + (s.level3.retryCount || 0) + (s.boss.retryCount || 0);
        });

        const avgL2 = totalCount > 0 ? Math.round(l2TotalScore / totalCount) : 0;
        const avgL3 = totalCount > 0 ? Math.round(l3TotalScore / totalCount) : 0;
        const avgBoss = totalCount > 0 ? Math.round(bossTotalScore / totalCount) : 0;

        const summaryEl = document.getElementById('admin-stats-summary');
        if (summaryEl) {
            summaryEl.innerHTML = `
                <div class="stat-card">
                    <div class="stat-num">${totalCount}</div>
                    <div class="stat-label">此伺服器 勇者總人數</div>
                </div>
                <div class="stat-card">
                    <div class="stat-num" style="color: #10b981;">${bossPass} <span style="font-size:13px; color:#888;">/ ${totalCount}</span></div>
                    <div class="stat-label">全破擊敗魔龍 (救人質)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-num" style="color: #ef4444;">${totalRetriesAll}</div>
                    <div class="stat-label">全體累計重來次數</div>
                </div>
                <div class="stat-card">
                    <div class="stat-num" style="color: #3b82f6;">${l1Pass} <span style="font-size:13px; color:#888;">/ ${totalCount}</span></div>
                    <div class="stat-label">第1關(迷霧) 通關數</div>
                </div>
                <div class="stat-card">
                    <div class="stat-num" style="color: #8b5cf6;">${avgL2}分</div>
                    <div class="stat-label">第2關(村莊) 平均分 (三星: ${l2Stars3}人)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-num" style="color: #ec4899;">${avgL3}分</div>
                    <div class="stat-label">第3關(神殿) 平均分 (三星: ${l3Stars3}人)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-num" style="color: #f59e0b;">${avgBoss}分</div>
                    <div class="stat-label">Boss關 平均分 (三星: ${bossStars3}人)</div>
                </div>
            `;
        }
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

if (typeof window !== 'undefined') {
    window.AdminDashboard = AdminDashboard;
}
