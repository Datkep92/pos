// manager.js - ES5, tương thích Android 6, iOS 12
var managerData = {
    currentViewMode: 'period',
    currentPeriod: { startDate: null, endDate: null },
    currentMonth: null,
    currentDay: null,
    transactions: [],
    costTransactions: [],
    adminCostTransactions: [],
    customers: [],
    staffs: []
};

var managerInitialized = false;
var costCategories = [];
var adminCostCategories = [];
var adminCostTransactions = [];

function loadStaffCostData() {
    return Promise.all([
        DB.getAll('cost_categories'),
        DB.getAll('cost_transactions')
    ]).then(function(results) {
        costCategories = results[0] || [];
        managerData.costTransactions = results[1] || [];
        window.costCategories = costCategories;
        window.costTransactions = managerData.costTransactions;
    });
}

function loadAdminCostData() {
    return Promise.all([
        DB.getAll('admin_cost_categories'),
        DB.getAll('cost_transactions_admin')
    ]).then(function(results) {
        adminCostCategories = results[0] || [];
        managerData.adminCostTransactions = results[1] || [];
        window.adminCostCategories = adminCostCategories;
        window.adminCostTransactions = managerData.adminCostTransactions;
    });
}

function initManager() {
    if (managerInitialized) return;
    loadAllData().then(function() {
        return loadStaffCostData();
    }).then(function() {
        return loadAdminCostData();
    }).then(function() {
        managerInitFilter();
        attachManagerEvents();
        attachCostPopupEvents();
        renderLowStockAlert();
        window.addEventListener('db_update', onManagerDBUpdate);
        managerInitialized = true;
        console.log('Manager initialized');
    }).catch(function(err) {
        console.error('Init manager error:', err);
    });
}

function loadAllData() {
    return Promise.all([
        DB.getAll('transactions'),
        DB.getAll('cost_transactions'),
        DB.getAll('cost_transactions_admin'),
        DB.getAll('customers'),
        DB.getAll('staffs')
    ]).then(function(results) {
        managerData.transactions = results[0] || [];
        managerData.costTransactions = results[1] || [];
        managerData.adminCostTransactions = results[2] || [];
        managerData.customers = results[3] || [];
        managerData.staffs = results[4] || [];

        managerData.transactions = managerData.transactions.filter(function(tx) {
            return !tx.refunded && tx.type !== 'refund';
        });
        managerData.costTransactions = managerData.costTransactions.filter(function(c) { return !c.deleted; });
        managerData.adminCostTransactions = managerData.adminCostTransactions.filter(function(c) { return !c.deleted; });
        console.log('[Manager] Loaded data: transactions', managerData.transactions.length, 'costs', managerData.costTransactions.length);
        return true;
    });
}

function onManagerDBUpdate(event) {
    var col = event.detail && event.detail.collection;
    if (!col) return;

    var affected = ['transactions', 'cost_transactions', 'cost_transactions_admin', 
                   'customers', 'staffs', 'ingredients', 'cost_categories', 
                   'admin_cost_categories', 'daily_balances'];

    if (affected.indexOf(col) !== -1) {
        console.log('[Manager] db_update received for:', col);

        loadAllData().then(function() {
            // Luôn update data
            console.log('[Manager] Data reloaded');

            // Chỉ render UI nếu đang ở tab Manager
            var managerView = document.getElementById('managerView');
            if (managerView && managerView.classList.contains('active')) {
                managerApplyFilter();
                if (col === 'ingredients') {
                    renderLowStockAlert();
                }
            }
        }).catch(function(err) {
            console.error('[Manager] Load data error:', err);
        });
    }
}

function managerInitFilter() {
    managerComputeCurrentPeriod();
    managerData.currentMonth = new Date();
    managerData.currentDay = new Date();
    updateManagerViewMode();
    attachFilterControls();
    managerApplyFilter();
}

function managerComputeCurrentPeriod() {
    var now = new Date();
    var day = now.getDate();
    var month = now.getMonth();
    var year = now.getFullYear();
    var start, end;
    if (day >= 20) {
        start = new Date(year, month, 20);
        end = new Date(year, month + 1, 19);
    } else {
        start = new Date(year, month - 1, 20);
        end = new Date(year, month, 19);
    }
    if (isNaN(start.getTime())) start = new Date();
    if (isNaN(end.getTime())) end = new Date();
    managerData.currentPeriod = { startDate: start, endDate: end };
}

function managerShiftPeriod(delta) {
    var newStart = new Date(managerData.currentPeriod.startDate);
    newStart.setMonth(newStart.getMonth() + delta);
    newStart.setDate(20);
    var newEnd = new Date(newStart);
    newEnd.setMonth(newStart.getMonth() + 1);
    newEnd.setDate(19);
    if (isNaN(newStart.getTime())) newStart = new Date();
    if (isNaN(newEnd.getTime())) newEnd = new Date();
    managerData.currentPeriod = { startDate: newStart, endDate: newEnd };
    updateManagerViewMode();
    managerApplyFilter();
}

function managerShiftMonth(delta) {
    var newMonth = new Date(managerData.currentMonth);
    newMonth.setMonth(newMonth.getMonth() + delta);
    if (isNaN(newMonth.getTime())) newMonth = new Date();
    managerData.currentMonth = newMonth;
    updateManagerViewMode();
    managerApplyFilter();
}

function managerShiftDay(delta) {
    var newDay = new Date(managerData.currentDay);
    newDay.setDate(newDay.getDate() + delta);
    if (isNaN(newDay.getTime())) newDay = new Date();
    managerData.currentDay = newDay;
    updateManagerViewMode();
    managerApplyFilter();
}

function managerFormatDateShort(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '--/--/----';
    var d = date.getDate();
    var m = date.getMonth() + 1;
    var y = date.getFullYear();
    return d + '/' + m + '/' + y;
}

function managerFormatMonthYear(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '--/----';
    var m = date.getMonth() + 1;
    var y = date.getFullYear();
    return m + '/' + y;
}

function updateManagerViewMode() {
    var select = document.getElementById('managerViewModeSelect');
    if (!select) return;
    var mode = select.value;
    managerData.currentViewMode = mode;
    if (mode === 'period') {
        var s = managerFormatDateShort(managerData.currentPeriod.startDate);
        var e = managerFormatDateShort(managerData.currentPeriod.endDate);
        var rangeText = s + ' → ' + e;
        if (select.options[0]) select.options[0].text = 'Kỳ ' + rangeText;
    } else if (mode === 'month') {
        var monthText = managerFormatMonthYear(managerData.currentMonth);
        if (select.options[1]) select.options[1].text = 'Tháng ' + monthText;
    } else {
        var dayText = managerFormatDateShort(managerData.currentDay);
        if (select.options[2]) select.options[2].text = dayText;
    }
}

function attachFilterControls() {
    var prev = document.getElementById('managerPeriodPrevBtn');
    var next = document.getElementById('managerPeriodNextBtn');
    var mode = document.getElementById('managerViewModeSelect');
    if (prev) {
        prev.onclick = function() {
            if (managerData.currentViewMode === 'period') managerShiftPeriod(-1);
            else if (managerData.currentViewMode === 'month') managerShiftMonth(-1);
            else managerShiftDay(-1);
        };
    }
    if (next) {
        next.onclick = function() {
            if (managerData.currentViewMode === 'period') managerShiftPeriod(1);
            else if (managerData.currentViewMode === 'month') managerShiftMonth(1);
            else managerShiftDay(1);
        };
    }
    if (mode) {
        mode.onchange = function() {
            var newMode = this.value;
            managerData.currentViewMode = newMode;
            if (newMode === 'period') managerComputeCurrentPeriod();
            else if (newMode === 'month') managerData.currentMonth = managerData.currentMonth || new Date();
            else if (newMode === 'day') managerData.currentDay = managerData.currentDay || new Date();
            updateManagerViewMode();
            managerApplyFilter();
        };
    }
}

function managerGetDateRangeByMode() {
    var mode = managerData.currentViewMode;
    var start = null, end = null;
    if (mode === 'period') {
        if (managerData.currentPeriod && managerData.currentPeriod.startDate && managerData.currentPeriod.endDate) {
            start = new Date(managerData.currentPeriod.startDate);
            end = new Date(managerData.currentPeriod.endDate);
        } else {
            managerComputeCurrentPeriod();
            start = new Date(managerData.currentPeriod.startDate);
            end = new Date(managerData.currentPeriod.endDate);
        }
    } else if (mode === 'month') {
        if (managerData.currentMonth) {
            start = new Date(managerData.currentMonth.getFullYear(), managerData.currentMonth.getMonth(), 1);
            end = new Date(managerData.currentMonth.getFullYear(), managerData.currentMonth.getMonth() + 1, 0);
        } else {
            managerData.currentMonth = new Date();
            start = new Date(managerData.currentMonth.getFullYear(), managerData.currentMonth.getMonth(), 1);
            end = new Date(managerData.currentMonth.getFullYear(), managerData.currentMonth.getMonth() + 1, 0);
        }
    } else {
        if (managerData.currentDay) {
            start = new Date(managerData.currentDay.getFullYear(), managerData.currentDay.getMonth(), managerData.currentDay.getDate());
            end = new Date(start);
            end.setDate(end.getDate() + 1);
        } else {
            managerData.currentDay = new Date();
            start = new Date(managerData.currentDay.getFullYear(), managerData.currentDay.getMonth(), managerData.currentDay.getDate());
            end = new Date(start);
            end.setDate(end.getDate() + 1);
        }
    }
    if (!start || isNaN(start.getTime())) start = new Date();
    if (!end || isNaN(end.getTime())) end = new Date();
    return { startDate: start, endDate: end };
}

