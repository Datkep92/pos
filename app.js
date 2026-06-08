// app.js - Khởi tạo, biến global, sự kiện, utility
// Tách từ pos.js - ES5, tương thích Android 6, iOS 12

var currentTab = 'tables';
var tempOrder = [];
var selectedCustomer = null;
var currentHistoryDate = new Date();
var currentReportDate = new Date();
var costCategories = [];
var costTransactions = [];
var menuItems = [];
var menuCategories = [];
var ingredients = [];
var customers = [];
var currentTableDetailId = null;
var currentMenuCategory = 'all';
var pendingPaymentTableId = null;
var pendingCustomerCallback = null;
var pendingDebtCustomerId = null;
var pendingSplitTableId = null;
var pendingTransferSourceTable = null;
var pendingMergeSourceId = null;
var pendingDeleteTableId = null;
var currentAddToTableId = null;
var renderDebounceTimer = null;
// Cache
var cachedTables = [];
var tablesCacheTime = 0;
var CACHE_TTL = 2000;
var renderScheduled = false;
// Biến cho module mới
var inventoryTransactions = [];
var managerCashPickups = [];

document.addEventListener('DOMContentLoaded', function() {
    // FIX: Đăng ký callback realtime TRƯỚC khi DB.init() gọi subscribeToCollection
    // để không bỏ lỡ event nào
    initRealtime();
    
    DB.init().then(function() {
        // Khởi tạo auth - kiểm tra session, hiển thị màn hình login nếu cần
        if (typeof initAuth === 'function') {
            initAuth();
        }
        return loadData();
    }).then(function() {
        // Tải các đơn nháp từ IndexedDB
        return loadDraftOrders();
    }).then(function() {
        initEventListeners();
        renderCurrentTime();
        // Khởi tạo module thông báo
        if (typeof initNotifications === 'function') {
            initNotifications();
        }
        // OPTIMIZE: Cập nhật đồng hồ mỗi 30s thay vì mỗi 1s (Android 6 lag)
        setInterval(renderCurrentTime, 30000);
        showToast('POS sẵn sàng', 'success');
    });
});

function loadData() {
    return Promise.all([
        DB.getAll('menu'),
        DB.getAll('menu_categories'),
        DB.getAll('ingredients'),
        DB.getAll('customers'),
        DB.getAll('cost_categories'),
        DB.getAll('cost_transactions'),
        DB.getAll('inventory_transactions'),
        DB.getAll('manager_cash_pickups')
    ]).then(function(results) {
        menuItems = results[0] || [];
        menuCategories = results[1] || [];
        ingredients = results[2] || [];
        customers = results[3] || [];
        costCategories = results[4] || [];
        costTransactions = results[5] || [];
        inventoryTransactions = results[6] || [];
        managerCashPickups = results[7] || [];
        window.menuItems = menuItems;
        window.ingredients = ingredients;
        window.customers = customers;
        window.inventoryTransactions = inventoryTransactions;
        window.managerCashPickups = managerCashPickups;
        renderTables();
        updateRecentToast();
    }).then(function() {
        renderCustomerList();
        renderHistoryByDate(currentHistoryDate);
        renderReport(currentReportDate);
        // FIX: Không cần gọi initRealtime() ở đây nữa vì đã gọi trước DB.init()
    });
}

function renderRecentTransactions() {
    var todayStr = new Date().toISOString().slice(0, 10);
    DB.getTransactionsByDate(todayStr).then(function(transactions) {
        var validTx = transactions.filter(function(tx) { return !tx.refunded; });
        validTx.sort(function(a, b) {
            return new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date);
        });
        var recent = validTx.slice(0, 3);
        var container = document.getElementById('recentList');
        if (!container) return;
        
        if (recent.length === 0) {
            container.innerHTML = '<div class="empty-text" style="padding: 8px;">Chưa có giao dịch hôm nay</div>';
            return;
        }
        
        var html = '';
        for (var i = 0; i < recent.length; i++) {
            var tx = recent[i];
            var timeDiff = Math.floor((Date.now() - new Date(tx.createdAt || tx.date)) / 60000);
            var timeText = '';
            if (timeDiff < 1) timeText = 'Vừa xong';
            else if (timeDiff < 60) timeText = timeDiff + ' phút trước';
            else timeText = Math.floor(timeDiff / 60) + ' giờ trước';
            
            var totalItems = 0;
            if (tx.items && tx.items.length) {
                for (var j = 0; j < tx.items.length; j++) totalItems += tx.items[j].qty;
            }
            
            var locationInfo = '';
            if (tx.tableName) {
                var displayLabel = (tx.customer && tx.customer.name) ? tx.customer.name : tx.tableName;
                locationInfo = '🍽️ ' + displayLabel;
            } else if (tx.type === 'takeaway') locationInfo = '🛵 Mang đi';
            else if (tx.type === 'grab') locationInfo = '🚕 Grab';
            else locationInfo = '🍽️ Tại chỗ';
            
            html += `
                <div class="recent-item" onclick="showTransactionDetail('${tx.id}')">
                    <span class="recent-time">${timeText}</span>
                    <span class="recent-info">${locationInfo} - ${totalItems} món</span>
                    <span class="recent-amount">${formatMoney(tx.amount)}</span>
                </div>
            `;
        }
        container.innerHTML = html;
    });
}

