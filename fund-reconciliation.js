// fund-reconciliation.js - Đối soát quỹ cuối ngày + Quản lý nhận tiền
// ES5, tương thích Android 6, iOS 12
// Công thức: expectedClosing = openingBalance + cashRevenue - posCashExpense - managerCashPickup

// ========== BIẾN GLOBAL ==========
var managerCashPickups = [];
var inventoryTransactions = [];

// ========== KHỞI TẠO ==========
function loadFundReconciliationData() {
    return Promise.all([
        DB.getAll('manager_cash_pickups'),
        DB.getAll('inventory_transactions')
    ]).then(function(results) {
        managerCashPickups = results[0] || [];
        inventoryTransactions = results[1] || [];
    });
}

// ========== MỞ MODAL QUẢN LÝ NHẬN TIỀN ==========
function openManagerPickupModal() {
    loadFundReconciliationData().then(function() {
        var modal = document.getElementById('managerCashPickupModal');
        if (!modal) {
            showToast('Không tìm thấy modal!', 'error');
            return;
        }

        document.getElementById('managerPickupAmount').value = '';
        document.getElementById('managerPickupNote').value = '';

        renderManagerPickupHistory();
        modal.style.display = 'flex';
    });
}

// ========== LƯU LẦN NHẬN TIỀN ==========
function saveManagerPickup() {
    var amount = parseInt(document.getElementById('managerPickupAmount').value) || 0;
    var note = document.getElementById('managerPickupNote').value.trim();

    if (amount <= 0) {
        showToast('Số tiền phải lớn hơn 0!', 'warning');
        return;
    }

    var now = new Date();
    var dateKey = now.toISOString().slice(0, 10);

    var data = {
        id: 'pickup_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
        amount: amount,
        note: note || 'Quản lý nhận tiền',
        date: now.toISOString(),
        dateKey: dateKey,
        createdAt: Date.now(),
        createdBy: window.currentDeviceId || ''
    };

    DB.create('manager_cash_pickups', data).then(function() {
        managerCashPickups.push(data);
        showToast('✅ Đã lưu: ' + formatMoney(amount), 'success');
        document.getElementById('managerPickupAmount').value = '';
        document.getElementById('managerPickupNote').value = '';
        renderManagerPickupHistory();
        // Cập nhật lại khu vực đối soát nếu đang mở
        if (typeof renderReconciliation === 'function') {
            renderReconciliation(dateKey);
        }
    }).catch(function(err) {
        console.error('Save pickup error:', err);
        showToast('Lỗi khi lưu!', 'error');
    });
}

// ========== HIỂN THỊ LỊCH SỬ NHẬN TIỀN ==========
function renderManagerPickupHistory() {
    var container = document.getElementById('managerPickupHistory');
    if (!container) return;

    var today = new Date().toISOString().slice(0, 10);
    var todayPickups = managerCashPickups.filter(function(p) {
        return p.dateKey === today;
    });

    todayPickups.sort(function(a, b) {
        return (b.createdAt || 0) - (a.createdAt || 0);
    });

    if (todayPickups.length === 0) {
        container.innerHTML = '<div class="empty-text">Chưa có lần nhận tiền nào hôm nay</div>';
        return;
    }

    var total = 0;
    var html = '';
    for (var i = 0; i < todayPickups.length; i++) {
        var p = todayPickups[i];
        total += p.amount;
        var timeStr = '';
        if (p.date) {
            try {
                var d = new Date(p.date);
                timeStr = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
            } catch(e) { timeStr = ''; }
        }
        html += '<div class="pickup-item">' +
            '<div class="pickup-item-info">' +
                '<span class="pickup-item-time">' + timeStr + '</span>' +
                '<span class="pickup-item-note">' + escapeHtml(p.note || '') + '</span>' +
            '</div>' +
            '<span class="pickup-item-amount">' + formatMoney(p.amount) + '</span>' +
        '</div>';
    }

    html += '<div class="pickup-total">Tổng: ' + formatMoney(total) + '</div>';
    container.innerHTML = html;
}

// ========== LẤY SỐ DƯ ĐẦU KỲ ==========
function getOpeningBalance(dateStr) {
    return DB.get('daily_balances', dateStr).then(function(balance) {
        return (balance && balance.cashKept) || 0;
    });
}