function managerFilterByDateRange(items, startDate, endDate) {
    if (!startDate || !endDate) return [];
    var startStr = startDate.toISOString().slice(0,10);
    var endStr = endDate.toISOString().slice(0,10);
    var result = [];
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var d = item.dateKey || item.date.slice(0,10);
        if (d >= startStr && d <= endStr) result.push(item);
    }
    return result;
}

function managerApplyFilter() {
    if (!managerData.transactions || !managerData.costTransactions || !managerData.adminCostTransactions || !managerData.customers) return;
    var range = managerGetDateRangeByMode();
    if (!range.startDate || !range.endDate) return;
    var filteredTrans = managerFilterByDateRange(managerData.transactions, range.startDate, range.endDate);
    var filteredCosts = managerFilterByDateRange(managerData.costTransactions, range.startDate, range.endDate);
    var filteredAdminCosts = managerFilterByDateRange(managerData.adminCostTransactions, range.startDate, range.endDate);
    var stats = managerComputeStats(filteredTrans, filteredCosts, filteredAdminCosts, managerData.customers, managerData.staffs, range.startDate, range.endDate);
    updateManagerUI(stats);
    renderExpenseList(filteredCosts);
    renderAdminExpenseList(filteredAdminCosts);
    renderManagerDebtList(managerData.customers);
    renderDrinkStats();
    renderLowStockAlert();
}

function managerComputeStats(transactions, staffCosts, adminCosts, customers, staffs, startDate, endDate) {
    var revenue = 0, grab = 0, bank = 0, cash = 0;
    for (var i = 0; i < transactions.length; i++) {
        var tx = transactions[i];
        var amt = tx.amount;
        revenue += amt;
        if (tx.type === 'grab') {
            grab += amt;
        } else if (tx.paymentMethod === 'cash') {
            cash += amt;
        } else if (tx.paymentMethod === 'transfer') {
            bank += amt;
        }
    }
    var staffCostTotal = 0, adminCostTotal = 0;
    for (var j = 0; j < staffCosts.length; j++) staffCostTotal += staffCosts[j].amount;
    for (var k = 0; k < adminCosts.length; k++) adminCostTotal += adminCosts[k].amount;
    
    var debtOccur = 0;
    var startStr = startDate.toISOString().slice(0,10);
    var endStr = endDate.toISOString().slice(0,10);
    for (var l = 0; l < customers.length; l++) {
        var cust = customers[l];
        var debts = cust.debtHistory || [];
        for (var m = 0; m < debts.length; m++) {
            var d = debts[m];
            var dStr = d.date ? d.date.slice(0,10) : '';
            if (dStr >= startStr && dStr <= endStr) debtOccur += d.amount;
        }
    }
    var totalDebt = 0;
    for (var n = 0; n < customers.length; n++) {
        var debt = customers[n].totalDebt || 0;
        if (debt > 0) totalDebt += debt;
    }
    var totalSalary = 0;
    var netIncome = revenue - (staffCostTotal + adminCostTotal + totalSalary);
    return {
        revenue: revenue,
        grab: grab,
        bank: bank,
        cash: cash,
        staffCost: staffCostTotal,
        adminCost: adminCostTotal,
        debtOccur: debtOccur,
        totalDebt: totalDebt,
        totalSalary: totalSalary,
        netIncome: netIncome
    };
}

function updateManagerUI(stats) {
    if (!stats) {
        var range = managerGetDateRangeByMode();
        if (!range.startDate || !range.endDate) return;
        var filteredTrans = managerFilterByDateRange(managerData.transactions, range.startDate, range.endDate);
        var filteredCosts = managerFilterByDateRange(managerData.costTransactions, range.startDate, range.endDate);
        var filteredAdminCosts = managerFilterByDateRange(managerData.adminCostTransactions, range.startDate, range.endDate);
        stats = managerComputeStats(filteredTrans, filteredCosts, filteredAdminCosts, managerData.customers, managerData.staffs, range.startDate, range.endDate);
    }
    var el;
    if ((el = document.getElementById('managerRevenue'))) el.innerText = formatMoney(stats.revenue);
    if ((el = document.getElementById('managerGrab'))) el.innerText = formatMoney(stats.grab);
    if ((el = document.getElementById('managerBank'))) el.innerText = formatMoney(stats.bank);
    if ((el = document.getElementById('managerCash'))) el.innerText = formatMoney(stats.cash);
    if ((el = document.getElementById('managerExpense'))) el.innerText = formatMoney(stats.staffCost);
    if ((el = document.getElementById('managerAdminExpense'))) el.innerText = formatMoney(stats.adminCost);
    if ((el = document.getElementById('managerDebt'))) el.innerText = formatMoney(stats.debtOccur);
    if ((el = document.getElementById('managerTotalDebt'))) el.innerText = formatMoney(stats.totalDebt);
    if ((el = document.getElementById('managerTotalSalary'))) el.innerText = formatMoney(stats.totalSalary);
    if ((el = document.getElementById('managerNetIncome'))) el.innerText = formatMoney(stats.netIncome);
}

function renderExpenseList(costs) {
    var container = document.getElementById('managerExpenseList');
    if (!container) return;
    if (!costs) costs = [];
    var map = {};
    for (var i = 0; i < costs.length; i++) {
        var c = costs[i];
        var name = c.categoryName;
        if (!map[name]) map[name] = 0;
        map[name] += c.amount;
    }
    var html = '';
    for (var name in map) {
        html += '<div class="manager-item" onclick="showExpenseDetail(\'' + escapeHtml(name) + '\')">' +
            '<span>📦 ' + escapeHtml(name) + '</span>' +
            '<strong>' + formatMoney(map[name]) + '</strong>' +
        '</div>';
    }
    if (!html) html = '<div class="empty-state">Chưa có chi phí nhân viên</div>';
    container.innerHTML = html;
}
function openAdminCostModal() {
    loadAdminCostData().then(function() {
        var modal = document.getElementById('adminCostModal');
        if (!modal) return;
        var nameInput = document.getElementById('adminExpenseNameInput');
        var amountInput = document.getElementById('adminExpenseAmount');
        var qtyInput = document.getElementById('adminExpenseQty');
        var title = document.getElementById('adminExpensePopupTitle');
        if (nameInput) nameInput.value = '';
        if (amountInput) amountInput.value = '';
        if (qtyInput) qtyInput.value = '1';
        if (title) title.innerText = 'Thêm chi phí Quản lý';
        renderAdminRecentCategories();
        renderAdminTodayCosts();
        renderAdminMonthCostTotal();
        modal.style.display = 'flex';
    });
}

function renderAdminRecentCategories() {
    var container = document.getElementById('adminRecentCategoriesList');
    if (!container) return;
    if (adminCostCategories.length === 0) {
        container.innerHTML = '<div class="empty-text">Chưa có danh mục</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < adminCostCategories.length; i++) {
        var cat = adminCostCategories[i];
        html += '<div class="recent-item">' +
            '<button class="recent-btn" onclick="setAdminExpenseName(\'' + escapeHtml(cat.name) + '\')">🏢 ' + escapeHtml(cat.name) + '</button>' +
            '<button class="action-btn-edit" onclick="editAdminExpenseName(\'' + cat.id + '\', \'' + escapeHtml(cat.name) + '\')">✏️</button>' +
            '<button class="action-btn-delete" onclick="deleteAdminExpenseCategory(\'' + cat.id + '\')">🗑️</button>' +
        '</div>';
    }
    container.innerHTML = html;
}

function setAdminExpenseName(name) {
    var input = document.getElementById('adminExpenseNameInput');
    if (input) input.value = name;
}

function editAdminExpenseName(id, oldName) {
    var newName = prompt('Nhập tên mới cho danh mục quản lý:', oldName);
    if (!newName || newName === oldName) return;
    var exists = false;
    for (var i = 0; i < adminCostCategories.length; i++) {
        if (adminCostCategories[i].name === newName) { exists = true; break; }
    }
    if (exists) { showToast('Danh mục đã tồn tại!', 'warning'); return; }
    DB.update('admin_cost_categories', id, { name: newName, updatedAt: Date.now() }).then(function() {
        return loadAdminCostData();
    }).then(function() {
        renderAdminRecentCategories();
        showToast('Đã sửa danh mục quản lý', 'success');
    });
}

function deleteAdminExpenseCategory(id) {
    var used = false;
    for (var i = 0; i < managerData.adminCostTransactions.length; i++) {
        if (managerData.adminCostTransactions[i].categoryId === id && !managerData.adminCostTransactions[i].deleted) {
            used = true; break;
        }
    }
    if (used) { showToast('Danh mục đã có giao dịch, không thể xóa!', 'error'); return; }
    if (!confirm('Xóa danh mục quản lý này?')) return;
    DB.remove('admin_cost_categories', id).then(function() {
        return loadAdminCostData();
    }).then(function() {
        renderAdminRecentCategories();
        showToast('Đã xóa danh mục quản lý', 'success');
    });
}

