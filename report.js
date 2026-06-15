// report.js - Báo cáo doanh thu, chi phí theo ngày
// Tách từ pos.js - ES5, tương thích Android 6, iOS 12

// ========== BÁO CÁO ==========
function renderReport(dateObj) {
    var dateStr = dateObj.toISOString().slice(0, 10);
    document.getElementById('reportDate').innerText = formatDateDisplay(dateStr);
    
    Promise.all([
        DB.getTransactionsByDate(dateStr),
        DB.getAll('cost_transactions'),
        DB.get('daily_balances', dateStr),
        DB.getAll('tables'),
        DB.getAll('customers'),
        typeof loadFundReconciliationData === 'function' ? loadFundReconciliationData() : Promise.resolve()
    ]).then(function(results) {
        var transactions = results[0].filter(function(t) { return !t.refunded; });
        var allCosts = results[1] || [];
        var dailyBalance = results[2] || { cashKept: 0, cashReceived: 0 };
        var allTables = results[3] || [];
        var allCustomers = results[4] || [];
        var isAdmin = typeof DB !== 'undefined' && DB.isAdmin && DB.isAdmin();
        
        // ===== 1. DOANH THU - ĐẾM SỐ LƯỢNG =====
        var cashTotal = 0, transferTotal = 0, debtPaymentTotal = 0, grabTotal = 0;
        var cashCount = 0, transferCount = 0, grabCount = 0, debtPaymentCount = 0;
        
        for (var i = 0; i < transactions.length; i++) {
            var tx = transactions[i];
            if (tx.paymentMethod === 'cash') { cashTotal += tx.amount; cashCount++; }
            else if (tx.paymentMethod === 'transfer') { transferTotal += tx.amount; transferCount++; }
            else if (tx.paymentMethod === 'debt') { debtPaymentTotal += tx.amount; debtPaymentCount++; }
            else if (tx.paymentMethod === 'grab') { grabTotal += tx.amount; grabCount++; }
        }
        
        var totalRevenue = cashTotal + transferTotal + debtPaymentTotal + grabTotal;
        
        // ===== 2. BÀN ĐANG HOẠT ĐỘNG =====
        var activeTables = allTables.filter(function(t) { return (t.items && t.items.length) || t.total > 0; });
        var activeTableTotal = 0;
        for (var ti = 0; ti < activeTables.length; ti++) {
            activeTableTotal += activeTables[ti].total || 0;
        }
        
        // ===== 3. CHI PHÍ (CHỈ TỪ QUỸ POS) =====
        var dailyCosts = allCosts.filter(function(c) { return c.dateKey === dateStr && !c.deleted; });
        var totalCost = 0;
        var ingredientCost = 0;
        var wasteCost = 0;
        var posCashCost = 0;
        var posCostCount = 0;
        var ingredientCount = 0;
        var wasteCount = 0;
        
        for (var j = 0; j < dailyCosts.length; j++) {
            var c = dailyCosts[j];
            // Chỉ tính chi phí từ quỹ POS, bỏ qua QLTT
            if (c.fundSource === 'pos_cash') {
                totalCost += c.amount;
                posCashCost += c.amount;
                posCostCount++;
                if (c.costType === 'ingredient') {
                    ingredientCost += c.amount;
                    ingredientCount++;
                } else {
                    wasteCost += c.amount;
                    wasteCount++;
                }
            }
        }
        
        // ===== 4. NỢ PHÁT SINH TRONG NGÀY =====
        var debtTodayCustomers = [];
        var debtTodayTotal = 0;
        for (var ci = 0; ci < allCustomers.length; ci++) {
            var cust = allCustomers[ci];
            if (cust.debtHistory && cust.debtHistory.length > 0) {
                for (var hi = 0; hi < cust.debtHistory.length; hi++) {
                    var dh = cust.debtHistory[hi];
                    if (dh.date && dh.date.indexOf(dateStr) === 0) {
                        debtTodayCustomers.push(cust);
                        debtTodayTotal += dh.amount || 0;
                        break;
                    }
                }
            }
        }
        var debtTodayPeople = debtTodayCustomers.length;
        
        // ===== 5. NỢ CÒN LẠI =====
        var remainingDebtCustomers = allCustomers.filter(function(c) { return (c.totalDebt || 0) > 0; });
        var remainingDebtTotal = 0;
        for (var rci = 0; rci < remainingDebtCustomers.length; rci++) {
            remainingDebtTotal += remainingDebtCustomers[rci].totalDebt || 0;
        }
        var remainingDebtPeople = remainingDebtCustomers.length;
        
        // ===== 5b. TIỀN DƯ (CREDIT) CỦA KHÁCH =====
        var creditCustomers = allCustomers.filter(function(c) { return (c.creditBalance || 0) > 0; });
        var creditTotal = 0;
        for (var cci = 0; cci < creditCustomers.length; cci++) {
            creditTotal += creditCustomers[cci].creditBalance || 0;
        }
        var creditPeople = creditCustomers.length;
        
        // ===== 6. TỔNG TIỀN QUẢN LÝ NHẬN (từ fund-reconciliation) =====
        var managerPickupTotal = 0;
        var pickupHistory = [];
        if (window.managerCashPickups && window.managerCashPickups.length) {
            for (var pi = 0; pi < window.managerCashPickups.length; pi++) {
                var p = window.managerCashPickups[pi];
                if (p.dateKey === dateStr) {
                    managerPickupTotal += p.amount || 0;
                    var timeStr = '';
                    if (p.date) {
                        try {
                            var d = new Date(p.date);
                            timeStr = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
                        } catch(e) {}
                    }
                    pickupHistory.push({ time: timeStr, amount: p.amount || 0 });
                }
            }
            // Sắp xếp theo thời gian tăng dần
            pickupHistory.sort(function(a, b) { return a.time.localeCompare(b.time); });
        }
        
        // Kiểm tra đã lưu đối soát chưa
        var isReconSaved = dailyBalance && dailyBalance.actualClosing !== undefined && dailyBalance.actualClosing !== null;
        
        // ===== RENDER HTML =====
        // QUY TẮC:
        // - Trước khi lưu đối soát: Ẩn số tiền TM/CK/Grab - chỉ hiển thị số lượng
        // - Sau khi lưu đối soát: Hiển thị đầy đủ số lượng + số tiền
        // - Các mục khác (bàn, chi phí, nợ, thanh toán nợ, QL nhận): Luôn hiển thị đầy đủ
        var html = `
            <div class="stat-card">
                <div class="stat-row" style="cursor:pointer;" onclick="showActiveTablesModal()">
                    <span>🪑 Bàn đang hoạt động</span>
                    <span class="stat-value primary">${formatMoney(activeTableTotal)}</span>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-row"><span>💰 Tiền mặt</span><span>${isReconSaved ? formatMoney(cashTotal) : cashCount + ' giao dịch'}</span></div>
                <div class="stat-row"><span>💳 Chuyển khoản</span><span>${isReconSaved ? formatMoney(transferTotal) : transferCount + ' giao dịch'}</span></div>
                <div class="stat-row"><span>🚕 Grab</span><span>${isReconSaved ? formatMoney(grabTotal) : grabCount + ' đơn'}</span></div>
                <div class="stat-row"><span>💢 Thanh toán nợ</span><span>${formatMoney(debtPaymentTotal)}</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-row" style="font-size:12px;padding-left:16px;">
                    <span>🧂 Nguyên liệu</span>
                    <span>${ingredientCount} khoản - ${formatMoney(ingredientCost)}</span>
                </div>
                <div class="stat-row" style="font-size:12px;padding-left:16px;">
                    <span>📦 Hao phí</span>
                    <span>${wasteCount} khoản - ${formatMoney(wasteCost)}</span>
                </div>
                <div class="stat-row" style="border-top:1px dashed var(--border);padding-top:4px;">
                    <span>🏦 Chi phí từ Két POS</span>
                    <span>${posCostCount} khoản - ${formatMoney(posCashCost)}</span>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-row" style="cursor:pointer;" onclick="showDebtTodayModal()">
                    <span>📊 Nợ phát sinh trong ngày</span>
                    <span>${debtTodayPeople} người - ${formatMoney(debtTodayTotal)}</span>
                </div>
                <div class="stat-row" style="cursor:pointer;" onclick="showRemainingDebtModal()">
                    <span>🏦 Nợ còn lại</span>
                    <span>${remainingDebtPeople} người - ${formatMoney(remainingDebtTotal)}</span>
                </div>
                ${creditTotal > 0 ? '<div class="stat-row" style="cursor:pointer;color:#d97706;" onclick="showCreditBalanceModal()"><span>💰 Tiền dư khách (trả trước)</span><span>' + creditPeople + ' người - ' + formatMoney(creditTotal) + '</span></div>' : ''}
            </div>
            <div class="stat-card">
                <div class="stat-row" style="border-bottom:1px dashed var(--border);padding-bottom:4px;margin-bottom:4px;">
                    <span>💰 Tiền quản lý nhận</span>
                    <span>${formatMoney(managerPickupTotal)}</span>
                </div>
                ${function(){
                    var phHtml = '';
                    for (var phi = 0; phi < pickupHistory.length; phi++) {
                        var ph = pickupHistory[phi];
                        phHtml += '<div class="stat-row" style="font-size:12px;padding-left:16px;">' +
                            '<span>🕐 ' + (ph.time || '--:--') + '</span>' +
                            '<span>' + formatMoney(ph.amount) + '</span>' +
                        '</div>';
                    }
                    return phHtml;
                }()}
            </div>
        `;
        document.getElementById('reportStats').innerHTML = html;
        
        // Render đối soát quỹ
        if (typeof renderReconciliation === 'function') {
            renderReconciliation(dateStr);
        }
    });
}

