// settings.js - Cài đặt ứng dụng + Tiền mặt tại POS
// ES5, tương thích Android 6, iOS 12
console.log('[settings.js] Loaded');

// ============================================================
// 0. HÀM KIỂM TRA CHỐT NGÀY (dùng chung cho toàn bộ POS)
// ============================================================
// Kiểm tra xem hôm nay đã chốt ngày chưa
// Dùng để chặn refund/xóa món/xóa bàn sau khi chốt
var _dayClosedCache = false;

function isDayClosed() {
    return _dayClosedCache;
}

// Cập nhật cache từ dữ liệu _posCashData
function _updateDayClosedCache() {
    if (_posCashData) {
        _dayClosedCache = _posCashData.isClosed === true;
    }
}

// ============================================================
// 1. TIỀN MẶT TẠI POS (Cash Counter + Đối soát quỹ)
// ============================================================
var CASH_DENOMS = [
    { value: 1000, label: '1k' },
    { value: 2000, label: '2k' },
    { value: 5000, label: '5k' },
    { value: 10000, label: '10k' },
    { value: 20000, label: '20k' },
    { value: 50000, label: '50k' },
    { value: 100000, label: '100k' },
    { value: 200000, label: '200k' },
    { value: 500000, label: '500k' }
];
var cashCounts = {};
var _posCashData = null; // Cache dữ liệu đối soát

function initQuickCashCounter() {
    cashCounts = {};
    for (var i = 0; i < CASH_DENOMS.length; i++) {
        cashCounts[CASH_DENOMS[i].value] = 0;
    }
    _posCashData = null;
    loadPosCashData();

    // Subscribe realtime vào daily_balances hôm nay để cập nhật _dayClosedCache
    // Khi admin hủy chốt từ thiết bị khác, nhân viên sẽ thấy ngay
    _subscribeDayClosedRealtime();
}

// Lắng nghe realtime thay đổi daily_balances (chốt ngày, chênh lệch, hủy chốt...)
function _subscribeDayClosedRealtime() {
    try {
        var today = new Date().toISOString().slice(0, 10);
        var shopId = (typeof DB !== 'undefined' && DB.getShopId) ? DB.getShopId() : 'shop_default';
        var dbRef = firebase.database().ref(shopId + '/daily_balances/' + today);

        // Lắng nghe thay đổi trên daily_balances hôm nay
        // Khi nhân viên A chốt ngày (ghi difference + isClosed lên Firebase),
        // nhân viên B và admin sẽ nhận được cập nhật realtime và reload UI
        dbRef.on('value', function(snapshot) {
            var data = snapshot.val();
            if (data) {
                var newIsClosed = data.isClosed === true;
                // Luôn cập nhật cache isClosed
                _dayClosedCache = newIsClosed;
                console.log('[DayClosed] Realtime update: isClosed =', _dayClosedCache, 'difference =', data.difference);
                // Luôn reload dữ liệu để cập nhật UI (chênh lệch, trạng thái...)
                loadPosCashData();
            }
        });
    } catch (e) {
        console.error('[DayClosed] Subscribe realtime error:', e);
    }
}

function loadPosCashData() {
    try {
    var today = new Date().toISOString().slice(0, 10);
    var isAdmin = typeof DB !== 'undefined' && DB.isAdmin && DB.isAdmin();

    // Lấy ngày hôm trước để tính số dư đầu kỳ
    var prevDate = new Date(today);
    prevDate.setDate(prevDate.getDate() - 1);
    var prevDateStr = prevDate.toISOString().slice(0, 10);

    console.log('[POS Cash] Loading data for:', today, 'prev:', prevDateStr);

    // Lấy shopId từ DB
    var shopId = (typeof DB !== 'undefined' && DB.getShopId) ? DB.getShopId() : 'shop_default';
    var dbRef = firebase.database().ref(shopId);

    // Đọc trực tiếp từ Firebase Realtime Database vì cost_transactions, daily_balances, manager_cash_pickups
    // KHÔNG được subscribe (đồng bộ) xuống IndexedDB local (xem db.js initDatabase)
    Promise.all([
        // Số dư đầu kỳ = cashKept của ngày hôm trước
        dbRef.child('daily_balances/' + prevDateStr).once('value'),
        // Doanh thu tiền mặt trong ngày (từ IndexedDB - transactions đã được subscribe)
        DB.getTransactionsByDate(today),
        // Chi phí từ Két POS - đọc trực tiếp từ Firebase
        dbRef.child('cost_transactions').once('value'),
        // Tiền quản lý nhận - đọc trực tiếp từ Firebase
        dbRef.child('manager_cash_pickups').once('value'),
        // daily_balances hôm nay (đã lưu) - đọc trực tiếp từ Firebase
        dbRef.child('daily_balances/' + today).once('value')
    ]).then(function(results) {
        var prevBalance = results[0].val() || {};
        var transactions = results[1] || [];
        var allCostsSnapshot = results[2].val() || {};
        var pickupsSnapshot = results[3].val() || {};
        var savedBalance = results[4].val() || {};

        // Chuyển đổi Firebase snapshot object thành array
        var allCosts = [];
        for (var key in allCostsSnapshot) {
            if (allCostsSnapshot.hasOwnProperty(key)) {
                var item = allCostsSnapshot[key];
                item.id = key;
                allCosts.push(item);
            }
        }

        var pickups = [];
        for (var key2 in pickupsSnapshot) {
            if (pickupsSnapshot.hasOwnProperty(key2)) {
                var item2 = pickupsSnapshot[key2];
                item2.id = key2;
                pickups.push(item2);
            }
        }

        // Lọc transactions không bị refund
        if (Array.isArray(transactions)) {
            transactions = transactions.filter(function(t) { return !t.refunded; });
        } else {
            transactions = [];
        }

        console.log('[POS Cash] prevBalance:', prevBalance);
        console.log('[POS Cash] transactions:', transactions.length, 'items');
        console.log('[POS Cash] allCosts (from Firebase):', allCosts.length, 'items');
        console.log('[POS Cash] pickups (from Firebase):', pickups.length, 'items');
        console.log('[POS Cash] savedBalance:', savedBalance);

        // Số dư đầu kỳ
        var openingBalance = (prevBalance && prevBalance.cashKept) || 0;

        // Doanh thu tiền mặt
        var cashRevenue = 0;
        for (var i = 0; i < transactions.length; i++) {
            if (transactions[i].paymentMethod === 'cash') {
                cashRevenue += transactions[i].amount;
            }
        }

        // Chi phí từ Két POS
        var posCashExpense = 0;
        var posCostCount = 0;
        for (var j = 0; j < allCosts.length; j++) {
            var c = allCosts[j];
            if (c.dateKey === today && !c.deleted && c.fundSource === 'pos_cash') {
                posCashExpense += c.amount;
                posCostCount++;
                console.log('[POS Cash] Found cost:', c.categoryName, c.amount, c.dateKey, c.fundSource);
            }
        }

        // Tiền quản lý nhận + lịch sử
        var managerPickupTotal = 0;
        var pickupHistory = [];
        for (var k = 0; k < pickups.length; k++) {
            if (pickups[k].dateKey === today) {
                managerPickupTotal += pickups[k].amount;
                pickupHistory.push(pickups[k]);
            }
        }
        // Sắp xếp lịch sử theo thời gian tăng dần
        pickupHistory.sort(function(a, b) {
            return (a.createdAt || 0) - (b.createdAt || 0);
        });

        // expectedClosing = số tiền dự kiến phải có trong két SAU KHI trừ QL nhận
        // Nếu đã lưu đối soát trước đó thì ưu tiên dùng expectedClosing đã lưu (tránh sai lệch khi F5)
        var expectedClosing;
        if (savedBalance && savedBalance.expectedClosing !== undefined && savedBalance.expectedClosing !== null) {
            expectedClosing = savedBalance.expectedClosing;
        } else {
            expectedClosing = openingBalance + cashRevenue - posCashExpense - managerPickupTotal;
        }

        console.log('[POS Cash] Result:', { openingBalance: openingBalance, cashRevenue: cashRevenue, posCashExpense: posCashExpense, posCostCount: posCostCount, managerPickupTotal: managerPickupTotal, expectedClosing: expectedClosing });

        _posCashData = {
            openingBalance: openingBalance,
            cashRevenue: cashRevenue,
            posCashExpense: posCashExpense,
            posCostCount: posCostCount,
            managerPickupTotal: managerPickupTotal,
            pickupHistory: pickupHistory,
            expectedClosing: expectedClosing,
            actualClosing: (savedBalance.actualClosing !== undefined && savedBalance.actualClosing !== null) ? savedBalance.actualClosing : null,
            isClosed: savedBalance.isClosed || false,
            difference: (savedBalance.difference !== undefined && savedBalance.difference !== null) ? savedBalance.difference : null,
            diffPercent: (savedBalance.diffPercent !== undefined && savedBalance.diffPercent !== null) ? savedBalance.diffPercent : null,
            status: savedBalance.status || null
        };

        // Cập nhật cache isDayClosed để các module khác (refund, xóa món, xóa bàn) kiểm tra
        _updateDayClosedCache();

        renderCashCounter(isAdmin);
    }).catch(function(err) {
        console.error('[POS Cash] loadPosCashData error:', err);
        renderCashCounter(isAdmin);
    });
    } catch(e) {
        console.error('[POS Cash] loadPosCashData fatal error:', e);
        renderCashCounter(isAdmin);
    }
}