// ========== TÍNH SỐ DƯ CUỐI KỲ DỰ KIẾN ==========
function calculateExpectedClosing(dateStr) {
    // Lấy ngày hôm trước
    var prevDate = new Date(dateStr);
    prevDate.setDate(prevDate.getDate() - 1);
    var prevDateStr = prevDate.toISOString().slice(0, 10);

    return Promise.all([
        // Số dư đầu kỳ = cashKept hôm trước
        getOpeningBalance(prevDateStr),
        // Doanh thu tiền mặt trong ngày
        DB.getTransactionsByDate(dateStr),
        // Chi phí từ Két POS trong ngày
        DB.getAll('cost_transactions'),
        // Tiền quản lý nhận trong ngày
        Promise.resolve(managerCashPickups)
    ]).then(function(results) {
        var openingBalance = results[0];
        var transactions = results[1].filter(function(t) { return !t.refunded; });
        var allCosts = results[2] || [];
        var pickups = results[3] || [];

        // Tính doanh thu tiền mặt
        var cashRevenue = 0;
        for (var i = 0; i < transactions.length; i++) {
            if (transactions[i].paymentMethod === 'cash') {
                cashRevenue += transactions[i].amount;
            }
        }

        // Tính chi phí từ Két POS
        var posCashExpense = 0;
        for (var j = 0; j < allCosts.length; j++) {
            var c = allCosts[j];
            if (c.dateKey === dateStr && !c.deleted && c.fundSource === 'pos_cash') {
                posCashExpense += c.amount;
            }
        }

        // Tính tổng tiền quản lý nhận
        var managerPickupTotal = 0;
        for (var k = 0; k < pickups.length; k++) {
            if (pickups[k].dateKey === dateStr) {
                managerPickupTotal += pickups[k].amount;
            }
        }

        var expectedClosing = openingBalance + cashRevenue - posCashExpense - managerPickupTotal;
        if (expectedClosing < 0) expectedClosing = 0;

        return {
            openingBalance: openingBalance,
            cashRevenue: cashRevenue,
            posCashExpense: posCashExpense,
            managerPickupTotal: managerPickupTotal,
            expectedClosing: expectedClosing
        };
    });
}

// ========== LẤY TRẠNG THÁI ĐỐI SOÁT ==========
function getReconciliationStatus(diffPercent) {
    if (diffPercent <= 0.5) {
        return { status: 'ok', label: '✅ Khớp quỹ', color: '#10b981' };
    } else if (diffPercent <= 2) {
        return { status: 'warning', label: '🟡 Cần kiểm tra', color: '#f59e0b' };
    } else {
        return { status: 'error', label: '🔴 Sai lệch quỹ', color: '#ef4444' };
    }
}