function renderAdminTodayCosts() {
    var container = document.getElementById('adminTodayCostList');
    var totalSpan = document.getElementById('adminTodayCostTotal');
    if (!container) return;
    var todayStr = new Date().toISOString().slice(0,10);
    var todayCosts = managerData.adminCostTransactions.filter(function(tx) {
        return tx.dateKey === todayStr && !tx.deleted;
    });
    if (todayCosts.length === 0) {
        container.innerHTML = '<div class="empty-text">📭 Chưa có chi phí quản lý hôm nay</div>';
        if (totalSpan) totalSpan.innerText = 'Tổng: 0đ';
        return;
    }
    var total = 0;
    var html = '';
    for (var i = 0; i < todayCosts.length; i++) {
        var tx = todayCosts[i];
        total += tx.amount;
        html += '<div class="today-cost-item">' +
            '<div class="today-cost-name">' + escapeHtml(tx.categoryName) + (tx.quantity > 1 ? ' x' + tx.quantity : '') + '</div>' +
            '<div class="today-cost-amount">' + formatMoney(tx.amount) + '</div>' +
        '</div>';
    }
    container.innerHTML = html;
    if (totalSpan) totalSpan.innerText = 'Tổng: ' + formatMoney(total);
}

function renderAdminMonthCostTotal() {
    var container = document.getElementById('adminMonthCostTotal');
    if (!container) return;
    var now = new Date();
    var startStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
    var endStr = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0,10);
    var total = 0;
    for (var i = 0; i < managerData.adminCostTransactions.length; i++) {
        var tx = managerData.adminCostTransactions[i];
        if (!tx.deleted && tx.dateKey >= startStr && tx.dateKey <= endStr) {
            total += tx.amount;
        }
    }
    container.innerText = formatMoney(total);
}

function saveAdminExpense() {
    var categoryName = document.getElementById('adminExpenseNameInput').value.trim();
    var amount = parseInt(document.getElementById('adminExpenseAmount').value) || 0;
    var quantity = parseInt(document.getElementById('adminExpenseQty').value) || 1;
    if (!categoryName) { showToast('Vui lòng nhập danh mục chi phí quản lý!', 'warning'); return; }
    if (amount <= 0) { showToast('Số tiền phải lớn hơn 0!', 'warning'); return; }
    var category = null;
    for (var i = 0; i < adminCostCategories.length; i++) {
        if (adminCostCategories[i].name === categoryName) { category = adminCostCategories[i]; break; }
    }
    var saveTrans = function(cat) {
        var nowDate = new Date();
        var nowStr = nowDate.toISOString();
        var data = {
            categoryId: cat.id,
            categoryName: cat.name,
            amount: amount,
            quantity: quantity,
            note: '',
            date: nowStr,
            dateKey: nowStr.slice(0,10),
            createdAt: Date.now(),
            createdBy: window.currentDeviceId,
            deleted: false
        };
        return DB.create('cost_transactions_admin', data).then(function() {
            return loadAdminCostData();
        });
    };
    if (category) {
        saveTrans(category).then(function() {
            renderAdminTodayCosts();
            renderAdminMonthCostTotal();
            renderAdminExpenseList(managerData.adminCostTransactions);
            if (document.getElementById('managerView').classList.contains('active')) managerApplyFilter();
            showToast('✅ Đã thêm chi phí quản lý', 'success');
            document.getElementById('adminExpenseAmount').value = '';
        });
    } else {
        var newId = Date.now().toString();
        var newCat = { id: newId, name: categoryName, createdAt: Date.now() };
        DB.create('admin_cost_categories', newCat).then(function() {
            return loadAdminCostData();
        }).then(function() {
            renderAdminRecentCategories();
            return newCat;
        }).then(saveTrans).then(function() {
            renderAdminTodayCosts();
            renderAdminMonthCostTotal();
            renderAdminExpenseList(managerData.adminCostTransactions);
            if (document.getElementById('managerView').classList.contains('active')) managerApplyFilter();
            showToast('✅ Đã thêm chi phí quản lý', 'success');
            document.getElementById('adminExpenseAmount').value = '';
        });
    }
}
function renderAdminExpenseList(costs) {
    var container = document.getElementById('managerAdminExpenseList');
    if (!container) return;
    if (!costs) costs = [];
    var map = {};
    for (var i = 0; i < costs.length; i++) {
        var c = costs[i];
        var name = c.categoryName;
        if (!map[name]) map[name] = { amount: 0, qty: 0 };
        map[name].amount += c.amount;
        map[name].qty += c.quantity || 1;
    }
    var html = '';
    for (var name in map) {
        html += '<div class="manager-item" onclick="showAdminExpenseDetail(\'' + escapeHtml(name) + '\')">' +
            '<span>🏢 ' + escapeHtml(name) + '</span>' +
            '<strong>SL:' + map[name].qty + ' • ' + formatMoney(map[name].amount) + '</strong>' +
        '</div>';
    }
    if (!html) html = '<div class="empty-state">Chưa có chi phí quản lý</div>';
    container.innerHTML = html;
}
function renderManagerDebtList(customers) {
    var container = document.getElementById('managerDebtList');
    if (!container) return;
    if (!customers) customers = [];
    var debtCust = [];
    for (var i = 0; i < customers.length; i++) {
        var cust = customers[i];
        var totalDebtAmount = 0;
        if (cust.debtHistory) {
            for (var j = 0; j < cust.debtHistory.length; j++) {
                totalDebtAmount += cust.debtHistory[j].amount || 0;
            }
        }
        var totalPaymentAmount = 0;
        if (cust.paymentHistory) {
            for (var j = 0; j < cust.paymentHistory.length; j++) {
                totalPaymentAmount += cust.paymentHistory[j].amount || 0;
            }
        }
        var balance = totalDebtAmount - totalPaymentAmount;
        if (cust.totalDebt && typeof cust.totalDebt === 'number' && Math.abs(cust.totalDebt - balance) < 1000) {
            balance = cust.totalDebt;
        }
        if (balance > 0) {
            debtCust.push({ id: cust.id, name: cust.name, totalDebt: balance });
        }
    }
    debtCust.sort(function(a, b) { return b.totalDebt - a.totalDebt; });
    var html = '';
    for (var k = 0; k < debtCust.length; k++) {
        var c = debtCust[k];
        html += '<div class="manager-item" onclick="showDebtDetail(\'' + c.id + '\')">' +
            '<span>👤 ' + escapeHtml(c.name) + '</span>' +
            '<strong style="color:var(--danger);">Nợ: ' + formatMoney(c.totalDebt) + '</strong>' +
        '</div>';
    }
    if (!html) html = '<div class="empty-state">Không có khách nợ</div>';
    container.innerHTML = html;
}

// ========== QUẢN LÝ CHI PHÍ POPUP ==========
function openCostModal(type) {
    var modal = document.getElementById('costModal');
    if (!modal) return;
    modal.setAttribute('data-cost-type', type || 'staff');
    var nameInput = document.getElementById('expenseNameInput');
    var amountInput = document.getElementById('expenseAmount');
    var qtyInput = document.getElementById('expenseQty');
    var title = document.getElementById('expensePopupTitle');
    if (nameInput) nameInput.value = '';
    if (amountInput) amountInput.value = '';
    if (qtyInput) qtyInput.value = '1';
    if (title) title.innerText = (type === 'admin' ? 'Thêm chi phí Quản lý' : 'Thêm chi phí Nhân viên');
    renderRecentCategories();
    renderTodayCosts();
    renderMonthCostCategories();
    modal.style.display = 'flex';
}

function renderRecentCategories() {
    var container = document.getElementById('recentCategoriesList');
    if (!container) return;
    if (costCategories.length === 0) {
        container.innerHTML = '<div class="empty-text">Chưa có danh mục</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < costCategories.length; i++) {
        var cat = costCategories[i];
        html += '<div class="recent-item">' +
            '<button class="recent-btn" onclick="setExpenseName(\'' + escapeHtml(cat.name) + '\')">📦 ' + escapeHtml(cat.name) + '</button>' +
            '<button class="action-btn-edit" onclick="editExpenseName(\'' + cat.id + '\', \'' + escapeHtml(cat.name) + '\')">✏️</button>' +
            '<button class="action-btn-delete" onclick="deleteExpenseCategory(\'' + cat.id + '\')">🗑️</button>' +
        '</div>';
    }
    container.innerHTML = html;
}

function setExpenseName(name) {
    var input = document.getElementById('expenseNameInput');
    if (input) input.value = name;
}

function editExpenseName(id, oldName) {
    var newName = prompt('Nhập tên mới cho danh mục:', oldName);
    if (!newName || newName === oldName) return;
    var exists = false;
    for (var i = 0; i < costCategories.length; i++) {
        if (costCategories[i].name === newName) {
            exists = true;
            break;
        }
    }
    if (exists) {
        showToast('Danh mục đã tồn tại!', 'warning');
        return;
    }
    DB.update('cost_categories', id, { name: newName, updatedAt: Date.now() }).then(function() {
        return DB.getAll('cost_categories');
    }).then(function(cats) {
        costCategories = cats;
        renderRecentCategories();
        renderTodayCosts();
        showToast('Đã sửa danh mục', 'success');
    });
}