function initEventListeners() {
    // Chuyển tab
    var tabs = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].onclick = (function(tab) {
            return function() { switchTab(tab.getAttribute('data-tab')); };
        })(tabs[i]);
    }

    // Các nút chính
    var createOrderBtn = document.getElementById('createOrderBtn');
    if (createOrderBtn) createOrderBtn.onclick = openCreateOrderModal;

    // Nút chi phí thống nhất (thay thế staffCostFloatBtn)
    var expenseFloatBtn = document.getElementById('expenseFloatBtn');
    if (expenseFloatBtn) {
        expenseFloatBtn.onclick = function() {
            if (typeof openExpenseModal === 'function') {
                openExpenseModal();
            } else {
                showToast('Chức năng chi phí chưa sẵn sàng', 'warning');
            }
        };
    }

    var prevDayBtn = document.getElementById('prevDayBtn');
    if (prevDayBtn) prevDayBtn.onclick = function() { changeHistoryDate(-1); };

    var nextDayBtn = document.getElementById('nextDayBtn');
    if (nextDayBtn) nextDayBtn.onclick = function() { changeHistoryDate(1); };

    var historyFilter = document.getElementById('historyFilter');
    if (historyFilter) historyFilter.onchange = function() { renderHistoryByDate(currentHistoryDate); };

    var reportPrevDayBtn = document.getElementById('reportPrevDayBtn');
    if (reportPrevDayBtn) reportPrevDayBtn.onclick = function() { changeReportDate(-1); };

    var reportNextDayBtn = document.getElementById('reportNextDayBtn');
    if (reportNextDayBtn) reportNextDayBtn.onclick = function() { changeReportDate(1); };

    var quickAddCustomerBtn = document.getElementById('quickAddCustomerBtn');
    if (quickAddCustomerBtn) quickAddCustomerBtn.onclick = quickAddCustomer;

    var createCustomerBtn = document.getElementById('createCustomerFromSelectorBtn');
    if (createCustomerBtn) createCustomerBtn.onclick = createCustomerFromInput;

    var confirmDebtBtn = document.getElementById('confirmDebtPaymentBtn');
    if (confirmDebtBtn) confirmDebtBtn.onclick = confirmDebtPayment;

    // Các nút thanh toán cũ (paymentMethodModal) đã được thay thế bằng quickPayModal
    // Thanh toán được xử lý trực tiếp từ showTableDetail() và quickPayConfirm()

    // Modal chia hóa đơn, chuyển món, xóa bàn
    var confirmSplit = document.getElementById('confirmSplitBtn');
    if (confirmSplit) confirmSplit.onclick = confirmSplitPayment;

    var confirmTransfer = document.getElementById('confirmTransferBtn');
    if (confirmTransfer) confirmTransfer.onclick = confirmTransferItems;

    var confirmDelete = document.getElementById('confirmDeleteTableBtn');
    if (confirmDelete) confirmDelete.onclick = confirmDeleteTable;
}

