// ========== BIẾN TOÀN CỤC ==========
let currentContext = null;
let tempOrder = [];
let currentSelectedCustomer = null;
let currentTableView = 'dining';

// ========== UTILS ==========
function formatMoney(amount) {
    return (amount || 0).toLocaleString('vi-VN') + 'đ';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) { console.log(message); return; }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'} ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

function refreshCustomerList() {} // Giữ để tránh lỗi

async function renderTables() {
    console.log('🔄 renderTables called');
    const grid = document.getElementById('tablesGrid');
    if (!grid) return;
    let tables = await DB.getAll('tables');
    console.log('📊 Số bàn trong DB:', tables.length);
    let activeTables = tables.filter(t => (t.items && t.items.length > 0) || t.status === 'occupied' || t.status === 'debt');
    console.log('📊 Số bàn active:', activeTables.length);
    if (activeTables.length === 0) {
        grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🍽️</div><div>Không có bàn nào đang phục vụ</div><button class="btn-add-table" onclick="document.getElementById('floatNewtableBtn').click()">+ Tạo bàn mới</button></div>`;
        return;
    }
    grid.innerHTML = activeTables.map(table => {
        const itemCount = (table.items || []).reduce((s, i) => s + (i.qty || 0), 0);
        const total = table.total || 0;
        const displayName = table.customerName || table.name;
        const hasCustomer = !!table.customerName;
        
        let timeDisplay = table.time || '--:--';
        if (table.startTime) {
            const start = new Date(table.startTime);
            const startStr = start.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            const diffMins = Math.floor((Date.now() - start) / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const diffMinutes = diffMins % 60;
            timeDisplay = `${startStr} - ${diffHours > 0 ? `${diffHours}h${diffMinutes}p` : `${diffMins}p`}`;
        }
        const assignHandler = `showCustomerSelectorForTable('${table.id}')`;
        const detailHandler = `showTableDetail('${table.id}')`;
        return `
            <div class="table-card occupied" onclick="${detailHandler}">
                <div class="table-top-row">
                    <div class="table-name-section">
                        <span class="table-name" style="cursor:pointer;" onclick="event.stopPropagation(); ${assignHandler}">
                            ${hasCustomer ? '👤' : '🪑'} ${escapeHtml(displayName)}
                        </span>
                    </div>
                    <span class="table-time">⏱️ ${timeDisplay}</span>
                </div>
                <div class="table-stats">
                    <div class="table-item-count">📦 <span>${itemCount}</span> món</div>
                    <div class="table-total">${formatMoney(total)}</div>
                </div>
                <div class="table-icons">
                    <div class="table-icon-btn" onclick="event.stopPropagation(); openAddMenuForTable('${table.id}')">➕</div>
                    <div class="table-icon-btn" onclick="event.stopPropagation(); showPaymentMethod('dinein', '${table.id}', ${total})">💸</div>
                    <div class="table-icon-btn" onclick="event.stopPropagation(); debtTable('${table.id}')">💢</div>
                </div>
            </div>
        `;
    }).join('');
    const diningCount = document.getElementById('diningCount');
    if (diningCount) diningCount.innerText = activeTables.length;
}
async function showTableDetail(tableId) {
    const tid = String(tableId);
    let table = await DB.get('tables', tid);
    if (!table) {
        const all = await DB.getAll('tables');
        table = all.find(t => String(t.id) === tid);
    }
    if (!table) { showToast('Không tìm thấy bàn!', 'error'); return; }
    
    document.getElementById('detailTableName').innerHTML = `🪑 ${table.name}${table.customerName ? ` (${escapeHtml(table.customerName)})` : ''}`;
    document.getElementById('detailTime').innerText = table.time || '--:--';
    document.getElementById('detailTotal').innerHTML = formatMoney(table.total || 0);
    
    const itemsContainer = document.getElementById('detailItemsList');
    if (!table.items || table.items.length === 0) {
        itemsContainer.innerHTML = '<div style="padding:20px; text-align:center;">✨ Chưa có món</div>';
    } else {
        itemsContainer.innerHTML = table.items.map((item, idx) => `
            <div class="detail-item-row" data-item-idx="${idx}">
                <div style="flex:2;">
                    <strong>${escapeHtml(item.name)}</strong>
                    <div style="font-size:12px;">${formatMoney(item.price)}đ</div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button class="btn-qty" onclick="updateItemQuantity('${table.id}', ${idx}, -1)">-</button>
                    <span id="qty-${idx}" style="min-width: 30px; text-align:center;">${item.qty}</span>
                    <button class="btn-qty" onclick="updateItemQuantity('${table.id}', ${idx}, 1)">+</button>
                    <button class="btn-delete-item" onclick="deleteItemFromTable('${table.id}', ${idx})">🗑️</button>
                </div>
                <div style="min-width: 70px; text-align: right;">${formatMoney(item.price * item.qty)}</div>
            </div>
        `).join('');
    }
    
    currentContext = { type: 'detailView', tableId: table.id };
    document.getElementById('tableDetailModal').style.display = 'flex';
    
    // Gắn sự kiện cho nút "Thêm món"
    document.getElementById('detailAddItemBtn').onclick = () => {
        closeModal('tableDetailModal');
        openAddMenuForTable(table.id);
    };
    // Gắn sự kiện cho các nút khác
    document.getElementById('detailPayBtn').onclick = async () => {
        const tbl = await DB.get('tables', table.id);
        if (tbl && (tbl.total || 0) > 0) {
            closeModal('tableDetailModal');
            showPaymentMethod('dinein', table.id, tbl.total);
        } else showToast('Không có món để thanh toán!', 'warning');
    };
    document.getElementById('detailDebtBtn').onclick = () => {
        closeModal('tableDetailModal');
        debtTable(table.id);
    };
    document.getElementById('detailSplitBillBtn').onclick = () => {
        showSplitBillModal(table.id);
    };
    document.getElementById('detailTransferBtn').onclick = () => {
        showTransferTableModal(table.id);
    };
}

async function updateItemQuantity(tableId, itemIndex, delta) {
    const tid = String(tableId);
    let table = await DB.get('tables', tid);
    if (!table) return;
    const items = [...(table.items || [])];
    if (itemIndex < 0 || itemIndex >= items.length) return;
    const newQty = items[itemIndex].qty + delta;
    if (newQty <= 0) {
        items.splice(itemIndex, 1);
    } else {
        items[itemIndex].qty = newQty;
    }
    const newTotal = items.reduce((sum, i) => sum + (i.price * i.qty), 0);
    await DB.update('tables', tid, { items: items, total: newTotal });
    await showTableDetail(tid);
    await renderTables();
    showToast('Đã cập nhật món', 'success');
}

async function deleteItemFromTable(tableId, itemIndex) {
    if (confirm('Xóa món này?')) {
        await updateItemQuantity(tableId, itemIndex, -999);
    }
}

async function showTransferTableModal(tableId) {
    const tid = String(tableId);
    const sourceTable = await DB.get('tables', tid);
    if (!sourceTable || !sourceTable.items || sourceTable.items.length === 0) {
        showToast('Bàn không có món để chuyển', 'warning');
        return;
    }
    
    let allTables = await DB.getAll('tables');
    const otherTables = allTables.filter(t => String(t.id) !== tid);
    const targetSelect = document.getElementById('targetTableSelect');
    targetSelect.innerHTML = '<option value="">-- Chọn bàn đích --</option>' + 
        otherTables.map(t => `<option value="${t.id}">${escapeHtml(t.name)}${t.customerName ? ` (${escapeHtml(t.customerName)})` : ''}</option>`).join('');
    
    const transferItemsDiv = document.getElementById('transferItemsList');
    transferItemsDiv.innerHTML = sourceTable.items.map((item, idx) => `
        <div class="transfer-item-row">
            <input type="checkbox" data-item-idx="${idx}" data-item-name="${item.name}" data-item-price="${item.price}" data-item-qty="${item.qty}" class="transfer-checkbox">
            <span><strong>${escapeHtml(item.name)}</strong> x${item.qty} - ${formatMoney(item.price * item.qty)}</span>
        </div>
    `).join('');
    
    document.getElementById('transferTableModal').style.display = 'flex';
    
    document.getElementById('confirmTransferBtn').onclick = async () => {
        const targetId = targetSelect.value;
        if (!targetId) {
            showToast('Vui lòng chọn bàn đích', 'warning');
            return;
        }
        const checkboxes = document.querySelectorAll('#transferItemsList .transfer-checkbox:checked');
        if (checkboxes.length === 0) {
            showToast('Chọn ít nhất một món để chuyển', 'warning');
            return;
        }
        const selectedItems = [];
        for (let cb of checkboxes) {
            const idx = parseInt(cb.dataset.itemIdx);
            const item = sourceTable.items[idx];
            selectedItems.push({ ...item });
        }
        // Xóa khỏi bàn nguồn
        let remainingItems = sourceTable.items.filter((_, idx) => !checkboxes.some(cb => parseInt(cb.dataset.itemIdx) === idx));
        const newSourceTotal = remainingItems.reduce((s, i) => s + (i.price * i.qty), 0);
        await DB.update('tables', tid, { items: remainingItems, total: newSourceTotal });
        // Thêm vào bàn đích
        const targetTable = await DB.get('tables', targetId);
        let targetItems = targetTable.items || [];
        for (let newItem of selectedItems) {
            const existing = targetItems.find(i => i.name === newItem.name);
            if (existing) existing.qty += newItem.qty;
            else targetItems.push(newItem);
        }
        const newTargetTotal = targetItems.reduce((s, i) => s + (i.price * i.qty), 0);
        await DB.update('tables', targetId, { items: targetItems, total: newTargetTotal, status: 'occupied' });
        
        showToast(`Đã chuyển ${selectedItems.length} món sang bàn ${targetTable.name}`, 'success');
        closeModal('transferTableModal');
        await renderTables();
        if (document.getElementById('tableDetailModal').style.display === 'flex') {
            await showTableDetail(tid);
        }
    };
}

async function showSplitBillModal(tableId) {
    const tid = String(tableId);
    const table = await DB.get('tables', tid);
    if (!table || !table.items || table.items.length === 0) {
        showToast('Không có món để chia', 'warning');
        return;
    }
    const splitContainer = document.getElementById('splitItemsList');
    splitContainer.innerHTML = table.items.map((item, idx) => `
        <div class="split-item-row">
            <input type="checkbox" data-item-idx="${idx}" data-item-price="${item.price}" data-item-qty="${item.qty}" class="split-checkbox" onchange="updateSplitTotal()">
            <span><strong>${escapeHtml(item.name)}</strong> x${item.qty} - ${formatMoney(item.price * item.qty)}</span>
            <input type="number" data-item-idx="${idx}" class="split-qty-input" placeholder="SL" value="${item.qty}" min="1" max="${item.qty}" onchange="updateSplitTotal()" style="width:70px;">
        </div>
    `).join('');
    updateSplitTotal();
    document.getElementById('splitBillModal').style.display = 'flex';
    
    document.getElementById('confirmSplitBtn').onclick = async () => {
        const checkboxes = document.querySelectorAll('#splitItemsList .split-checkbox:checked');
        if (checkboxes.length === 0) {
            showToast('Chọn ít nhất một món để thanh toán', 'warning');
            return;
        }
        let splitItems = [];
        let originalItems = [...table.items];
        for (let cb of checkboxes) {
            const idx = parseInt(cb.dataset.itemIdx);
            const originalItem = originalItems[idx];
            const qtyInput = document.querySelector(`.split-qty-input[data-item-idx="${idx}"]`);
            let splitQty = qtyInput ? parseInt(qtyInput.value) : originalItem.qty;
            if (isNaN(splitQty)) splitQty = originalItem.qty;
            if (splitQty > originalItem.qty) splitQty = originalItem.qty;
            if (splitQty <= 0) continue;
            splitItems.push({
                name: originalItem.name,
                price: originalItem.price,
                qty: splitQty
            });
            originalItems[idx].qty -= splitQty;
        }
        const remainingItems = originalItems.filter(i => i.qty > 0);
        const newTotal = remainingItems.reduce((s, i) => s + (i.price * i.qty), 0);
        await DB.update('tables', tid, { items: remainingItems, total: newTotal });
        
        const splitTotal = splitItems.reduce((s, i) => s + (i.price * i.qty), 0);
        await processPaymentDirect('dinein', tableId, splitTotal, 'cash', splitItems);
        
        closeModal('splitBillModal');
        await renderTables();
        if (document.getElementById('tableDetailModal').style.display === 'flex') {
            await showTableDetail(tid);
        }
        showToast(`Đã thanh toán ${formatMoney(splitTotal)} cho các món đã chọn`, 'success');
    };
}

function updateSplitTotal() {
    let total = 0;
    const checkboxes = document.querySelectorAll('#splitItemsList .split-checkbox:checked');
    for (let cb of checkboxes) {
        const idx = parseInt(cb.dataset.itemIdx);
        const price = parseFloat(cb.dataset.itemPrice);
        const qtyInput = document.querySelector(`.split-qty-input[data-item-idx="${idx}"]`);
        let qty = qtyInput ? parseInt(qtyInput.value) : parseInt(cb.dataset.itemQty);
        if (isNaN(qty)) qty = 0;
        total += price * qty;
    }
    document.getElementById('splitTotalAmount').innerText = formatMoney(total);
}


// ========== CHI TIẾT BÀN ==========
async function showTableDetail(tableId) {
    const tid = String(tableId);
    let table = await DB.get('tables', tid);
    if (!table) {
        const all = await DB.getAll('tables');
        table = all.find(t => String(t.id) === tid);
    }
    if (!table) { showToast('Không tìm thấy bàn!', 'error'); return; }
    document.getElementById('detailTableName').innerHTML = `🪑 ${table.name}`;
    document.getElementById('detailTime').innerText = table.time || '--:--';
    document.getElementById('detailTotal').innerHTML = formatMoney(table.total || 0);
    const itemsContainer = document.getElementById('detailItemsList');
    if (!table.items || table.items.length === 0) itemsContainer.innerHTML = '<div style="padding:20px;">✨ Chưa có món</div>';
    else itemsContainer.innerHTML = table.items.map(item => `<div class="detail-item-row"><span>${item.name} x${item.qty}</span><span>${formatMoney((item.price || 0) * (item.qty || 0))}</span></div>`).join('');
    currentContext = { type: 'detailView', tableId: table.id };
    document.getElementById('tableDetailModal').style.display = 'flex';
}

// ========== THANH TOÁN ==========
async function showPaymentMethod(type, tableId, amount) {
    if (!amount || amount <= 0) { showToast('Không có món để thanh toán!', 'warning'); return; }
    let items = [], tableName = '', startTime = null;
    if (type === 'dinein') {
        const tid = String(tableId);
        const table = await DB.get('tables', tid);
        if (table) {
            items = [...(table.items || [])];
            tableName = table.name;
            startTime = table.startTime;
        } else {
            console.error('Không tìm thấy bàn để thanh toán:', tid);
        }
    } else {
        items = [...tempOrder];
        tableName = 'Mang đi';
    }
    let sittingTime = '';
    if (startTime) {
        const diffMins = Math.floor((Date.now() - new Date(startTime)) / 60000);
        const diffHours = Math.floor(diffMins / 60);
        sittingTime = diffHours > 0 ? `${diffHours} giờ ${diffMins % 60} phút` : `${diffMins} phút`;
    }
    const modalBody = document.getElementById('paymentModalBody');
    modalBody.innerHTML = `
        <div class="payment-info-section">
            <div class="payment-info-row"><span>📌 Bàn</span><span>${tableName}</span></div>
            <div class="payment-info-row"><span>⏱️ Thời gian</span><span>${new Date().toLocaleString('vi-VN')}</span></div>
            ${sittingTime ? `<div class="payment-info-row"><span>🕑 Thời gian ngồi</span><span>${sittingTime}</span></div>` : ''}
        </div>
        <div class="payment-items-title">📋 Danh sách món</div>
        <div class="payment-items-list">
            ${items.map(item => `<div><span>${item.name} x${item.qty}</span><span>${formatMoney((item.price || 0) * (item.qty || 0))}</span></div>`).join('')}
        </div>
        <div class="payment-info-section">
            <div class="payment-info-row"><span>💰 Tổng tiền</span><span class="total">${formatMoney(amount)}</span></div>
        </div>
        <div class="payment-methods">
            <button class="payment-method-btn cash" onclick="processPaymentDirect('${type}', '${tableId}', ${amount}, 'cash')">💰 Tiền mặt</button>
            <button class="payment-method-btn transfer" onclick="processPaymentDirect('${type}', '${tableId}', ${amount}, 'transfer')">💳 Chuyển khoản</button>
        </div>
    `;
    document.getElementById('paymentModal').style.display = 'flex';
}

async function processPaymentDirect(type, tableId, amount, paymentMethod) {
    console.log('💰 Thanh toán:', { type, tableId, amount, paymentMethod });
    
    if (typeof addTransaction === 'function') {
        addTransaction(type === 'takeaway' ? 'takeaway' : (type === 'dinein' ? 'dinein' : 'debt_payment'), amount, paymentMethod);
    }
    
    let items = [];
    let customerName = '';
    let tableName = '';
    if (type === 'dinein') {
        const tid = String(tableId);
        const table = await DB.get('tables', tid);
        if (table) {
            items = [...(table.items || [])];
            customerName = table.customerName || '';
            tableName = table.name;
        }
    } else if (type === 'debt_table') {
        const tid = String(tableId);
        const table = await DB.get('tables', tid);
        if (table) {
            items = [...(table.items || [])];
            customerName = table.customerName || '';
            tableName = table.name;
        }
        await DB.remove('tables', tid);
    } else {
        items = [...tempOrder];
        customerName = currentSelectedCustomer?.name || '';
        tableName = 'Mang đi';
    }
    
    if (typeof addHistory === 'function') {
        await addHistory({
            type: type === 'takeaway' ? 'takeaway' : (type === 'dinein' ? 'dinein' : 'debt_payment'),
            amount, paymentMethod, items,
            customer: customerName ? { name: customerName } : null,
            tableName: type === 'dinein' ? (customerName || tableName) : tableName,
            note: customerName ? `Khách: ${customerName}` : ''
        });
    }
    
    if (typeof deductIngredients === 'function') {
        let orderItems = [];
        if (type === 'dinein') {
            const tid = String(tableId);
            const table = await DB.get('tables', tid);
            orderItems = table ? [...(table.items || [])] : [];
        } else if (type === 'debt_table') {
            const tid = String(tableId);
            const table = await DB.get('tables', tid);
            orderItems = table ? [...(table.items || [])] : [];
        } else {
            orderItems = [...tempOrder];
        }
        await deductIngredients(orderItems);
    }
    
    if (type === 'dinein') {
        const tid = String(tableId);
        const exists = await DB.get('tables', tid);
        if (exists) {
            await DB.remove('tables', tid);
        }
    } else if (type !== 'debt_table') {
        tempOrder = [];
    }
    
    showToast(`✅ Thanh toán thành công ${formatMoney(amount)}`, 'success');
    await renderTables();
    document.getElementById('paymentModal').style.display = 'none';
    document.getElementById('tableDetailModal').style.display = 'none';
    if (typeof renderReport === 'function' && document.getElementById('reportView')?.classList.contains('active')) renderReport();
    if (typeof renderCustomerList === 'function' && document.getElementById('customersView')?.classList.contains('active')) renderCustomerList();
    if (typeof renderDebtList === 'function') renderDebtList();
    if (typeof renderIngredients === 'function') renderIngredients();
}

// ========== GHI NỢ BÀN (THÔNG MINH: DÙNG KHÁCH ĐÃ GÁN HOẶC CHỌN/TẠO MỚI) ==========
async function debtTable(tableId) {
    const tid = String(tableId);
    const table = await DB.get('tables', tid);
    if (!table || !table.items || table.items.length === 0) {
        showToast('Không có món để ghi nợ!', 'warning');
        return;
    }
    const total = table.total || 0;
    const orderDetail = (table.items || []).map(i => `${i.name} x${i.qty}`).join(', ');
    const note = `Mua tại ${table.name} - ${orderDetail}`;

    // Hàm xử lý ghi nợ sau khi có customer
    const processDebt = async (customer) => {
        if (!customer) return;
        if (typeof addCustomerDebt === 'function') {
            await addCustomerDebt(customer.id, total, note);
            await DB.remove('tables', tid);
            await renderTables();
            showToast(`💰 Đã ghi nợ ${formatMoney(total)} cho ${customer.name}`, 'success');
            document.getElementById('tableDetailModal').style.display = 'none';
            if (typeof renderDebtList === 'function') renderDebtList();
            if (typeof renderCustomerList === 'function') renderCustomerList();
            // Nếu đang ở subtab nợ (bàn nợ trong ngày), cập nhật danh sách
            if (document.querySelector('.sub-tab.active')?.getAttribute('data-subtab') === 'debt') {
                if (typeof renderDebtListForTab === 'function') await renderDebtListForTab();
            }
        }
    };

    // Trường hợp 1: Bàn đã có khách (customerId hoặc customerName)
    let existingCustomer = null;
    if (table.customerId && window.customers) {
        existingCustomer = window.customers.find(c => c.id == table.customerId);
    }
    if (existingCustomer) {
        if (confirm(`Bàn đã được gán cho khách "${existingCustomer.name}". Ghi nợ ${formatMoney(total)} cho khách này?`)) {
            await processDebt(existingCustomer);
        } else {
            // Nếu không đồng ý, hiển thị selector để chọn khách khác
            if (typeof showCustomerSelector === 'function') {
                showCustomerSelector(async (selectedCustomer) => {
                    await processDebt(selectedCustomer);
                });
            }
        }
        return;
    }

    // Trường hợp 2: Bàn chưa có khách -> hiển thị modal chọn/tạo khách
    if (typeof showCustomerSelector === 'function') {
        showCustomerSelector(async (selectedCustomer) => {
            await processDebt(selectedCustomer);
        });
    } else {
        // Fallback nếu thiếu hàm (dùng prompt cũ)
        const customerName = prompt('Nhập tên khách hàng để ghi nợ:');
        if (!customerName) return;
        let customer = window.customers?.find(c => c.name === customerName);
        if (!customer && typeof addCustomer === 'function') {
            customer = await addCustomer(customerName, '', '');
        }
        if (customer) await processDebt(customer);
    }
}

// ========== MENU TRONG POPUP ==========
function renderOrderMenuForModal(searchTerm = '') {
    const container = document.getElementById('menuGridOrder');
    if (!container) {
        console.error('Không tìm thấy container menuGridOrder');
        return;
    }
    if (!window.menuItems || window.menuItems.length === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center;">📭 Chưa có món nào. Hãy thêm món trong tab Menu.</div>';
        return;
    }
    let items = window.menuItems;
    if (searchTerm) items = items.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));
    container.innerHTML = items.map(item => `
        <div class="menu-item-simple" onclick="addToTempOrder('${item.name}', ${item.price || 0})">
            ${item.name}<br>
            <span style="font-size:10px;">${formatMoney(item.price || 0)}</span>
        </div>
    `).join('');
}

function openAddMenuForTable(tableId) {
    currentContext = { type: 'addToTable', tableId: tableId };
    tempOrder = [];
    
    // Hiển thị danh mục và menu
    if (typeof renderOrderCategories === 'function') {
        renderOrderCategories();
    }
    // Khởi tạo bộ lọc danh mục mặc định
    window.currentOrderCategory = 'all';
    const searchInput = document.getElementById('menuSearchInput2');
    if (searchInput) {
        searchInput.oninput = (e) => {
            if (typeof renderOrderMenuByCategory === 'function') {
                renderOrderMenuByCategory(window.currentOrderCategory || 'all', e.target.value);
            }
        };
        searchInput.value = '';
    }
    if (typeof renderOrderMenuByCategory === 'function') {
        renderOrderMenuByCategory('all', '');
    }
    
    renderTempCartOrder();
    document.getElementById('orderModalTitle').innerHTML = '➕ Thêm món';
    document.getElementById('customerSelectRow').style.display = 'none';
    document.getElementById('orderModal').style.display = 'flex';
}

function renderTempCartOrder() {
    const container = document.getElementById('tempCartOrderItems');
    const totalSpan = document.getElementById('tempCartOrderTotal');
    if (tempOrder.length === 0) { container.innerHTML = 'Chưa có món'; totalSpan.innerText = '0'; return; }
    let total = 0;
    container.innerHTML = tempOrder.map(item => {
        const itemTotal = (item.price || 0) * (item.qty || 0);
        total += itemTotal;
        return `<div class="temp-cart-item"><span>${item.name} x${item.qty}</span><span>${formatMoney(itemTotal)} <button onclick="removeFromTempOrder('${item.name}')">X</button></span></div>`;
    }).join('');
    totalSpan.innerText = total.toLocaleString('vi-VN');
}

function removeFromTempOrder(name) {
    tempOrder = tempOrder.filter(i => i.name !== name);
    renderTempCartOrder();
}

function addToTempOrder(name, price) {
    const existing = tempOrder.find(i => i.name === name);
    if (existing) existing.qty++;
    else tempOrder.push({ name, price, qty: 1 });
    renderTempCartOrder();
}

document.getElementById('confirmOrderBtn')?.addEventListener('click', async () => {
    if (tempOrder.length === 0) { showToast('Vui lòng chọn món!', 'warning'); return; }
    
    // Kiểm tra tồn kho trước khi xác nhận
    if (typeof checkStockForItems === 'function') {
        const enough = await checkStockForItems(tempOrder);
        if (!enough) return;
    }
    
    const total = tempOrder.reduce((s, i) => s + ((i.price || 0) * (i.qty || 0)), 0);
    if (currentContext?.type === 'takeaway') {
        document.getElementById('orderModal').style.display = 'none';
        showPaymentMethod('takeaway', null, total);
    } else if (currentContext?.type === 'newtable' && currentContext.tableId) {
        const table = await DB.get('tables', String(currentContext.tableId));
        if (table) {
            const existingItems = table.items || [];
            tempOrder.forEach(newItem => {
                const ex = existingItems.find(i => i.name === newItem.name);
                if (ex) ex.qty += newItem.qty;
                else existingItems.push({ ...newItem });
            });
            const newTotal = existingItems.reduce((s, i) => s + ((i.price || 0) * (i.qty || 0)), 0);
            const now = new Date();
            await DB.update('tables', String(currentContext.tableId), {
                items: existingItems, total: newTotal, status: 'occupied',
                startTime: now.toISOString(), time: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
            });
            if (currentSelectedCustomer) {
                await DB.update('tables', String(currentContext.tableId), { customerId: currentSelectedCustomer.id, customerName: currentSelectedCustomer.name });
            }
            await renderTables();
            showToast(`✅ Đã tạo đơn tại bàn ${table.name}`, 'success');
        }
        document.getElementById('orderModal').style.display = 'none';
        tempOrder = [];
        currentSelectedCustomer = null;
    } else if (currentContext?.type === 'addToTable' && currentContext.tableId) {
        const table = await DB.get('tables', String(currentContext.tableId));
        if (table) {
            const existingItems = table.items || [];
            tempOrder.forEach(newItem => {
                const ex = existingItems.find(i => i.name === newItem.name);
                if (ex) ex.qty += newItem.qty;
                else existingItems.push({ ...newItem });
            });
            const newTotal = existingItems.reduce((s, i) => s + ((i.price || 0) * (i.qty || 0)), 0);
            await DB.update('tables', String(currentContext.tableId), { items: existingItems, total: newTotal });
            if (table.status === 'empty') {
                const now = new Date();
                await DB.update('tables', String(currentContext.tableId), { status: 'occupied', startTime: now.toISOString(), time: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) });
            }
            await renderTables();
            showToast(`✅ Đã thêm món vào bàn`, 'success');
        }
        document.getElementById('orderModal').style.display = 'none';
        tempOrder = [];
    }
});

// ========== NÚT NỔI ==========
document.getElementById('floatTakeawayBtn')?.addEventListener('click', () => {
    currentContext = { type: 'takeaway' };
    currentSelectedCustomer = null;
    tempOrder = [];
    if (typeof renderOrderMenuForModal === 'function') renderOrderMenuForModal('');
    renderTempCartOrder();
    document.getElementById('orderModalTitle').innerHTML = '🛵 Bán mang đi';
    document.getElementById('customerSelectRow').style.display = 'flex';
    document.getElementById('selectedCustomerDisplay').innerHTML = '👤 Chọn khách hàng (không bắt buộc)';
    document.getElementById('clearCustomerBtn').style.display = 'none';
    document.getElementById('orderModal').style.display = 'flex';
});

document.getElementById('floatNewtableBtn')?.addEventListener('click', async () => {
    let tables = await DB.getAll('tables');
    let emptyTable = tables.find(t => (!t.items || t.items.length === 0) && t.status !== 'debt');
    if (!emptyTable) {
        const newId = Date.now().toString();
        const newNumber = tables.length + 1;
        const newTable = { id: newId, name: `Bàn ${newNumber.toString().padStart(2, '0')}`, status: 'empty', time: '--:--', startTime: null, items: [], total: 0, debt: 0, customerId: null };
        await DB.create('tables', newTable);
        showToast(`✅ Đã tạo bàn mới: ${newTable.name}`, 'success');
        emptyTable = newTable;
    }
    currentContext = { type: 'newtable', tableId: emptyTable.id };
    currentSelectedCustomer = null;
    tempOrder = [];
    if (typeof renderOrderMenuForModal === 'function') renderOrderMenuForModal('');
    renderTempCartOrder();
    document.getElementById('orderModalTitle').innerHTML = `🍽️ Tạo đơn - ${emptyTable.name}`;
    document.getElementById('customerSelectRow').style.display = 'flex';
    document.getElementById('selectedCustomerDisplay').innerHTML = '👤 Chọn khách hàng (gán tên bàn)';
    document.getElementById('clearCustomerBtn').style.display = 'none';
    document.getElementById('orderModal').style.display = 'flex';
});

// ========== CHỌN/GÁN KHÁCH ==========
function showCustomerSelectorForOrder() {
    if (typeof showCustomerSelector === 'function') {
        showCustomerSelector((customer) => {
            currentSelectedCustomer = customer;
            document.getElementById('selectedCustomerDisplay').innerHTML = `👤 ${customer.name} ${customer.totalDebt > 0 ? `(nợ ${formatMoney(customer.totalDebt)})` : ''}`;
            document.getElementById('clearCustomerBtn').style.display = 'inline-block';
        });
    }
}

async function showCustomerSelectorForTable(tableId) {
    const tid = String(tableId);
    const table = await DB.get('tables', tid);
    if (!table) return;

    if (typeof showCustomerSelector === 'function') {
        showCustomerSelector(async (newCustomer) => {
            const oldCustomerId = table.customerId;
            const totalAmount = table.total || 0;
            const orderDetail = (table.items || []).map(i => `${i.name} x${i.qty}`).join(', ');
            const note = `Mua tại ${table.name} - ${orderDetail}`;

            let shouldTransferDebt = false;
            if (totalAmount > 0) {
                shouldTransferDebt = confirm(`Bàn đang có số tiền ${formatMoney(totalAmount)}.\nBạn có muốn GHI NỢ số tiền này cho khách "${newCustomer.name}" không?\n(Nếu không, bạn có thể ghi nợ sau bằng nút 💢)`);
            }

            if (oldCustomerId && totalAmount > 0 && shouldTransferDebt) {
                const removeOldDebt = confirm(`Bàn trước đó thuộc khách khác.\nCó nên HỦY khoản nợ ${formatMoney(totalAmount)} cho khách cũ (nếu có) không?`);
                if (removeOldDebt && typeof updateCustomerDebt === 'function') {
                    await updateCustomerDebt(oldCustomerId, totalAmount, 'pay_debt', `Chuyển nợ từ bàn ${table.name} sang khách ${newCustomer.name}`);
                    showToast(`✅ Đã hủy nợ ${formatMoney(totalAmount)} cho khách cũ`, 'info');
                }
            }

            if (totalAmount > 0 && shouldTransferDebt && typeof addCustomerDebt === 'function') {
                await addCustomerDebt(newCustomer.id, totalAmount, note);
                showToast(`💰 Đã ghi nợ ${formatMoney(totalAmount)} cho khách ${newCustomer.name}`, 'success');
            }

            // Cập nhật bàn: chỉ lưu customerId và customerName, KHÔNG ghi đè tên bàn
            const updateData = { 
                customerId: newCustomer.id, 
                customerName: newCustomer.name
            };
            if (table.status === 'empty') {
                updateData.status = 'occupied';
                updateData.startTime = new Date().toISOString();
                updateData.time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            }
            await DB.update('tables', tid, updateData);
            await renderTables();
            showToast(`✅ Đã gán khách hàng "${newCustomer.name}" cho bàn`, 'success');

            if (document.querySelector('.sub-tab.active')?.getAttribute('data-subtab') === 'debt') {
                if (typeof renderDebtListForTab === 'function') await renderDebtListForTab();
            }
        });
    }
}

function clearSelectedCustomer() {
    currentSelectedCustomer = null;
    document.getElementById('selectedCustomerDisplay').innerHTML = '👤 Chọn khách hàng (không bắt buộc)';
    document.getElementById('clearCustomerBtn').style.display = 'none';
}

async function reindexTables() {
    let tables = await DB.getAll('tables');
    tables.sort((a, b) => parseInt(a.name.replace('Bàn ', '')) - parseInt(b.name.replace('Bàn ', '')));
    for (let i = 0; i < tables.length; i++) {
        const newName = `Bàn ${(i + 1).toString().padStart(2, '0')}`;
        if (tables[i].name !== newName) {
            // Kiểm tra bàn còn tồn tại trước khi cập nhật
            const stillExists = await DB.get('tables', String(tables[i].id));
            if (stillExists) {
                await DB.update('tables', String(tables[i].id), { name: newName });
            } else {
                console.warn(`Bàn ${tables[i].id} không tồn tại, bỏ qua cập nhật`);
            }
        }
    }
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
window.escapeHtml = escapeHtml;
async function renderDebtListForTab() {
    const container = document.getElementById('debtListContainer');
    if (!container) return;
    const customers = window.customers || [];
    const debtCustomers = customers.filter(c => (c.totalDebt || 0) > 0);
    if (debtCustomers.length === 0) {
        container.innerHTML = '<div class="empty-state">✅ Không có khách nợ</div>';
        return;
    }
    container.innerHTML = debtCustomers.map(c => `
        <div class="debt-card" onclick="if(typeof renderCustomerDetail === 'function') renderCustomerDetail('${c.id}')">
            <div class="debt-card-header"><div>👤 ${escapeHtml(c.name)}</div><div>${formatMoney(c.totalDebt)}</div></div>
            <div class="debt-card-phone">📞 ${c.phone || 'Chưa có số'}</div>
            <div class="debt-card-address">🏠 ${c.address || 'Chưa có địa chỉ'}</div>
            <div class="debt-card-actions"><button class="btn-pay-debt-small" onclick="event.stopPropagation(); if(typeof openPaymentForCustomer === 'function') openPaymentForCustomer('${c.id}')">💸 Thanh toán nợ</button></div>
        </div>
    `).join('');
}

// Export
window.renderDebtListForTab = renderDebtListForTab;

// ========== SUB TAB (Bán tại chỗ / Khách nợ) ==========
document.querySelectorAll('.sub-tab').forEach(subtab => {
    subtab.addEventListener('click', async () => {
        document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
        subtab.classList.add('active');
        const type = subtab.getAttribute('data-subtab');
        if (type === 'debt') {
            await renderDebtListForTab();
        } else {
            await renderTables();
        }
    });
});

// ========== CÁC NÚT TRONG MODAL CHI TIẾT BÀN ==========
document.getElementById('detailAddBtn')?.addEventListener('click', () => {
    if (currentContext?.tableId) {
        document.getElementById('tableDetailModal').style.display = 'none';
        openAddMenuForTable(currentContext.tableId);
    }
});

document.getElementById('detailPayBtn')?.addEventListener('click', async () => {
    if (currentContext?.tableId) {
        const table = await DB.get('tables', String(currentContext.tableId));
        if (table && (table.total || 0) > 0) {
            document.getElementById('tableDetailModal').style.display = 'none';
            showPaymentMethod('dinein', currentContext.tableId, table.total);
        } else showToast('Không có món để thanh toán!', 'warning');
    }
});

document.getElementById('detailDebtBtn')?.addEventListener('click', () => {
    if (currentContext?.tableId) {
        debtTable(currentContext.tableId);
        document.getElementById('tableDetailModal').style.display = 'none';
    }
});

// ========== ĐÓNG MODAL KHI CLICK RA NGOÀI ==========
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        tempOrder = [];
        currentSelectedCustomer = null;
    });
});
window.onclick = (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
        tempOrder = [];
        currentSelectedCustomer = null;
    }
};

// ========== THỜI GIAN ==========
function updateTime() {
    const now = new Date();
    const timeEl = document.getElementById('currentTime');
    if (timeEl) timeEl.innerText = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
setInterval(updateTime, 1000);
updateTime();

// ========== CHUYỂN TAB CHÍNH ==========
document.querySelectorAll('.main-tab, .bottom-nav-item').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab');
        document.querySelectorAll('.main-tab, .bottom-nav-item').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabId}View`).classList.add('active');
        if (tabId === 'menu' && typeof renderMenuManager === 'function') renderMenuManager();
        if (tabId === 'ingredients' && typeof renderIngredients === 'function') renderIngredients();
        if (tabId === 'customers' && typeof renderCustomerList === 'function') renderCustomerList();
        if (tabId === 'report' && typeof renderReport === 'function') renderReport();
        if (tabId === 'history' && typeof renderHistory === 'function') renderHistory();
        if (tabId === 'settings' && typeof loadSettings === 'function') loadSettings();
    });
});