function renderCashCounter(isAdmin) {
    var container = document.getElementById('quickCashContainer');
    if (!container) return;
    if (isAdmin === undefined) {
        isAdmin = typeof DB !== 'undefined' && DB.isAdmin && DB.isAdmin();
    }

    // Tính tổng tiền đếm được
    var countedTotal = 0;
    for (var i = 0; i < CASH_DENOMS.length; i++) {
        countedTotal += CASH_DENOMS[i].value * (cashCounts[CASH_DENOMS[i].value] || 0);
    }

    var data = _posCashData || {
        openingBalance: 0, cashRevenue: 0, posCashExpense: 0, posCostCount: 0,
        managerPickupTotal: 0, pickupHistory: [], expectedClosing: 0, actualClosing: null,
        isClosed: false, difference: null, diffPercent: null, status: null
    };

    // expectedClosing đã trừ QL nhận, nên chênh lệch = đếm được - dự kiến còn
    var liveDiff = countedTotal - data.expectedClosing;
    var liveDiffClass = liveDiff >= 0 ? 'pos-cash-positive' : 'pos-cash-negative';

    // Số tiền tại POS hiện tại = expectedClosing (đã trừ QL nhận)
    // Khi đã đếm: lấy countedTotal
    var currentPosCash = data.expectedClosing;
    var actualPosCash = countedTotal > 0 ? countedTotal : currentPosCash;
    if (actualPosCash < 0) actualPosCash = 0;

    var html = '';
    html += '<div class="cash-counter">';

    // ===== HEADER =====
    html += '  <div class="cash-counter-header">';
    html += '    <span class="cash-counter-title">💰 Tiền mặt tại POS</span>';
    if (data.isClosed) {
        html += '    <span class="cash-closed-badge">🔒 Đã chốt</span>';
    }
    html += '  </div>';

    // ===== THÔNG TIN ĐỐI SOÁT (chỉ Quản lý mới thấy) =====
    if (isAdmin) {
        html += '  <div class="pos-cash-info">';
        html += '    <div class="pos-cash-row"><span>📂 Số dư đầu kỳ</span><span>' + formatMoney(data.openingBalance) + '</span></div>';
        html += '    <div class="pos-cash-row"><span>💵 Doanh thu tiền mặt</span><span>' + formatMoney(data.cashRevenue) + '</span></div>';
        html += '    <div class="pos-cash-row"><span>🏦 Chi phí từ Két POS</span><span class="pos-cash-expense">' + data.posCostCount + ' khoản - ' + formatMoney(data.posCashExpense) + '</span></div>';

        html += '    <div class="pos-cash-row pos-cash-formula">';
        html += '      <span>📐 Dự kiến còn:</span>';
        html += '      <span class="pos-cash-expected" id="posCashExpected">' + formatMoney(data.expectedClosing) + '</span>';
        html += '    </div>';

        // Số tiền thực tế = tổng đếm được
        html += '    <div class="pos-cash-row">';
        html += '      <span>📊 Số tiền thực tế:</span>';
        html += '      <span class="cash-counter-total" id="cashGrandTotal">' + formatMoney(countedTotal) + '</span>';
        html += '    </div>';

        // Chênh lệch: nếu đã chốt thì hiển thị difference đã lưu, nếu chưa thì tính realtime
        var displayDiff = data.difference !== null && data.difference !== undefined ? data.difference : liveDiff;
        var isSurplus = displayDiff > 0; // Dư tiền
        var diffSuffix = data.isClosed ? ' (đã chốt)' : '';
        var displayDiffClass = displayDiff < 0 ? 'pos-cash-negative' : (displayDiff > 0 ? 'pos-cash-warning' : 'pos-cash-positive');
        html += '    <div class="pos-cash-row pos-cash-diff" id="posCashDiffRow">';
        html += '      <span>📋 Chênh lệch:</span>';
        html += '      <span class="' + displayDiffClass + '" id="posCashDiffValue">' + (displayDiff >= 0 ? '+' : '') + formatMoney(displayDiff) + diffSuffix + '</span>';
        if (isSurplus) {
            html += '      <span class="pos-cash-warning" style="margin-left:8px;font-size:11px;">⚠️ Dư tiền - Kiểm tra lại!</span>';
        }
        html += '    </div>';
        html += '  </div>';
    }

    // ===== HIỂN THỊ THÔNG TIN CHO NHÂN VIÊN (đưa LÊN TRÊN bộ đếm) =====
    if (!isAdmin) {
        html += '  <div class="pos-cash-staff-result">';

        // Nhân viên: chỉ hiển thị chi phí POS và QL nhận (ẩn số dư đầu kỳ, doanh thu...)
        html += '    <div class="pos-cash-row"><span>🏦 Chi phí Két POS</span><span>' + data.posCostCount + ' khoản - ' + formatMoney(data.posCashExpense) + '</span></div>';
        html += '    <div class="pos-cash-row"><span>💰 QL nhận</span><span>' + formatMoney(data.managerPickupTotal) + '</span></div>';

        // 💵 Số tiền tại POS hiện tại = số nhân viên đếm
        html += '    <div class="pos-cash-row">';
        html += '      <span>💵 Số tiền tại POS hiện tại:</span>';
        html += '      <span class="' + (countedTotal >= 0 ? 'pos-cash-positive' : 'pos-cash-negative') + '" id="staffPosCashValue">' + formatMoney(countedTotal) + '</span>';
        html += '    </div>';

        // 📊 Chênh lệch + đầy đủ thông tin - chỉ hiển thị khi đã chốt
        // Dùng data.difference từ Firebase (do nhân viên A đã chốt ghi lên)
        // KHÔNG tính lại staffDiff = countedTotal - data.expectedClosing vì:
        //   - Nhân viên B chưa đếm tiền -> countedTotal = 0 -> sai
        //   - Cần hiển thị chênh lệch thực tế từ máy đã chốt
        if (data.isClosed) {
            html += '    <div class="pos-cash-row"><span>📂 Số dư đầu kỳ</span><span>' + formatMoney(data.openingBalance) + '</span></div>';
            html += '    <div class="pos-cash-row"><span>💵 Doanh thu tiền mặt</span><span>' + formatMoney(data.cashRevenue) + '</span></div>';

            // Lấy difference từ Firebase (do nhân viên A chốt ghi lên)
            var savedDiff = (data.difference !== null && data.difference !== undefined) ? data.difference : null;
            if (savedDiff !== null) {
                if (savedDiff > 0) {
                    // Dư tiền: không hiển thị số dư
                    html += '    <div class="pos-cash-row pos-cash-diff" id="staffDiffRow">';
                    html += '      <span>📊 Chênh lệch thực tế:</span>';
                    html += '      <span class="pos-cash-warning" id="staffDiffValue">Nhập máy bị thiếu - Yêu cầu nhập dữ liệu lần sau đầy đủ (đã chốt)</span>';
                    html += '    </div>';
                } else if (savedDiff < 0) {
                    // Thiếu tiền: hiển thị số tiền thiếu + cảnh báo nhập máy
                    html += '    <div class="pos-cash-row pos-cash-diff" id="staffDiffRow">';
                    html += '      <span>📊 Chênh lệch thực tế:</span>';
                    html += '      <span class="pos-cash-negative" id="staffDiffValue">' + formatMoney(savedDiff) + ' (đã chốt)</span>';
                    html += '    </div>';
                    html += '    <div class="pos-cash-row" style="margin-top:4px;">';
                    html += '      <span style="color:#e74c3c;font-size:12px;">⚠️ Nhập máy bị thiếu - Yêu cầu lần sau nhập máy đầy đủ</span>';
                    html += '    </div>';
                } else {
                    // Không chênh lệch
                    html += '    <div class="pos-cash-row pos-cash-diff" id="staffDiffRow">';
                    html += '      <span>📊 Chênh lệch thực tế:</span>';
                    html += '      <span class="pos-cash-positive" id="staffDiffValue">' + formatMoney(savedDiff) + ' (đã chốt)</span>';
                    html += '    </div>';
                }
            }
        }

        html += '  </div>';
    }

    // ===== BẢNG ĐẾM TIỀN =====
    html += '  <div class="pos-cash-section-title">🔢 Kiểm tiền mặt</div>';
    html += '  <div class="denom-grid">';

    for (var i = 0; i < CASH_DENOMS.length; i++) {
        var denom = CASH_DENOMS[i];
        var count = cashCounts[denom.value] || 0;
        var subtotal = denom.value * count;
        html += '    <div class="denom-card">';
        html += '      <div class="denom-label">' + denom.label + '</div>';
        html += '      <div class="denom-controls">';
        html += '        <button class="ctrl-btn ctrl-minus" onclick="adjustCashCount(' + denom.value + ', -1)">−</button>';
        html += '        <input type="number" class="denom-input" id="cashInput_' + denom.value + '" value="' + count + '" min="0" onchange="setCashCount(' + denom.value + ', this.value)" onfocus="this.select()">';
        html += '        <button class="ctrl-btn ctrl-plus" onclick="adjustCashCount(' + denom.value + ', 1)">+</button>';
        html += '      </div>';
        html += '      <div class="denom-subtotal" id="denomSubtotal_' + denom.value + '">' + formatMoney(subtotal) + '</div>';
        html += '    </div>';
    }

    html += '  </div>';

    // ===== NÚT HÀNH ĐỘNG =====
    if (isAdmin) {
        html += '  <div class="cash-counter-actions">';
        html += '    <button class="cash-action-btn cash-reset-btn" onclick="resetCashCounter()">🔄 Làm lại</button>';
        html += '    <button class="cash-action-btn cash-copy-btn" onclick="copyCashResult()">📋 Sao chép</button>';
        if (data.isClosed) {
            // Admin có nút "Hủy chốt" để mở khóa cho nhân viên chốt lại
            html += '    <button class="cash-action-btn cash-unlock-btn" onclick="unlockDayClose()">🔓 Hủy chốt</button>';
        }
        html += '  </div>';
    } else {
        html += '  <div class="cash-counter-actions">';
        html += '    <button class="cash-action-btn cash-reset-btn" onclick="resetCashCounter()">🔄 Làm lại</button>';
        html += '    <button class="cash-action-btn cash-copy-btn" onclick="copyCashResult()">📋 Sao chép</button>';
        if (!data.isClosed) {
            html += '    <button class="cash-action-btn cash-close-btn" onclick="staffCloseDay()">🔒 Chốt ngày</button>';
        }
        html += '  </div>';
    }

    html += '</div>';

    // ===== PHẦN RIÊNG: TIỀN QUẢN LÝ NHẬN (input + lưu Firebase) =====
    if (isAdmin) {
        html += '<div class="cash-counter" style="margin-top:12px;">';
        html += '  <div class="cash-counter-header">';
        html += '    <span class="cash-counter-title">💰 Tiền QL nhận</span>';
        html += '  </div>';
        html += '  <div class="pos-cash-info">';
        html += '    <div class="pos-cash-row">';
        html += '      <span>Tiền QL nhận:</span>';
        html += '      <span class="pos-cash-mgr-pickup">';
        html += '        <input type="number" class="mgr-pickup-input" id="mgrPickupInput" value="" min="0" placeholder="0">';
        html += '        <button class="mgr-pickup-btn" onclick="saveManagerPickup()">💾 Lưu</button>';
        html += '      </span>';
        html += '    </div>';

        // Lịch sử quản lý nhận tiền hôm nay
        if (data.pickupHistory && data.pickupHistory.length > 0) {
            for (var hi = 0; hi < data.pickupHistory.length; hi++) {
                var ph = data.pickupHistory[hi];
                var timeStr = '';
                if (ph.createdAt) {
                    var d = new Date(ph.createdAt);
                    timeStr = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
                }
                html += '    <div class="pos-cash-row pos-cash-pickup-log">';
                html += '      <span>🕐 ' + timeStr + '</span>';
                html += '      <span>-' + formatMoney(ph.amount) + '</span>';
                html += '    </div>';
            }
        }
        html += '  </div>';
        html += '</div>';
    }

    container.innerHTML = html;
}

