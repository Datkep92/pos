// ========== POS.JS - NHÂN VIÊN BÁN HÀNG ==========
// Tương thích iOS 12, Android 6

// ========== BIẾN TOÀN CỤC ==========
let currentTab = 'tables';
let tempOrder = [];
let selectedCustomer = null;
let currentHistoryDate = new Date();
let currentReportDate = new Date();
let costCategories = [];
let costTransactions = [];
let menuItems = [];
let menuCategories = [];
let ingredients = [];
let customers = [];

// ========== KHỞI TẠO ==========
document.addEventListener('DOMContentLoaded', async function() {
    await DB.init();
    await loadData();
    initEventListeners();
    renderCurrentTime();
    setInterval(renderCurrentTime, 1000);
    showToast('📱 POS sẵn sàng', 'success');
});

async function loadData() {
    menuItems = await DB.getAll('menu') || [];
    menuCategories = await DB.getAll('menu_categories') || [];
    ingredients = await DB.getAll('ingredients') || [];
    customers = await DB.getAll('customers') || [];
    costCategories = await DB.getAll('cost_categories') || [];
    costTransactions = await DB.getAll('cost_transactions') || [];
    
    window.menuItems = menuItems;
    window.ingredients = ingredients;
    window.customers = customers;
    
    await renderTables();
    renderCustomerList();
    renderHistoryByDate(currentHistoryDate);
    renderReport(currentReportDate);
    
    // 👇 THÊM DÒNG NÀY
    await initRealtime();
}

function initEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => switchTab(btn.getAttribute('data-tab'));
    });
    
    // Create order button
    document.getElementById('createOrderBtn').onclick = openCreateOrderModal;
    document.getElementById('costBtn').onclick = openCostModal;
    
    // History controls
    document.getElementById('prevDayBtn').onclick = () => changeHistoryDate(-1);
    document.getElementById('nextDayBtn').onclick = () => changeHistoryDate(1);
    document.getElementById('historyFilter').onchange = () => renderHistoryByDate(currentHistoryDate);
    
    // Report controls
    document.getElementById('reportPrevDayBtn').onclick = () => changeReportDate(-1);
    document.getElementById('reportNextDayBtn').onclick = () => changeReportDate(1);
    
    // Quick add customer
    document.getElementById('quickAddCustomerBtn').onclick = quickAddCustomer;
    
    // Save cost
    document.getElementById('saveCostBtn').onclick = saveExpense;
    
    // Create customer from selector
    document.getElementById('createCustomerFromSelectorBtn').onclick = createCustomerFromInput;
    
    // Debt payment confirm
    document.getElementById('confirmDebtPaymentBtn').onclick = confirmDebtPayment;
}

function switchTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === tabId + 'View');
    });
}

// ========== THỜI GIAN ==========
function renderCurrentTime() {
    const now = new Date();
    const timeEl = document.getElementById('currentTime');
    if (timeEl) {
        timeEl.innerText = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }
}

// ========== UTILS ==========
function formatMoney(amount) {
    return (amount || 0).toLocaleString('vi-VN') + 'đ';
}

function showToast(message, type) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ========== BÀN (TABLES) ==========
async function renderTables() {
    const tables = await DB.getAll('tables');
    const activeTables = tables.filter(t => 
        (t.items && t.items.length > 0) || (t.total > 0) || t.status === 'debt'
    );
    
    const grid = document.getElementById('tablesGrid');
    if (!grid) return;
    
    if (activeTables.length === 0) {
        grid.innerHTML = '<div class="empty-state">🍽️ Không có bàn đang phục vụ</div>';
        return;
    }
    
    grid.innerHTML = activeTables.map(table => {
        const itemCount = (table.items || []).reduce((s, i) => s + (i.qty || 0), 0);
        const total = table.total || 0;
        let timeDisplay = table.time || '--:--';
        if (table.startTime) {
            const start = new Date(table.startTime);
            const diffMins = Math.floor((Date.now() - start) / 60000);
            timeDisplay = `${diffMins}p`;
        }
        return `
            <div class="table-card" onclick="showTableDetail('${table.id}')">
                <div class="table-header">
                    <span class="table-name">🪑 ${escapeHtml(table.name)}${table.customerName ? ` (${escapeHtml(table.customerName)})` : ''}</span>
                    <span class="table-time">⏱️ ${timeDisplay}</span>
                </div>
                <div class="table-stats">
                    <span class="table-item-count">📦 ${itemCount} món</span>
                    <span class="table-total">${formatMoney(total)}</span>
                </div>
                <div class="table-actions">
                    <div class="table-action" onclick="event.stopPropagation(); openAddMenuForTable('${table.id}')">➕ Thêm</div>
                    <div class="table-action" onclick="event.stopPropagation(); showTablePayment('${table.id}')">💸 TT</div>
                </div>
            </div>
        `;
    }).join('');
}

