// realtime.js - Realtime subscriptions, cập nhật bàn thông minh
// Tách từ pos.js - ES5, tương thích Android 6, iOS 12

// ========== REALTIME THÔNG MINH ==========
// FIX: Debounce ngắn hơn (100ms) vì local callback đã nhanh, Firebase chỉ là đồng bộ nền
var _realtimeTimers = {};

function _debounceRealtime(key, fn, delay) {
    delay = delay || 100;
    if (_realtimeTimers[key]) clearTimeout(_realtimeTimers[key]);
    _realtimeTimers[key] = setTimeout(function() {
        _realtimeTimers[key] = null;
        fn();
    }, delay);
}

// FIX: Gọi UI render ngay từ memoryCache, không chờ Firebase
function _renderNow(key, fn) {
    if (_realtimeTimers[key]) clearTimeout(_realtimeTimers[key]);
    _realtimeTimers[key] = null;
    fn();
}

function initRealtime() {
    DB.subscribe('tables', function(newTables) {
        if (!newTables) return;
        cachedTables = newTables;
        tablesCacheTime = Date.now();
        if (currentTab !== 'tables') return;
        // FIX: Render ngay nếu đang ở tab tables, không debounce
        _renderNow('tables_render', function() {
            updateTablesDiff(newTables);
        });
    });
    
    DB.subscribe('daily_balances', function() {
        if (currentTab === 'report' || currentTab === 'manager') {
            _debounceRealtime('daily_balances', function() {
                renderReport(currentReportDate);
                if (typeof managerApplyFilter === 'function') {
                    managerApplyFilter();
                }
            }, 100);
        }
    });
    
    DB.subscribe('customers', function(data) {
        customers = data || [];
        _debounceRealtime('customers', function() {
            if (currentTab === 'customers') {
                renderCustomerList();
            }
            var selectorModal = document.getElementById('customerSelectorModal');
            if (selectorModal && selectorModal.style.display === 'flex') {
                var searchVal = document.getElementById('customerSelectorSearch') ? document.getElementById('customerSelectorSearch').value : '';
                renderCustomerSelectorList(searchVal);
            }
            var detailModal = document.getElementById('customerDetailModal');
            if (detailModal && detailModal.style.display === 'flex') {
                var detailContent = document.getElementById('customerDetailContent');
                if (detailContent && detailContent.getAttribute('data-customer-id')) {
                    showCustomerDetail(detailContent.getAttribute('data-customer-id'));
                }
            }
            if (currentTab === 'manager' && typeof renderManagerDebtList === 'function') {
                renderManagerDebtList(customers);
            }
        }, 100);
    });
    
    DB.subscribe('menu', function(data) {
        menuItems = data || [];
        if (typeof _invalidateLookups === 'function') _invalidateLookups();
        var orderModal = document.getElementById('orderModal');
        if (orderModal && orderModal.style.display === 'flex') {
            _debounceRealtime('menu', function() {
                renderMenuByCategory(currentMenuCategory);
            }, 100);
        }
    });
    
    DB.subscribe('menu_categories', function(data) {
        menuCategories = data || [];
        var orderModal = document.getElementById('orderModal');
        if (orderModal && orderModal.style.display === 'flex') {
            _debounceRealtime('menu_categories', function() {
                renderOrderCategories();
            }, 100);
        }
    });
    
    DB.subscribe('ingredients', function(data) {
        ingredients = data || [];
        if (typeof _invalidateLookups === 'function') _invalidateLookups();
        if (currentTab === 'manager' && typeof renderLowStockAlert === 'function') {
            _debounceRealtime('ingredients', function() {
                renderLowStockAlert();
            }, 100);
        }
    });
    
    // Transaction subscription - cập nhật realtime history, report, customers
    DB.subscribe('transactions', function() {
        _debounceRealtime('transactions', function() {
            updateRecentToast();
            if (currentTab === 'history') {
                renderHistoryByDate(currentHistoryDate);
            }
            if (currentTab === 'report') {
                renderReport(currentReportDate);
            }
            if (typeof renderRecentTransactions === 'function') {
                renderRecentTransactions();
            }
        }, 100);
    });
    
    DB.subscribe('cost_categories', function(data) {
        costCategories = data || [];
        _debounceRealtime('cost_categories', function() {
            // Refresh expense modal nếu đang mở
            var expenseModal = document.getElementById('expenseModal');
            if (expenseModal && expenseModal.style.display === 'flex' && typeof loadExpenseData === 'function') {
                loadExpenseData().then(function() {
                    renderTodayExpenses();
                    renderMonthExpenseTotal();
                });
            }
            if (currentTab === 'manager' && typeof managerApplyFilter === 'function') {
                managerApplyFilter();
            }
        }, 100);
    });
    
    DB.subscribe('cost_transactions', function(data) {
        costTransactions = data || [];
        _debounceRealtime('cost_transactions', function() {
            // Refresh expense modal nếu đang mở
            var expenseModal = document.getElementById('expenseModal');
            if (expenseModal && expenseModal.style.display === 'flex' && typeof loadExpenseData === 'function') {
                loadExpenseData().then(function() {
                    renderTodayExpenses();
                    renderMonthExpenseTotal();
                });
            }
            if (currentTab === 'report') {
                renderReport(currentReportDate);
            }
            if (currentTab === 'manager' && typeof managerApplyFilter === 'function') {
                managerApplyFilter();
            }
        }, 100);
    });
    
    DB.subscribe('cost_transactions_admin', function(data) {
        if (typeof adminCostTransactions !== 'undefined') {
            adminCostTransactions = data || [];
        }
        if (currentTab === 'manager' && typeof managerApplyFilter === 'function') {
            _debounceRealtime('cost_transactions_admin', function() {
                managerApplyFilter();
            }, 100);
        }
    });
    
    DB.subscribe('admin_cost_categories', function(data) {
        if (typeof adminCostCategories !== 'undefined') {
            adminCostCategories = data || [];
        }
        if (currentTab === 'manager' && typeof managerApplyFilter === 'function') {
            _debounceRealtime('admin_cost_categories', function() {
                managerApplyFilter();
            }, 100);
        }
    });
}

