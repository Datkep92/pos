// customers.js - Khách hàng, công nợ, chọn khách
// Tách từ pos.js - ES5, tương thích Android 6, iOS 12

// ========== KHÁCH HÀNG ==========
function renderCustomerList() {
    DB.getAll('customers').then(function(custs) {
        customers = custs;
        var keyword = document.getElementById('customerSearchInput') ? document.getElementById('customerSearchInput').value.toLowerCase() : '';
        var filtered = keyword ? customers.filter(function(c) { return c.name.toLowerCase().indexOf(keyword) !== -1 || (c.phone && c.phone.indexOf(keyword) !== -1); }) : customers;
        var totalDebt = 0;
        for (var i = 0; i < filtered.length; i++) totalDebt += (filtered[i].totalDebt || 0);
        document.getElementById('totalDebtAmount').innerText = formatMoney(totalDebt);
        var container = document.getElementById('customerList');
        if (!container) return;
        if (!filtered.length) { container.innerHTML = '<div class="empty-state">📭 Không có khách hàng</div>'; return; }
        var html = '';
        for (var i = 0; i < filtered.length; i++) {
            var c = filtered[i];
            var netBalance = (c.creditBalance || 0) - (c.totalDebt || 0);
            var balanceHtml = '';
            if (netBalance > 0) {
                balanceHtml = '<span style="color:#16a34a;">+' + formatMoney(netBalance) + '</span>';
            } else if (netBalance < 0) {
                balanceHtml = '<span style="color:#ef4444;">-' + formatMoney(Math.abs(netBalance)) + '</span>';
            } else {
                balanceHtml = '✅';
            }
            html += '<div class="customer-card" onclick="showCustomerDetail(\'' + c.id + '\')"><div class="customer-avatar">' + c.name.charAt(0).toUpperCase() + '</div><div class="customer-info"><div class="customer-name">' + escapeHtml(c.name) + '</div><div class="customer-phone">📞 ' + (c.phone || '') + '</div></div><div class="customer-debt">' + balanceHtml + '</div></div>';
        }
        container.innerHTML = html;
    });
}

function quickAddCustomer() {
    var searchInput = document.getElementById('customerSearchInput');
    var name = searchInput ? searchInput.value.trim() : '';
    if (!name) {
        showToast('Nhập tên khách hàng vào ô tìm kiếm!', 'warning');
        if (searchInput) searchInput.focus();
        return;
    }
    // Kiểm tra khách đã tồn tại chưa
    for (var i = 0; i < customers.length; i++) {
        if (customers[i].name.toLowerCase() === name.toLowerCase()) {
            showToast('Khách "' + name + '" đã tồn tại!', 'warning');
            return;
        }
    }
    addCustomer(name, '').then(function() {
        if (searchInput) searchInput.value = '';
        renderCustomerList();
        showToast('✅ Đã thêm khách ' + name, 'success');
    });
}

function addCustomer(name, phone) {
    var newId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    var newCustomer = { id: newId, name: name.trim(), phone: phone || '', address: '', totalDebt: 0, totalSpent: 0, creditBalance: 0, createdAt: new Date().toISOString(), debtHistory: [], paymentHistory: [], creditHistory: [] };
    return DB.create('customers', newCustomer).then(function() {
        customers.push(newCustomer);
        return newCustomer;
    });
}