function deleteExpenseCategory(id) {
    var used = false;
    for (var i = 0; i < managerData.costTransactions.length; i++) {
        if (managerData.costTransactions[i].categoryId === id && !managerData.costTransactions[i].deleted) {
            used = true;
            break;
        }
    }
    if (!used && managerData.adminCostTransactions) {
        for (var j = 0; j < managerData.adminCostTransactions.length; j++) {
            if (managerData.adminCostTransactions[j].categoryId === id && !managerData.adminCostTransactions[j].deleted) {
                used = true;
                break;
            }
        }
    }
    if (used) {
        showToast('Danh mục đã có giao dịch, không thể xóa!', 'error');
        return;
    }
    if (!confirm('Xóa danh mục này?')) return;
    DB.remove('cost_categories', id).then(function() {
        return DB.getAll('cost_categories');
    }).then(function(cats) {
        costCategories = cats;
        renderRecentCategories();
        showToast('Đã xóa danh mục', 'success');
    });
}

function renderTodayCosts() {
    var container = document.getElementById('todayCostList');
    var totalSpan = document.getElementById('todayCostTotal');
    if (!container || !totalSpan) return;
    var todayStr = new Date().toISOString().slice(0,10);
    var allToday = [];
    for (var i = 0; i < managerData.costTransactions.length; i++) {
        var tx = managerData.costTransactions[i];
        if (tx.dateKey === todayStr && !tx.deleted) allToday.push(tx);
    }
    for (var j = 0; j < managerData.adminCostTransactions.length; j++) {
        var tx2 = managerData.adminCostTransactions[j];
        if (tx2.dateKey === todayStr && !tx2.deleted) allToday.push(tx2);
    }
    allToday.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    var total = 0;
    if (allToday.length === 0) {
        container.innerHTML = '<div class="empty-text">📭 Chưa có dữ liệu chi phí</div>';
        totalSpan.innerText = 'Tổng: 0đ';
        return;
    }
    var html = '';
    for (var k = 0; k < allToday.length; k++) {
        var tx = allToday[k];
        total += tx.amount;
        html += '<div class="today-cost-item">' +
            '<div class="today-cost-name">' + escapeHtml(tx.categoryName) + (tx.quantity > 1 ? ' x' + tx.quantity : '') + '</div>' +
            '<div class="today-cost-amount">' + formatMoney(tx.amount) + '</div>' +
        '</div>';
    }
    container.innerHTML = html;
    totalSpan.innerText = 'Tổng: ' + formatMoney(total);
}

function renderMonthCostCategories() {
    var container = document.getElementById('monthCostCategoryList');
    if (!container) return;
    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth();
    var map = {};
    for (var i = 0; i < managerData.costTransactions.length; i++) {
        var tx = managerData.costTransactions[i];
        if (tx.deleted) continue;
        var d = new Date(tx.date);
        if (d.getFullYear() === year && d.getMonth() === month) {
            if (!map[tx.categoryName]) map[tx.categoryName] = 0;
            map[tx.categoryName] += tx.amount;
        }
    }
    var items = [];
    for (var name in map) {
        items.push({ name: name, amount: map[name] });
    }
    items.sort(function(a, b) { return b.amount - a.amount; });
    var html = '';
    for (var j = 0; j < items.length; j++) {
        html += '<div class="today-cost-item" onclick="showExpenseDetail(\'' + escapeHtml(items[j].name) + '\')">' +
            '<div class="today-cost-name">' + escapeHtml(items[j].name) + '</div>' +
            '<div class="today-cost-amount">' + formatMoney(items[j].amount) + '</div>' +
        '</div>';
    }
    if (!html) html = '<div class="empty-text">📭 Chưa có dữ liệu tháng này</div>';
    container.innerHTML = html;
}

function saveExpenseFromPopup() {
    var modal = document.getElementById('costModal');
    var costType = modal ? modal.getAttribute('data-cost-type') || 'staff' : 'staff';
    var categoryName = document.getElementById('expenseNameInput') ? document.getElementById('expenseNameInput').value.trim() : '';
    var amount = parseInt(document.getElementById('expenseAmount') ? document.getElementById('expenseAmount').value : 0) || 0;
    var quantity = parseInt(document.getElementById('expenseQty') ? document.getElementById('expenseQty').value : 1) || 1;
    if (!categoryName) {
        showToast('Vui lòng nhập hoặc chọn danh mục chi phí!', 'warning');
        return;
    }
    if (amount <= 0) {
        showToast('Số tiền phải lớn hơn 0!', 'warning');
        return;
    }
    var category = null;
    for (var i = 0; i < costCategories.length; i++) {
        if (costCategories[i].name === categoryName) {
            category = costCategories[i];
            break;
        }
    }
    var saveTrans = function(cat) {
        var nowDate = new Date();
        var nowStr = nowDate.toISOString();
        var collection = (costType === 'admin') ? 'cost_transactions_admin' : 'cost_transactions';
        var data = {
            categoryId: cat.id,
            categoryName: cat.name,
            amount: amount,
            quantity: quantity,
            note: '',
            date: nowStr,
            dateKey: nowStr.slice(0,10),
            createdAt: Date.now(),
            createdBy: window.currentDeviceId,
            deleted: false
        };
        return DB.create(collection, data).then(function() {
            return loadAllData().then(function() {
                return loadStaffCostData();
            });
        });
    };
    if (category) {
        saveTrans(category).then(function() {
            renderTodayCosts();
            renderMonthCostCategories();
            var managerView = document.getElementById('managerView');
            if (managerView && managerView.classList.contains('active')) {
                managerApplyFilter();
            }
            showToast('✅ Đã thêm chi phí ' + (costType === 'admin' ? 'quản lý' : 'nhân viên'), 'success');
        });
    } else {
        var newId = Date.now().toString();
        var newCat = { id: newId, name: categoryName, createdAt: Date.now(), createdBy: window.currentDeviceId };
        DB.create('cost_categories', newCat).then(function() {
            costCategories.push(newCat);
            renderRecentCategories();
            return newCat;
        }).then(saveTrans).then(function() {
            renderTodayCosts();
            renderMonthCostCategories();
            if (document.getElementById('managerView').classList.contains('active')) managerApplyFilter();
            showToast('✅ Đã thêm chi phí ' + (costType === 'admin' ? 'quản lý' : 'nhân viên'), 'success');
        });
    }
}