function updateRecentToast() {
    var todayStr = new Date().toISOString().slice(0, 10);
    DB.getTransactionsByDate(todayStr).then(function(transactions) {
        // Chỉ hiển thị giao dịch thuộc Bàn (có tableName)
        var validTx = transactions.filter(function(tx) { return !tx.refunded && tx.tableName; });
        validTx.sort(function(a, b) {
            return new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date);
        });
        var recent = validTx.slice(0, 3);
        var container = document.getElementById('recentToastList');
        if (!container) return;
        
        if (recent.length === 0) {
            container.innerHTML = '<div style="font-size: 10px; color: #64748b; text-align:center;">🍽️ Chưa có giao dịch bàn</div>';
            return;
        }
        
        var html = '';
        for (var i = 0; i < recent.length; i++) {
            var tx = recent[i];
            var timeDiff = Math.floor((Date.now() - new Date(tx.createdAt || tx.date)) / 60000);
            var timeText = '';
            if (timeDiff < 1) timeText = 'vừa xong';
            else if (timeDiff < 60) timeText = timeDiff + 'p';
            else timeText = Math.floor(timeDiff / 60) + 'h';
            
            var totalItems = 0;
            if (tx.items && tx.items.length) {
                for (var j = 0; j < tx.items.length; j++) totalItems += tx.items[j].qty;
            }
            
            // Luôn có tableName vì đã filter, fallback đề phòng
            var shortInfo = tx.tableName || 'Bàn';
            
            // Thêm phương thức thanh toán
            var methodIcon = '';
            if (tx.paymentMethod === 'cash') methodIcon = '💰';
            else if (tx.paymentMethod === 'transfer') methodIcon = '💳';
            else if (tx.paymentMethod === 'debt') methodIcon = '💢';
            else if (tx.paymentMethod === 'grab') methodIcon = '🚕';
            else methodIcon = '💵';
            
            html += `
                <div class="recent-toast-item" onclick="showTransactionDetail('${tx.id}')">
                    <span class="toast-time">${timeText}</span>
                    <span class="toast-info">${shortInfo} (${totalItems} món) ${methodIcon}</span>
                    <span class="toast-amount">${formatMoney(tx.amount)}</span>
                </div>
            `;
        }
        container.innerHTML = html;
    });
}

// ========== CẬP NHẬT BÀN THÔNG MINH ==========
// OPTIMIZE: Sử dụng DocumentFragment để batch DOM operations
function updateTablesDiff(newTables) {
    var activeTables = newTables.filter(function(t) { return (t.items && t.items.length) || t.total > 0; });
    var grid = document.getElementById('tablesGrid');
    if (!grid) return;
    
    var existingCards = grid.querySelectorAll('.table-card');
    var existingIds = {};
    for (var i = 0; i < existingCards.length; i++) {
        existingIds[existingCards[i].getAttribute('data-id')] = existingCards[i];
    }
    
    var newIds = {};
    for (var i = 0; i < activeTables.length; i++) {
        newIds[activeTables[i].id] = activeTables[i];
    }
    
    // Xóa bàn không còn
    for (var id in existingIds) {
        if (!newIds[id]) {
            existingIds[id].remove();
        }
    }
    
    // Thêm hoặc cập nhật bàn - dùng DocumentFragment để batch
    var fragment = null;
    for (var i = 0; i < activeTables.length; i++) {
        var table = activeTables[i];
        var existingCard = existingIds[table.id];
        if (existingCard) {
            updateTableCard(existingCard, table);
        } else {
            if (!fragment) fragment = document.createDocumentFragment();
            fragment.appendChild(createTableCard(table));
        }
    }
    if (fragment) grid.appendChild(fragment);
}

