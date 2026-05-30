// ========== QUẢN LÝ KHÁCH HÀNG & CÔNG NỢ (ĐỒNG BỘ FIREBASE) ==========

// Khởi tạo: load từ DB
async function initCustomers() {
    window.customers = await DB.getAll('customers') || [];
    renderCustomerList();
    renderDebtList();
    console.log('✅ Đã tải customers:', window.customers.length);
}

// Thêm khách hàng mới
async function addCustomer(name, phone, address) {
    const newId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    const newCustomer = {
        id: newId,
        name: name.trim(),
        phone: phone || '',
        address: address || '',
        totalDebt: 0,
        totalSpent: 0,    // chỉ tính khi khách thanh toán (trả nợ hoặc trả trực tiếp)
        createdAt: new Date().toISOString(),
        debtHistory: [],
        paymentHistory: []
    };
    await DB.create('customers', newCustomer);
    window.customers = await DB.getAll('customers');
    renderCustomerList();
    renderDebtList();
    showToast(`Đã thêm khách ${name}`, 'success');
    return newCustomer;
}

// Cập nhật công nợ (thanh toán hoặc ghi nợ)
async function updateCustomerDebt(customerId, amount, type, note) {
    let customer = window.customers.find(c => c.id === customerId);
    if (!customer) return;
    
    // Sao chép để tránh tham chiếu
    customer = JSON.parse(JSON.stringify(customer));
    
    if (type === 'pay_debt') {
        // Thanh toán nợ: giảm totalDebt, tăng totalSpent
        customer.totalDebt = Math.max(0, (customer.totalDebt || 0) - amount);
        customer.totalSpent = (customer.totalSpent || 0) + amount;
        customer.paymentHistory = customer.paymentHistory || [];
        customer.paymentHistory.unshift({
            id: Date.now(),
            date: new Date().toISOString(),
            amount: amount,
            method: 'cash',    // có thể truyền method từ ngoài
            note: note
        });
    } else if (type === 'add_debt') {
        // Ghi nợ thêm: chỉ tăng totalDebt, không tăng totalSpent
        customer.totalDebt = (customer.totalDebt || 0) + amount;
        // KHÔNG cộng totalSpent ở đây
        customer.debtHistory = customer.debtHistory || [];
        customer.debtHistory.unshift({
            id: Date.now(),
            date: new Date().toISOString(),
            amount: amount,
            paidAmount: 0,
            remainingAmount: amount,
            note: note,
            status: 'unpaid',
            payments: []
        });
    }
    
    await DB.update('customers', customerId, customer);
    window.customers = await DB.getAll('customers');
    renderCustomerList();
    renderDebtList();
    
    // Nếu đang ở sub-tab nợ, cập nhật lại danh sách nợ trong tab đó
    if (document.querySelector('.sub-tab.active')?.getAttribute('data-subtab') === 'debt') {
        if (typeof renderDebtListForTab === 'function') await renderDebtListForTab();
    }
}

// Hàm thanh toán nợ (gọi từ giao diện)
async function payCustomerDebt(customerId, amount, method) {
    const customer = window.customers.find(c => c.id === customerId);
    if (!customer) return;
    
    await updateCustomerDebt(customerId, amount, 'pay_debt', `Thanh toán ${formatMoney(amount)} bằng ${method === 'cash' ? 'tiền mặt' : 'chuyển khoản'}`);
    
    // Ghi vào lịch sử giao dịch (transactions)
    if (typeof addHistory === 'function') {
        await addHistory({
            type: 'debt_payment',
            amount: amount,
            paymentMethod: method,
            customer: { id: customer.id, name: customer.name },
            note: `Thanh toán nợ cho khách ${customer.name}`
        });
    }
    
    showToast(`Đã thanh toán ${formatMoney(amount)} cho khách ${customer.name}`, 'success');
    
    // Cập nhật chi tiết khách nếu modal đang mở
    if (document.getElementById('customerDetailModal').style.display === 'flex') {
        renderCustomerDetail(customerId);
    }
    
    // Nếu đang ở subtab nợ, cập nhật lại danh sách
    if (document.querySelector('.sub-tab.active')?.getAttribute('data-subtab') === 'debt') {
        if (typeof renderDebtListForTab === 'function') await renderDebtListForTab();
    }
}