function adjustCashCount(denomValue, delta) {
    var current = cashCounts[denomValue] || 0;
    var newVal = current + delta;
    if (newVal < 0) newVal = 0;
    cashCounts[denomValue] = newVal;
    updateDenomSubtotal(denomValue);
    updateCashGrandTotal();
}

function setCashCount(denomValue, val) {
    var num = parseInt(val, 10);
    if (isNaN(num) || num < 0) num = 0;
    cashCounts[denomValue] = num;
    updateDenomSubtotal(denomValue);
    updateCashGrandTotal();
}

function updateDenomSubtotal(denomValue) {
    var count = cashCounts[denomValue] || 0;
    var subtotal = denomValue * count;
    var el = document.getElementById('denomSubtotal_' + denomValue);
    if (el) el.textContent = formatMoney(subtotal);
    var input = document.getElementById('cashInput_' + denomValue);
    if (input) input.value = count;
}

function updateCashGrandTotal() {
    var total = 0;
    for (var i = 0; i < CASH_DENOMS.length; i++) {
        var denom = CASH_DENOMS[i];
        total += denom.value * (cashCounts[denom.value] || 0);
    }

    // Số tiền thực tế = tổng đếm được
    var el = document.getElementById('cashGrandTotal');
    if (el) el.textContent = formatMoney(total);

    // Cập nhật chênh lệch realtime (admin)
    var expectedClosing = _posCashData ? _posCashData.expectedClosing : 0;
    var liveDiff = total - expectedClosing;
    var diffEl = document.getElementById('posCashDiffValue');
    if (diffEl) {
        var diffClass = liveDiff >= 0 ? 'pos-cash-positive' : 'pos-cash-negative';
        diffEl.textContent = (liveDiff >= 0 ? '+' : '') + formatMoney(liveDiff);
        diffEl.className = diffClass;
    }

    // Cập nhật Số tiền tại POS hiện tại (staff) = số nhân viên đếm
    var staffPosCashEl = document.getElementById('staffPosCashValue');
    if (staffPosCashEl) {
        staffPosCashEl.textContent = formatMoney(total);
        staffPosCashEl.className = total >= 0 ? 'pos-cash-positive' : 'pos-cash-negative';
    }
}