function attachCostPopupEvents() {
    var openBtn = document.getElementById('openCostModalBtn');
    if (openBtn) openBtn.onclick = function() { openCostModal('staff'); };
    var quickCostBtn = document.getElementById('quickCostBtn');
    if (quickCostBtn) quickCostBtn.onclick = function() { openCostModal('staff'); };
    var adminExpenseBtn = document.getElementById('adminExpenseFab');
    if (adminExpenseBtn) {
        adminExpenseBtn.onclick = function(e) {
            e.stopPropagation();
            openCostModal('admin');
        };
    }
    var saveBtn = document.getElementById('saveExpenseBtn');
    if (saveBtn) saveBtn.onclick = saveExpenseFromPopup;
    var closeBtns = document.querySelectorAll('[data-close="costModal"]');
    for (var i = 0; i < closeBtns.length; i++) {
        closeBtns[i].onclick = function() { closeModal('costModal'); };
    }
    var quickMoneyBtns = document.querySelectorAll('.quick-money-btn');
    for (var j = 0; j < quickMoneyBtns.length; j++) {
        quickMoneyBtns[j].onclick = function() {
            var amount = this.getAttribute('data-amount');
            var amountInput = document.getElementById('expenseAmount');
            if (amountInput) amountInput.value = amount;
        };
    }
    function initFilter(inputId, listId) {
        var input = document.getElementById(inputId);
        if (!input) return;
        input.addEventListener('input', function() {
            var keyword = this.value.trim().toLowerCase();
            var items = document.querySelectorAll('#' + listId + ' .recent-item');
            for (var i = 0; i < items.length; i++) {
                var btn = items[i].querySelector('.recent-btn');
                if (!btn) continue;
                var name = btn.innerText.replace('📦', '').trim().toLowerCase();
                if (keyword === '' || name.indexOf(keyword) !== -1) {
                    items[i].style.display = 'flex';
                } else {
                    items[i].style.display = 'none';
                }
            }
        });
    }
    initFilter('expenseNameInput', 'recentCategoriesList');
    var adminExpenseBtn = document.getElementById('adminExpenseFab');
if (adminExpenseBtn) {
    adminExpenseBtn.onclick = function(e) {
        e.stopPropagation();
        openAdminCostModal();
    };
}
var saveAdminBtn = document.getElementById('saveAdminExpenseBtn');
if (saveAdminBtn) saveAdminBtn.onclick = saveAdminExpense;
var closeAdminBtns = document.querySelectorAll('[data-close="adminCostModal"]');
for (var i = 0; i < closeAdminBtns.length; i++) {
    closeAdminBtns[i].onclick = function() { closeModal('adminCostModal'); };
}
var quickAdminBtns = document.querySelectorAll('#adminCostModal .quick-money-btn');
for (var j = 0; j < quickAdminBtns.length; j++) {
    quickAdminBtns[j].onclick = function() {
        var amount = this.getAttribute('data-amount');
        var amountInput = document.getElementById('adminExpenseAmount');
        if (amountInput) amountInput.value = amount;
    };
}
}
function formatDateRange(start, end) {
    if (!start || !end) return '';
    var s = start.toLocaleDateString('vi-VN');
    var e = end.toLocaleDateString('vi-VN');
    return s + ' → ' + e;
}
function showExpenseDetail(categoryName) {
    var range = managerGetDateRangeByMode();
    if (!range.startDate || !range.endDate) {
        showToast('Không xác định được khoảng thời gian', 'warning');
        return;
    }
    var startStr = range.startDate.toISOString().slice(0,10);
    var endStr = range.endDate.toISOString().slice(0,10);
    var all = managerData.costTransactions;
    var filtered = [];
    for (var i = 0; i < all.length; i++) {
        var tx = all[i];
        if (tx.categoryName === categoryName && !tx.deleted) {
            var d = tx.dateKey || tx.date.slice(0,10);
            if (d >= startStr && d <= endStr) {
                filtered.push(tx);
            }
        }
    }
    filtered.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    var dateRangeText = formatDateRange(range.startDate, range.endDate);
    var html = '<div class="cost-history-header">📜 Lịch sử chi phí nhân viên: <strong>' + escapeHtml(categoryName) + '</strong><br><span style="font-size:12px;">(' + dateRangeText + ')</span></div>';
    if (filtered.length === 0) {
        html += '<div class="empty-state">Không có giao dịch trong khoảng thời gian này</div>';
    } else {
        html += '<div class="cost-history-list">';
        for (var j = 0; j < filtered.length; j++) {
            var tx = filtered[j];
            var dateStr = new Date(tx.date).toLocaleDateString('vi-VN');
            var timeStr = new Date(tx.date).toLocaleTimeString('vi-VN');
            html += '<div class="cost-history-item">' +
                '<div class="cost-history-date">' + dateStr + ' ' + timeStr + '</div>' +
                '<div class="cost-history-amount">' + formatMoney(tx.amount) + (tx.quantity > 1 ? ' x' + tx.quantity : '') + '</div>' +
                (tx.note ? '<div class="cost-history-note">📝 ' + escapeHtml(tx.note) + '</div>' : '') +
            '</div>';
        }
        html += '</div>';
    }
    var contentDiv = document.getElementById('costHistoryList');
    var titleSpan = document.getElementById('costHistoryTitle');
    if (contentDiv) contentDiv.innerHTML = html;
    if (titleSpan) titleSpan.innerHTML = '📜 Lịch sử chi phí - ' + escapeHtml(categoryName);
    var modal = document.getElementById('costHistoryModal');
    if (modal) modal.style.display = 'flex';
}

function showAdminExpenseDetail(categoryName) {
    var range = managerGetDateRangeByMode();
    if (!range.startDate || !range.endDate) {
        showToast('Không xác định được khoảng thời gian', 'warning');
        return;
    }
    var startStr = range.startDate.toISOString().slice(0,10);
    var endStr = range.endDate.toISOString().slice(0,10);
    var all = managerData.adminCostTransactions;
    var filtered = [];
    for (var i = 0; i < all.length; i++) {
        var tx = all[i];
        if (tx.categoryName === categoryName && !tx.deleted) {
            var d = tx.dateKey || tx.date.slice(0,10);
            if (d >= startStr && d <= endStr) {
                filtered.push(tx);
            }
        }
    }
    filtered.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    var dateRangeText = formatDateRange(range.startDate, range.endDate);
    var html = '<div class="cost-history-header">📜 Lịch sử chi phí quản lý: <strong>' + escapeHtml(categoryName) + '</strong><br><span style="font-size:12px;">(' + dateRangeText + ')</span></div>';
    if (filtered.length === 0) {
        html += '<div class="empty-state">Không có giao dịch trong khoảng thời gian này</div>';
    } else {
        html += '<div class="cost-history-list">';
        for (var j = 0; j < filtered.length; j++) {
            var tx = filtered[j];
            var dateStr = new Date(tx.date).toLocaleDateString('vi-VN');
            var timeStr = new Date(tx.date).toLocaleTimeString('vi-VN');
            html += '<div class="cost-history-item">' +
                '<div class="cost-history-date">' + dateStr + ' ' + timeStr + '</div>' +
                '<div class="cost-history-amount">' + formatMoney(tx.amount) + (tx.quantity > 1 ? ' x' + tx.quantity : '') + '</div>' +
                (tx.note ? '<div class="cost-history-note">' + escapeHtml(tx.note) + '</div>' : '') +
            '</div>';
        }
        html += '</div>';
    }
    var contentDiv = document.getElementById('costHistoryList');
    var titleSpan = document.getElementById('costHistoryTitle');
    if (contentDiv) contentDiv.innerHTML = html;
    if (titleSpan) titleSpan.innerHTML = '📜 Lịch sử chi phí quản lý - ' + escapeHtml(categoryName);
    var modal = document.getElementById('costHistoryModal');
    if (modal) modal.style.display = 'flex';
}

function showDebtDetail(customerId) {
    // Gọi hàm có sẵn trong pos.js
    if (typeof window.showCustomerDetail === 'function') {
        window.showCustomerDetail(customerId);
    } else {
        showToast('Chức năng đang cập nhật', 'info');
    }
}

function renderDrinkStats() {
    var container = document.getElementById('managerDrinkStats');
    if (!container) return;
    var range = managerGetDateRangeByMode();
    if (!range.startDate || !range.endDate) {
        container.innerHTML = '<div class="empty-state">Chưa có dữ liệu</div>';
        return;
    }
    var filteredTrans = managerFilterByDateRange(managerData.transactions, range.startDate, range.endDate);
    var itemSales = {};
    for (var i = 0; i < filteredTrans.length; i++) {
        var tx = filteredTrans[i];
        if (tx.type === 'debt_payment') continue;
        var items = tx.items || [];
        for (var j = 0; j < items.length; j++) {
            var item = items[j];
            var name = item.name.replace(/\s*\([^)]*\)/g, '').trim();
            var qty = item.qty || 0;
            if (!itemSales[name]) itemSales[name] = 0;
            itemSales[name] += qty;
        }
    }
    var itemsArray = [];
    for (var name in itemSales) {
        itemsArray.push({ name: name, qty: itemSales[name] });
    }
    itemsArray.sort(function(a, b) { return b.qty - a.qty; });
    var topItems = itemsArray.slice(0, 10);
    if (topItems.length === 0) {
        container.innerHTML = '<div class="empty-state">📭 Không có dữ liệu bán hàng</div>';
        return;
    }
    var html = '<div class="stats-list">';
    for (var k = 0; k < topItems.length; k++) {
        html += '<div class="stats-item">' +
            '<span>' + (k+1) + '. ' + escapeHtml(topItems[k].name) + '</span>' +
            '<span class="stats-qty">📦 ' + topItems[k].qty + '</span>' +
        '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
}