function showCustomerDetail(customerId) {
    var c = null;
    for (var i = 0; i < customers.length; i++) { if (customers[i].id === customerId) { c = customers[i]; break; } }
    if (!c) return;
    
    // Lấy tất cả giao dịch của khách này để hiển thị danh sách món
    DB.getAll('transactions').then(function(allTransactions) {
        var historyHtml = '';
        var all = [];
        
        // Lấy từ debtHistory và paymentHistory
        if (c.debtHistory) {
            for (var i = 0; i < c.debtHistory.length; i++) {
                all.push({ type: 'debt', date: c.debtHistory[i].date, amount: c.debtHistory[i].amount, note: c.debtHistory[i].note, transactionId: null });
            }
        }
        if (c.paymentHistory) {
            for (var i = 0; i < c.paymentHistory.length; i++) {
                all.push({ type: 'payment', date: c.paymentHistory[i].date, amount: c.paymentHistory[i].amount, note: c.paymentHistory[i].note, transactionId: null });
            }
        }
        // Lấy từ creditHistory
        if (c.creditHistory) {
            for (var i = 0; i < c.creditHistory.length; i++) {
                all.push({ type: 'credit', date: c.creditHistory[i].date, amount: c.creditHistory[i].amount, note: c.creditHistory[i].note, transactionId: null });
            }
        }
        
        // Map transactionId cho debt records từ transactions collection
        var debtTxMap = {};
        for (var i = 0; i < allTransactions.length; i++) {
            var tx = allTransactions[i];
            if (tx.type === 'debt_payment' && tx.customer && tx.customer.id === customerId) {
                // Lưu items theo thời gian gần đúng (trong khoảng 1 phút)
                var txTime = new Date(tx.createdAt || tx.date).getTime();
                for (var j = 0; j < all.length; j++) {
                    var hTime = new Date(all[j].date).getTime();
                    if (Math.abs(txTime - hTime) < 60000 && all[j].transactionId === null) {
                        all[j].transactionId = tx.id;
                        all[j].items = tx.items || [];
                        break;
                    }
                }
            }
        }
        
        all.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
        
        for (var i = 0; i < all.length; i++) {
            var h = all[i];
            var amountClass = h.type === 'debt' ? 'var(--danger)' : (h.type === 'credit' ? 'var(--warning)' : 'var(--success)');
            var sign = h.type === 'debt' ? '-' : (h.type === 'credit' ? '+' : '+');
            var typeLabel = h.type === 'credit' ? '💰 Trả dư' : (h.type === 'debt' ? '📝 Nợ' : '💵 Trả nợ');
            
            // Hiển thị danh sách món nếu có
            var itemsHtml = '';
            if (h.items && h.items.length > 0) {
                itemsHtml = '<div style="font-size:11px;color:#666;margin:4px 0 8px 12px;">';
                for (var j = 0; j < h.items.length; j++) {
                    itemsHtml += '• ' + escapeHtml(h.items[j].name) + ' x' + h.items[j].qty + ' - ' + formatMoney(h.items[j].price * h.items[j].qty) + '<br>';
                }
                itemsHtml += '</div>';
            }
            
            historyHtml += '<div class="cart-item"><span>' + new Date(h.date).toLocaleString('vi-VN') + ' ' + typeLabel + '</span><span style="color:' + amountClass + '">' + sign + formatMoney(h.amount) + '</span></div><div style="font-size:11px; margin-bottom:4px;">📝 ' + escapeHtml(h.note || '') + '</div>' + itemsHtml;
        }
        
        var content = document.getElementById('customerDetailContent');
        if (!content) return;
        content.setAttribute('data-customer-id', customerId);
        // Tính số dư thực: creditBalance - totalDebt
        var netBalance = (c.creditBalance || 0) - (c.totalDebt || 0);
        var balanceColor = netBalance >= 0 ? '#16a34a' : '#ef4444';
        var balanceSign = netBalance >= 0 ? '+' : '';
        var balanceLabel = netBalance >= 0 ? '💰 Tiền dư' : '💰 Công nợ';
        var showPayBtn = netBalance < 0; // chỉ hiện nút thanh toán nợ khi đang nợ
        var debtForPayment = Math.abs(netBalance); // số nợ thực tế cần thanh toán
        content.innerHTML = '<div class="debt-summary" style="margin-bottom:16px;"><span>' + balanceLabel + '</span><span style="color:' + balanceColor + '; font-size:20px;">' + balanceSign + formatMoney(Math.abs(netBalance)) + '</span></div>' + (showPayBtn ? '<button class="btn-save" onclick="openDebtPayment(\'' + c.id + '\', ' + debtForPayment + ')" style="margin-bottom:16px;">💸 Thanh toán nợ</button>' : '') + '<div class="cost-history-title">📜 Lịch sử</div>' + (historyHtml || '<div class="empty-state">Chưa có giao dịch</div>');
        document.getElementById('customerDetailModal').style.display = 'flex';
    });
}