function resetCashCounter() {
    // Nếu đã chốt ngày thì không cho reset - tránh nhầm lẫn số liệu
    if (_posCashData && _posCashData.isClosed) {
        showToast('🔒 Đã chốt ngày, không thể làm lại', 'warning');
        return;
    }
    for (var i = 0; i < CASH_DENOMS.length; i++) {
        cashCounts[CASH_DENOMS[i].value] = 0;
    }
    renderCashCounter();
}

function copyCashResult() {
    var total = 0;
    var lines = [];
    lines.push('=== KIỂM TIỀN MẶT POS ===');
    for (var i = 0; i < CASH_DENOMS.length; i++) {
        var denom = CASH_DENOMS[i];
        var count = cashCounts[denom.value] || 0;
        if (count > 0) {
            var subtotal = denom.value * count;
            total += subtotal;
            lines.push(denom.label + ': ' + count + ' tờ = ' + formatMoney(subtotal));
        }
    }
    lines.push('---------------------');
    lines.push('TỔNG CỘNG: ' + formatMoney(total));

    if (_posCashData) {
        lines.push('');
        lines.push('📊 ĐỐI SOÁT:');
        lines.push('Dự kiến: ' + formatMoney(_posCashData.expectedClosing));
        lines.push('Thực tế: ' + formatMoney(total));
        var diff = total - _posCashData.expectedClosing;
        lines.push('Chênh lệch: ' + (diff >= 0 ? '+' : '') + formatMoney(diff));
    }

    var text = lines.join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            showToast('✅ Đã sao chép kết quả', 'success');
        }).catch(function() {
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        showToast('✅ Đã sao chép kết quả', 'success');
    } catch (e) {
        showToast('❌ Không thể sao chép', 'error');
    }
    document.body.removeChild(textarea);
}

// ========== QUẢN LÝ: NHẬP TIỀN QUẢN LÝ NHẬN ==========
function saveManagerPickup() {
    var input = document.getElementById('mgrPickupInput');
    if (!input) return;
    var amount = parseFloat(input.value) || 0;
    if (amount <= 0) {
        showToast('⚠️ Nhập số tiền hợp lệ', 'warning');
        return;
    }

    var today = new Date().toISOString().slice(0, 10);
    var now = Date.now();
    var pickupId = 'pickup_' + now.toString(36) + '_' + Math.random().toString(36).substr(2, 4);

    var pickupData = {
        id: pickupId,
        amount: amount,
        dateKey: today,
        createdAt: now,
        createdBy: (DB.getCurrentUser && DB.getCurrentUser() && DB.getCurrentUser().id) || window.currentDeviceId || 'admin',
        note: 'Quản lý nhận tiền mặt'
    };

    // Bước 1: Ghi thẳng lên Firebase để các máy khác thấy ngay (và để loadPosCashData đọc được)
    var shopId = (typeof DB !== 'undefined' && DB.getShopId) ? DB.getShopId() : 'shop_default';
    var dbRef = firebase.database().ref(shopId + '/manager_cash_pickups/' + pickupId);

    dbRef.set(pickupData).catch(function(err) {
        console.error('saveManagerPickup - Firebase set error:', err);
    });

    // Bước 2: Lưu vào IndexedDB qua DB.create -> tự động notify local subscribers (realtime.js)
    // -> window.managerCashPickups được cập nhật -> renderReport chạy lại -> report thấy số liệu mới
    if (typeof DB !== 'undefined' && typeof DB.create === 'function') {
        DB.create('manager_cash_pickups', pickupData).then(function() {
            showToast('✅ Đã lưu: ' + formatMoney(amount), 'success');
            // Reload lại dữ liệu settings (đọc từ Firebase)
            loadPosCashData();
        }).catch(function(err) {
            console.error('saveManagerPickup - DB.create error:', err);
            showToast('❌ Lỗi khi lưu!', 'error');
        });
    } else {
        showToast('✅ Đã lưu: ' + formatMoney(amount) + ' (chưa đồng bộ)', 'success');
        loadPosCashData();
    }
}


// ========== NHÂN VIÊN: CHỐT NGÀY ==========
function staffCloseDay() {
    var countedTotal = 0;
    for (var i = 0; i < CASH_DENOMS.length; i++) {
        countedTotal += CASH_DENOMS[i].value * (cashCounts[CASH_DENOMS[i].value] || 0);
    }

    var data = _posCashData || {
        openingBalance: 0, cashRevenue: 0, posCashExpense: 0,
        managerPickupTotal: 0, expectedClosing: 0
    };
    var managerPickupTotal = data.managerPickupTotal || 0;
    var expectedClosing = data.expectedClosing || 0;

    // expectedClosing đã trừ QL nhận
    var expectedAfterPickup = expectedClosing;
    var difference = countedTotal - expectedAfterPickup;
    var isNegative = difference < 0;
    var isSurplus = difference > 0;

    // differenceType: 'surplus' (dư), 'deficit' (thiếu), 'balanced' (cân bằng)
    // Dùng cho admin lọc danh sách chốt ngày dễ dàng
    var differenceType = isSurplus ? 'surplus' : (isNegative ? 'deficit' : 'balanced');

    var today = new Date().toISOString().slice(0, 10);

    // Ghi lên Firebase - các máy khác đọc realtime sẽ tự cập nhật
    var shopId = (typeof DB !== 'undefined' && DB.getShopId) ? DB.getShopId() : 'shop_default';
    var dbRef = firebase.database().ref(shopId + '/daily_balances/' + today);
    dbRef.update({
        difference: difference,
        differenceType: differenceType,
        isClosed: true,
        closedAt: Date.now(),
        closedBy: window.currentDeviceId || 'staff',
        updatedAt: Date.now()
    }).then(function() {
        // Thông báo kết quả
        var toastMsg = '';
        var isSurplus = difference > 0;
        if (isNegative) {
            toastMsg = '🔒 ĐÃ CHỐT NGÀY ' + formatDateDisplay(today) + '\n' +
                       '🔴 THIẾU ' + formatMoney(Math.abs(difference)) + ' - BÁO QUẢN LÝ!\n\n' +
                       '📂 Đầu kỳ: ' + formatMoney(data.openingBalance) + '\n' +
                       '💵 Đếm được: ' + formatMoney(countedTotal) + '\n' +
                       '💰 QL nhận: ' + formatMoney(managerPickupTotal) + '\n' +
                       '📐 Dự kiến còn: ' + formatMoney(expectedAfterPickup) + '\n' +
                       '📋 Thiếu: ' + formatMoney(Math.abs(difference));
            showCloseableToast(toastMsg, 'error');
        } else if (isSurplus) {
            toastMsg = '🔒 ĐÃ CHỐT NGÀY ' + formatDateDisplay(today) + '\n' +
                       '⚠️ Dư tiền! Vui lòng nhập dữ liệu lần sau chính xác hơn.\n\n' +
                       '📂 Đầu kỳ: ' + formatMoney(data.openingBalance) + '\n' +
                       '💵 Đếm được: ' + formatMoney(countedTotal) + '\n' +
                       '💰 QL nhận: ' + formatMoney(managerPickupTotal) + '\n' +
                       '📐 Dự kiến còn: ' + formatMoney(expectedAfterPickup);
            showCloseableToast(toastMsg, 'warning');
        } else {
            toastMsg = '🔒 ĐÃ CHỐT NGÀY ' + formatDateDisplay(today) + '\n' +
                       '✅ Số dư đầu kỳ mai: ' + formatMoney(countedTotal) + '\n\n' +
                       '📂 Đầu kỳ: ' + formatMoney(data.openingBalance) + '\n' +
                       '💵 Đếm được: ' + formatMoney(countedTotal) + '\n' +
                       '💰 QL nhận: ' + formatMoney(managerPickupTotal) + '\n' +
                       '📐 Dự kiến còn: ' + formatMoney(expectedAfterPickup) + '\n' +
                       '📋 Không chênh lệch';
            showCloseableToast(toastMsg, 'success');
        }

        // Gửi Telegram cho admin
        if (typeof sendTelegramMessage === 'function') {
            var icon = isNegative ? '🔴' : (isSurplus ? '⚠️' : '✅');
            var tgMsg = icon + ' NHÂN VIÊN CHỐT NGÀY ' + formatDateDisplay(today) + '\n\n' +
                        '📂 Đầu kỳ: ' + formatMoney(data.openingBalance) + '\n' +
                        '💵 Doanh thu TM: ' + formatMoney(data.cashRevenue) + '\n' +
                        '🏦 Chi phí POS: ' + formatMoney(data.posCashExpense) + '\n' +
                        '💰 QL nhận: ' + formatMoney(managerPickupTotal) + '\n' +
                        '📐 Dự kiến còn: ' + formatMoney(expectedAfterPickup) + '\n' +
                        '📊 Đếm được: ' + formatMoney(countedTotal) + '\n' +
                        '📋 Chênh lệch: ' + (difference >= 0 ? '+' : '') + formatMoney(difference);
            if (isNegative) {
                tgMsg += '\n\n🔴 THIẾU ' + formatMoney(Math.abs(difference)) + ' - CẦN KIỂM TRA!';
            } else if (isSurplus) {
                tgMsg += '\n\n⚠️ DƯ ' + formatMoney(difference) + ' - Cần kiểm tra!';
            }
            sendTelegramMessage(tgMsg);
        }

        loadPosCashData(); // Reload
    }).catch(function(err) {
        console.error('staffCloseDay error:', err);
        showToast('❌ Lỗi khi chốt ngày!', 'error');
    });
}