// FIX: Khi chuyển tab, render lại data từ memoryCache để hiển thị data mới nhất
function switchTab(tabId) {
    currentTab = tabId;
    var tabs = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].getAttribute('data-tab') === tabId) tabs[i].classList.add('active');
        else tabs[i].classList.remove('active');
    }
    var contents = document.querySelectorAll('.tab-content');
    for (var i = 0; i < contents.length; i++) {
        if (contents[i].id === tabId + 'View') contents[i].classList.add('active');
        else contents[i].classList.remove('active');
    }
    
    // Chỉ hiển thị draft bubbles và recent toast trên tab Bàn
    var draftContainer = document.getElementById('draftBubbleContainer');
    var recentToast = document.getElementById('recentToast');
    if (tabId === 'tables') {
        if (draftContainer) draftContainer.style.display = '';
        if (recentToast) recentToast.style.display = '';
        renderTables();
        // Bắt đầu timer cập nhật thời gian bàn tự động
        if (typeof startTableTimer === 'function') {
            startTableTimer();
        }
    } else {
        // Dừng timer cập nhật thời gian bàn khi rời tab
        if (typeof stopTableTimer === 'function') {
            stopTableTimer();
        }
        // Ẩn draft bubbles và recent toast khi không ở tab Bàn
        if (draftContainer) draftContainer.style.display = 'none';
        if (recentToast) recentToast.style.display = 'none';
        
        if (tabId === 'history') {
            renderHistoryByDate(currentHistoryDate);
        } else if (tabId === 'report') {
            renderReport(currentReportDate);
            if (typeof renderReconciliation === 'function') {
                var dateStr = currentReportDate.toISOString().slice(0, 10);
                renderReconciliation(dateStr);
            }
        } else if (tabId === 'customers') {
            renderCustomerList();
        } else if (tabId === 'manager') {
            if (typeof managerApplyFilter === 'function') managerApplyFilter();
        } else if (tabId === 'staff') {
            if (typeof DB !== 'undefined' && DB.isAdmin && DB.isAdmin()) {
                if (typeof DB.getStaffs === 'function') {
                    DB.getStaffs().then(function(staffs) {
                        if (typeof renderStaffList === 'function') renderStaffList(staffs);
                    });
                }
            }
        } else if (tabId === 'inventory') {
            if (typeof renderInventoryMenu === 'function') renderInventoryMenu();
            if (typeof renderInventoryIngredients === 'function') renderInventoryIngredients();
            if (typeof renderInventoryCategoryFilter === 'function') renderInventoryCategoryFilter();
        }
    }
}

// OPTIMIZE: Cache formatMoney để tránh gọi toLocaleString('vi-VN') liên tục (chậm trên Android 6)
var _moneyCache = {};
function formatMoney(amount) {
    var val = amount || 0;
    var key = String(val);
    if (_moneyCache[key]) return _moneyCache[key];
    var result = val.toLocaleString('vi-VN') + 'đ';
    _moneyCache[key] = result;
    return result;
}
// Toast counter để tạo ID duy nhất
var _toastCounter = 0;
// Map lưu các toast đang hiển thị (id -> { element, timer })
var _toastMap = {};

function showToast(message, type, duration) {
    if (duration === undefined) duration = 2500;
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerText = message;
    document.getElementById('toastContainer').appendChild(toast);
    var id = 'toast_' + (++_toastCounter);
    toast.setAttribute('data-toast-id', id);
    if (duration > 0) {
        var timer = setTimeout(function() { toast.remove(); delete _toastMap[id]; }, duration);
        _toastMap[id] = { element: toast, timer: timer };
    } else {
        _toastMap[id] = { element: toast, timer: null };
    }
    return id;
}

function hideToast(id) {
    var entry = _toastMap[id];
    if (entry) {
        if (entry.timer) clearTimeout(entry.timer);
        if (entry.element && entry.element.parentNode) entry.element.remove();
        delete _toastMap[id];
    }
}
function closeModal(modalId) { var m = document.getElementById(modalId); if (m) m.style.display = 'none'; }
function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, function(m) { if (m === '&') return '&'; if (m === '<') return '<'; if (m === '>') return '>'; return m; }); }
function formatDateDisplay(dateStr) { var d = new Date(dateStr); return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); }
function renderCurrentTime() { var now = new Date(); var timeEl = document.getElementById('currentTime'); if (timeEl) timeEl.innerText = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); }

// Ghi đè hàm closeModal để bỏ chặn cuộn
var originalCloseModal = window.closeModal;
window.closeModal = function(modalId) {
    var modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('closing');
        setTimeout(function() {
            modal.style.display = 'none';
            modal.classList.remove('closing');
        }, 200);
    }
    document.body.classList.remove('modal-open');
    if (originalCloseModal) originalCloseModal(modalId);
};

// Hàm mở modal mới (chặn cuộn body)
function openBottomSheet(modalId) {
    var modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
}

// OPTIMIZE: Loại bỏ MutationObserver - gây lag trên Android 6, không cần thiết vì openBottomSheet đã xử lý
// Đóng modal khi click ra ngoài vùng .modal-content
document.querySelectorAll('.modal').forEach(function(modal) {
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal(modal.id);
        }
    });
});