function changeReportDate(delta) { var nd = new Date(currentReportDate); nd.setDate(nd.getDate() + delta); currentReportDate = nd; renderReport(currentReportDate); }

// ========== MODAL BÀN ĐANG HOẠT ĐỘNG ==========
function showActiveTablesModal() {
    DB.getAll('tables').then(function(allTables) {
        var activeTables = allTables.filter(function(t) { return (t.items && t.items.length) || t.total > 0; });
        var container = document.getElementById('costDetailList');
        if (!container) return;
        
        if (activeTables.length === 0) {
            container.innerHTML = '<div class="empty-state">✅ Không có bàn nào đang hoạt động</div>';
        } else {
            var html = '';
            var total = 0;
            for (var i = 0; i < activeTables.length; i++) {
                var t = activeTables[i];
                total += t.total || 0;
                var displayName = t.customerName ? t.customerName : ((t.name && t.name.trim()) ? t.name : 'Bàn ' + t.id);
                html += '<div class="cost-detail-item">' +
                            '<span>🪑 ' + escapeHtml(displayName) + '</span>' +
                            '<span>' + formatMoney(t.total || 0) + '</span>' +
                        '</div>';
            }
            html += '<div class="cost-detail-item" style="font-weight:700;border-top:2px solid var(--border);padding-top:8px;margin-top:4px;">' +
                        '<span>Tổng tiền bàn</span>' +
                        '<span>' + formatMoney(total) + '</span>' +
                    '</div>';
            container.innerHTML = html;
        }
        document.getElementById('infoModal').querySelector('.modal-title').innerText = '🪑 Bàn đang hoạt động';
        document.getElementById('infoModal').style.display = 'flex';
    });
}