// ========== ADMIN: HỦY CHỐT NGÀY ==========
// Admin có thể hủy chốt để cho phép nhân viên chốt lại
function unlockDayClose() {
    if (!confirm('🔓 Xác nhận hủy chốt ngày hôm nay?\n\nSau khi hủy chốt:\n- Nhân viên có thể chốt lại\n- Hoàn tác/xóa món/xóa bàn sẽ yêu cầu mật khẩu (đã chốt)\n\nTiếp tục?')) return;

    var today = new Date().toISOString().slice(0, 10);
    var shopId = (typeof DB !== 'undefined' && DB.getShopId) ? DB.getShopId() : 'shop_default';

    var dbRef = firebase.database().ref(shopId + '/daily_balances/' + today);
    dbRef.update({
        isClosed: false,
        closedAt: null,
        closedBy: null,
        updatedAt: Date.now()
    }).then(function() {
        showToast('🔓 Đã hủy chốt ngày hôm nay', 'success');

        if (typeof sendTelegramMessage === 'function') {
            var msg = '🔓 QUẢN LÝ HỦY CHỐT NGÀY ' + formatDateDisplay(today) + '\n\n' +
                      'Nhân viên có thể chốt lại ngày hôm nay.';
            sendTelegramMessage(msg);
        }

        loadPosCashData();
    }).catch(function(err) {
        console.error('unlockDayClose error:', err);
        showToast('❌ Lỗi khi hủy chốt!', 'error');
    });
}

// ========== TOAST CÓ NÚT TẮT ==========
function showCloseableToast(message, type) {
    var toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'success') + ' toast-closeable';
    toast.style.cursor = 'default';

    var msgSpan = document.createElement('span');
    msgSpan.style.whiteSpace = 'pre-line';
    msgSpan.style.flex = '1';
    msgSpan.style.fontSize = '13px';
    msgSpan.style.lineHeight = '1.6';
    msgSpan.textContent = message;

    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;color:#fff;font-size:18px;cursor:pointer;padding:0 0 0 12px;opacity:0.8;flex-shrink:0;';
    closeBtn.onclick = function() {
        if (toast.parentNode) toast.remove();
    };

    toast.appendChild(msgSpan);
    toast.appendChild(closeBtn);
    document.getElementById('toastContainer').appendChild(toast);

    // Auto-dismiss sau 15 giây nếu không tắt
    setTimeout(function() {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.5s';
            setTimeout(function() {
                if (toast.parentNode) toast.remove();
            }, 500);
        }
    }, 15000);
}

// ============================================================
// 2. CÀI ĐẶT ỨNG DỤNG (Settings)
// ============================================================

function initSettingsTab() {
    try {
    // Phân quyền hiển thị:
    // - Nhân viên: chỉ thấy "⚙️ Cài đặt ứng dụng" + "📝 Ghi chú"
    // - Admin: thấy tất cả (Telegram, ESP32, Thông tin quán, Chat)
    // Phân quyền nhân viên đã chuyển sang modal employees.js
    var isAdmin = typeof DB !== 'undefined' && DB.isAdmin && DB.isAdmin();
    var appSection = document.getElementById('settingsAppSection');
    var shopSection = document.getElementById('settingsShopSection');
    var telegramSection = document.getElementById('settingsTelegramSection');
    var permSection = document.getElementById('settingsPermissionSection');
    var chatSection = document.getElementById('settingsChatSection');
    var esp32Section = document.getElementById('settingsEsp32Section');
    var chatLockField = document.getElementById('chatLockField');
    var staffNoteSection = document.getElementById('settingsStaffNoteSection');

    // App section: staff thấy, admin ẩn (admin đã có các section khác)
    if (appSection) appSection.style.display = isAdmin ? 'none' : '';
    // Staff note section: chỉ nhân viên mới thấy
    if (staffNoteSection) staffNoteSection.style.display = isAdmin ? 'none' : '';
    // Shop section: chỉ admin mới thấy
    if (shopSection) shopSection.style.display = isAdmin ? '' : 'none';
    // Telegram section: chỉ admin mới thấy
    if (telegramSection) telegramSection.style.display = isAdmin ? '' : 'none';
    // ESP32 section: chỉ admin mới thấy
    if (esp32Section) esp32Section.style.display = isAdmin ? '' : 'none';
    // Permission section: luôn ẩn (đã chuyển sang modal employees.js)
    if (permSection) permSection.style.display = 'none';
    // Chat section: chỉ admin mới thấy
    if (chatSection) chatSection.style.display = isAdmin ? '' : 'none';
    // Lock chat field: chỉ admin mới thấy
    if (chatLockField) chatLockField.style.display = isAdmin ? '' : 'none';

    // Load Telegram config nếu có
    var savedToken = localStorage.getItem('telegram_bot_token');
    var tokenInput = document.getElementById('telegramBotToken');
    if (tokenInput) tokenInput.value = savedToken || '';
    var savedChatId = localStorage.getItem('telegram_chat_id');
    var chatIdInput = document.getElementById('telegramChatId');
    if (chatIdInput) chatIdInput.value = savedChatId || '';
    var savedBotName = localStorage.getItem('telegram_bot_name');
    var botNameInput = document.getElementById('telegramBotName');
    if (botNameInput) botNameInput.value = savedBotName || '';

    // Load staff permission list (đã chuyển sang modal employees.js)
    // Giữ lại để tương thích nếu có gọi từ nơi khác

    // Khởi tạo Đếm tiền nhanh
    if (typeof initQuickCashCounter === 'function') {
        initQuickCashCounter();
    }

    // Load token GitHub
    var savedGithubToken = localStorage.getItem('github_token');
    var githubTokenInput = document.getElementById('settingsGithubToken');
    if (githubTokenInput) {
        githubTokenInput.value = savedGithubToken || '';
    }

    // Load skipped version
    var skipped = localStorage.getItem('skip_version');
    var skippedEl = document.getElementById('settingsSkippedVersion');
    if (skippedEl) {
        skippedEl.textContent = skipped || 'Không có';
    }

    // Load version
    var versionEl = document.getElementById('settingsCurrentVersion');
    if (versionEl) {
        versionEl.textContent = window.APP_VERSION || '1.0.0';
    }

    // Load shop info
    if (typeof loadShopInfo === 'function') {
        loadShopInfo();
    }

    // Load ESP32 config
    if (typeof loadEsp32Config === 'function') {
        loadEsp32Config();
    }

    // Load lock config
    loadLockConfig();

    // Đồng bộ trạng thái toggle khóa chat
    // Sử dụng isChatLocked() từ messages.js (đã đồng bộ qua Firebase realtime)
    if (isAdmin) {
        var chatLockToggle = document.getElementById('chatLockToggle');
        var chatLockLabel = document.getElementById('chatLockStatusLabel');
        if (chatLockToggle) {
            var locked = false;
            if (typeof isChatLocked === 'function') {
                locked = isChatLocked();
            } else {
                // Fallback nếu messages.js chưa load
                try {
                    locked = localStorage.getItem('chat_staff_locked') === 'true';
                } catch(e) {}
            }
            chatLockToggle.checked = locked;
            if (chatLockLabel) {
                chatLockLabel.textContent = locked ? '🔒 Đã khóa' : '🔓 Đã mở';
            }
        }
    }

    // Load ghi chú nhân viên từ localStorage
    var staffNoteInput = document.getElementById('staffNoteInput');
    if (staffNoteInput) {
        try {
            var savedNote = localStorage.getItem('staff_note');
            if (savedNote !== null) {
                staffNoteInput.value = savedNote;
            }
        } catch(e) {}
    }

    // Kiểm tra cập nhật
    if (typeof checkUpdateNow === 'function') {
        checkUpdateNow();
    }
    } catch(e) {
        console.error('initSettingsTab error:', e);
    }
}