async function showTableDetail(tableId) {
    window._currentDetailTableId = tableId;
    const table = await DB.get('tables', String(tableId));
    if (!table) return;
    
    document.getElementById('detailTableName').innerHTML = `🪑 ${escapeHtml(table.name)}${table.customerName ? ` (${escapeHtml(table.customerName)})` : ''}`;
    
    let itemsHtml = '';
    let totalItems = 0;
    let totalAmount = 0;
    
    if (table.items && table.items.length) {
        itemsHtml = table.items.map((item, idx) => {
            totalItems += item.qty;
            totalAmount += item.price * item.qty;
            return `
                <div class="cart-item">
                    <span>${escapeHtml(item.name)} x${item.qty}</span>
                    <span>${formatMoney(item.price * item.qty)}</span>
                </div>
            `;
        }).join('');
    } else {
        itemsHtml = '<div class="empty-state">✨ Chưa có món</div>';
    }
    
    document.getElementById('detailItems').innerHTML = itemsHtml;
    document.getElementById('detailSummary').innerHTML = `
        <div class="cart-total">Tổng: ${formatMoney(totalAmount)}</div>
    `;
    document.getElementById('detailActions').innerHTML = `
        <div class="cart-actions">
            <button class="cart-action-btn cash" onclick="paymentAtTable('${table.id}', 'cash', null)">💰 Tiền mặt</button>
            <button class="cart-action-btn transfer" onclick="paymentAtTable('${table.id}', 'transfer', null)">💳 Chuyển khoản</button>
            <button class="cart-action-btn debt" onclick="debtAtTable('${table.id}')">💢 Ghi nợ</button>
            <button class="cart-action-btn" style="background:#f1f5f9;" onclick="openAddMenuForTable('${table.id}'); closeModal('tableDetailModal')">➕ Thêm món</button>
        </div>
    `;
    
    document.getElementById('tableDetailModal').style.display = 'flex';
}

async function paymentAtTable(tableId, method, customer) {
    const table = await DB.get('tables', String(tableId));
    if (!table || !table.items || table.items.length === 0) {
        showToast('Không có món để thanh toán!', 'warning');
        return;
    }
    await processPayment('dinein', method, table.items, table.total, customer, table.name);
    await DB.remove('tables', String(tableId));
    await renderTables();
    closeModal('tableDetailModal');
}

async function debtAtTable(tableId) {
    const table = await DB.get('tables', String(tableId));
    if (!table || !table.items || table.items.length === 0) {
        showToast('Không có món để ghi nợ!', 'warning');
        return;
    }
    
    showCustomerSelector(async (customer) => {
        const total = table.total;
        const items = table.items;
        const note = `Mua tại ${table.name} - ${items.map(i => `${i.name} x${i.qty}`).join(', ')}`;
        
        await addCustomerDebt(customer.id, total, note);
        await deductIngredients(items);
        await DB.remove('tables', String(tableId));
        await renderTables();
        showToast(`💰 Đã ghi nợ ${formatMoney(total)} cho ${customer.name}`, 'success');
        closeModal('tableDetailModal');
    });
}

async function openAddMenuForTable(tableId) {
    window._currentTableId = tableId;
    tempOrder = [];
    selectedCustomer = null;
    renderOrderCategories();
    renderMenuByCategory('all');
    renderCart();
    document.getElementById('orderModal').style.display = 'flex';
}

// ========== TẠO ĐƠN (ORDER FLOW) ==========
function openCreateOrderModal() {
    tempOrder = [];
    selectedCustomer = null;
    window._currentTableId = null;
    renderOrderCategories();
    renderMenuByCategory('all');
    renderCart();
    document.getElementById('orderModal').style.display = 'flex';
}

function renderOrderCategories() {
    const container = document.getElementById('orderCategories');
    if (!container) return;
    
    let html = '<div class="category-chip active" data-cat="all" onclick="renderMenuByCategory(\'all\')">📋 Tất cả</div>';
    menuCategories.forEach(cat => {
        html += `<div class="category-chip" data-cat="${cat.id}" onclick="renderMenuByCategory('${cat.id}')">${cat.icon || '📌'} ${escapeHtml(cat.name)}</div>`;
    });
    container.innerHTML = html;
}

function renderMenuByCategory(categoryId) {
    window._currentMenuCategory = categoryId;
    let items = menuItems;
    if (categoryId !== 'all') {
        items = menuItems.filter(i => i.categoryId == categoryId);
    }
    
    const container = document.getElementById('menuGrid');
    if (!container) return;
    
    if (items.length === 0) {
        container.innerHTML = '<div class="empty-state">📭 Không có món</div>';
        return;
    }
    
    container.innerHTML = items.map(item => {
        const price = item.hasVariants && item.variants && item.variants[0] ? item.variants[0].price : (item.price || 0);
        return `
            <div class="menu-item" onclick="addToCart('${item.id}', '${escapeHtml(item.name)}', ${price})">
                <div class="menu-item-name">${escapeHtml(item.name)}</div>
                <div class="menu-item-price">${formatMoney(price)}</div>
            </div>
        `;
    }).join('');
    
    // Cập nhật active state cho category chip
    document.querySelectorAll('#orderCategories .category-chip').forEach(chip => {
        const chipCat = chip.getAttribute('data-cat');
        if ((categoryId === 'all' && chipCat === 'all') || chipCat == categoryId) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });
}

function addToCart(id, name, price) {
    const existing = tempOrder.find(i => i.id === id);
    if (existing) {
        existing.qty++;
    } else {
        tempOrder.push({ id: id, name: name, price: price, qty: 1 });
    }
    renderCart();
}

function removeFromCart(index) {
    tempOrder.splice(index, 1);
    renderCart();
}