function openDebtPayment(customerId, currentDebt) {
    for (var i = 0; i < customers.length; i++) {
        if (customers[i].id === customerId) {
            var creditBalance = customers[i].creditBalance || 0;
            var infoHtml = '💰 Khách: ' + customers[i].name + '<br>💢 Nợ: <span style="color:#ef4444;">-' + formatMoney(currentDebt) + '</span>';
            if (creditBalance > 0) {
                infoHtml += '<br>💰 Tiền dư: <span style="color:#16a34a;">+' + formatMoney(creditBalance) + '</span>';
                infoHtml += '<br><span style="color:#666;font-size:12px;">💡 Sẽ tự động trừ ' + formatMoney(creditBalance) + ' tiền dư vào số tiền nhập</span>';
            }
            document.getElementById('debtPaymentInfo').innerHTML = infoHtml;
            break;
        }
    }
    document.getElementById('debtPaymentAmount').value = currentDebt;
    document.getElementById('debtPaymentModal').style.display = 'flex';
    pendingDebtCustomerId = customerId;
    // Focus vào input để nhập số tiền
    setTimeout(function() { document.getElementById('debtPaymentAmount').focus(); }, 100);
}

// OPTIMIZE: confirmDebtPayment - loại bỏ DB.getAll không cần thiết, dùng memory cache
function confirmDebtPayment(method) {
    var amount = parseInt(document.getElementById('debtPaymentAmount').value) || 0;
    if (amount <= 0) { showToast('Số tiền không hợp lệ!', 'warning'); return; }
    var customer = null;
    for (var i = 0; i < customers.length; i++) { if (customers[i].id === pendingDebtCustomerId) { customer = customers[i]; break; } }
    if (!customer) return;
    
    var methodLabel = method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản';
    var creditBalance = customer.creditBalance || 0;
    
    // Tự động trừ tiền dư trước khi thanh toán
    var creditUsed = 0;
    var actualPayment = amount; // số tiền thực tế khách đưa
    if (creditBalance > 0) {
        creditUsed = Math.min(creditBalance, amount);
        actualPayment = amount - creditUsed; // số tiền khách cần trả sau khi đã dùng tiền dư
        customer.creditBalance = creditBalance - creditUsed;
        customer.creditHistory = customer.creditHistory || [];
        customer.creditHistory.unshift({ id: Date.now(), date: new Date().toISOString(), amount: -creditUsed, note: 'Dùng tiền dư khi thanh toán nợ' });
    }
    
    // Xử lý: nếu trả nhiều hơn nợ, phần dư thành credit
    var payment = Math.min(actualPayment, customer.totalDebt || 0);
    var overpay = actualPayment - payment;
    
    customer.totalDebt = (customer.totalDebt || 0) - payment;
    customer.paymentHistory = customer.paymentHistory || [];
    customer.paymentHistory.unshift({ id: Date.now(), date: new Date().toISOString(), amount: payment, method: method, note: 'Thanh toán nợ ' + formatMoney(payment) + ' (' + methodLabel + ')' + (creditUsed > 0 ? ' (đã dùng ' + formatMoney(creditUsed) + ' tiền dư)' : '') });
    
    // Nếu có tiền dư (trả hơn số nợ sau khi đã trừ credit), lưu thêm vào creditBalance
    if (overpay > 0) {
        customer.creditBalance = (customer.creditBalance || 0) + overpay;
        customer.creditHistory = customer.creditHistory || [];
        customer.creditHistory.unshift({ id: Date.now(), date: new Date().toISOString(), amount: overpay, note: 'Trả dư khi thanh toán nợ +' + formatMoney(overpay) });
    }
    
    closeModal('debtPaymentModal');
    
    // OPTIMIZE: Cập nhật DB trước, không cần DB.getAll('transactions') để tìm items
    // Vì items không hiển thị trong lịch sử thanh toán nợ (chỉ hiển thị số tiền)
    DB.update('customers', customer.id, {
        totalDebt: customer.totalDebt,
        paymentHistory: customer.paymentHistory,
        creditBalance: customer.creditBalance || 0,
        creditHistory: customer.creditHistory || []
    }).then(function() {
        var historyNote = 'Thanh toán nợ (' + methodLabel + ')';
        if (creditUsed > 0) historyNote += ' (đã dùng ' + formatMoney(creditUsed) + ' tiền dư)';
        if (overpay > 0) historyNote += ' (dư ' + formatMoney(overpay) + ')';
        return addHistory({ type: 'debt_payment', amount: payment, paymentMethod: method, items: [], customer: { id: customer.id, name: customer.name }, note: historyNote });
    }).then(function() {
        // OPTIMIZE: Không cần DB.getAll('customers') - memory cache đã được cập nhật
        var msg = '✅ Đã thanh toán ' + formatMoney(payment) + ' (' + methodLabel + ')';
        if (creditUsed > 0) msg += ', đã dùng ' + formatMoney(creditUsed) + ' tiền dư';
        if (overpay > 0) msg += ', dư ' + formatMoney(overpay) + ' làm tiền trả trước';
        showToast(msg, 'success');
        renderCustomerList();
        showCustomerDetail(customer.id);
    });
}