// Lưu ghi chú nhân viên vào localStorage (gọi từ oninput)
function saveStaffNote(value) {
    try {
        localStorage.setItem('staff_note', value || '');
    } catch(e) {}
}

function updateSettingsStatus(message, isError) {
    var statusEl = document.getElementById('settingsUpdateStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#dc2626' : '#16a34a';
}

function saveGitHubToken() {
    var input = document.getElementById('settingsGithubToken');
    if (!input) return;
    var token = input.value.trim();
    if (!token) {
        showToast('⚠️ Vui lòng nhập token', 'warning');
        return;
    }
    localStorage.setItem('github_token', token);
    showToast('✅ Đã lưu token', 'success');
}

function clearGitHubToken() {
    localStorage.removeItem('github_token');
    var input = document.getElementById('settingsGithubToken');
    if (input) input.value = '';
    showToast('🗑️ Đã xóa token', 'info');
}

function checkUpdateNow() {
    updateSettingsStatus('Đang kiểm tra...', false);
    var token = localStorage.getItem('github_token');
    if (!token) {
        updateSettingsStatus('⚠️ Chưa có token GitHub', true);
        return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://api.github.com/repos/cana2/posapp/releases/latest', true);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.setRequestHeader('Accept', 'application/vnd.github.v3+json');
    xhr.timeout = 15000;

    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            try {
                var data = JSON.parse(xhr.responseText);
                var latestVersion = (data.tag_name || 'v1.0.0').replace(/^v/, '');
                var currentVersion = window.APP_VERSION || '1.0.0';
                var skipped = localStorage.getItem('skip_version');

                if (compareVersions(latestVersion, currentVersion) > 0) {
                    if (skipped === latestVersion) {
                        updateSettingsStatus('📌 Phiên bản ' + latestVersion + ' đang bị bỏ qua', false);
                    } else {
                        updateSettingsStatus('🎉 Có phiên bản mới: v' + latestVersion, false);
                        showToast('🎉 Có phiên bản mới v' + latestVersion, 'info', 5000);
                    }
                } else {
                    updateSettingsStatus('✅ Đã là phiên bản mới nhất', false);
                }
            } catch (e) {
                updateSettingsStatus('❌ Lỗi phân tích phản hồi', true);
            }
        } else if (xhr.status === 401) {
            updateSettingsStatus('❌ Token không hợp lệ', true);
        } else if (xhr.status === 403) {
            updateSettingsStatus('❌ Đã vượt quá giới hạn API', true);
        } else {
            updateSettingsStatus('❌ Lỗi ' + xhr.status, true);
        }
    };

    xhr.onerror = function() {
        updateSettingsStatus('❌ Không thể kết nối', true);
    };

    xhr.ontimeout = function() {
        updateSettingsStatus('❌ Hết thời gian chờ', true);
    };

    xhr.send();
}

function clearSkipVersion() {
    localStorage.removeItem('skip_version');
    var skippedEl = document.getElementById('settingsSkippedVersion');
    if (skippedEl) skippedEl.textContent = 'Không có';
    showToast('🔄 Đã bỏ bỏ qua, kiểm tra lại...', 'info');
    checkUpdateNow();
}

function savePrinterIp() {
    var input = document.getElementById('settingsPrinterIp');
    if (!input) return;
    var ip = input.value.trim();
    if (!ip) {
        showToast('⚠️ Vui lòng nhập địa chỉ IP', 'warning');
        return;
    }
    localStorage.setItem('printer_ip', ip);
    showToast('✅ Đã lưu địa chỉ máy in', 'success');
}

function testPrint() {
    var ip = localStorage.getItem('printer_ip');
    if (!ip) {
        showToast('⚠️ Chưa có địa chỉ máy in', 'warning');
        return;
    }
    // Gửi lệnh in thử qua Android bridge
    if (window.AppBridge && typeof window.AppBridge.printTest === 'function') {
        window.AppBridge.printTest(ip);
    } else {
        showToast('📡 Đã gửi lệnh in thử đến ' + ip, 'info');
    }
}

function toggleTokenVisibility() {
    var input = document.getElementById('settingsGithubToken');
    var btn = document.getElementById('settingsToggleToken');
    if (!input || !btn) return;
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
    } else {
        input.type = 'password';
        btn.textContent = '👁️';
    }
}

// ============================================================
// 3. THÔNG TIN QUÁN (Shop Info)
// ============================================================

function loadShopInfo() {
    var nameEl = document.getElementById('shopInfoName');
    var addressEl = document.getElementById('shopInfoAddress');
    var phoneEl = document.getElementById('shopInfoPhone');
    if (!nameEl) return;

    if (window.shopInfo) {
        nameEl.value = window.shopInfo.name || '';
        addressEl.value = window.shopInfo.address || '';
        phoneEl.value = window.shopInfo.phone || '';
    } else {
        nameEl.value = '';
        addressEl.value = '';
        phoneEl.value = '';
    }
}

function saveShopInfo() {
    var name = document.getElementById('shopInfoName').value.trim();
    var address = document.getElementById('shopInfoAddress').value.trim();
    var phone = document.getElementById('shopInfoPhone').value.trim();

    if (!name) {
        showToast('⚠️ Vui lòng nhập tên quán', 'warning');
        return;
    }

    var data = {
        id: 'shop_info',
        name: name,
        address: address,
        phone: phone,
        updatedAt: new Date().toISOString()
    };

    DB.create('shop_info', data, 'shop_info').then(function() {
        window.shopInfo = data;
        showToast('✅ Đã lưu thông tin quán', 'success');
    }).catch(function(err) {
        console.error('Save shop info error:', err);
        showToast('❌ Lỗi lưu thông tin quán', 'error');
    });
}

function clearShopInfo() {
    if (!confirm('Xóa thông tin quán?')) return;
    DB.remove('shop_info', 'shop_info').then(function() {
        window.shopInfo = null;
        loadShopInfo();
        showToast('🗑️ Đã xóa thông tin quán', 'info');
    }).catch(function(err) {
        console.error('Clear shop info error:', err);
        showToast('❌ Lỗi xóa thông tin quán', 'error');
    });
}

// ============================================================
// 5. TELEGRAM CONFIG
// ============================================================