// ========== CÀI ĐẶT ==========
function loadSettings() {
    document.getElementById('settingAutoPrint').checked = localStorage.getItem('settingAutoPrint') === 'true';
    document.getElementById('settingAfterPay').checked = localStorage.getItem('settingAfterPay') !== 'false';
    document.getElementById('settingShowCustomer').checked = localStorage.getItem('settingShowCustomer') === 'true';
    document.getElementById('settingMinStock').value = localStorage.getItem('settingMinStock') || '10';
}
function saveSettings() {
    localStorage.setItem('settingAutoPrint', document.getElementById('settingAutoPrint')?.checked);
    localStorage.setItem('settingAfterPay', document.getElementById('settingAfterPay')?.checked);
    localStorage.setItem('settingShowCustomer', document.getElementById('settingShowCustomer')?.checked);
    localStorage.setItem('settingMinStock', document.getElementById('settingMinStock')?.value);
    showToast('✅ Đã lưu cài đặt!', 'success');
}
async function resetAllData() {
    if (confirm('⚠️ Xóa toàn bộ dữ liệu?')) {
        localStorage.clear();
        indexedDB.deleteDatabase('pos_data');
        showToast('Đã reset, reload...', 'success');
        setTimeout(() => location.reload(), 1500);
    }
}
async function exportAllData() {
    const tables = await DB.getAll('tables');
    const data = {
        tables, customers: window.customers || [], menuItems: window.menuItems || [],
        menuCategories: window.menuCategories || [], ingredients: window.ingredients || [],
        reportData: window.reportData || {}, history: window.historyData || []
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pos_backup_${new Date().toISOString().slice(0, 19)}.json`;
    link.click();
    showToast('✅ Đã xuất dữ liệu!', 'success');
}
function importAllData(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.tables) for (const t of data.tables) await DB.create('tables', t);
            if (data.customers) localStorage.setItem('pos_customers', JSON.stringify(data.customers));
            if (data.menuItems && data.menuCategories) localStorage.setItem('pos_menu', JSON.stringify({ categories: data.menuCategories, items: data.menuItems }));
            if (data.ingredients) localStorage.setItem('pos_ingredients', JSON.stringify(data.ingredients));
            if (data.reportData) localStorage.setItem('pos_report', JSON.stringify(data.reportData));
            if (data.history) localStorage.setItem('pos_history', JSON.stringify(data.history));
            showToast('✅ Nhập thành công! Reload...', 'success');
            setTimeout(() => location.reload(), 1500);
        } catch (err) { showToast('Lỗi file!', 'error'); }
    };
    reader.readAsText(file);
}

// ========== KHỞI TẠO DATABASE & UI ==========
(async function () {
    await DB.init();
    console.log('Database ready');

    // Load menu
    window.menuItems = await DB.getAll('menu');
    window.menuCategories = await DB.getAll('menu_categories');
    // Nếu menu rỗng, tạo dữ liệu mẫu (tạm thời)
    if (window.menuItems.length === 0 && window.menuCategories.length === 0) {
        await DB.create('menu_categories', { id: 'cat1', name: 'Cà phê', color: '#f97316', icon: '☕' });
        await DB.create('menu', { id: 'item1', name: 'Cà phê đen', price: 25000, categoryId: 'cat1', ingredients: [] });
        await DB.create('menu', { id: 'item2', name: 'Cà phê sữa', price: 30000, categoryId: 'cat1', ingredients: [] });
        window.menuItems = await DB.getAll('menu');
        window.menuCategories = await DB.getAll('menu_categories');
        console.log('✅ Đã tạo menu mẫu');
    }

    window.customers = await DB.getAll('customers');
    window.ingredients = await DB.getAll('ingredients');

    let tables = await DB.getAll('tables');
if (tables.length === 0) {
    console.log('📌 Chưa có bàn nào, tạo 8 bàn mặc định...');
    for (let i = 1; i <= 8; i++) {
        const newId = Date.now().toString() + i;
        await DB.create('tables', {
            id: newId,
            name: `Bàn ${i.toString().padStart(2, '0')}`,
            status: 'empty',
            time: '--:--',
            startTime: null,
            items: [],
            total: 0,
            debt: 0,
            customerId: null
        });
    }
} else {
    console.log(`📌 Đã có ${tables.length} bàn, không tạo mới.`);
}

    await renderTables();
    if (typeof renderCustomerList === 'function') renderCustomerList();
    if (typeof renderMenuManager === 'function') renderMenuManager();
    if (typeof renderIngredients === 'function') renderIngredients();
    if (typeof initMenu === 'function') initMenu();
    if (typeof initIngredients === 'function') initIngredients();
    if (typeof initCustomers === 'function') initCustomers();
    if (typeof initReport === 'function') initReport();
    if (typeof initHistory === 'function') initHistory();
    loadSettings();

    setInterval(() => {
        if (document.querySelector('.tab-content.active')?.id === 'tablesView') renderTables();
    }, 60000);
})();


window.addEventListener('db_update', async (e) => {
    const { collection, data } = e.detail;
    console.log('🔥 db_update event:', collection, data?.length);

    switch (collection) {
        case 'tables':
            await renderTables();
            if (document.querySelector('.sub-tab.active')?.getAttribute('data-subtab') === 'debt') {
                if (typeof renderDebtListForTab === 'function') await renderDebtListForTab();
            }
            break;
        case 'customers':
            window.customers = data;
            if (typeof renderCustomerList === 'function') renderCustomerList();
            if (typeof renderDebtList === 'function') renderDebtList();
            if (document.querySelector('.sub-tab.active')?.getAttribute('data-subtab') === 'debt') {
                if (typeof renderDebtListForTab === 'function') await renderDebtListForTab();
            }
            break;
        case 'menu':
    window.menuItems = [...data];

    if (typeof menuItems !== 'undefined') {
        menuItems = [...data];
    }

    if (typeof renderMenuManager === 'function') {
        renderMenuManager();
    }

    if (
        document.getElementById('orderModal')?.style.display === 'flex' &&
        typeof renderOrderMenuForModal === 'function'
    ) {
        const searchTerm =
            document.getElementById('menuSearchInput2')?.value || '';

        renderOrderMenuForModal(searchTerm);
    }

    break;


case 'menu_categories':
    window.menuCategories = [...data];

    if (typeof menuCategories !== 'undefined') {
        menuCategories = [...data];
    }

    if (typeof renderMenuManager === 'function') {
        renderMenuManager();
    }

    if (
        document.getElementById('orderModal')?.style.display === 'flex' &&
        typeof renderOrderCategories === 'function'
    ) {
        renderOrderCategories();
    }

    break;


case 'ingredients':
    window.ingredients = [...data];

    if (typeof ingredients !== 'undefined') {
        ingredients = [...data];
    }

    if (typeof renderIngredients === 'function') {
        renderIngredients();
    }

    break;


case 'transactions':
    window.historyData = [...data];

    if (typeof historyData !== 'undefined') {
        historyData = [...data];
    }

    if (typeof renderHistory === 'function') {
        renderHistory();
    }

    if (typeof renderReport === 'function') {
        renderReport();
    }

    break;
        case 'reports':
            // Nếu bạn dùng report tính từ transactions thì không cần case này
            break;
        default:
            console.log('⚠️ Collection chưa xử lý:', collection);
    }
});


// Xuất các hàm toàn cục
window.renderTables = renderTables;
window.showPaymentMethod = showPaymentMethod;
window.debtTable = debtTable;
window.openAddMenuForTable = openAddMenuForTable;
window.showTableDetail = showTableDetail;
window.showCustomerSelectorForTable = showCustomerSelectorForTable;
window.showCustomerSelectorForOrder = showCustomerSelectorForOrder;
window.clearSelectedCustomer = clearSelectedCustomer;
window.addToTempOrder = addToTempOrder;
window.removeFromTempOrder = removeFromTempOrder;
window.formatMoney = formatMoney;
window.closeModal = closeModal;
window.saveSettings = saveSettings;
window.resetAllData = resetAllData;
window.exportAllData = exportAllData;
window.importAllData = importAllData;
window.loadSettings = loadSettings;
window.showToast = showToast;
window.reindexTables = reindexTables;