// Các hàm render giữ nguyên như cũ (dùng window.customers)
function renderCustomerList() {
    const customers = window.customers || [];
    const container = document.getElementById('customerListContainer');
    if (!container) return;
    const keyword = document.getElementById('customerSearchInput')?.value.toLowerCase() || '';
    let filtered = customers;
    if (keyword) filtered = customers.filter(c => c.name.toLowerCase().includes(keyword) || c.phone.includes(keyword));
    const totalDebt = filtered.reduce((s, c) => s + (c.totalDebt || 0), 0);
    const totalDebtEl = document.getElementById('totalDebtAmount');
    if (totalDebtEl) totalDebtEl.innerText = formatMoney(totalDebt);
    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><div>👥 Chưa có khách</div><button onclick="openAddCustomerModal()">+ Thêm</button></div>`;
        return;
    }
    container.innerHTML = filtered.map(c => `
        <div class="customer-card" onclick="renderCustomerDetail('${c.id}')">
            <div class="customer-avatar">${c.name.charAt(0).toUpperCase()}</div>
            <div class="customer-info">
                <div class="customer-name">${escapeHtml(c.name)}</div>
                <div class="customer-contact">📞 ${c.phone || 'Chưa có'}</div>
            </div>
            <div class="customer-debt ${c.totalDebt > 0 ? 'has-debt' : 'no-debt'}">${c.totalDebt > 0 ? formatMoney(c.totalDebt) : '✅ Hết nợ'}</div>
        </div>
    `).join('');
}

function renderDebtList() {
    const customers = window.customers || [];
    const container = document.getElementById('debtListContainer');
    if (!container) return;
    const debtCustomers = customers.filter(c => (c.totalDebt || 0) > 0);
    if (debtCustomers.length === 0) {
        container.innerHTML = '<div class="empty-state">✅ Không có khách nợ</div>';
        return;
    }
    container.innerHTML = debtCustomers.map(c => `
        <div class="debt-card" onclick="renderCustomerDetail('${c.id}')">
            <div class="debt-card-header"><div>👤 ${escapeHtml(c.name)}</div><div>${formatMoney(c.totalDebt)}</div></div>
            <div class="debt-card-phone">📞 ${c.phone || 'Chưa có'}</div>
            <div class="debt-card-actions"><button class="btn-pay-debt-small" onclick="event.stopPropagation(); openPaymentForCustomer('${c.id}')">💸 Thanh toán nợ</button></div>
        </div>
    `).join('');
}

async function renderCustomerDetail(customerId) {
    const c = window.customers.find(c => c.id === customerId);
    if (!c) return;
    const container = document.getElementById('customerDetailContent');
    container.innerHTML = `
        <div><strong>${escapeHtml(c.name)}</strong> 📞 ${c.phone || ''} 🏠 ${c.address || ''}</div>
        <div>Tổng nợ: ${formatMoney(c.totalDebt || 0)}</div>
        <div>Tổng chi: ${formatMoney(c.totalSpent || 0)}</div>
        <div>Lịch sử: ${c.debtHistory?.length || 0} khoản nợ, ${c.paymentHistory?.length || 0} lần thanh toán</div>
        <button onclick="openPaymentForCustomer('${c.id}')">Thanh toán nợ</button>
        <button onclick="closeModal('customerDetailModal')">Đóng</button>
    `;
    document.getElementById('customerDetailModal').style.display = 'flex';
}

function openPaymentForCustomer(customerId) {
    const c = window.customers.find(c => c.id === customerId);
    if (!c || !c.totalDebt) { showToast('Khách không nợ', 'info'); return; }
    const amount = prompt(`Nhập số tiền thanh toán cho ${c.name} (nợ ${formatMoney(c.totalDebt)})`, c.totalDebt);
    if (!amount) return;
    const val = parseInt(amount);
    if (isNaN(val) || val <= 0) { showToast('Số tiền không hợp lệ', 'warning'); return; }
    payCustomerDebt(customerId, val, 'cash');
}

function addCustomerDebt(customerId, amount, note) {
    return updateCustomerDebt(customerId, amount, 'add_debt', note);
}

// Modal thêm/sửa khách
function openAddCustomerModal() {
    document.getElementById('customerFormTitle').innerText = '➕ Thêm khách hàng';
    document.getElementById('customerFormId').value = '';
    document.getElementById('customerFormName').value = '';
    document.getElementById('customerFormPhone').value = '';
    document.getElementById('customerFormAddress').value = '';
    document.getElementById('customerFormModal').style.display = 'flex';
}

function editCustomer(id) {
    const c = window.customers.find(c => c.id === id);
    if (!c) return;
    document.getElementById('customerFormTitle').innerText = '✏️ Sửa khách hàng';
    document.getElementById('customerFormId').value = c.id;
    document.getElementById('customerFormName').value = c.name;
    document.getElementById('customerFormPhone').value = c.phone || '';
    document.getElementById('customerFormAddress').value = c.address || '';
    document.getElementById('customerFormModal').style.display = 'flex';
}

async function saveCustomerForm() {
    const id = document.getElementById('customerFormId').value;
    const name = document.getElementById('customerFormName').value.trim();
    const phone = document.getElementById('customerFormPhone').value;
    const address = document.getElementById('customerFormAddress').value;
    if (!name) { showToast('Vui lòng nhập tên khách hàng!', 'warning'); return; }
    if (id) {
        const c = window.customers.find(c => c.id === id);
        if (c) {
            c.name = name;
            c.phone = phone;
            c.address = address;
            await DB.update('customers', id, c);
            window.customers = await DB.getAll('customers');
            renderCustomerList();
            renderDebtList();
            showToast('Đã cập nhật', 'success');
        }
    } else {
        if (!phone) { showToast('Vui lòng nhập số điện thoại!', 'warning'); return; }
        await addCustomer(name, phone, address);
    }
    closeModal('customerFormModal');
}

async function deleteCustomer(id) {
    if (confirm('Xóa khách hàng này?')) {
        await DB.remove('customers', id);
        window.customers = await DB.getAll('customers');
        renderCustomerList();
        renderDebtList();
        showToast('Đã xóa', 'success');
    }
}

// ========== CHỌN KHÁCH (CHO NÚT + TRÊN BÀN) ==========
function showCustomerSelector(callback) {
    window.customerSelectCallback = callback;
    const container = document.getElementById('customerSelectorList');
    if (!container) return;
    const customerList = window.customers || [];
    if (customerList.length === 0) {
        container.innerHTML = `<div class="empty-state">📭 Chưa có khách</div><div class="add-new" onclick="openAddCustomerModalFromSelector()">➕ Thêm mới</div>`;
    } else {
        container.innerHTML = customerList.map(c => `
            <div class="customer-select-item" onclick="selectCustomer('${c.id}')">
                <div class="customer-select-avatar">${c.name.charAt(0).toUpperCase()}</div>
                <div class="customer-select-info">
                    <div class="customer-select-name">${escapeHtml(c.name)}</div>
                    <div class="customer-select-debt">${c.totalDebt > 0 ? `🔴 Nợ ${formatMoney(c.totalDebt)}` : '✅ Hết nợ'}</div>
                </div>
            </div>
        `).join('');
        container.innerHTML += `<div class="add-new" onclick="openAddCustomerModalFromSelector()">➕ Thêm khách hàng mới</div>`;
    }
    document.getElementById('customerSelectorModal').style.display = 'flex';
}

function selectCustomer(customerId) {
    const customer = window.customers.find(c => c.id === customerId);
    if (customer && window.customerSelectCallback) {
        window.customerSelectCallback(customer);
    }
    closeModal('customerSelectorModal');
}

function openAddCustomerModalFromSelector() {
    closeModal('customerSelectorModal');
    openAddCustomerModal();
}

function filterCustomerSelector() {
    // Tạm thời bỏ qua
}

function searchCustomerList() {
    renderCustomerList(); // vì renderCustomerList đã đọc giá trị input
}

// Hàm thoát HTML để tránh XSS
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Export toàn cục
window.initCustomers = initCustomers;
window.renderCustomerList = renderCustomerList;
window.renderDebtList = renderDebtList;
window.renderCustomerDetail = renderCustomerDetail;
window.openAddCustomerModal = openAddCustomerModal;
window.editCustomer = editCustomer;
window.saveCustomerForm = saveCustomerForm;
window.deleteCustomer = deleteCustomer;
window.addCustomerDebt = addCustomerDebt;
window.updateCustomerDebt = updateCustomerDebt;
window.payCustomerDebt = payCustomerDebt;
window.openPaymentForCustomer = openPaymentForCustomer;
window.showCustomerSelector = showCustomerSelector;
window.selectCustomer = selectCustomer;
window.openAddCustomerModalFromSelector = openAddCustomerModalFromSelector;
window.filterCustomerSelector = filterCustomerSelector;
window.searchCustomerList = searchCustomerList;