function toggleTelegramTokenVisibility() {
    var input = document.getElementById('telegramBotToken');
    var btn = document.getElementById('settingsToggleTelegramToken');
    if (!input || !btn) return;
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
    } else {
        input.type = 'password';
        btn.textContent = '👁️';
    }
}

function saveTelegramConfig() {
    var token = document.getElementById('telegramBotToken').value.trim();
    var chatId = document.getElementById('telegramChatId').value.trim();
    var botName = document.getElementById('telegramBotName').value.trim();

    if (!token || !chatId) {
        showToast('⚠️ Vui lòng nhập Bot Token và Chat ID', 'warning');
        return;
    }

    localStorage.setItem('telegram_bot_token', token);
    localStorage.setItem('telegram_chat_id', chatId);
    if (botName) {
        localStorage.setItem('telegram_bot_name', botName);
    }

    // Cập nhật biến global trong telegram.js nếu có
    if (typeof window.TELEGRAM_BOT_TOKEN !== 'undefined') {
        window.TELEGRAM_BOT_TOKEN = token;
    }
    if (typeof window.TELEGRAM_CHAT_ID !== 'undefined') {
        window.TELEGRAM_CHAT_ID = chatId;
    }

    var statusEl = document.getElementById('telegramConfigStatus');
    if (statusEl) statusEl.textContent = '✅ Đã lưu cấu hình Telegram';
    showToast('✅ Đã lưu cấu hình Telegram', 'success');
}

function testTelegramConfig() {
    var token = localStorage.getItem('telegram_bot_token');
    var chatId = localStorage.getItem('telegram_chat_id');
    if (!token || !chatId) {
        showToast('⚠️ Chưa có cấu hình Telegram', 'warning');
        return;
    }

    var statusEl = document.getElementById('telegramConfigStatus');
    if (statusEl) statusEl.textContent = '📨 Đang gửi tin nhắn thử...';

    var message = encodeURIComponent('🟢 *Tin nhắn thử từ POS* \n\nNếu bạn thấy tin nhắn này, cấu hình Telegram đã hoạt động!');
    var url = 'https://api.telegram.org/bot' + token + '/sendMessage?chat_id=' + chatId + '&text=' + message + '&parse_mode=Markdown';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = 10000;

    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            if (statusEl) statusEl.textContent = '✅ Gửi thử thành công!';
            showToast('✅ Gửi tin nhắn thử thành công', 'success');
        } else {
            if (statusEl) statusEl.textContent = '❌ Lỗi: ' + xhr.status;
            showToast('❌ Gửi thử thất bại (HTTP ' + xhr.status + ')', 'error');
        }
    };

    xhr.onerror = function() {
        if (statusEl) statusEl.textContent = '❌ Không thể kết nối Telegram';
        showToast('❌ Không thể kết nối Telegram API', 'error');
    };

    xhr.ontimeout = function() {
        if (statusEl) statusEl.textContent = '❌ Hết thời gian chờ';
        showToast('❌ Hết thời gian chờ kết nối Telegram', 'error');
    };

    xhr.send();
}

function clearTelegramConfig() {
    if (!confirm('Xóa cấu hình Telegram?')) return;
    localStorage.removeItem('telegram_bot_token');
    localStorage.removeItem('telegram_chat_id');
    localStorage.removeItem('telegram_bot_name');

    document.getElementById('telegramBotToken').value = '';
    document.getElementById('telegramChatId').value = '';
    document.getElementById('telegramBotName').value = '';

    var statusEl = document.getElementById('telegramConfigStatus');
    if (statusEl) statusEl.textContent = '🗑️ Đã xóa cấu hình Telegram';
    showToast('🗑️ Đã xóa cấu hình Telegram', 'info');
}

// ============================================================
// 5b. CẤU HÌNH KHÓA BÀN & THỜI GIAN
// ============================================================

function loadLockConfig() {
    try {
        var info = window.shopInfo || {};
        var startHourInput = document.getElementById('settingsLockStartHour');
        if (startHourInput) startHourInput.value = info.lockStartHour !== undefined ? info.lockStartHour : '';

        var endHourInput = document.getElementById('settingsLockEndHour');
        if (endHourInput) endHourInput.value = info.lockEndHour !== undefined ? info.lockEndHour : '';

        var endMinuteInput = document.getElementById('settingsLockEndMinute');
        if (endMinuteInput) endMinuteInput.value = info.lockEndMinute !== undefined ? info.lockEndMinute : '';

        var tableLockInput = document.getElementById('settingsTableLockHours');
        if (tableLockInput) tableLockInput.value = info.tableLockHours !== undefined ? info.tableLockHours : '';

        var lockPassInput = document.getElementById('settingsLockPassword');
        if (lockPassInput) lockPassInput.value = info.lockPassword || '';
    } catch(e) {
        console.error('loadLockConfig error:', e);
    }
}

function saveLockConfig() {
    var startHour = document.getElementById('settingsLockStartHour').value.trim();
    var endHour = document.getElementById('settingsLockEndHour').value.trim();
    var endMinute = document.getElementById('settingsLockEndMinute').value.trim();
    var tableLockHours = document.getElementById('settingsTableLockHours').value.trim();
    var lockPassword = document.getElementById('settingsLockPassword').value.trim();

    // Validate
    if (startHour) {
        var sh = parseInt(startHour, 10);
        if (isNaN(sh) || sh < 0 || sh > 23) {
            showToast('⚠️ Giờ mở quán không hợp lệ (0-23)', 'warning');
            return;
        }
    }
    if (endHour) {
        var eh = parseInt(endHour, 10);
        if (isNaN(eh) || eh < 0 || eh > 23) {
            showToast('⚠️ Giờ đóng quán không hợp lệ (0-23)', 'warning');
            return;
        }
    }
    if (endMinute) {
        var em = parseInt(endMinute, 10);
        if (isNaN(em) || em < 0 || em > 59) {
            showToast('⚠️ Phút đóng quán không hợp lệ (0-59)', 'warning');
            return;
        }
    }
    if (tableLockHours) {
        var tlh = parseInt(tableLockHours, 10);
        if (isNaN(tlh) || tlh < 1 || tlh > 24) {
            showToast('⚠️ Thời gian ngồi tối đa không hợp lệ (1-24)', 'warning');
            return;
        }
    }

    // Các key này nằm trực tiếp trong info/{shopId} trên Firebase (cùng cấp với name, code)
    // Ghi trực tiếp lên Firebase để đảm bảo đúng path
    var shopId = localStorage.getItem('current_shop_id') || 'shop_default';
    var fbRef = firebase.database().ref(shopId + '/info');
    var updates = {};
    if (startHour) updates.lockStartHour = parseInt(startHour, 10);
    if (endHour) updates.lockEndHour = parseInt(endHour, 10);
    if (endMinute) updates.lockEndMinute = parseInt(endMinute, 10);
    if (tableLockHours) updates.tableLockHours = parseInt(tableLockHours, 10);
    if (lockPassword) updates.lockPassword = lockPassword;

    fbRef.update(updates).then(function() {
        // Cập nhật shopInfo và shopConfig ngay lập tức
        if (window.shopInfo) {
            for (var k in updates) window.shopInfo[k] = updates[k];
        }
        if (window.shopConfig) {
            for (var k in updates) window.shopConfig[k] = updates[k];
        }
        var statusEl = document.getElementById('lockConfigStatus');
        if (statusEl) statusEl.textContent = '✅ Đã lưu cấu hình khóa bàn & thời gian';
        showToast('✅ Đã lưu cấu hình khóa bàn & thời gian', 'success');
    }).catch(function(err) {
        console.error('Save lock config error:', err);
        showToast('❌ Lỗi lưu cấu hình', 'error');
    });
}

// ============================================================
// 6. PHÂN QUYỀN NHÂN VIÊN (Staff Permission)
//    Đã chuyển sang employees.js
//    Các hàm này là wrapper để tránh xung đột tên
// ============================================================