// ========== RENDER KHU VỰC ĐỐI SOÁT QUỸ ==========
function renderReconciliation(dateStr) {
    var container = document.getElementById('reconciliationArea');
    if (!container) return;

    // Load data mới nhất
    loadFundReconciliationData().then(function() {
        return calculateExpectedClosing(dateStr);
    }).then(function(result) {
        return DB.get('daily_balances', dateStr).then(function(dailyBalance) {
            var savedBalance = dailyBalance || {};

            var actualClosing = savedBalance.actualClosing || 0;
            var difference = actualClosing - result.expectedClosing;
            var diffPercent = result.expectedClosing > 0
                ? Math.abs(difference) / result.expectedClosing * 100
                : 0;
            var statusInfo = getReconciliationStatus(diffPercent);

            var isClosed = savedBalance.isClosed || false;

            var html = '<div class="reconciliation-card">' +
                '<div class="recon-title">📊 ĐỐI SOÁT QUỸ</div>' +

                // Các dòng tự động
                '<div class="recon-row auto">' +
                    '<span>Số dư đầu kỳ</span>' +
                    '<span>' + formatMoney(result.openingBalance) + '</span>' +
                '</div>' +
                '<div class="recon-row auto">' +
                    '<span>Doanh thu tiền mặt</span>' +
                    '<span>' + formatMoney(result.cashRevenue) + '</span>' +
                '</div>' +
                '<div class="recon-row auto">' +
                    '<span>Chi phí từ Két POS</span>' +
                    '<span class="recon-expense">-' + formatMoney(result.posCashExpense) + '</span>' +
                '</div>' +
                '<div class="recon-row">' +
                    '<span>Tiền quản lý nhận</span>' +
                    '<span>' +
                        '<span class="recon-pickup-amount">' + formatMoney(result.managerPickupTotal) + '</span>' +
                        '<button class="recon-pickup-btn" onclick="openManagerPickupModal()">✏️</button>' +
                    '</span>' +
                '</div>' +

                '<div class="recon-divider"></div>' +

                // Dòng dự kiến
                '<div class="recon-row expected">' +
                    '<span>Số dư cuối kỳ dự kiến</span>' +
                    '<span>' + formatMoney(result.expectedClosing) + '</span>' +
                '</div>' +

                // Nhập số dư thực tế
                '<div class="recon-input-row">' +
                    '<label>Tiền mặt thực tế cuối ngày:</label>' +
                    '<div class="recon-input-group">' +
                        '<input type="number" id="reconActualCashInput" class="recon-input" ' +
                            'value="' + (actualClosing || '') + '" placeholder="0đ" step="1000" ' +
                            (isClosed ? 'disabled' : '') + '>' +
                        '<button class="recon-save-btn" id="reconSaveActualBtn" ' +
                            (isClosed ? 'disabled' : '') + '>💾 Lưu</button>' +
                    '</div>' +
                '</div>' +

                // Kết quả so sánh
                '<div class="recon-result ' + statusInfo.status + '">' +
                    '<div class="recon-result-row">' +
                        '<span>Chênh lệch:</span>' +
                        '<span class="' + (difference >= 0 ? 'recon-positive' : 'recon-negative') + '">' +
                            (difference >= 0 ? '+' : '') + formatMoney(difference) +
                        '</span>' +
                    '</div>' +
                    '<div class="recon-result-row">' +
                        '<span>Tỷ lệ:</span>' +
                        '<span>' + diffPercent.toFixed(2) + '%</span>' +
                    '</div>' +
                    '<div class="recon-status" style="color:' + statusInfo.color + ';">' +
                        statusInfo.label +
                    '</div>' +
                '</div>' +

                // Nút chốt ngày
                '<div class="recon-actions">' +
                    (isClosed
                        ? '<div class="recon-closed-badge">🔒 Đã chốt ngày</div>'
                        : '<button class="recon-close-btn" id="reconCloseDayBtn">🔒 Chốt ngày</button>'
                    ) +
                '</div>' +
            '</div>';

            container.innerHTML = html;

            // Gắn sự kiện sau khi render
            attachReconciliationEvents(dateStr, result.expectedClosing);
        });
    }).catch(function(err) {
        console.error('Render reconciliation error:', err);
        container.innerHTML = '<div class="empty-state">Lỗi tải dữ liệu đối soát</div>';
    });
}

// ========== GẮN SỰ KIỆN ĐỐI SOÁT ==========
function attachReconciliationEvents(dateStr, expectedClosing) {
    var saveBtn = document.getElementById('reconSaveActualBtn');
    if (saveBtn) {
        saveBtn.onclick = function() {
            saveActualClosing(dateStr, expectedClosing);
        };
    }

    var closeBtn = document.getElementById('reconCloseDayBtn');
    if (closeBtn) {
        closeBtn.onclick = function() {
            closeDay(dateStr);
        };
    }

    // Preview realtime
    var actualInput = document.getElementById('reconActualCashInput');
    if (actualInput) {
        actualInput.addEventListener('input', function() {
            var val = parseInt(this.value) || 0;
            previewReconciliation(expectedClosing, val);
        });
    }
}

// ========== XEM TRƯỚC KẾT QUẢ ĐỐI SOÁT ==========
function previewReconciliation(expectedClosing, actualClosing) {
    var difference = actualClosing - expectedClosing;
    var diffPercent = expectedClosing > 0 ? Math.abs(difference) / expectedClosing * 100 : 0;
    var statusInfo = getReconciliationStatus(diffPercent);

    var resultEl = document.querySelector('.recon-result');
    if (!resultEl) return;

    resultEl.className = 'recon-result ' + statusInfo.status;

    var rows = resultEl.querySelectorAll('.recon-result-row');
    if (rows.length >= 2) {
        var diffSpan = rows[0].querySelector('span:last-child');
        if (diffSpan) {
            diffSpan.className = difference >= 0 ? 'recon-positive' : 'recon-negative';
            diffSpan.innerText = (difference >= 0 ? '+' : '') + formatMoney(difference);
        }
        var pctSpan = rows[1].querySelector('span:last-child');
        if (pctSpan) {
            pctSpan.innerText = diffPercent.toFixed(2) + '%';
        }
    }

    var statusEl = resultEl.querySelector('.recon-status');
    if (statusEl) {
        statusEl.style.color = statusInfo.color;
        statusEl.innerText = statusInfo.label;
    }
}