function addCustomerDebt(customerId, amount, note) {
    var c = null;
    for (var i = 0; i < customers.length; i++) { if (customers[i].id === customerId) { c = customers[i]; break; } }
    if (!c) return Promise.resolve({ debtAmount: amount, creditUsed: 0 });
    
    // Tự động trừ creditBalance trước khi ghi nợ
    var creditBalance = c.creditBalance || 0;
    var creditUsed = 0;
    var debtAmount = amount;
    
    if (creditBalance > 0) {
        creditUsed = Math.min(creditBalance, amount);
        debtAmount = amount - creditUsed;
        c.creditBalance = creditBalance - creditUsed;
        c.creditHistory = c.creditHistory || [];
        c.creditHistory.unshift({ id: Date.now(), date: new Date().toISOString(), amount: -creditUsed, note: 'Trừ tiền dư khi ghi nợ: ' + note });
    }
    
    if (debtAmount > 0) {
        c.totalDebt = (c.totalDebt || 0) + debtAmount;
        c.debtHistory = c.debtHistory || [];
        c.debtHistory.unshift({ id: Date.now(), date: new Date().toISOString(), amount: debtAmount, note: note, status: 'unpaid' });
    }
    
    var updateData = { totalDebt: c.totalDebt || 0, debtHistory: c.debtHistory || [] };
    if (creditUsed > 0) {
        updateData.creditBalance = c.creditBalance;
        updateData.creditHistory = c.creditHistory;
    }
    return DB.update('customers', customerId, updateData).then(function() {
        // OPTIMIZE: Không cần DB.getAll('customers') - memory cache đã được cập nhật
        return { debtAmount: debtAmount, creditUsed: creditUsed };
    });
}

// ========== CẬP NHẬT CREDIT CHO KHÁCH ==========
function addCustomerCredit(customerId, amount, note) {
    var c = null;
    for (var i = 0; i < customers.length; i++) { if (customers[i].id === customerId) { c = customers[i]; break; } }
    if (!c) return Promise.resolve();
    c.creditBalance = (c.creditBalance || 0) + amount;
    c.creditHistory = c.creditHistory || [];
    c.creditHistory.unshift({ id: Date.now(), date: new Date().toISOString(), amount: amount, note: note });
    return DB.update('customers', customerId, { creditBalance: c.creditBalance, creditHistory: c.creditHistory }).then(function() {
        // OPTIMIZE: Không cần DB.getAll('customers') - memory cache đã được cập nhật
    });
}

