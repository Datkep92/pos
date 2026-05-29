// ========== QUẢN LÝ KHÁCH HÀNG ==========
let customers = [];
let nextCustomerId = 1;

const sampleCustomers = [
    { id: 1, name: "Nguyễn Văn A", phone: "0987654321", address: "12 Nguyễn Huệ", debt: 125000, totalSpent: 450000, createdAt: "2024-01-15", history: [] },
    { id: 2, name: "Trần Thị B", phone: "0978123456", address: "45 Lê Lợi", debt: 0, totalSpent: 230000, createdAt: "2024-02-20", history: [] },
    { id: 3, name: "Lê Văn C", phone: "0965234789", address: "78 Trần Phú", debt: 85000, totalSpent: 320000, createdAt: "2024-03-10", history: [] }
];

function initCustomers() {
    const saved = localStorage.getItem('pos_customers');
    if (saved) {
        customers = JSON.parse(saved);
        nextCustomerId = Math.max(...customers.map(c => c.id), 0) + 1;
    } else {
        customers = sampleCustomers;
        nextCustomerId = 4;
        saveCustomers();
    }
    renderCustomerList();
}

function saveCustomers() {
    localStorage.setItem('pos_customers', JSON.stringify(customers));
}

function renderCustomerList(searchKeyword = '') {
    const container = document.getElementById('customerListContainer');
    if (!container) return;
    
    let filtered = customers;
    if (searchKeyword) {
        const k = searchKeyword.toLowerCase();
        filtered = customers.filter(c => c.name.toLowerCase().includes(k) || c.phone.includes(k));
    }
    
    const totalDebt = filtered.reduce((sum, c) => sum + c.debt, 0);
    document.getElementById('totalDebtAmount').innerHTML = formatMoney(totalDebt);
    
    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><div>Chưa có khách hàng nào</div><button class="btn-add-customer" onclick="openAddCustomerModal()">+ Thêm khách hàng</button></div>`;
        return;
    }
    
    container.innerHTML = filtered.map(customer => `
        <div class="customer-card" onclick="renderCustomerDetail(${customer.id})">
            <div class="customer-avatar">${customer.name.charAt(0).toUpperCase()}</div>
            <div class="customer-info">
                <div class="customer-name">${customer.name}</div>
                <div class="customer-contact">📞 ${customer.phone || 'Chưa có'}</div>
            </div>
            <div class="customer-debt ${customer.debt > 0 ? 'has-debt' : 'no-debt'}">
                ${customer.debt > 0 ? formatMoney(customer.debt) : '✅ Hết nợ'}
            </div>
        </div>
    `).join('');
}

function searchCustomerList() {
    const keyword = document.getElementById('customerSearchInput').value;
    renderCustomerList(keyword);
}

function renderCustomerDetail(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    window.currentCustomerId = customerId;
    const container = document.getElementById('customerDetailContent');
    
    container.innerHTML = `
        <div class="customer-detail-header">
            <div class="customer-detail-avatar">${customer.name.charAt(0).toUpperCase()}</div>
            <div class="customer-detail-info">
                <h3>${customer.name}</h3>
                <p>📞 ${customer.phone || 'Chưa có'}</p>
                <p>🏠 ${customer.address || 'Chưa có'}</p>
                <p>📅 Tham gia: ${customer.createdAt}</p>
            </div>
            <div class="customer-detail-actions">
                <button class="btn-edit-customer" onclick="openEditCustomerModal(${customer.id})">✏️ Sửa</button>
                <button class="btn-delete-customer" onclick="deleteCustomer(${customer.id})">🗑️ Xóa</button>
            </div>
        </div>
        <div class="customer-stats">
            <div class="stat-card-mini"><div class="stat-label">💰 Tổng chi tiêu</div><div class="stat-value">${formatMoney(customer.totalSpent)}</div></div>
            <div class="stat-card-mini debt-stat"><div class="stat-label">🔴 Công nợ</div><div class="stat-value ${customer.debt > 0 ? 'text-danger' : 'text-success'}">${customer.debt > 0 ? formatMoney(customer.debt) : '0đ'}</div></div>
            <div class="stat-card-mini"><div class="stat-label">📋 Tổng đơn</div><div class="stat-value">${customer.history.filter(h => h.type === 'add_debt').length}</div></div>
        </div>
        ${customer.debt > 0 ? `
            <div class="debt-payment-section">
                <div class="section-title">💸 Thanh toán công nợ</div>
                <div class="debt-payment-form">
                    <input type="number" id="debtPaymentAmount" placeholder="Số tiền thanh toán" class="payment-input">
                    <button class="btn-pay-debt" onclick="payCustomerDebt(${customer.id})">Xác nhận</button>
                </div>
            </div>
        ` : ''}
        <div class="section-title">📜 Lịch sử giao dịch</div>
        <div class="history-timeline">
            ${customer.history.length === 0 ? '<div class="empty-history">Chưa có giao dịch nào</div>' : 
                customer.history.map(h => `
                    <div class="timeline-item ${h.type}">
                        <div class="timeline-date">${new Date(h.date).toLocaleString('vi-VN')}</div>
                        <div class="timeline-type">${h.type === 'add_debt' ? '🛒 Mua hàng' : '💰 Thanh toán nợ'}</div>
                        <div class="timeline-amount ${h.type === 'add_debt' ? 'text-danger' : 'text-success'}">${h.type === 'add_debt' ? '-' : '+'}${formatMoney(h.amount)}</div>
                        <div class="timeline-note">${h.orderInfo || h.note || ''}</div>
                    </div>
                `).join('')
            }
        </div>
    `;
    
    document.getElementById('customerDetailModal').style.display = 'flex';
}

function payCustomerDebt(customerId) {
    const amountInput = document.getElementById('debtPaymentAmount');
    const amount = parseInt(amountInput.value);
    const customer = customers.find(c => c.id === customerId);
    
    if (!amount || amount <= 0) {
        alert('Vui lòng nhập số tiền hợp lệ!');
        return;
    }
    if (amount > customer.debt) {
        alert(`Số tiền thanh toán lớn hơn công nợ!`);
        return;
    }
    if (confirm(`Xác nhận thanh toán ${formatMoney(amount)} từ ${customer.name}?`)) {
        updateCustomerDebt(customerId, amount, 'pay_debt', `Thanh toán công nợ ${formatMoney(amount)}`);
        if (typeof addHistory === 'function') {
            addHistory({ type: 'debt_payment', amount: amount, note: `Khách ${customer.name} thanh toán nợ` });
        }
        amountInput.value = '';
        alert('✅ Đã ghi nhận thanh toán!');
    }
}

function updateCustomerDebt(customerId, amount, type, orderInfo) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    if (type === 'add_debt') {
        customer.debt += amount;
        customer.totalSpent += amount;
    } else if (type === 'pay_debt') {
        customer.debt = Math.max(0, customer.debt - amount);
    }
    
    customer.history.unshift({
        date: new Date().toISOString(),
        type: type,
        amount: amount,
        orderInfo: orderInfo || '',
        note: type === 'add_debt' ? 'Mua hàng ghi nợ' : 'Thanh toán công nợ'
    });
    
    if (customer.history.length > 50) customer.history.pop();
    saveCustomers();
    renderCustomerList();
    if (window.currentCustomerId === customerId) renderCustomerDetail(customerId);
}

function addCustomerOrder(customerId, amount, orderDetail) {
    updateCustomerDebt(customerId, amount, 'add_debt', orderDetail);
}

function openAddCustomerModal() {
    document.getElementById('customerFormTitle').innerText = '➕ Thêm khách hàng mới';
    document.getElementById('customerFormId').value = '';
    document.getElementById('customerFormName').value = '';
    document.getElementById('customerFormPhone').value = '';
    document.getElementById('customerFormAddress').value = '';
    document.getElementById('customerFormModal').style.display = 'flex';
}

function openEditCustomerModal(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    document.getElementById('customerFormTitle').innerText = '✏️ Sửa thông tin khách hàng';
    document.getElementById('customerFormId').value = customer.id;
    document.getElementById('customerFormName').value = customer.name;
    document.getElementById('customerFormPhone').value = customer.phone || '';
    document.getElementById('customerFormAddress').value = customer.address || '';
    document.getElementById('customerFormModal').style.display = 'flex';
}

function saveCustomerForm() {
    const id = document.getElementById('customerFormId').value;
    const name = document.getElementById('customerFormName').value.trim();
    const phone = document.getElementById('customerFormPhone').value;
    const address = document.getElementById('customerFormAddress').value;
    
    if (!name) {
        alert('Vui lòng nhập tên khách hàng!');
        return;
    }
    
    if (id) {
        const customer = customers.find(c => c.id === parseInt(id));
        if (customer) {
            customer.name = name;
            customer.phone = phone;
            customer.address = address;
            saveCustomers();
        }
    } else {
        const newCustomer = {
            id: nextCustomerId++,
            name: name,
            phone: phone,
            address: address,
            debt: 0,
            totalSpent: 0,
            createdAt: new Date().toISOString().slice(0,10),
            history: []
        };
        customers.push(newCustomer);
        saveCustomers();
    }
    closeModal('customerFormModal');
    renderCustomerList();
    if (id) renderCustomerDetail(parseInt(id));
}

function deleteCustomer(customerId) {
    if (confirm('Xóa khách hàng này? Dữ liệu lịch sử sẽ mất!')) {
        customers = customers.filter(c => c.id !== customerId);
        saveCustomers();
        renderCustomerList();
        closeModal('customerDetailModal');
    }
}

function showCustomerSelector(callback) {
    window.customerSelectCallback = callback;
    const container = document.getElementById('customerSelectorList');
    container.innerHTML = customers.map(c => `
        <div class="customer-select-item" onclick="selectCustomer(${c.id})">
            <div class="customer-select-avatar">${c.name.charAt(0).toUpperCase()}</div>
            <div class="customer-select-info">
                <div class="customer-select-name">${c.name}</div>
                <div class="customer-select-debt">${c.debt > 0 ? `🔴 Nợ ${formatMoney(c.debt)}` : '✅ Hết nợ'}</div>
            </div>
        </div>
    `).join('');
    container.innerHTML += `<div class="customer-select-item add-new" onclick="openAddCustomerModalFromSelector()"><div class="customer-select-avatar">➕</div><div class="customer-select-info"><div class="customer-select-name">Thêm khách hàng mới</div></div></div>`;
    document.getElementById('customerSelectorModal').style.display = 'flex';
}

function selectCustomer(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (customer && window.customerSelectCallback) {
        window.customerSelectCallback(customer);
    }
    closeModal('customerSelectorModal');
}

function openAddCustomerModalFromSelector() {
    closeModal('customerSelectorModal');
    openAddCustomerModal();
    window.tempAfterAdd = () => showCustomerSelector(window.customerSelectCallback);
}

function filterCustomerSelector() {
    const keyword = document.getElementById('customerSelectorSearch').value.toLowerCase();
    const items = document.querySelectorAll('#customerSelectorList .customer-select-item:not(.add-new)');
    items.forEach(item => {
        const name = item.querySelector('.customer-select-name')?.innerText.toLowerCase() || '';
        item.style.display = name.includes(keyword) ? 'flex' : 'none';
    });
}

// Xuất global
window.customers = customers;
window.renderCustomerList = renderCustomerList;
window.searchCustomerList = searchCustomerList;
window.renderCustomerDetail = renderCustomerDetail;
window.openAddCustomerModal = openAddCustomerModal;
window.openEditCustomerModal = openEditCustomerModal;
window.saveCustomerForm = saveCustomerForm;
window.deleteCustomer = deleteCustomer;
window.showCustomerSelector = showCustomerSelector;
window.selectCustomer = selectCustomer;
window.filterCustomerSelector = filterCustomerSelector;
window.updateCustomerDebt = updateCustomerDebt;
window.addCustomerOrder = addCustomerOrder;
window.payCustomerDebt = payCustomerDebt;