// ========== LƯU SỐ DƯ THỰC TẾ ==========
function saveActualClosing(dateStr, expectedClosing) {
    var actualClosing = parseInt(document.getElementById('reconActualCashInput').value) || 0;

    if (actualClosing < 0) {
        showToast('Số dư thực tế không hợp lệ!', 'warning');
        return;
    }

    var difference = actualClosing - expectedClosing;
    var diffPercent = expectedClosing > 0 ? Math.abs(difference) / expectedClosing * 100 : 0;
    var statusInfo = getReconciliationStatus(diffPercent);

    // Lấy daily_balances hiện tại để giữ cashKept và cashReceived cũ
    DB.get('daily_balances', dateStr).then(function(existing) {
        var data = existing || { id: dateStr };

        data.actualClosing = actualClosing;
        data.difference = difference;
        data.diffPercent = diffPercent;
        data.status = statusInfo.status;
        data.updatedAt = Date.now();

        // Nếu chưa có cashKept, tạm tính = actualClosing
        if (!data.cashKept && data.cashKept !== 0) {
            data.cashKept = actualClosing;
        }

        return DB.create('daily_balances', data, dateStr);
    }).then(function() {
        showToast('✅ Đã lưu số dư thực tế', 'success');
        renderReconciliation(dateStr);
    }).catch(function(err) {
        console.error('Save actual closing error:', err);
        showToast('Lỗi khi lưu!', 'error');
    });
}

// ========== CHỐT NGÀY ==========
function closeDay(dateStr) {
    if (!confirm('Bạn có chắc muốn chốt ngày ' + formatDateDisplay(dateStr) + '?')) return;

    // Kiểm tra đã nhập số dư thực tế chưa
    var actualClosing = parseInt(document.getElementById('reconActualCashInput').value) || 0;
    if (actualClosing <= 0) {
        if (!confirm('Số dư thực tế đang là 0. Bạn có chắc muốn chốt ngày với số dư 0?')) return;
    }

    DB.get('daily_balances', dateStr).then(function(existing) {
        var data = existing || { id: dateStr };

        // Cập nhật các trường chốt ngày
        data.actualClosing = actualClosing;
        data.cashKept = actualClosing; // Số dư để lại quán = actualClosing
        data.isClosed = true;
        data.closedAt = Date.now();
        data.closedBy = window.currentDeviceId || '';

        // Nếu chưa có cashReceived, giữ nguyên
        if (!data.cashReceived) data.cashReceived = 0;

        return DB.create('daily_balances', data, dateStr);
    }).then(function() {
        showToast('🔒 Đã chốt ngày ' + formatDateDisplay(dateStr), 'success');
        renderReconciliation(dateStr);
    }).catch(function(err) {
        console.error('Close day error:', err);
        showToast('Lỗi khi chốt ngày!', 'error');
    });
}

// ========== LẤY CHI PHÍ THEO LOẠI (cho report.js) ==========
function getCostsByType(dateStr) {
    return DB.getAll('cost_transactions').then(function(allCosts) {
        var filtered = allCosts.filter(function(c) {
            return c.dateKey === dateStr && !c.deleted;
        });

        var result = {
            ingredientTotal: 0,
            wasteTotal: 0,
            posCashTotal: 0,
            managementTotal: 0,
            all: filtered
        };

        for (var i = 0; i < filtered.length; i++) {
            var c = filtered[i];
            if (c.costType === 'ingredient') result.ingredientTotal += c.amount;
            else result.wasteTotal += c.amount;
            if (c.fundSource === 'pos_cash') result.posCashTotal += c.amount;
            else result.managementTotal += c.amount;
        }

        return result;
    });
}

// Export global
window.openManagerPickupModal = openManagerPickupModal;
window.saveManagerPickup = saveManagerPickup;
window.renderManagerPickupHistory = renderManagerPickupHistory;
window.calculateExpectedClosing = calculateExpectedClosing;
window.renderReconciliation = renderReconciliation;
window.getReconciliationStatus = getReconciliationStatus;
window.closeDay = closeDay;
window.saveActualClosing = saveActualClosing;
window.getCostsByType = getCostsByType;
window.loadFundReconciliationData = loadFundReconciliationData;
window.managerCashPickups = managerCashPickups;
window.inventoryTransactions = inventoryTransactions;