function updateTableCard(card, table) {
    var itemCount = 0;
    if (table.items) {
        for (var j = 0; j < table.items.length; j++) {
            itemCount += table.items[j].qty;
        }
    }
    
    var timeDisplay = '--:--';
    var isLocked = false;
    if (table.startTime) {
        var start = new Date(table.startTime);
        var diffMins = Math.floor((Date.now() - start) / 60000);
        var hours = Math.floor(diffMins / 60);
        var mins = diffMins % 60;
        timeDisplay = start.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' - ' + (hours ? hours + 'h' + mins + 'p' : mins + 'p');
        isLocked = diffMins >= (TABLE_LOCK_HOURS || 5) * 60;
    }
    
    var displayName = table.customerName ? escapeHtml(table.customerName) : escapeHtml(table.name);
    
    var nameSpan = card.querySelector('.table-name');
    if (nameSpan) nameSpan.innerHTML = displayName + (isLocked ? ' 🔒' : '');
    
    var timeSpan = card.querySelector('.table-time');
    if (timeSpan) timeSpan.innerHTML = (isLocked ? '🔒 ' : '⏱️ ') + timeDisplay;
    
    var itemCountSpan = card.querySelector('.table-item-count');
    if (itemCountSpan) itemCountSpan.innerHTML = '📦 ' + itemCount + ' món';
    
    var totalSpan = card.querySelector('.table-total');
    if (totalSpan) totalSpan.innerHTML = formatMoney(table.total);
    
    // Thêm class locked nếu bàn bị khóa
    if (isLocked) {
        card.classList.add('table-locked');
    } else {
        card.classList.remove('table-locked');
    }
}

function createTableCard(table) {
    var itemCount = 0;
    if (table.items) {
        for (var j = 0; j < table.items.length; j++) {
            itemCount += table.items[j].qty;
        }
    }
    
    var timeDisplay = '--:--';
    var isLocked = false;
    if (table.startTime) {
        var start = new Date(table.startTime);
        var diffMins = Math.floor((Date.now() - start) / 60000);
        var hours = Math.floor(diffMins / 60);
        var mins = diffMins % 60;
        timeDisplay = start.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' - ' + (hours ? hours + 'h' + mins + 'p' : mins + 'p');
        isLocked = diffMins >= (TABLE_LOCK_HOURS || 5) * 60;
    }
    
    var displayName = table.customerName ? escapeHtml(table.customerName) : escapeHtml(table.name);
    
    var div = document.createElement('div');
    div.className = 'table-card' + (isLocked ? ' table-locked' : '');
    div.setAttribute('data-id', table.id);
    div.onclick = function(id) { return function() { showTableDetail(id); }; }(table.id);
    div.innerHTML =
        '<div class="table-header">' +
            '<span class="table-name" onclick="event.stopPropagation(); showCustomerSelectorForTable(\'' + table.id + '\')" style="cursor:pointer;">' + displayName + (isLocked ? ' 🔒' : '') + '</span>' +
            '<span class="table-time">' + (isLocked ? '🔒 ' : '⏱️ ') + timeDisplay + '</span>' +
        '</div>' +
        '<div class="table-stats">' +
            '<span class="table-item-count">📦 ' + itemCount + ' món</span>' +
            '<span class="table-total">' + formatMoney(table.total) + '</span>' +
        '</div>' +
        '<div class="table-actions">' +
            '<div class="table-action" onclick="event.stopPropagation(); openAddMenuForTable(\'' + table.id + '\')">➕</div>' +
        '</div>';
    return div;
}

// FIX: renderTables luôn lấy data mới nhất từ memoryCache/IndexedDB
// Không dùng cachedTables cũ vì có thể đã thay đổi sau DB.create/update
function renderTables() {
    return DB.getAll('tables').then(function(tables) {
        cachedTables = tables;
        tablesCacheTime = Date.now();
        updateTablesDiff(tables);
    });
}