// ========== MODAL NỢ PHÁT SINH TRONG NGÀY ==========
function showDebtTodayModal() {
    var dateStr = currentReportDate.toISOString().slice(0, 10);
    DB.getAll('customers').then(function(allCustomers) {
        var container = document.getElementById('infoModalList');
        if (!container) return;
        
        var html = '';
        var total = 0;
        var count = 0;
        for (var ci = 0; ci < allCustomers.length; ci++) {
            var cust = allCustomers[ci];
            if (cust.debtHistory && cust.debtHistory.length > 0) {
                var custDebtToday = 0;
                for (var hi = 0; hi < cust.debtHistory.length; hi++) {
                    var dh = cust.debtHistory[hi];
                    if (dh.date && dh.date.indexOf(dateStr) === 0) {
                        custDebtToday += dh.amount || 0;
                    }
                }
                if (custDebtToday > 0) {
                    count++;
                    total += custDebtToday;
                    html += '<div class="cost-detail-item">' +
                                '<span>👤 ' + escapeHtml(cust.name || 'Khách ' + cust.id) + '</span>' +
                                '<span>' + formatMoney(custDebtToday) + '</span>' +
                            '</div>';
                }
            }
        }
        
        if (count === 0) {
            html = '<div class="empty-state">✅ Không có nợ phát sinh hôm nay</div>';
        } else {
            html += '<div class="cost-detail-item" style="font-weight:700;border-top:2px solid var(--border);padding-top:8px;margin-top:4px;">' +
                        '<span>Tổng (' + count + ' người)</span>' +
                        '<span>' + formatMoney(total) + '</span>' +
                    '</div>';
        }
        container.innerHTML = html;
        document.getElementById('infoModal').querySelector('.modal-title').innerText = '📊 Nợ phát sinh trong ngày';
        document.getElementById('infoModal').style.display = 'flex';
    });
}