function updateCartQty(index, delta) {
    const item = tempOrder[index];
    if (item) {
        item.qty += delta;
        if (item.qty <= 0) {
            tempOrder.splice(index, 1);
        }
        renderCart();
    }
}

function renderCart() {
    const container = document.getElementById('cartItems');
    const totalSpan = document.getElementById('cartTotal');
    const actionsDiv = document.getElementById('cartActions');
    
    if (!container) return;
    
    if (tempOrder.length === 0) {
        container.innerHTML = '<div class="empty-state">🛒 Chưa có món</div>';
        totalSpan.innerText = 'Tổng: 0đ';
        if (actionsDiv) actionsDiv.innerHTML = '';
        return;
    }
    
    let total = 0;
    let itemsHtml = '';
    tempOrder.forEach((item, idx) => {
        const itemTotal = item.price * item.qty;
        total += itemTotal;
        itemsHtml += `
            <div class="cart-item">
                <span>${escapeHtml(item.name)} x${item.qty}</span>
                <div>
                    <span style="margin-right:8px;">${formatMoney(itemTotal)}</span>
                    <button onclick="updateCartQty(${idx}, -1)" style="background:none; border:none; font-size:16px;">➖</button>
                    <button onclick="updateCartQty(${idx}, 1)" style="background:none; border:none; font-size:16px;">➕</button>
                    <button onclick="removeFromCart(${idx})" style="background:none; border:none; color:red;">✖</button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = itemsHtml;
    totalSpan.innerText = `Tổng: ${formatMoney(total)}`;
    
    // 5 nút xử lý đơn hàng
    actionsDiv.innerHTML = `
        <button class="cart-action-btn table" onclick="handleOrderCreateTable()">🍽️ Tại bàn</button>
        <button class="cart-action-btn cash" onclick="handleOrderPayment('cash')">💰 TM mặt</button>
        <button class="cart-action-btn transfer" onclick="handleOrderPayment('transfer')">💳 CK khoản</button>
        <button class="cart-action-btn grab" onclick="handleOrderGrab()">🚕 Grab</button>
        <button class="cart-action-btn debt" onclick="handleOrderDebt()">💢 Ghi nợ</button>
    `;
}

async function handleOrderCreateTable() {
    if (tempOrder.length === 0) {
        showToast('Vui lòng chọn món!', 'warning');
        return;
    }
    
    // Kiểm tra tồn kho
    if (!await checkStock(tempOrder)) return;
    
    // Tạo bàn mới
    const tables = await DB.getAll('tables');
    let maxNumber = 0;
    tables.forEach(t => {
        const match = t.name.match(/Bàn (\d+)/);
        if (match) maxNumber = Math.max(maxNumber, parseInt(match[1]));
    });
    const newNumber = maxNumber + 1;
    if (newNumber > 99) {
        showToast('Đã đạt giới hạn 99 bàn!', 'warning');
        return;
    }
    
    const newTableId = Date.now().toString();
    const now = new Date();
    const newTable = {
        id: newTableId,
        name: `Bàn ${newNumber}`,
        status: 'occupied',
        time: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        startTime: now.toISOString(),
        items: tempOrder.map(item => ({ ...item, addedTime: now.toISOString() })),
        total: tempOrder.reduce((s, i) => s + i.price * i.qty, 0),
        customerId: selectedCustomer?.id || null,
        customerName: selectedCustomer?.name || null
    };
    
    await DB.create('tables', newTable, newTableId);
    await deductIngredients(tempOrder);
    
    showToast(`✅ Đã tạo bàn ${newTable.name}`, 'success');
    tempOrder = [];
    selectedCustomer = null;
    closeModal('orderModal');
    await renderTables();
}

async function handleOrderPayment(method) {
    if (tempOrder.length === 0) {
        showToast('Vui lòng chọn món!', 'warning');
        return;
    }
    const total = tempOrder.reduce((s, i) => s + i.price * i.qty, 0);
    await processPayment('takeaway', method, tempOrder, total, selectedCustomer, 'Mang đi');
    tempOrder = [];
    selectedCustomer = null;
    closeModal('orderModal');
}

async function handleOrderGrab() {
    if (tempOrder.length === 0) {
        showToast('Vui lòng chọn món!', 'warning');
        return;
    }
    const total = tempOrder.reduce((s, i) => s + i.price * i.qty, 0);
    await processPayment('grab', 'grab', tempOrder, total, null, 'Grab');
    tempOrder = [];
    selectedCustomer = null;
    closeModal('orderModal');
}

async function handleOrderDebt() {
    if (tempOrder.length === 0) {
        showToast('Vui lòng chọn món!', 'warning');
        return;
    }
    showCustomerSelector(async (customer) => {
        const total = tempOrder.reduce((s, i) => s + i.price * i.qty, 0);
        const note = `Mua hàng - ${tempOrder.map(i => `${i.name} x${i.qty}`).join(', ')}`;
        
        if (!await checkStock(tempOrder)) return;
        await addCustomerDebt(customer.id, total, note);
        await deductIngredients(tempOrder);
        
        await addHistory({
            type: 'debt_payment',
            amount: total,
            paymentMethod: 'debt',
            items: tempOrder.slice(),
            customer: { id: customer.id, name: customer.name },
            note: note
        });
        
        showToast(`💰 Đã ghi nợ ${formatMoney(total)} cho ${customer.name}`, 'success');
        tempOrder = [];
        selectedCustomer = null;
        closeModal('orderModal');
    });
}

// ========== THANH TOÁN (PROCESS PAYMENT) ==========
async function processPayment(type, method, items, amount, customer, tableName) {
    // Kiểm tra tồn kho
    if (!await checkStock(items)) return false;
    
    // Trừ nguyên liệu
    await deductIngredients(items);
    
    // Ghi giao dịch
    await addHistory({
        type: type,
        amount: amount,
        paymentMethod: method,
        items: items,
        customer: customer,
        tableName: tableName,
        note: customer ? `KH: ${customer.name}` : ''
    });
    
    showToast(`✅ ${formatMoney(amount)} - ${method === 'cash' ? 'Tiền mặt' : method === 'transfer' ? 'Chuyển khoản' : 'Grab'}`, 'success');
    
    // Refresh UI
    await renderTables();
    renderCustomerList();
    renderHistoryByDate(currentHistoryDate);
    renderReport(currentReportDate);
    
    return true;
}

// ========== KIỂM TRA & TRỪ NGUYÊN LIỆU ==========
async function checkStock(items) {
    for (const orderItem of items) {
        const menuItem = menuItems.find(m => m.id === orderItem.id);
        if (menuItem && menuItem.ingredients) {
            for (const req of menuItem.ingredients) {
                const ing = ingredients.find(i => i.id === req.ingredientId);
                if (ing) {
                    const needed = (req.quantity || 0) * orderItem.qty;
                    if (ing.stock < needed) {
                        showToast(`⚠️ Nguyên liệu "${ing.name}" không đủ cho món ${orderItem.name}`, 'error');
                        return false;
                    }
                }
            }
        }
    }
    return true;
}

async function deductIngredients(items) {
    for (const orderItem of items) {
        const menuItem = menuItems.find(m => m.id === orderItem.id);
        if (menuItem && menuItem.ingredients) {
            for (const req of menuItem.ingredients) {
                const ing = ingredients.find(i => i.id === req.ingredientId);
                if (ing) {
                    ing.stock -= (req.quantity || 0) * orderItem.qty;
                    if (ing.stock < 0) ing.stock = 0;
                    await DB.update('ingredients', ing.id, { stock: ing.stock });
                }
            }
        }
    }
    window.ingredients = ingredients;
}

// ========== LỊCH SỬ GIAO DỊCH ==========
async function addHistory(transaction) {
    const newTrans = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        dateKey: new Date().toISOString().slice(0, 10),
        type: transaction.type,
        amount: transaction.amount,
        paymentMethod: transaction.paymentMethod,
        items: transaction.items || [],
        customer: transaction.customer || null,
        tableName: transaction.tableName || null,
        note: transaction.note || '',
        refunded: false,
        refundReason: null,
        refundedAt: null
    };
    await DB.create('transactions', newTrans);
}

async function renderHistoryByDate(dateObj) {
    const dateStr = dateObj.toISOString().slice(0, 10);
    document.getElementById('historyDate').innerText = formatDateDisplay(dateStr);
    
    let transactions = await DB.getTransactionsByDate(dateStr);
    const filter = document.getElementById('historyFilter').value;
    
    if (filter !== 'all') {
        if (filter === 'cash') transactions = transactions.filter(t => t.paymentMethod === 'cash');
        else if (filter === 'transfer') transactions = transactions.filter(t => t.paymentMethod === 'transfer');
        else if (filter === 'debt_payment') transactions = transactions.filter(t => t.type === 'debt_payment');
        else transactions = transactions.filter(t => t.type === filter);
    }
    
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const container = document.getElementById('historyList');
    if (!container) return;
    
    if (transactions.length === 0) {
        container.innerHTML = '<div class="empty-state">📭 Không có giao dịch</div>';
        return;
    }
    
    container.innerHTML = transactions.map(tx => {
        const timeStr = new Date(tx.date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const typeIcon = tx.type === 'dinein' ? '🍽️' : tx.type === 'takeaway' ? '🛵' : tx.type === 'grab' ? '🚕' : '💰';
        const typeName = tx.type === 'dinein' ? 'Tại chỗ' : tx.type === 'takeaway' ? 'Mang đi' : tx.type === 'grab' ? 'Grab' : 'Thanh toán nợ';
        const isRefunded = tx.refunded === true;
        
        return `
            <div class="history-item ${tx.type}">
                <div class="history-header">
                    <span class="history-time">${timeStr} - ${typeIcon} ${typeName}</span>
                    <span class="history-amount">${formatMoney(tx.amount)}</span>
                </div>
                <div class="history-info">
                    ${tx.tableName ? `<span>🪑 ${tx.tableName}</span>` : ''}
                    ${tx.customer ? `<span>👤 ${escapeHtml(tx.customer.name)}</span>` : ''}
                    ${!isRefunded ? `<button class="btn-refund" onclick="refundTransaction('${tx.id}')">🔄 Hủy</button>` : '<span style="color:#999;">✅ Đã hủy</span>'}
                </div>
                ${tx.note ? `<div style="font-size:11px; color:#888;">📝 ${escapeHtml(tx.note)}</div>` : ''}
            </div>
        `;
    }).join('');
}

async function refundTransaction(transactionId) {
    const reason = prompt('📝 Nhập lý do hủy giao dịch:', 'Khách yêu cầu hoàn tiền');
    if (!reason) return;
    
    if (!confirm('Bạn có chắc chắn muốn HỦY giao dịch này? Nguyên liệu sẽ được hoàn trả.')) return;
    
    const trans = await DB.get('transactions', transactionId);
    if (!trans || trans.refunded) {
        showToast('Giao dịch không tồn tại hoặc đã bị hủy!', 'error');
        return;
    }
    
    // Khôi phục nguyên liệu
    if (trans.items && trans.items.length) {
        for (const orderItem of trans.items) {
            const menuItem = menuItems.find(m => m.id === orderItem.id);
            if (menuItem && menuItem.ingredients) {
                for (const req of menuItem.ingredients) {
                    const ing = ingredients.find(i => i.id === req.ingredientId);
                    if (ing) {
                        ing.stock += (req.quantity || 0) * orderItem.qty;
                        await DB.update('ingredients', ing.id, { stock: ing.stock });
                    }
                }
            }
        }
    }
    
    // Xử lý công nợ nếu là debt_payment
    if (trans.type === 'debt_payment' && trans.customer) {
        await addCustomerDebt(trans.customer.id, trans.amount, `Hoàn tiền hủy giao dịch - ${reason}`);
    }
    
    // Đánh dấu giao dịch đã hủy
    trans.refunded = true;
    trans.refundReason = reason;
    trans.refundedAt = Date.now();
    await DB.update('transactions', transactionId, trans);
    
    showToast(`✅ Đã hủy giao dịch ${formatMoney(trans.amount)}`, 'success');
    renderHistoryByDate(currentHistoryDate);
    renderReport(currentReportDate);
    window.ingredients = ingredients;
}

function changeHistoryDate(delta) {
    const newDate = new Date(currentHistoryDate);
    newDate.setDate(newDate.getDate() + delta);
    currentHistoryDate = newDate;
    renderHistoryByDate(currentHistoryDate);
}

// ========== BÁO CÁO ==========
async function renderReport(dateObj) {
    const dateStr = dateObj.toISOString().slice(0, 10);
    document.getElementById('reportDate').innerText = formatDateDisplay(dateStr);
    
    const transactions = await DB.getTransactionsByDate(dateStr);
    const activeTrans = transactions.filter(t => !t.refunded);
    
    let revenue = 0, dineinTotal = 0, takeawayTotal = 0, grabTotal = 0;
    let cashTotal = 0, transferTotal = 0;
    let dineinCount = 0, takeawayCount = 0, grabCount = 0;
    
    for (const tx of activeTrans) {
        revenue += tx.amount;
        if (tx.type === 'dinein') { dineinTotal += tx.amount; dineinCount++; }
        else if (tx.type === 'takeaway') { takeawayTotal += tx.amount; takeawayCount++; }
        else if (tx.type === 'grab') { grabTotal += tx.amount; grabCount++; }
        
        if (tx.paymentMethod === 'cash') cashTotal += tx.amount;
        else if (tx.paymentMethod === 'transfer') transferTotal += tx.amount;
    }
    
    const container = document.getElementById('reportStats');
    if (!container) return;
    
    container.innerHTML = `
        <div class="stat-card">
            <div class="stat-row"><span class="stat-label">💰 Tổng doanh thu</span><span class="stat-value primary">${formatMoney(revenue)}</span></div>
            <div class="stat-row"><span class="stat-label">🍽️ Tại chỗ (${dineinCount} đơn)</span><span class="stat-value">${formatMoney(dineinTotal)}</span></div>
            <div class="stat-row"><span class="stat-label">🛵 Mang đi (${takeawayCount} đơn)</span><span class="stat-value">${formatMoney(takeawayTotal)}</span></div>
            <div class="stat-row"><span class="stat-label">🚕 Grab (${grabCount} đơn)</span><span class="stat-value">${formatMoney(grabTotal)}</span></div>
        </div>
        <div class="stat-card">
            <div class="stat-row"><span class="stat-label">💰 Tiền mặt</span><span class="stat-value success">${formatMoney(cashTotal)}</span></div>
            <div class="stat-row"><span class="stat-label">💳 Chuyển khoản</span><span class="stat-value info">${formatMoney(transferTotal)}</span></div>
        </div>
    `;
}

function changeReportDate(delta) {
    const newDate = new Date(currentReportDate);
    newDate.setDate(newDate.getDate() + delta);
    currentReportDate = newDate;
    renderReport(currentReportDate);
}

// ========== KHÁCH HÀNG ==========
async function renderCustomerList() {
    customers = await DB.getAll('customers') || [];
    const container = document.getElementById('customerList');
    if (!container) return;
    
    const keyword = document.getElementById('customerSearchInput')?.value.toLowerCase() || '';
    let filtered = customers;
    if (keyword) {
        filtered = customers.filter(c => c.name.toLowerCase().includes(keyword) || (c.phone && c.phone.includes(keyword)));
    }
    
    const totalDebt = filtered.reduce((s, c) => s + (c.totalDebt || 0), 0);
    document.getElementById('totalDebtAmount').innerText = formatMoney(totalDebt);
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">📭 Không có khách hàng</div>';
        return;
    }
    
    container.innerHTML = filtered.map(c => {
        const debt = c.totalDebt || 0;
        return `
            <div class="customer-card" onclick="showCustomerDetail('${c.id}')">
                <div class="customer-avatar">${c.name.charAt(0).toUpperCase()}</div>
                <div class="customer-info">
                    <div class="customer-name">${escapeHtml(c.name)}</div>
                    <div class="customer-phone">📞 ${c.phone || 'Chưa có'}</div>
                </div>
                <div class="customer-debt">${debt > 0 ? formatMoney(debt) : '✅'}</div>
            </div>
        `;
    }).join('');
}

async function quickAddCustomer() {
    const name = prompt('👤 Nhập tên khách hàng:');
    if (!name) return;
    
    const existing = customers.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
        showToast(`Khách "${name}" đã tồn tại!`, 'warning');
        return;
    }
    
    await addCustomer(name, '');
    document.getElementById('customerSearchInput').value = '';
    await renderCustomerList();
    showToast(`✅ Đã thêm khách ${name}`, 'success');
}

async function addCustomer(name, phone) {
    const newId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    const newCustomer = {
        id: newId,
        name: name.trim(),
        phone: phone || '',
        address: '',
        totalDebt: 0,
        totalSpent: 0,
        createdAt: new Date().toISOString(),
        debtHistory: [],
        paymentHistory: []
    };
    await DB.create('customers', newCustomer);
    customers.push(newCustomer);
    return newCustomer;
}

async function showCustomerDetail(customerId) {
    const c = customers.find(c => c.id === customerId);
    if (!c) return;
    
    const totalDebt = c.totalDebt || 0;
    const debtHistory = c.debtHistory || [];
    const paymentHistory = c.paymentHistory || [];
    
    let historyHtml = '';
    [...debtHistory, ...paymentHistory]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach(h => {
            const isDebt = h.amount > 0 && !h.method;
            historyHtml += `
                <div class="cart-item">
                    <span>${new Date(h.date).toLocaleString('vi-VN')}</span>
                    <span style="color:${isDebt ? 'var(--danger)' : 'var(--success)'}">${isDebt ? '-' : '+'}${formatMoney(h.amount)}</span>
                </div>
                <div style="font-size:11px; color:#888; margin-bottom:8px;">📝 ${escapeHtml(h.note || '')}</div>
            `;
        });
    
    const container = document.getElementById('customerDetailContent');
    if (!container) return;
    
    container.innerHTML = `
        <div class="debt-summary" style="margin-bottom:16px;">
            <span>💰 Công nợ</span>
            <span style="color:var(--danger); font-size:20px;">${formatMoney(totalDebt)}</span>
        </div>
        ${totalDebt > 0 ? `<button class="btn-save" onclick="openDebtPayment('${c.id}', ${totalDebt})" style="margin-bottom:16px;">💸 Thanh toán nợ</button>` : ''}
        <div class="cost-history-title">📜 Lịch sử giao dịch</div>
        <div class="cost-list">${historyHtml || '<div class="empty-state">Chưa có giao dịch</div>'}</div>
    `;
    
    document.getElementById('customerDetailModal').style.display = 'flex';
}

function openDebtPayment(customerId, currentDebt) {
    document.getElementById('debtPaymentInfo').innerHTML = `💰 Khách: ${customers.find(c => c.id === customerId)?.name}<br>💢 Nợ hiện tại: ${formatMoney(currentDebt)}`;
    document.getElementById('debtPaymentAmount').value = currentDebt;
    document.getElementById('debtPaymentModal').style.display = 'flex';
    window._currentDebtCustomerId = customerId;
}

async function confirmDebtPayment() {
    const customerId = window._currentDebtCustomerId;
    const amount = parseInt(document.getElementById('debtPaymentAmount').value) || 0;
    if (amount <= 0) {
        showToast('Số tiền không hợp lệ!', 'warning');
        return;
    }
    
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    const newTotal = (customer.totalDebt || 0) - amount;
    const paymentAmount = Math.min(amount, customer.totalDebt || 0);
    
    customer.totalDebt = Math.max(0, newTotal);
    customer.paymentHistory = customer.paymentHistory || [];
    customer.paymentHistory.unshift({
        id: Date.now(),
        date: new Date().toISOString(),
        amount: paymentAmount,
        method: 'cash',
        note: `Thanh toán nợ ${formatMoney(paymentAmount)}`
    });
    
    await DB.update('customers', customerId, { totalDebt: customer.totalDebt, paymentHistory: customer.paymentHistory });
    
    await addHistory({
        type: 'debt_payment',
        amount: paymentAmount,
        paymentMethod: 'cash',
        customer: { id: customer.id, name: customer.name },
        note: `Thanh toán nợ`
    });
    
    customers = await DB.getAll('customers');
    showToast(`✅ Đã thanh toán ${formatMoney(paymentAmount)} cho ${customer.name}`, 'success');
    closeModal('debtPaymentModal');
    renderCustomerList();
    showCustomerDetail(customerId);
}

async function addCustomerDebt(customerId, amount, note) {
    let customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    customer.totalDebt = (customer.totalDebt || 0) + amount;
    customer.debtHistory = customer.debtHistory || [];
    customer.debtHistory.unshift({
        id: Date.now(),
        date: new Date().toISOString(),
        amount: amount,
        note: note,
        status: 'unpaid'
    });
    
    await DB.update('customers', customerId, { totalDebt: customer.totalDebt, debtHistory: customer.debtHistory });
    customers = await DB.getAll('customers');
}

// ========== CHỌN KHÁCH HÀNG (SELECTOR) ==========
let pendingCustomerCallback = null;

function showCustomerSelector(callback) {
    pendingCustomerCallback = callback;
    renderCustomerSelectorList('');
    document.getElementById('customerSelectorSearch').value = '';
    document.getElementById('customerSelectorModal').style.display = 'flex';
    
    const searchInput = document.getElementById('customerSelectorSearch');
    searchInput.oninput = function() {
        renderCustomerSelectorList(this.value);
    };
}

function renderCustomerSelectorList(searchTerm) {
    let filtered = customers;
    if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        filtered = customers.filter(c => c.name.toLowerCase().includes(lower) || (c.phone && c.phone.includes(searchTerm)));
    }
    
    const container = document.getElementById('customerSelectorList');
    if (!container) return;
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">📭 Không tìm thấy khách</div>';
        return;
    }
    
    container.innerHTML = filtered.map(c => `
        <div class="customer-select-item" onclick="selectCustomer('${c.id}')">
            <div class="customer-avatar" style="width:36px; height:36px;">${c.name.charAt(0).toUpperCase()}</div>
            <div style="flex:1;">
                <div style="font-weight:600;">${escapeHtml(c.name)}</div>
                <div style="font-size:11px; color:#888;">${c.phone || ''} ${c.totalDebt > 0 ? `- Nợ: ${formatMoney(c.totalDebt)}` : ''}</div>
            </div>
        </div>
    `).join('');
}

function selectCustomer(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (customer && pendingCustomerCallback) {
        pendingCustomerCallback(customer);
        pendingCustomerCallback = null;
    }
    closeModal('customerSelectorModal');
}

async function createCustomerFromInput() {
    const name = document.getElementById('customerSelectorSearch').value.trim();
    if (!name) {
        showToast('Vui lòng nhập tên khách hàng!', 'warning');
        return;
    }
    
    const existing = customers.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
        if (confirm(`Khách "${existing.name}" đã tồn tại. Chọn khách này?`)) {
            selectCustomer(existing.id);
        }
        return;
    }
    
    const newCustomer = await addCustomer(name, '');
    if (newCustomer && pendingCustomerCallback) {
        pendingCustomerCallback(newCustomer);
        pendingCustomerCallback = null;
    }
    closeModal('customerSelectorModal');
    showToast(`✅ Đã tạo khách ${name}`, 'success');
    await renderCustomerList();
}

// ========== CHI PHÍ (COST) ==========
async function openCostModal() {
    costCategories = await DB.getAll('cost_categories') || [];
    costTransactions = await DB.getAll('cost_transactions') || [];
    
    document.getElementById('costName').value = '';
    document.getElementById('costAmount').value = '';
    
    renderCostCategoriesList();
    await renderTodayCosts();
    await renderMonthCostTotal();
    
    document.getElementById('costModal').style.display = 'flex';
}

function renderCostCategoriesList() {
    const container = document.getElementById('costCategoriesList');
    if (!container) return;
    
    if (costCategories.length === 0) {
        container.innerHTML = '<div class="empty-state">Chưa có danh mục</div>';
        return;
    }
    
    container.innerHTML = '<div class="cost-history-title">📦 Danh mục nhanh</div><div class="quick-money" style="flex-wrap:wrap;">' +
        costCategories.map(cat => `<button class="quick-money-btn" onclick="setCostName('${escapeHtml(cat.name)}')">${escapeHtml(cat.name)}</button>`).join('') +
        '</div>';
}

function setCostName(name) {
    document.getElementById('costName').value = name;
}

async function saveExpense() {
    const name = document.getElementById('costName').value.trim();
    const amount = parseInt(document.getElementById('costAmount').value) || 0;
    
    if (!name) {
        showToast('Vui lòng nhập tên chi phí!', 'warning');
        return;
    }
    if (amount <= 0) {
        showToast('Số tiền phải lớn hơn 0!', 'warning');
        return;
    }
    
    let category = costCategories.find(c => c.name === name);
    if (!category) {
        const newId = Date.now().toString();
        category = { id: newId, name: name, createdAt: Date.now() };
        await DB.create('cost_categories', category);
        costCategories.push(category);
    }
    
    const now = new Date();
    const data = {
        categoryId: category.id,
        categoryName: category.name,
        amount: amount,
        quantity: 1,
        date: now.toISOString(),
        dateKey: now.toISOString().slice(0, 10),
        createdAt: Date.now(),
        deleted: false
    };
    await DB.create('cost_transactions', data);
    
    costTransactions.push(data);
    showToast(`✅ Đã thêm chi phí ${formatMoney(amount)}`, 'success');
    
    document.getElementById('costName').value = '';
    document.getElementById('costAmount').value = '';
    await renderTodayCosts();
    await renderMonthCostTotal();
}

async function renderTodayCosts() {
    const container = document.getElementById('todayCostList');
    if (!container) return;
    
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayCosts = costTransactions.filter(tx => tx.dateKey === todayStr && !tx.deleted);
    
    if (todayCosts.length === 0) {
        container.innerHTML = '<div class="empty-text">📭 Chưa có chi phí hôm nay</div>';
        return;
    }
    
    let total = 0;
    let html = '';
    todayCosts.forEach(tx => {
        total += tx.amount;
        html += `<div class="cost-item"><span>${escapeHtml(tx.categoryName)}</span><span>${formatMoney(tx.amount)}</span></div>`;
    });
    html += `<div class="cost-total">Tổng: ${formatMoney(total)}</div>`;
    container.innerHTML = html;
}

async function renderMonthCostTotal() {
    const container = document.getElementById('monthCostTotal');
    if (!container) return;
    
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startStr = startDate.toISOString().slice(0, 10);
    const endStr = endDate.toISOString().slice(0, 10);
    
    let total = 0;
    costTransactions.forEach(tx => {
        if (!tx.deleted && tx.dateKey >= startStr && tx.dateKey <= endStr) {
            total += tx.amount;
        }
    });
    
    container.innerHTML = formatMoney(total);
}
// Thêm biến để lưu unsubscribe functions
let realtimeUnsubscribes = {};

// Gọi sau khi loadData xong
async function initRealtime() {
    // Subscribe tables
    DB.subscribe('tables', async (data) => {
        if (currentTab === 'tables') await renderTables();
        // Nếu đang xem chi tiết bàn, refresh
        const detailModal = document.getElementById('tableDetailModal');
        if (detailModal && detailModal.style.display === 'flex' && window._currentDetailTableId) {
            await showTableDetail(window._currentDetailTableId);
        }
    });
    
    // Subscribe customers
    DB.subscribe('customers', async (data) => {
        customers = data || [];
        window.customers = customers;
        if (currentTab === 'customers') await renderCustomerList();
        // Refresh selector nếu đang mở
        const selectorModal = document.getElementById('customerSelectorModal');
        if (selectorModal && selectorModal.style.display === 'flex') {
            const searchVal = document.getElementById('customerSelectorSearch')?.value || '';
            renderCustomerSelectorList(searchVal);
        }
    });
    
    // Subscribe menu (cho nhân viên thấy món mới ngay)
    DB.subscribe('menu', async (data) => {
        menuItems = data || [];
        window.menuItems = menuItems;
        const orderModal = document.getElementById('orderModal');
        if (orderModal && orderModal.style.display === 'flex') {
            renderMenuByCategory(window._currentMenuCategory || 'all');
        }
    });
    
    DB.subscribe('menu_categories', async (data) => {
        menuCategories = data || [];
        const orderModal = document.getElementById('orderModal');
        if (orderModal && orderModal.style.display === 'flex') {
            renderOrderCategories();
        }
    });
    
    // Subscribe ingredients (cập nhật tồn kho realtime)
    DB.subscribe('ingredients', async (data) => {
        ingredients = data || [];
        window.ingredients = ingredients;
    });
    
    // Subscribe transactions (cập nhật lịch sử và báo cáo realtime)
    DB.subscribe('transactions', async (data) => {
        if (currentTab === 'history') await renderHistoryByDate(currentHistoryDate);
        if (currentTab === 'report') await renderReport(currentReportDate);
        // Cập nhật tổng công nợ trên tab khách hàng
        if (currentTab === 'customers') {
            const totalDebt = customers.reduce((s, c) => s + (c.totalDebt || 0), 0);
            const totalEl = document.getElementById('totalDebtAmount');
            if (totalEl) totalEl.innerText = formatMoney(totalDebt);
        }
    });
    
    // Subscribe cost (cập nhật popup chi phí)
    DB.subscribe('cost_categories', async (data) => {
        costCategories = data || [];
        const costModal = document.getElementById('costModal');
        if (costModal && costModal.style.display === 'flex') {
            renderCostCategoriesList();
        }
    });
    
    DB.subscribe('cost_transactions', async (data) => {
        costTransactions = data || [];
        const costModal = document.getElementById('costModal');
        if (costModal && costModal.style.display === 'flex') {
            await renderTodayCosts();
            await renderMonthCostTotal();
        }
    });
}
// ========== HELPER ==========
function formatDateDisplay(dateStr) {
    const d = new Date(dateStr);
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
}

// Export global functions
window.showTableDetail = showTableDetail;
window.paymentAtTable = paymentAtTable;
window.debtAtTable = debtAtTable;
window.openAddMenuForTable = openAddMenuForTable;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateCartQty = updateCartQty;
window.handleOrderCreateTable = handleOrderCreateTable;
window.handleOrderPayment = handleOrderPayment;
window.handleOrderGrab = handleOrderGrab;
window.handleOrderDebt = handleOrderDebt;
window.renderMenuByCategory = renderMenuByCategory;
window.closeModal = closeModal;
window.refundTransaction = refundTransaction;
window.showCustomerDetail = showCustomerDetail;
window.openDebtPayment = openDebtPayment;
window.confirmDebtPayment = confirmDebtPayment;
window.selectCustomer = selectCustomer;
window.setCostName = setCostName;
window.quickAddCustomer = quickAddCustomer;