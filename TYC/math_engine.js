// 國小四年級下學期數學：整數四則運算 題目生成與計算引擎
// 符號使用：＋、−、×、÷

const MathEngine = {
    // 取得隨機整數 [min, max]
    randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    // 隨機選擇陣列中的一項
    pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    },

    // 隨機洗牌
    shuffle(arr) {
        const res = [...arr];
        for (let i = res.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [res[i], res[j]] = [res[j], res[i]];
        }
        return res;
    },

    // ==========================================
    // Level 1: 單一加減乘除運算
    // 加減：百位以內 (例如 35+86，可到百位數)
    // 乘法：其中一個是非 1 個位數 (2~9)，另一個也是非 1 但位數不限 (例如 12~85 或 2~9)
    // 除法：商必須是整數 (除數 >= 2, 商 >= 2)
    // ==========================================
    generateLevel1Question() {
        const ops = ['＋', '−', '×', '÷'];
        const op = this.pick(ops);
        let a, b, answer;

        if (op === '＋') {
            // 加法：可到百位
            a = this.randInt(15, 350);
            b = this.randInt(15, 350);
            answer = a + b;
        } else if (op === '−') {
            // 減法：結果正整數，被減數大於減數
            b = this.randInt(15, 350);
            answer = this.randInt(10, 350);
            a = b + answer;
        } else if (op === '×') {
            // 其中一個非 1 個位數 (2~9)，另一個非 1 位數不限 (11~65 或 2~9)
            const single = this.randInt(2, 9);
            const other = this.randInt(11, 49);
            if (Math.random() < 0.5) {
                a = single;
                b = other;
            } else {
                a = other;
                b = single;
            }
            answer = a * b;
        } else {
            // 除法：商為整數，除數 >= 2, 商 >= 2
            const divisor = this.randInt(2, 9);
            const quotient = this.randInt(3, 40);
            a = divisor * quotient;
            b = divisor;
            answer = quotient;
        }

        // 產生具誘答力的干擾項
        const distractors = new Set();
        
        // 誘答力策略：常見計算錯誤（正負符號看錯、乘法進位錯誤、加減借位錯誤、加成減）
        if (op === '＋') {
            distractors.add(Math.abs(a - b)); // 算成減法
            distractors.add(answer + 10);      // 進位多算 10
            distractors.add(answer - 10);      // 忘記進位
            distractors.add(answer + 1);
            distractors.add(answer - 1);
        } else if (op === '−') {
            distractors.add(a + b);            // 算成加法
            distractors.add(answer + 10);      // 借位退位算錯
            distractors.add(answer - 10);
            distractors.add(answer + 1);
            distractors.add(answer - 1);
        } else if (op === '×') {
            distractors.add(a + b);            // 乘算成加
            distractors.add(answer + a);       // 少乘一次
            distractors.add(answer - a);
            distractors.add(answer + 10);
            distractors.add(answer - 10);
        } else { // ÷
            distractors.add(a - b);            // 除算成減
            distractors.add(answer + 2);
            distractors.add(answer - 1 > 0 ? answer - 1 : answer + 3);
            distractors.add(answer + 10);
        }

        distractors.delete(answer);
        const validDistractors = Array.from(distractors).filter(n => typeof n === 'number' && n > 0 && n !== answer);
        
        // 如果不足 2 個，補充鄰近隨機數
        while (validDistractors.length < 2) {
            const offset = this.pick([-3, -2, -1, 1, 2, 3, 5, -5]);
            const candidate = answer + offset;
            if (candidate > 0 && candidate !== answer && !validDistractors.includes(candidate)) {
                validDistractors.push(candidate);
            }
        }

        const pickedDistractors = this.shuffle(validDistractors).slice(0, 2);
        const options = this.shuffle([
            { text: String(answer), isCorrect: true, val: answer },
            { text: String(pickedDistractors[0]), isCorrect: false, val: pickedDistractors[0] },
            { text: String(pickedDistractors[1]), isCorrect: false, val: pickedDistractors[1] }
        ]);

        return {
            expr: `${a} ${op} ${b}`,
            a,
            b,
            op,
            answer,
            options
        };
    },

    // ==========================================
    // Level 2: 連續加減乘除四則運算 - 判斷與逐步融合
    // 包含括號或乘除加減，例如：
    // 型式 1: a + b × c
    // 型式 2: a × b - c
    // 型式 3: (a + b) × c
    // 型式 4: a + b ÷ c
    // 型式 5: a - (b + c)
    // 型式 6: a × (b - c)
    // 嚴格遵守：
    // - 乘法一個是非 1 個位數 (2~9)，另一個也是非 1 但位數不限
    // - 除法商必為整數
    // - 全程皆為正整數
    // ==========================================
    generateLevel2Question() {
        const types = ['add_mul', 'mul_sub', 'paren_add_mul', 'sub_div', 'paren_sub_mul', 'add_div_sub'];
        const type = this.pick(types);

        let initialTokens = []; 
        // token 格式:
        // { type: 'num', id: 0, val: 6 }
        // { type: 'op', id: 1, val: '＋' }
        // { type: 'paren', val: '(' }
        
        if (type === 'add_mul') {
            // A ＋ B × C
            const B = this.randInt(2, 9);
            const C = this.randInt(2, 15);
            const A = this.randInt(10, 80);
            // 優先計算 B × C
            initialTokens = [
                { type: 'num', id: 'n0', val: A },
                { type: 'op', id: 'o0', val: '＋' },
                { type: 'num', id: 'n1', val: B },
                { type: 'op', id: 'o1', val: '×' },
                { type: 'num', id: 'n2', val: C }
            ];
        } else if (type === 'mul_sub') {
            // A × B − C
            const A = this.randInt(2, 9);
            const B = this.randInt(6, 18);
            const prod = A * B;
            const C = this.randInt(5, prod - 5);
            initialTokens = [
                { type: 'num', id: 'n0', val: A },
                { type: 'op', id: 'o0', val: '×' },
                { type: 'num', id: 'n1', val: B },
                { type: 'op', id: 'o1', val: '−' },
                { type: 'num', id: 'n2', val: C }
            ];
        } else if (type === 'paren_add_mul') {
            // (A ＋ B) × C
            const C = this.randInt(2, 9);
            const A = this.randInt(5, 30);
            const B = this.randInt(5, 30);
            initialTokens = [
                { type: 'paren_left', val: '(' },
                { type: 'num', id: 'n0', val: A },
                { type: 'op', id: 'o0', val: '＋' },
                { type: 'num', id: 'n1', val: B },
                { type: 'paren_right', val: ')' },
                { type: 'op', id: 'o1', val: '×' },
                { type: 'num', id: 'n2', val: C }
            ];
        } else if (type === 'sub_div') {
            // A − B ÷ C
            const C = this.randInt(2, 9);
            const quot = this.randInt(3, 15);
            const B = C * quot;
            const A = quot + this.randInt(10, 50);
            initialTokens = [
                { type: 'num', id: 'n0', val: A },
                { type: 'op', id: 'o0', val: '−' },
                { type: 'num', id: 'n1', val: B },
                { type: 'op', id: 'o1', val: '÷' },
                { type: 'num', id: 'n2', val: C }
            ];
        } else if (type === 'paren_sub_mul') {
            // A × (B − C)
            const A = this.randInt(2, 9);
            const C = this.randInt(4, 25);
            const diff = this.randInt(2, 12);
            const B = C + diff;
            initialTokens = [
                { type: 'num', id: 'n0', val: A },
                { type: 'op', id: 'o0', val: '×' },
                { type: 'paren_left', val: '(' },
                { type: 'num', id: 'n1', val: B },
                { type: 'op', id: 'o1', val: '−' },
                { type: 'num', id: 'n2', val: C },
                { type: 'paren_right', val: ')' }
            ];
        } else {
            // A ＋ B ÷ C
            const C = this.randInt(2, 9);
            const quot = this.randInt(2, 20);
            const B = C * quot;
            const A = this.randInt(10, 100);
            initialTokens = [
                { type: 'num', id: 'n0', val: A },
                { type: 'op', id: 'o0', val: '＋' },
                { type: 'num', id: 'n1', val: B },
                { type: 'op', id: 'o1', val: '÷' },
                { type: 'num', id: 'n2', val: C }
            ];
        }

        return {
            id: Date.now() + Math.random(),
            initialTokens
        };
    },

    // 判斷兩個被選中的數字是否為合法的第一優先計算組合
    // tokens: 目前算式的 token 清單
    // numId1, numId2: 玩家點選的兩個數字 token 的 id
    validateAndFuseTokens(tokens, numId1, numId2) {
        // 1. 找出兩個數字在 tokens 中的位置
        let idx1 = tokens.findIndex(t => t.id === numId1);
        let idx2 = tokens.findIndex(t => t.id === numId2);
        if (idx1 === -1 || idx2 === -1) return { success: false, reason: '請選擇兩個相鄰的數字！' };
        if (idx1 > idx2) {
            [idx1, idx2] = [idx2, idx1];
        }

        // 2. 檢查這兩個數字之間是否恰好隔著一個運算子
        if (idx2 - idx1 !== 2 || tokens[idx1 + 1].type !== 'op') {
            return { success: false, reason: '請選擇被運算符號隔開的兩個數字！' };
        }

        const opToken = tokens[idx1 + 1];
        const num1 = tokens[idx1].val;
        const num2 = tokens[idx2].val;
        const op = opToken.val;

        // 3. 檢查優先權規則：
        // 規則 A: 如果有括號，必須先算括號內的運算！
        // 檢查整個算式是否有括號
        const hasLeftParen = tokens.some(t => t.type === 'paren_left');
        const hasRightParen = tokens.some(t => t.type === 'paren_right');

        if (hasLeftParen && hasRightParen) {
            const leftParenIdx = tokens.findIndex(t => t.type === 'paren_left');
            const rightParenIdx = tokens.findIndex(t => t.type === 'paren_right');

            // 檢查玩家選擇的運算是否在括號內
            const isInParen = (idx1 > leftParenIdx && idx2 < rightParenIdx);
            if (!isInParen) {
                return { success: false, reason: '括號要先算喔！請先算括號裡面的算式。' };
            }
        }

        // 規則 B: 先乘除後加減！
        // 如果當前選擇的是加或減 (＋, −)，但同級別範圍內還有乘或除 (×, ÷)，則違規！
        if (op === '＋' || op === '−') {
            // 找出可計算範圍（若在括號內，則只看括號內；否則只看無括號的外部）
            let searchStart = 0;
            let searchEnd = tokens.length;
            if (hasLeftParen && hasRightParen) {
                const lp = tokens.findIndex(t => t.type === 'paren_left');
                const rp = tokens.findIndex(t => t.type === 'paren_right');
                if (idx1 > lp && idx2 < rp) {
                    searchStart = lp + 1;
                    searchEnd = rp;
                } else {
                    // 在括號外，但在這之前前面已經擋掉沒算括號的情況了
                }
            }

            for (let i = searchStart; i < searchEnd; i++) {
                if (tokens[i].type === 'op' && (tokens[i].val === '×' || tokens[i].val === '÷')) {
                    return { success: false, reason: '先乘除後加減！請先算乘法或除法。' };
                }
            }
        }

        // 計算融合結果
        let fusedVal;
        if (op === '＋') fusedVal = num1 + num2;
        else if (op === '−') fusedVal = num1 - num2;
        else if (op === '×') fusedVal = num1 * num2;
        else if (op === '÷') {
            if (num2 === 0 || num1 % num2 !== 0) {
                return { success: false, reason: '除法運算必須整除！請選擇能整除的運算步驟。' };
            }
            fusedVal = num1 / num2;
        }

        // 產生新的 tokens 序列
        const newTokens = [];
        for (let i = 0; i < tokens.length; i++) {
            if (i === idx1) {
                newTokens.push({
                    type: 'num',
                    id: 'fused_' + Date.now() + '_' + Math.random(),
                    val: fusedVal,
                    isNew: true
                });
                i = idx2; // 跳過中間的 op 和第二個 num
            } else {
                newTokens.push(tokens[i]);
            }
        }

        // 如果新 tokens 中括號內只剩單一數字，自動脫除括號
        const cleanTokens = [];
        for (let i = 0; i < newTokens.length; i++) {
            if (newTokens[i].type === 'paren_left' && 
                i + 2 < newTokens.length && 
                newTokens[i + 1].type === 'num' && 
                newTokens[i + 2].type === 'paren_right') {
                cleanTokens.push(newTokens[i + 1]);
                i += 2;
            } else {
                cleanTokens.push(newTokens[i]);
            }
        }

        const remainingNums = cleanTokens.filter(t => t.type === 'num').length;

        return {
            success: true,
            fusedVal,
            tokens: cleanTokens,
            isCompleted: remainingNums === 1,
            finalResult: cleanTokens.find(t => t.type === 'num')?.val
        };
    },

    // ==========================================
    // Level 3: 神殿祕寶 - 固定最多為三數字的四則運算 (+ - * /)
    // 門上有四則運算式，輸入正整數號碼
    // 最多 3 個數字 (2 個運算子)，乘法其一為2~9，除法整除，加減乘除混合與括號
    // ==========================================
    generateLevel3Question() {
        const templates = [
            // 模板 1: A ＋ B × C (3數字)
            () => {
                const B = this.randInt(2, 9);
                const C = this.randInt(2, 25);
                const A = this.randInt(10, 100);
                const ans = A + B * C;
                return { expr: `${A} ＋ ${B} × ${C}`, answer: ans };
            },
            // 模板 2: B × C ＋ A (3數字)
            () => {
                const B = this.randInt(2, 9);
                const C = this.randInt(2, 25);
                const A = this.randInt(10, 100);
                const ans = B * C + A;
                return { expr: `${B} × ${C} ＋ ${A}`, answer: ans };
            },
            // 模板 3: A − B × C (3數字)
            () => {
                const B = this.randInt(2, 9);
                const C = this.randInt(2, 20);
                const prod = B * C;
                const A = prod + this.randInt(10, 90);
                const ans = A - prod;
                return { expr: `${A} − ${B} × ${C}`, answer: ans };
            },
            // 模板 4: B × C − A (3數字)
            () => {
                const B = this.randInt(2, 9);
                const C = this.randInt(6, 25);
                const prod = B * C;
                const A = this.randInt(5, prod - 5);
                const ans = prod - A;
                return { expr: `${B} × ${C} − ${A}`, answer: ans };
            },
            // 模板 5: (A ＋ B) × C (3數字)
            () => {
                const C = this.randInt(2, 9);
                const A = this.randInt(5, 40);
                const B = this.randInt(5, 40);
                const ans = (A + B) * C;
                return { expr: `(${A} ＋ ${B}) × ${C}`, answer: ans };
            },
            // 模板 6: (A − B) × C (3數字)
            () => {
                const C = this.randInt(2, 9);
                const diff = this.randInt(3, 20);
                const B = this.randInt(5, 30);
                const A = B + diff;
                const ans = diff * C;
                return { expr: `(${A} − ${B}) × ${C}`, answer: ans };
            },
            // 模板 7: A × (B ＋ C) (3數字)
            () => {
                const A = this.randInt(2, 9);
                const B = this.randInt(5, 30);
                const C = this.randInt(5, 30);
                const ans = A * (B + C);
                return { expr: `${A} × (${B} ＋ ${C})`, answer: ans };
            },
            // 模板 8: A × (B − C) (3數字)
            () => {
                const A = this.randInt(2, 9);
                const diff = this.randInt(3, 20);
                const C = this.randInt(5, 25);
                const B = C + diff;
                const ans = A * diff;
                return { expr: `${A} × (${B} − ${C})`, answer: ans };
            },
            // 模板 9: A ＋ B ÷ C (3數字)
            () => {
                const C = this.randInt(2, 9);
                const quot = this.randInt(3, 25);
                const B = C * quot;
                const A = this.randInt(10, 100);
                const ans = A + quot;
                return { expr: `${A} ＋ ${B} ÷ ${C}`, answer: ans };
            },
            // 模板 10: A − B ÷ C (3數字)
            () => {
                const C = this.randInt(2, 9);
                const quot = this.randInt(3, 25);
                const B = C * quot;
                const A = quot + this.randInt(10, 100);
                const ans = A - quot;
                return { expr: `${A} − ${B} ÷ ${C}`, answer: ans };
            },
            // 模板 11: (A ＋ B) ÷ C (3數字)
            () => {
                const C = this.randInt(2, 9);
                const quot = this.randInt(3, 25);
                const total = C * quot;
                const A = this.randInt(2, total - 2);
                const B = total - A;
                return { expr: `(${A} ＋ ${B}) ÷ ${C}`, answer: quot };
            },
            // 模板 12: (A − B) ÷ C (3數字)
            () => {
                const C = this.randInt(2, 9);
                const quot = this.randInt(3, 25);
                const diff = C * quot;
                const B = this.randInt(10, 50);
                const A = B + diff;
                return { expr: `(${A} − ${B}) ÷ ${C}`, answer: quot };
            },
            // 模板 13: A ＋ B − C (3數字)
            () => {
                const A = this.randInt(20, 100);
                const B = this.randInt(15, 80);
                const C = this.randInt(10, A + B - 10);
                const ans = A + B - C;
                return { expr: `${A} ＋ ${B} − ${C}`, answer: ans };
            },
            // 模板 14: A − B ＋ C (3數字)
            () => {
                const B = this.randInt(15, 60);
                const A = B + this.randInt(10, 80);
                const C = this.randInt(10, 80);
                const ans = A - B + C;
                return { expr: `${A} − ${B} ＋ ${C}`, answer: ans };
            },
            // 模板 15: A × B ÷ C (3數字)
            () => {
                const C = this.randInt(2, 9);
                const quot = this.randInt(2, 15);
                const A = C * quot;
                const B = this.randInt(2, 9);
                const ans = quot * B;
                return { expr: `${A} × ${B} ÷ ${C}`, answer: ans };
            },
            // 模板 16: A ÷ B × C (3數字)
            () => {
                const B = this.randInt(2, 9);
                const quot = this.randInt(2, 15);
                const A = B * quot;
                const C = this.randInt(2, 9);
                const ans = quot * C;
                return { expr: `${A} ÷ ${B} × ${C}`, answer: ans };
            },
            // 模板 17: A ÷ (B ＋ C) (3數字)
            () => {
                const B = this.randInt(2, 20);
                const C = this.randInt(2, 20);
                const sum = B + C;
                const quot = this.randInt(2, 15);
                const A = sum * quot;
                return { expr: `${A} ÷ (${B} ＋ ${C})`, answer: quot };
            },
            // 模板 18: A ÷ (B − C) (3數字)
            () => {
                const C = this.randInt(2, 20);
                const diff = this.randInt(2, 9);
                const B = C + diff;
                const quot = this.randInt(2, 15);
                const A = diff * quot;
                return { expr: `${A} ÷ (${B} − ${C})`, answer: quot };
            }
        ];

        for (let tries = 0; tries < 50; tries++) {
            const generator = this.pick(templates);
            const q = generator();
            if (this.isExactDivision(q.expr) && Number.isInteger(q.answer) && q.answer > 0) {
                return q;
            }
        }
        return templates[0]();
    },

    // ==========================================
    // Boss 關: 討伐魔龍
    // 魔龍出一個混和四則運算式 (Dragon Skill)
    // 勇者有 3 個混和四則運算式，其中 1 個值與魔龍相同，另 2 個值不同
    // ==========================================
    generateBossQuestion() {
        // 生成魔龍式子（目標值 Target Value）
        const dragonQ = this.generateLevel3Question();
        const targetVal = dragonQ.answer;

        // 生成與 targetVal 相同的攻擊招式式子 (Correct Attack)
        const correctAttack = this.generateEquivalentExpression(targetVal, dragonQ.expr);

        // 生成另外 2 個數值不同的攻擊招式 (Distractor Attacks)
        const distractors = [];
        let attempts = 0;
        while (distractors.length < 2 && attempts < 50) {
            attempts++;
            const fakeQ = this.generateLevel3Question();
            if (fakeQ.answer !== targetVal && !distractors.some(d => d.answer === fakeQ.answer) && this.isExactDivision(fakeQ.expr)) {
                distractors.push(fakeQ);
            }
        }

        // 如果生成失敗備用
        if (distractors.length < 2) {
            distractors.push({ expr: `${targetVal + 10} ＋ 5 − 5`, answer: targetVal + 10 });
            distractors.push({ expr: `${targetVal - 8 > 0 ? targetVal - 8 : targetVal + 18} ＋ 2`, answer: targetVal - 8 > 0 ? targetVal - 8 : targetVal + 18 });
        }

        const attackSkills = this.shuffle([
            { id: 'skill_1', expr: correctAttack.expr, value: targetVal, isMatch: true },
            { id: 'skill_2', expr: distractors[0].expr, value: distractors[0].answer, isMatch: false },
            { id: 'skill_3', expr: distractors[1].expr, value: distractors[1].answer, isMatch: false }
        ]);

        return {
            dragonExpr: dragonQ.expr,
            targetVal: targetVal,
            attacks: attackSkills
        };
    },

    // 輔助函式：根據目標值產生另一個等值的混和四則運算式
    generateEquivalentExpression(targetVal, avoidExpr) {
        // 嘗試幾種組合模式
        const strategies = [
            // 策略 1: X ＋ Y × Z = targetVal
            () => {
                const Z = this.randInt(2, 9);
                const maxProd = Math.min(targetVal - 2, 70);
                if (maxProd < Z * 2) return null;
                const Y = this.randInt(2, Math.floor(maxProd / Z));
                const prod = Y * Z;
                const X = targetVal - prod;
                if (X <= 0) return null;
                return { expr: `${X} ＋ ${Y} × ${Z}` };
            },
            // 策略 2: (targetVal + K) − K
            () => {
                const K = this.randInt(5, 40);
                const M = this.randInt(2, 9);
                const mult = K * M;
                // (targetVal + K) 式子
                return { expr: `${targetVal + K} − ${mult} ÷ ${M}` };
            },
            // 策略 3: (A ＋ B) × C = targetVal
            () => {
                // 如果 targetVal 有因數 2~9
                for (let C = 9; C >= 2; C--) {
                    if (targetVal % C === 0) {
                        const sum = targetVal / C;
                        if (sum >= 6) {
                            const A = this.randInt(2, sum - 2);
                            const B = sum - A;
                            return { expr: `(${A} ＋ ${B}) × ${C}` };
                        }
                    }
                }
                return null;
            },
            // 策略 4: X − Y × Z = targetVal
            () => {
                const Z = this.randInt(2, 8);
                const Y = this.randInt(2, 6);
                const prod = Y * Z;
                const X = targetVal + prod;
                return { expr: `${X} − ${Y} × ${Z}` };
            }
        ];

        this.shuffle(strategies);
        for (const strat of strategies) {
            const res = strat();
            if (res && res.expr !== avoidExpr && this.isExactDivision(res.expr)) {
                return res;
            }
        }

        // 萬用後備：保證數值絕對正確且整除
        const k = this.randInt(2, 9);
        return { expr: `${targetVal} ＋ ${k} × 2 − ${k * 2}` };
    },

    // 嚴格檢驗算式中所有的除法運算步驟是否皆能整除 (無小數或餘數)
    isExactDivision(expr) {
        if (!expr) return true;
        const sanitized = String(expr)
            .replace(/＝.*/g, '')
            .replace(/＋/g, '+')
            .replace(/[−–—]/g, '-')
            .replace(/×/g, '*')
            .replace(/[^0-9+\-*/() ÷]/g, '');

        let isExact = true;
        const tokens = sanitized.match(/\d+|[+\-*()÷\/]/g);
        if (!tokens) return true;

        const ops = [];
        const vals = [];
        const precedence = { '+': 1, '-': 1, '*': 2, '÷': 2, '/': 2 };

        function applyOp(op) {
            if (vals.length < 2) return;
            const b = vals.pop();
            const a = vals.pop();
            if (op === '+') vals.push(a + b);
            else if (op === '-') vals.push(a - b);
            else if (op === '*') vals.push(a * b);
            else if (op === '÷' || op === '/') {
                if (b === 0 || Math.abs(a % b) !== 0) {
                    isExact = false;
                }
                vals.push(b === 0 ? 0 : a / b);
            }
        }

        for (let t of tokens) {
            if (/^\d+$/.test(t)) {
                vals.push(parseInt(t, 10));
            } else if (t === '(') {
                ops.push(t);
            } else if (t === ')') {
                while (ops.length && ops[ops.length - 1] !== '(') {
                    applyOp(ops.pop());
                }
                ops.pop();
            } else if (precedence[t]) {
                while (ops.length && ops[ops.length - 1] !== '(' && precedence[ops[ops.length - 1]] >= precedence[t]) {
                    applyOp(ops.pop());
                }
                ops.push(t);
            }
        }
        while (ops.length) {
            applyOp(ops.pop());
        }
        return isExact;
    },

    // 四則運算式精確求解 (支援全形符號 ＋ − × ÷ 與括號)
    evalMathExpr(str) {
        if (!str) return NaN;
        const sanitized = String(str)
            .replace(/＝.*/g, '')
            .replace(/＝/g, '')
            .replace(/\?/g, '')
            .replace(/＋/g, '+')
            .replace(/[−–—]/g, '-')
            .replace(/×/g, '*')
            .replace(/÷/g, '/')
            .replace(/[^0-9+\-*/() ]/g, '');
        try {
            return Math.round(Function(`'use strict'; return (${sanitized})`)());
        } catch (e) {
            return NaN;
        }
    }
};

if (typeof window !== 'undefined') {
    window.MathEngine = MathEngine;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MathEngine;
}