// ========== MODAL NỢ CÒN LẠI ==========
function showRemainingDebtModal() {
    DB.getAll('customers').then(function(allCustomers) {
        var container = document.getElementById('infoModalList');
        if (!container) return;
        
        var debtCustomers = allCustomers.filter(function(c) { return (c.totalDebt || 0) > 0; });
        var html = '';
        var total = 0;
        
        if (debtCustomers.length === 0) {
            html = '<div class="empty-state">✅ Không có nợ tồn đọng</div>';
        } else {
            for (var i = 0; i < debtCustomers.length; i++) {
                var c = debtCustomers[i];
                total += c.totalDebt || 0;
                html += '<div class="cost-detail-item">' +
                            '<span>👤 ' + escapeHtml(c.name || 'Khách ' + c.id) + '</span>' +
                            '<span>' + formatMoney(c.totalDebt || 0) + '</span>' +
                        '</div>';
            }
            html += '<div class="cost-detail-item" style="font-weight:700;border-top:2px solid var(--border);padding-top:8px;margin-top:4px;">' +
                        '<span>Tổng (' + debtCustomers.length + ' người)</span>' +
                        '<span>' + formatMoney(total) + '</span>' +
                    '</div>';
        }
        container.innerHTML = html;
        document.getElementById('infoModal').querySelector('.modal-title').innerText = '🏦 Nợ còn lại';
        document.getElementById('infoModal').style.display = 'flex';
    });
}

// ========== MODAL TIỀN DƯ KHÁCH ==========
function showCreditBalanceModal() {
    DB.getAll('customers').then(function(allCustomers) {
        var container = document.getElementById('infoModalList');
        if (!container) return;
        
        var creditCustomers = allCustomers.filter(function(c) { return (c.creditBalance || 0) > 0; });
        var html = '';
        var total = 0;
        
        if (creditCustomers.length === 0) {
            html = '<div class="empty-state">✅ Không có khách có tiền dư</div>';
        } else {
            for (var i = 0; i < creditCustomers.length; i++) {
                var c = creditCustomers[i];
                total += c.creditBalance || 0;
                html += '<div class="cost-detail-item">' +
                            '<span>👤 ' + escapeHtml(c.name || 'Khách ' + c.id) + '</span>' +
                            '<span style="color:#d97706;">' + formatMoney(c.creditBalance || 0) + '</span>' +
                        '</div>';
            }
            html += '<div class="cost-detail-item" style="font-weight:700;border-top:2px solid var(--border);padding-top:8px;margin-top:4px;">' +
                        '<span>Tổng (' + creditCustomers.length + ' người)</span>' +
                        '<span style="color:#d97706;">' + formatMoney(total) + '</span>' +
                    '</div>';
        }
        container.innerHTML = html;
        document.getElementById('infoModal').querySelector('.modal-title').innerText = '💰 Tiền dư khách (trả trước)';
        document.getElementById('infoModal').style.display = 'flex';
    });
}

// Export global
window.showActiveTablesModal = showActiveTablesModal;
window.showDebtTodayModal = showDebtTodayModal;
window.showRemainingDebtModal = showRemainingDebtModal;
window.showCreditBalanceModal = showCreditBalanceModal;