// employees.js đã định nghĩa và export các hàm:
//   loadStaffPermissionList, toggleStaffRole, createNewStaff, deleteStaff
// Settings.js chỉ gọi lại qua window để tránh đệ quy

function loadStaffPermissionList() {
    // Gọi implementation từ employees.js qua tên khác để tránh đệ quy
    if (typeof window._empLoadStaffPermList === 'function') {
        window._empLoadStaffPermList();
    }
}

function toggleStaffRole(staffId, currentRole) {
    if (typeof window._empToggleRole === 'function') {
        window._empToggleRole(staffId, currentRole);
    }
}

function createNewStaff() {
    if (typeof window._empCreateStaff === 'function') {
        window._empCreateStaff();
    }
}

function deleteStaff(staffId, staffName) {
    if (typeof window._empDeleteStaff === 'function') {
        window._empDeleteStaff(staffId, staffName);
    }
}

// ============================================================
// 7. ESCAPE HELPER
// ============================================================

function escapeJsString(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\')
              .replace(/'/g, "\\'")
              .replace(/"/g, '\\"')
              .replace(/\n/g, '\\n')
              .replace(/\r/g, '\\r');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&')
              .replace(/</g, '<')
              .replace(/>/g, '>')
              .replace(/"/g, '"')
              .replace(/'/g, '&#039;');
}

// ============================================================
// 4. SO SÁNH PHIÊN BẢN (Version Compare)
// ============================================================

function compareVersions(v1, v2) {
    var parts1 = v1.split('.').map(Number);
    var parts2 = v2.split('.').map(Number);
    for (var i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        var n1 = parts1[i] || 0;
        var n2 = parts2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    return 0;
}

// ============================================================
// 7. CẤU HÌNH ESP32 (KÉT TIỀN)
// ============================================================

/**
 * Lấy shopId cho ESP32 config
 */
function _getEsp32ShopId() {
    return localStorage.getItem('current_shop_id') || 'shop_default';
}

/**
 * Toggle hiển thị Telegram token trong phần ESP32
 */
function toggleEsp32TelegramToken() {
    var input = document.getElementById('esp32TelegramToken');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

/**
 * Lưu cấu hình ESP32 lên Firebase
 * ESP32 sẽ đọc cấu hình này khi khởi động thay vì hardcode
 */
function saveEsp32Config() {
    var ssid = document.getElementById('esp32WifiSsid').value.trim();
    var password = document.getElementById('esp32WifiPassword').value.trim();
    var fbHost = document.getElementById('esp32FirebaseHost').value.trim();
    var shopId = document.getElementById('esp32ShopId').value.trim();
    var tgToken = document.getElementById('esp32TelegramToken').value.trim();
    var tgChatId = document.getElementById('esp32TelegramChatId').value.trim();

    if (!ssid) {
        showToast('⚠️ Vui lòng nhập WiFi SSID', 'warning');
        return;
    }
    if (!password) {
        showToast('⚠️ Vui lòng nhập WiFi Password', 'warning');
        return;
    }
    if (!fbHost) {
        showToast('⚠️ Vui lòng nhập Firebase Host', 'warning');
        return;
    }

    var config = {
        wifi: {
            ssid: ssid,
            password: password
        },
        firebase: {
            host: fbHost,
            shopId: shopId || 'shop_default'
        },
        telegram: {
            token: tgToken || '',
            chatId: tgChatId || ''
        },
        updatedAt: new Date().toISOString(),
        updatedBy: (function() {
            try {
                var s = localStorage.getItem('pos_session');
                if (s) {
                    var u = JSON.parse(s);
                    return u.displayName || u.username || 'admin';
                }
            } catch(e) {}
            return 'admin';
        })()
    };

    var statusEl = document.getElementById('esp32ConfigStatus');
    if (statusEl) statusEl.textContent = '⏳ Đang lưu...';

    var currentShopId = _getEsp32ShopId();
    var dbRef = firebase.database().ref(currentShopId + '/esp32_config');

    dbRef.set(config).then(function() {
        if (statusEl) statusEl.textContent = '✅ Đã lưu cấu hình ESP32';
        showToast('✅ Đã lưu cấu hình ESP32', 'success');
    }).catch(function(err) {
        console.error('Save ESP32 config error:', err);
        if (statusEl) statusEl.textContent = '❌ Lỗi: ' + err.message;
        showToast('❌ Lỗi lưu cấu hình ESP32', 'error');
    });
}

/**
 * Tải cấu hình ESP32 từ Firebase và điền vào form
 */
function loadEsp32Config() {
    var statusEl = document.getElementById('esp32ConfigStatus');
    if (statusEl) statusEl.textContent = '⏳ Đang tải...';

    var currentShopId = _getEsp32ShopId();
    var dbRef = firebase.database().ref(currentShopId + '/esp32_config');

    dbRef.once('value').then(function(snapshot) {
        var config = snapshot.val();
        if (!config) {
            if (statusEl) statusEl.textContent = 'ℹ️ Chưa có cấu hình ESP32';
            return;
        }

        // Điền WiFi
        var ssidEl = document.getElementById('esp32WifiSsid');
        if (ssidEl && config.wifi) ssidEl.value = config.wifi.ssid || '';

        var passEl = document.getElementById('esp32WifiPassword');
        if (passEl && config.wifi) passEl.value = config.wifi.password || '';

        // Điền Firebase
        var fbHostEl = document.getElementById('esp32FirebaseHost');
        if (fbHostEl && config.firebase) fbHostEl.value = config.firebase.host || '';

        var shopIdEl = document.getElementById('esp32ShopId');
        if (shopIdEl && config.firebase) shopIdEl.value = config.firebase.shopId || '';

        // Điền Telegram
        var tgTokenEl = document.getElementById('esp32TelegramToken');
        if (tgTokenEl && config.telegram) tgTokenEl.value = config.telegram.token || '';

        var tgChatIdEl = document.getElementById('esp32TelegramChatId');
        if (tgChatIdEl && config.telegram) tgChatIdEl.value = config.telegram.chatId || '';

        if (statusEl) {
            var updated = config.updatedAt ? ' (cập nhật: ' + new Date(config.updatedAt).toLocaleString('vi-VN') + ')' : '';
            statusEl.textContent = '✅ Đã tải cấu hình' + updated;
        }
        showToast('✅ Đã tải cấu hình ESP32', 'success');
    }).catch(function(err) {
        console.error('Load ESP32 config error:', err);
        if (statusEl) statusEl.textContent = '❌ Lỗi: ' + err.message;
        showToast('❌ Lỗi tải cấu hình ESP32', 'error');
    });
}

/**
 * Xóa cấu hình ESP32 khỏi Firebase
 */
function clearEsp32Config() {
    if (!confirm('Xóa cấu hình ESP32? ESP32 sẽ không thể kết nối nếu chưa có cấu hình mới.')) return;

    var statusEl = document.getElementById('esp32ConfigStatus');
    if (statusEl) statusEl.textContent = '⏳ Đang xóa...';

    var currentShopId = _getEsp32ShopId();
    var dbRef = firebase.database().ref(currentShopId + '/esp32_config');

    dbRef.remove().then(function() {
        // Xóa các field trên form
        var ids = ['esp32WifiSsid', 'esp32WifiPassword', 'esp32FirebaseHost',
                   'esp32ShopId', 'esp32TelegramToken', 'esp32TelegramChatId'];
        ids.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });

        if (statusEl) statusEl.textContent = '🗑️ Đã xóa cấu hình ESP32';
        showToast('🗑️ Đã xóa cấu hình ESP32', 'info');
    }).catch(function(err) {
        console.error('Clear ESP32 config error:', err);
        if (statusEl) statusEl.textContent = '❌ Lỗi: ' + err.message;
        showToast('❌ Lỗi xóa cấu hình ESP32', 'error');
    });
}