function renderLowStockAlert() {
    var container = document.getElementById('managerLowStockAlert');
    if (!container) return;
    var ingredients = window.ingredients || [];
    if (ingredients.length === 0) {
        container.innerHTML = '<div class="empty-state">📦 Chưa có nguyên liệu</div>';
        return;
    }
    var minStockSetting = parseInt(localStorage.getItem('settingMinStock') || '10');
    var lowItems = [];
    for (var i = 0; i < ingredients.length; i++) {
        var ing = ingredients[i];
        var threshold = ing.minStock || minStockSetting;
        if (ing.stock <= threshold) {
            lowItems.push(ing);
        }
    }
    if (lowItems.length === 0) {
        container.innerHTML = '<div class="empty-state">✅ Tất cả nguyên liệu đủ tồn kho</div>';
        return;
    }
    var html = '<div class="alert-list">';
    for (var j = 0; j < lowItems.length; j++) {
        var ing = lowItems[j];
        html += '<div class="alert-item">' +
            '<span class="alert-name">⚠️ ' + escapeHtml(ing.name) + '</span>' +
            '<span class="alert-stock">Tồn: ' + ing.stock + ' ' + (ing.unit || '') + '</span>' +
        '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
}

function attachManagerEvents() {
    var headers = document.querySelectorAll('.toggle-header');
    for (var i = 0; i < headers.length; i++) {
        headers[i].onclick = function(e) {
            var card = this.parentNode;
            while (card && card.nodeType === 1 && !card.classList.contains('card')) {
                card = card.parentNode;
            }
            if (card && card.classList) card.classList.toggle('collapsed');
            e.stopPropagation();
        };
    }
    var revenueBox = document.getElementById('revenueBox');
    if (revenueBox) revenueBox.onclick = showRevenueHistory;
    var bankBox = document.getElementById('bankBox');
    if (bankBox) bankBox.onclick = showTransferHistory;
    var cashBox = document.getElementById('cashBox');
    if (cashBox) cashBox.onclick = showCashReceivedHistory;
    var grabBox = document.getElementById('grabBox');
    if (grabBox) grabBox.onclick = showGrabHistory;
    var expenseBox = document.getElementById('expenseBox');
    if (expenseBox) expenseBox.onclick = showStaffExpenseHistory;
    var adminExpenseBox = document.getElementById('adminExpenseBox');
    if (adminExpenseBox) adminExpenseBox.onclick = showAdminExpenseHistory;
    var debtOccurBox = document.getElementById('debtOccurBox');
    if (debtOccurBox) debtOccurBox.onclick = showDebtOccurredHistory;
    var totalDebtBox = document.getElementById('totalDebtBox');
    if (totalDebtBox) totalDebtBox.onclick = showCurrentTotalDebt;
    var netIncomeBox = document.getElementById('netIncomeBox');
    if (netIncomeBox) netIncomeBox.onclick = showCashReceivedHistory;
}

function showRevenueHistory() {
    var range = managerGetDateRangeByMode();
    if (!range.startDate || !range.endDate) return;
    var filteredTrans = managerFilterByDateRange(managerData.transactions, range.startDate, range.endDate);
    var revenueTrans = filteredTrans.filter(function(tx) {
        return (tx.type === 'dinein' || tx.type === 'takeaway') && tx.refunded !== true;
    });
    renderTransactionHistory(revenueTrans, 'Doanh thu');
}

function showTransferHistory() {
    var range = managerGetDateRangeByMode();
    if (!range.startDate || !range.endDate) return;
    var filteredTrans = managerFilterByDateRange(managerData.transactions, range.startDate, range.endDate);
    var transferTrans = filteredTrans.filter(function(tx) {
        return tx.paymentMethod === 'transfer' && tx.refunded !== true;
    });
    renderTransactionHistory(transferTrans, 'Chuyển khoản');
}

function showCashReceivedHistory() {
    var range = managerGetDateRangeByMode();
    if (!range.startDate || !range.endDate) return;
    var filteredTrans = managerFilterByDateRange(managerData.transactions, range.startDate, range.endDate);
    var cashTrans = filteredTrans.filter(function(tx) {
        return tx.paymentMethod === 'cash' && tx.refunded !== true;
    });
    renderTransactionHistory(cashTrans, 'Thực nhận (Tiền mặt)');
}

function showGrabHistory() {
    var range = managerGetDateRangeByMode();
    if (!range.startDate || !range.endDate) return;
    var filteredTrans = managerFilterByDateRange(managerData.transactions, range.startDate, range.endDate);
    var grabTrans = filteredTrans.filter(function(tx) {
        return tx.type === 'grab' && tx.refunded !== true;
    });
    renderTransactionHistory(grabTrans, 'Grab');
}

function showStaffExpenseHistory() {
    var range = managerGetDateRangeByMode();
    if (!range.startDate || !range.endDate) return;
    var filteredCosts = managerFilterByDateRange(managerData.costTransactions, range.startDate, range.endDate);
    renderExpenseHistory(filteredCosts, 'Chi phí nhân viên');
}

function showAdminExpenseHistory() {
    var range = managerGetDateRangeByMode();
    if (!range.startDate || !range.endDate) return;
    var filteredCosts = managerFilterByDateRange(managerData.adminCostTransactions, range.startDate, range.endDate);
    renderExpenseHistory(filteredCosts, 'Chi phí quản lý');
}

function showDebtOccurredHistory() {
    var range = managerGetDateRangeByMode();
    if (!range.startDate || !range.endDate) return;
    var startStr = range.startDate.toISOString().slice(0,10);
    var endStr = range.endDate.toISOString().slice(0,10);
    var debtEntries = [];
    for (var i = 0; i < managerData.customers.length; i++) {
        var cust = managerData.customers[i];
        var debts = cust.debtHistory || [];
        for (var j = 0; j < debts.length; j++) {
            var d = debts[j];
            var dStr = d.date ? d.date.slice(0,10) : '';
            if (dStr >= startStr && dStr <= endStr) {
                debtEntries.push({
                    customerName: cust.name,
                    amount: d.amount,
                    date: d.date,
                    note: d.note
                });
            }
        }
    }
    renderDebtHistory(debtEntries, 'Công nợ phát sinh');
}

function showCurrentTotalDebt() {
    var debtCust = [];
    for (var i = 0; i < managerData.customers.length; i++) {
        var cust = managerData.customers[i];
        var totalDebtAmount = 0;
        if (cust.debtHistory) {
            for (var j = 0; j < cust.debtHistory.length; j++) {
                totalDebtAmount += cust.debtHistory[j].amount || 0;
            }
        }
        var totalPaymentAmount = 0;
        if (cust.paymentHistory) {
            for (var j = 0; j < cust.paymentHistory.length; j++) {
                totalPaymentAmount += cust.paymentHistory[j].amount || 0;
            }
        }
        var balance = totalDebtAmount - totalPaymentAmount;
        if (cust.totalDebt && typeof cust.totalDebt === 'number' && Math.abs(cust.totalDebt - balance) < 1000) {
            balance = cust.totalDebt;
        }
        if (balance > 0) {
            debtCust.push({ name: cust.name, totalDebt: balance, id: cust.id });
        }
    }
    renderCurrentDebtList(debtCust);
}

function renderTransactionHistory(transactions, title) {
    if (transactions.length === 0) {
        showHistoryMessage('Không có giao dịch nào trong kỳ', title);
        return;
    }
    // Nhóm theo ngày
    var groups = {};
    for (var i = 0; i < transactions.length; i++) {
        var tx = transactions[i];
        var dateKey = tx.dateKey || tx.date.slice(0,10);
        if (!groups[dateKey]) {
            groups[dateKey] = { transactions: [], totalAmount: 0 };
        }
        groups[dateKey].transactions.push(tx);
        groups[dateKey].totalAmount += tx.amount;
    }
    var dateList = Object.keys(groups).sort().reverse();
    var html = '<div class="history-date-list">';
    for (var d = 0; d < dateList.length; d++) {
        var date = dateList[d];
        var group = groups[date];
        var dateObj = new Date(date);
        var dateStr = dateObj.toLocaleDateString('vi-VN');
        html += '<div class="history-date-group" data-date="' + date + '">' +
            '<div class="history-date-header" onclick="toggleHistoryDateGroup(this)">' +
                '<span class="history-date-title">📅 ' + dateStr + '</span>' +
                '<span class="history-date-summary">' +
                    '<span class="history-date-amount">' + formatMoney(group.totalAmount) + '</span>' +
                    '<span class="toggle-icon">▼</span>' +
                '</span>' +
            '</div>' +
            '<div class="history-date-items" style="display:none;">';
        for (var j = 0; j < group.transactions.length; j++) {
            var tx = group.transactions[j];
            var timeStr = new Date(tx.date).toLocaleTimeString('vi-VN');
            var itemsCount = 0;
            if (tx.items) {
                for (var k = 0; k < tx.items.length; k++) itemsCount += tx.items[k].qty;
            }
            html += '<div class="history-date-item" onclick="showTransactionDetail(\'' + tx.id + '\')" style="cursor:pointer;">' +
                '<div class="history-date-item-time">' + timeStr + ' - ' + (tx.tableName ? '🪑 ' + tx.tableName : (tx.type === 'takeaway' ? '🛵 Mang đi' : '🍽️ Tại chỗ')) + ' (' + itemsCount + ' món)</div>' +
                '<div class="history-date-item-amount">' + formatMoney(tx.amount) + '</div>' +
            '</div>';
        }
        html += '</div></div>';
    }
    html += '</div>';
    showHistoryModal(html, title);
}

function renderExpenseHistory(costs, title) {
    if (costs.length === 0) {
        showHistoryMessage('Không có chi phí nào trong kỳ', title);
        return;
    }
    var groups = {};
    for (var i = 0; i < costs.length; i++) {
        var c = costs[i];
        var dateKey = c.dateKey || c.date.slice(0,10);
        if (!groups[dateKey]) {
            groups[dateKey] = { costs: [], totalAmount: 0 };
        }
        groups[dateKey].costs.push(c);
        groups[dateKey].totalAmount += c.amount;
    }
    var dateList = Object.keys(groups).sort().reverse();
    var html = '<div class="history-date-list">';
    for (var d = 0; d < dateList.length; d++) {
        var date = dateList[d];
        var group = groups[date];
        var dateObj = new Date(date);
        var dateStr = dateObj.toLocaleDateString('vi-VN');
        html += '<div class="history-date-group" data-date="' + date + '">' +
            '<div class="history-date-header" onclick="toggleHistoryDateGroup(this)">' +
                '<span class="history-date-title">📅 ' + dateStr + '</span>' +
                '<span class="history-date-summary">' +
                    '<span class="history-date-amount">' + formatMoney(group.totalAmount) + '</span>' +
                    '<span class="toggle-icon">▼</span>' +
                '</span>' +
            '</div>' +
            '<div class="history-date-items" style="display:none;">';
        for (var j = 0; j < group.costs.length; j++) {
            var c = group.costs[j];
            var timeStr = new Date(c.date).toLocaleTimeString('vi-VN');
            html += '<div class="history-date-item">' +
                '<div class="history-date-item-time">' + timeStr + ' - ' + escapeHtml(c.categoryName) + (c.quantity > 1 ? ' x' + c.quantity : '') + '</div>' +
                '<div class="history-date-item-amount" style="color:var(--danger);">-' + formatMoney(c.amount) + '</div>' +
            '</div>';
        }
        html += '</div></div>';
    }
    html += '</div>';
    showHistoryModal(html, title);
}

function renderDebtHistory(debtEntries, title) {
    if (debtEntries.length === 0) {
        showHistoryMessage('Không có khoản nợ nào trong kỳ', title);
        return;
    }
    var groups = {};
    for (var i = 0; i < debtEntries.length; i++) {
        var d = debtEntries[i];
        var dateKey = d.date.slice(0,10);
        if (!groups[dateKey]) {
            groups[dateKey] = { entries: [], totalAmount: 0 };
        }
        groups[dateKey].entries.push(d);
        groups[dateKey].totalAmount += d.amount;
    }
    var dateList = Object.keys(groups).sort().reverse();
    var html = '<div class="history-date-list">';
    for (var d = 0; d < dateList.length; d++) {
        var date = dateList[d];
        var group = groups[date];
        var dateObj = new Date(date);
        var dateStr = dateObj.toLocaleDateString('vi-VN');
        html += '<div class="history-date-group" data-date="' + date + '">' +
            '<div class="history-date-header" onclick="toggleHistoryDateGroup(this)">' +
                '<span class="history-date-title">📅 ' + dateStr + '</span>' +
                '<span class="history-date-summary">' +
                    '<span class="history-date-amount">' + formatMoney(group.totalAmount) + '</span>' +
                    '<span class="toggle-icon">▼</span>' +
                '</span>' +
            '</div>' +
            '<div class="history-date-items" style="display:none;">';
        for (var j = 0; j < group.entries.length; j++) {
            var entry = group.entries[j];
            var timeStr = new Date(entry.date).toLocaleTimeString('vi-VN');
            html += '<div class="history-date-item">' +
                '<div class="history-date-item-time">' + timeStr + ' - 👤 ' + escapeHtml(entry.customerName) + (entry.note ? ' (' + escapeHtml(entry.note) + ')' : '') + '</div>' +
                '<div class="history-date-item-amount" style="color:var(--danger);">+' + formatMoney(entry.amount) + '</div>' +
            '</div>';
        }
        html += '</div></div>';
    }
    html += '</div>';
    showHistoryModal(html, title);
}

function renderCurrentDebtList(debtCust) {
    if (debtCust.length === 0) {
        showHistoryMessage('Không có khách nợ', 'Tổng công nợ');
        return;
    }
    var html = '<div class="cost-list">';
    for (var i = 0; i < debtCust.length; i++) {
        var c = debtCust[i];
        html += '<div class="manager-item" onclick="showDebtDetail(\'' + c.id + '\')" style="cursor:pointer;">' +
            '<span>👤 ' + escapeHtml(c.name) + '</span>' +
            '<strong style="color:var(--danger);">' + formatMoney(c.totalDebt) + '</strong>' +
        '</div>';
    }
    html += '</div>';
    showHistoryModal(html, 'Tổng công nợ hiện tại');
}

function showHistoryMessage(message, title) {
    var html = '<div class="empty-state">' + message + '</div>';
    showHistoryModal(html, title);
}

function showHistoryModal(html, title) {
    var contentDiv = document.getElementById('historyDetailContent');
    var titleSpan = document.getElementById('historyDetailTitle');
    var modal = document.getElementById('historyDetailModal');
    if (contentDiv) contentDiv.innerHTML = html;
    if (titleSpan) titleSpan.innerHTML = '📋 ' + title;
    if (modal) modal.style.display = 'flex';
    else console.warn('Không tìm thấy modal #historyDetailModal');
}

// Hàm toggle mở rộng nhóm ngày
window.toggleHistoryDateGroup = function(headerElement) {
    var groupDiv = headerElement.closest('.history-date-group');
    if (!groupDiv) return;
    var itemsDiv = groupDiv.querySelector('.history-date-items');
    if (itemsDiv) {
        var isHidden = itemsDiv.style.display === 'none';
        itemsDiv.style.display = isHidden ? 'block' : 'none';
        var toggleIcon = headerElement.querySelector('.toggle-icon');
        if (toggleIcon) {
            toggleIcon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    }
};
function showHistoryGeneric(title, type) {
    var range = managerGetDateRangeByMode();
    if (!range.startDate || !range.endDate) return;
    var startStr = range.startDate.toISOString().slice(0,10);
    var endStr = range.endDate.toISOString().slice(0,10);
    var contentHtml = '<div class="cost-history-header">📋 ' + escapeHtml(title) + ' (' + startStr + ' → ' + endStr + ')</div>';
    contentHtml += '<div class="empty-state">Chức năng đang được phát triển</div>';
    
    var contentDiv = document.getElementById('historyDetailContent');
    var titleSpan = document.getElementById('historyDetailTitle');
    var modal = document.getElementById('historyDetailModal');
    
    if (contentDiv) contentDiv.innerHTML = contentHtml;
    if (titleSpan) titleSpan.innerHTML = '📋 Lịch sử ' + escapeHtml(title);
    if (modal) modal.style.display = 'flex';
    else console.warn('Không tìm thấy modal #historyDetailModal');
}
// Hiển thị modal danh sách giao dịch (theo từng giao dịch)
function showTransactionHistoryModal(transactions, title) {
    if (transactions.length === 0) {
        showEmptyModal(title, 'Không có giao dịch');
        return;
    }
    // Nhóm theo ngày
    var groups = {};
    for (var i = 0; i < transactions.length; i++) {
        var tx = transactions[i];
        var dateKey = tx.dateKey || tx.date.slice(0,10);
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(tx);
    }
    var groupList = [];
    for (var date in groups) {
        groupList.push({ date: date, items: groups[date] });
    }
    groupList.sort(function(a, b) { return b.date.localeCompare(a.date); });
    
    var html = '<div class="history-date-list">';
    for (var i = 0; i < groupList.length; i++) {
        var group = groupList[i];
        var dateObj = new Date(group.date);
        var dateStr = dateObj.toLocaleDateString('vi-VN');
        var totalAmount = 0;
        for (var j = 0; j < group.items.length; j++) totalAmount += group.items[j].amount;
        html += '<div class="history-date-group" data-date="' + group.date + '">' +
            '<div class="history-date-header" onclick="toggleHistoryDateGroup(this)">' +
                '<span class="history-date-title">📅 ' + dateStr + '</span>' +
                '<span class="history-date-summary">' +
                    '<span>📦 ' + group.items.length + ' giao dịch</span>' +
                    '<span class="history-date-amount">' + formatMoney(totalAmount) + '</span>' +
                    '<span class="toggle-icon">▼</span>' +
                '</span>' +
            '</div>' +
            '<div class="history-date-items" style="display:none;">';
        for (var k = 0; k < group.items.length; k++) {
            var tx = group.items[k];
            var timeStr = new Date(tx.date).toLocaleTimeString('vi-VN');
            var typeText = '';
            if (tx.type === 'dinein') typeText = '🍽️ Tại chỗ';
            else if (tx.type === 'takeaway') typeText = '🛵 Mang đi';
            else if (tx.type === 'grab') typeText = '🚕 Grab';
            else typeText = '💰 Nợ';
            var paymentText = '';
            if (tx.paymentMethod === 'cash') paymentText = '💰 TM';
            else if (tx.paymentMethod === 'transfer') paymentText = '💳 CK';
            else if (tx.paymentMethod === 'debt') paymentText = '💢 Nợ';
            html += '<div class="history-date-item" style="cursor:pointer;" onclick="showTransactionDetail(\'' + tx.id + '\')">' +
                '<div class="history-date-item-time">' + timeStr + ' - ' + typeText + ' - ' + paymentText + (tx.tableName ? ' - 🪑 ' + tx.tableName : '') + '</div>' +
                '<div class="history-date-item-amount">' + formatMoney(tx.amount) + '</div>' +
            '</div>';
        }
        html += '</div></div>';
    }
    html += '</div>';
    setModalContent(title, html);
}

// Hiển thị modal danh sách chi phí (cost)
function showCostHistoryModal(costs, title) {
    if (costs.length === 0) {
        showEmptyModal(title, 'Không có chi phí');
        return;
    }
    var groups = {};
    for (var i = 0; i < costs.length; i++) {
        var c = costs[i];
        var dateKey = c.dateKey || c.date.slice(0,10);
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(c);
    }
    var groupList = [];
    for (var date in groups) {
        groupList.push({ date: date, items: groups[date] });
    }
    groupList.sort(function(a, b) { return b.date.localeCompare(a.date); });
    var html = '<div class="history-date-list">';
    for (var i = 0; i < groupList.length; i++) {
        var group = groupList[i];
        var dateObj = new Date(group.date);
        var dateStr = dateObj.toLocaleDateString('vi-VN');
        var totalAmount = 0;
        for (var j = 0; j < group.items.length; j++) totalAmount += group.items[j].amount;
        html += '<div class="history-date-group" data-date="' + group.date + '">' +
            '<div class="history-date-header" onclick="toggleHistoryDateGroup(this)">' +
                '<span class="history-date-title">📅 ' + dateStr + '</span>' +
                '<span class="history-date-summary">' +
                    '<span>📦 ' + group.items.length + ' khoản</span>' +
                    '<span class="history-date-amount">' + formatMoney(totalAmount) + '</span>' +
                    '<span class="toggle-icon">▼</span>' +
                '</span>' +
            '</div>' +
            '<div class="history-date-items" style="display:none;">';
        for (var k = 0; k < group.items.length; k++) {
            var c = group.items[k];
            var timeStr = new Date(c.date).toLocaleTimeString('vi-VN');
            html += '<div class="history-date-item">' +
                '<div class="history-date-item-time">' + timeStr + ' - ' + escapeHtml(c.categoryName) + (c.quantity > 1 ? ' x' + c.quantity : '') + '</div>' +
                '<div class="history-date-item-amount">' + formatMoney(c.amount) + '</div>' +
            '</div>';
        }
        html += '</div></div>';
    }
    html += '</div>';
    setModalContent(title, html);
}

// Hiển thị modal nhóm theo ngày với summary tùy chỉnh (cho thực nhận)
function showGroupedHistoryModal(groupList, title, summaryFormatter) {
    if (groupList.length === 0) {
        showEmptyModal(title, 'Không có dữ liệu');
        return;
    }
    var html = '<div class="history-date-list">';
    for (var i = 0; i < groupList.length; i++) {
        var g = groupList[i];
        var dateObj = new Date(g.date);
        var dateStr = dateObj.toLocaleDateString('vi-VN');
        var summary = summaryFormatter(g);
        html += '<div class="history-date-group" data-date="' + g.date + '">' +
            '<div class="history-date-header" onclick="toggleHistoryDateGroup(this)">' +
                '<span class="history-date-title">📅 ' + dateStr + '</span>' +
                '<span class="history-date-summary">' +
                    '<span>' + summary + '</span>' +
                    '<span class="toggle-icon">▼</span>' +
                '</span>' +
            '</div>' +
            '<div class="history-date-items" style="display:none;">';
        // Chi tiết trong ngày
        for (var j = 0; j < g.details.length; j++) {
            var detail = g.details[j];
            if (detail.type === 'transaction') {
                var tx = detail.data;
                var timeStr = new Date(tx.date).toLocaleTimeString('vi-VN');
                html += '<div class="history-date-item" style="cursor:pointer;" onclick="showTransactionDetail(\'' + tx.id + '\')">' +
                    '<div class="history-date-item-time">' + timeStr + ' - ' + (tx.paymentMethod === 'cash' ? '💰 Thu tiền mặt' : '💳 Thu chuyển khoản') + ' - ' + (tx.type === 'dinein' ? '🍽️ Tại chỗ' : tx.type === 'takeaway' ? '🛵 Mang đi' : '🚕 Grab') + (tx.tableName ? ' - 🪑 ' + tx.tableName : '') + '</div>' +
                    '<div class="history-date-item-amount" style="color:green;">+' + formatMoney(tx.amount) + '</div>' +
                '</div>';
            } else if (detail.type === 'cost') {
                var cost = detail.data;
                var timeStr = new Date(cost.date).toLocaleTimeString('vi-VN');
                html += '<div class="history-date-item">' +
                    '<div class="history-date-item-time">' + timeStr + ' - Chi phí NV: ' + escapeHtml(cost.categoryName) + (cost.quantity > 1 ? ' x' + cost.quantity : '') + '</div>' +
                    '<div class="history-date-item-amount" style="color:red;">-' + formatMoney(cost.amount) + '</div>' +
                '</div>';
            } else if (detail.type === 'admincost') {
                var acost = detail.data;
                var timeStr = new Date(acost.date).toLocaleTimeString('vi-VN');
                html += '<div class="history-date-item">' +
                    '<div class="history-date-item-time">' + timeStr + ' - Chi phí QL: ' + escapeHtml(acost.categoryName) + (acost.quantity > 1 ? ' x' + acost.quantity : '') + '</div>' +
                    '<div class="history-date-item-amount" style="color:red;">-' + formatMoney(acost.amount) + '</div>' +
                '</div>';
            }
        }
        html += '</div></div>';
    }
    html += '</div>';
    setModalContent(title, html);
}

// Hiển thị modal công nợ phát sinh
function showDebtHistoryModal(debtEntries, title) {
    if (debtEntries.length === 0) {
        showEmptyModal(title, 'Không có khoản nợ phát sinh');
        return;
    }
    var groups = {};
    for (var i = 0; i < debtEntries.length; i++) {
        var d = debtEntries[i];
        var dateKey = d.date.slice(0,10);
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(d);
    }
    var groupList = [];
    for (var date in groups) {
        groupList.push({ date: date, items: groups[date] });
    }
    groupList.sort(function(a, b) { return b.date.localeCompare(a.date); });
    var html = '<div class="history-date-list">';
    for (var i = 0; i < groupList.length; i++) {
        var group = groupList[i];
        var dateObj = new Date(group.date);
        var dateStr = dateObj.toLocaleDateString('vi-VN');
        var totalAmount = 0;
        for (var j = 0; j < group.items.length; j++) totalAmount += group.items[j].amount;
        html += '<div class="history-date-group" data-date="' + group.date + '">' +
            '<div class="history-date-header" onclick="toggleHistoryDateGroup(this)">' +
                '<span class="history-date-title">📅 ' + dateStr + '</span>' +
                '<span class="history-date-summary">' +
                    '<span>📦 ' + group.items.length + ' khoản nợ</span>' +
                    '<span class="history-date-amount">' + formatMoney(totalAmount) + '</span>' +
                    '<span class="toggle-icon">▼</span>' +
                '</span>' +
            '</div>' +
            '<div class="history-date-items" style="display:none;">';
        for (var k = 0; k < group.items.length; k++) {
            var d = group.items[k];
            html += '<div class="history-date-item" style="cursor:pointer;" onclick="showDebtDetail(\'' + d.customerId + '\')">' +
                '<div class="history-date-item-time">👤 ' + escapeHtml(d.customerName) + ' - ' + (d.note ? escapeHtml(d.note) : '') + '</div>' +
                '<div class="history-date-item-amount" style="color:red;">+' + formatMoney(d.amount) + '</div>' +
            '</div>';
        }
        html += '</div></div>';
    }
    html += '</div>';
    setModalContent(title, html);
}

// Hiển thị modal tổng công nợ hiện tại
function showCurrentDebtModal(debtCust) {
    if (debtCust.length === 0) {
        showEmptyModal('Tổng công nợ', 'Không có khách nợ');
        return;
    }
    var html = '<div class="cost-list">';
    for (var i = 0; i < debtCust.length; i++) {
        var c = debtCust[i];
        html += '<div class="manager-item" style="cursor:pointer;" onclick="showDebtDetail(\'' + c.id + '\')">' +
            '<span>👤 ' + escapeHtml(c.name) + '</span>' +
            '<strong style="color:var(--danger);">' + formatMoney(c.totalDebt) + '</strong>' +
        '</div>';
    }
    html += '</div>';
    setModalContent('Tổng công nợ khách hàng', html);
}

// Hàm tiện ích: đặt nội dung modal và hiển thị
function setModalContent(title, html) {
    var titleSpan = document.getElementById('historyDetailTitle');
    var contentDiv = document.getElementById('historyDetailContent');
    var modal = document.getElementById('historyDetailModal');
    if (titleSpan) titleSpan.innerHTML = '📋 ' + escapeHtml(title);
    if (contentDiv) contentDiv.innerHTML = html;
    if (modal) modal.style.display = 'flex';
    else console.warn('Không tìm thấy modal #historyDetailModal');
}

function showEmptyModal(title, message) {
    var html = '<div class="empty-state">' + escapeHtml(message) + '</div>';
    setModalContent(title, html);
}

// Hàm toggle đã có, nhưng cần đảm bảo hoạt động (đã định nghĩa trong manager.js)
// Nếu chưa có, thêm:
window.toggleHistoryDateGroup = function(headerElement) {
    var groupDiv = headerElement.closest('.history-date-group');
    if (!groupDiv) return;
    var itemsDiv = groupDiv.querySelector('.history-date-items');
    if (itemsDiv) {
        var isHidden = itemsDiv.style.display === 'none';
        itemsDiv.style.display = isHidden ? 'block' : 'none';
        var toggleIcon = headerElement.querySelector('.toggle-icon');
        if (toggleIcon) {
            toggleIcon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    }
};
// Export global
window.initManager = initManager;
window.openCostModal = openCostModal;
window.setExpenseName = setExpenseName;
window.editExpenseName = editExpenseName;
window.deleteExpenseCategory = deleteExpenseCategory;
window.showExpenseDetail = showExpenseDetail;
window.showAdminExpenseDetail = showAdminExpenseDetail;
window.showDebtDetail = showDebtDetail;
window.showRevenueHistory = showRevenueHistory;
window.showTransferHistory = showTransferHistory;
window.showCashReceivedHistory = showCashReceivedHistory;
window.showGrabHistory = showGrabHistory;
window.showStaffExpenseHistory = showStaffExpenseHistory;
window.showAdminExpenseHistory = showAdminExpenseHistory;
window.showDebtOccurredHistory = showDebtOccurredHistory;
window.showCurrentTotalDebt = showCurrentTotalDebt;