function useCustomerCredit(customerId, amount, note) {
    var c = null;
    for (var i = 0; i < customers.length; i++) { if (customers[i].id === customerId) { c = customers[i]; break; } }
    if (!c) return Promise.resolve(0);
    var used = Math.min(amount, c.creditBalance || 0);
    if (used <= 0) return Promise.resolve(0);
    c.creditBalance = (c.creditBalance || 0) - used;
    c.creditHistory = c.creditHistory || [];
    c.creditHistory.unshift({ id: Date.now(), date: new Date().toISOString(), amount: -used, note: note });
    return DB.update('customers', customerId, { creditBalance: c.creditBalance, creditHistory: c.creditHistory }).then(function() {
        // OPTIMIZE: Không cần DB.getAll('customers') - memory cache đã được cập nhật
        return used;
    });
}

// ========== CHỌN KHÁCH ==========
function showCustomerSelector(callback) {
    pendingCustomerCallback = callback;
    renderCustomerSelectorList('');
    var searchInput = document.getElementById('customerSelectorSearch');
    if (searchInput) searchInput.value = '';
    document.getElementById('customerSelectorModal').style.display = 'flex';
    if (searchInput) {
        searchInput.oninput = function() { renderCustomerSelectorList(this.value); };
    }
}

function renderCustomerSelectorList(searchTerm) {
    var filtered = customers;
    if (searchTerm) {
        var lower = searchTerm.toLowerCase();
        filtered = customers.filter(function(c) { return c.name.toLowerCase().indexOf(lower) !== -1 || (c.phone && c.phone.indexOf(searchTerm) !== -1); });
    }
    var container = document.getElementById('customerSelectorList');
    if (!container) return;
    if (filtered.length === 0) { container.innerHTML = '<div class="empty-state">📭 Không tìm thấy khách</div>'; return; }
    var html = '';
    for (var i = 0; i < filtered.length; i++) {
        var c = filtered[i];
        var netBalance = (c.creditBalance || 0) - (c.totalDebt || 0);
        var balanceText = '';
        if (netBalance > 0) {
            balanceText = ' - <span style="color:#16a34a;">+' + formatMoney(netBalance) + '</span>';
        } else if (netBalance < 0) {
            balanceText = ' - <span style="color:#ef4444;">-' + formatMoney(Math.abs(netBalance)) + '</span>';
        }
        html += '<div class="customer-select-item" onclick="selectCustomer(\'' + c.id + '\')"><div class="customer-avatar" style="width:36px;height:36px;">' + c.name.charAt(0).toUpperCase() + '</div><div><div style="font-weight:600;">' + escapeHtml(c.name) + '</div><div style="font-size:11px;">' + (c.phone || '') + balanceText + '</div></div></div>';
    }
    container.innerHTML = html;
}

function selectCustomer(customerId) {
    var customer = null;
    for (var i = 0; i < customers.length; i++) { if (customers[i].id === customerId) { customer = customers[i]; break; } }
    if (customer && pendingCustomerCallback) {
        pendingCustomerCallback(customer);
        pendingCustomerCallback = null;
    }
    closeModal('customerSelectorModal');
}

function createCustomerFromInput() {
    var name = document.getElementById('customerSelectorSearch').value.trim();
    if (!name) { showToast('Nhập tên khách hàng!', 'warning'); return; }
    for (var i = 0; i < customers.length; i++) {
        if (customers[i].name.toLowerCase() === name.toLowerCase()) {
            if (confirm('Khách "' + name + '" đã tồn tại. Chọn khách này?')) {
                selectCustomer(customers[i].id);
            }
            return;
        }
    }
    addCustomer(name, '').then(function(newC) {
        if (newC && pendingCustomerCallback) {
            pendingCustomerCallback(newC);
            pendingCustomerCallback = null;
        }
        closeModal('customerSelectorModal');
        showToast('✅ Đã tạo khách ' + name, 'success');
        renderCustomerList();
    });
}

// Export global
window.showCustomerDetail = showCustomerDetail;
window.openDebtPayment = openDebtPayment;
window.confirmDebtPayment = confirmDebtPayment;
window.selectCustomer = selectCustomer;
window.quickAddCustomer = quickAddCustomer;
window.addCustomerCredit = addCustomerCredit;
window.useCustomerCredit = useCustomerCredit;