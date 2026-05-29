// ========== QUẢN LÝ KHÁCH HÀNG & CÔNG NỢ ==========
let customers = [];
let nextCustomerId = 1;

// DỮ LIỆU MẪU
const sampleCustomers = [
    { 
        id: 1, 
        name: "Nguyễn Văn A", 
        phone: "0987654321", 
        address: "12 Nguyễn Huệ", 
        totalDebt: 125000,        // Tổng nợ hiện tại
        totalSpent: 450000,       // Tổng đã mua
        createdAt: "2024-01-15",
        debtHistory: [            // Lịch sử các khoản nợ
            { 
                id: 1705300000001, 
                date: "2024-01-15T10:30:00", 
                amount: 125000, 
                paidAmount: 0,
                remainingAmount: 125000,
                note: "Mua hàng tại bàn 01 - CF sữa x2, Bánh mì x1", 
                status: "unpaid", // unpaid, partial, paid
                payments: []
            }
        ],
        paymentHistory: []        // Lịch sử thanh toán tổng hợp
    },
    { 
        id: 2, 
        name: "Trần Thị B", 
        phone: "0978123456", 
        address: "45 Lê Lợi", 
        totalDebt: 0, 
        totalSpent: 230000, 
        createdAt: "2024-02-20",
        debtHistory: [],
        paymentHistory: []
    },
    { 
        id: 3, 
        name: "Lê Văn C", 
        phone: "0965234789", 
        address: "78 Trần Phú", 
        totalDebt: 85000, 
        totalSpent: 320000, 
        createdAt: "2024-03-10",
        debtHistory: [
            { 
                id: 1705400000002, 
                date: "2024-03-10T14:20:00", 
                amount: 85000, 
                paidAmount: 0,
                remainingAmount: 85000,
                note: "Mua hàng tại bàn 04 - Sting x2, Redbull x1", 
                status: "unpaid",
                payments: []
            }
        ],
        paymentHistory: []
    }
];

// ========== KHỞI TẠO ==========
function initCustomers() {
    const saved = localStorage.getItem('pos_customers');
    if (saved) {
        customers = JSON.parse(saved);
        nextCustomerId = Math.max(...customers.map(c => c.id), 0) + 1;
    } else {
        customers = JSON.parse(JSON.stringify(sampleCustomers));
        nextCustomerId = 4;
        saveCustomers();
    }
    
    // Xuất global
    window.customers = customers;
    
    renderCustomerList();
    renderDebtList();
}

function saveCustomers() {
    localStorage.setItem('pos_customers', JSON.stringify(customers));
    window.customers = customers;
}

// ========== THÊM CÔNG NỢ MỚI (THANH TOÁN SAU) ==========
function addCustomerDebt(customerId, amount, note) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) {
        showToast('Không tìm thấy khách hàng!', 'error');
        return null;
    }
    
    const debtRecord = {
        id: Date.now(),
        date: new Date().toISOString(),
        amount: amount,
        paidAmount: 0,
        remainingAmount: amount,
        note: note,
        status: 'unpaid',
        payments: []
    };
    
    customer.debtHistory.unshift(debtRecord);
    customer.totalDebt += amount;
    customer.totalSpent += amount;
    
    saveCustomers();
    
    // Cập nhật UI
    renderCustomerList();
    renderDebtList();
    if (window.currentCustomerId === customerId) renderCustomerDetail(customerId);
    
    showToast(`💰 Đã ghi nợ ${formatMoney(amount)} cho ${customer.name}`, 'warning');
    return debtRecord;
}

// ========== THANH TOÁN CÔNG NỢ (HỖ TRỢ TRẢ DẦN) ==========
function payCustomerDebt(customerId, amount, paymentMethod = 'cash') {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) {
        showToast('Không tìm thấy khách hàng!', 'error');
        return false;
    }
    
    if (amount <= 0) {
        showToast('Số tiền thanh toán không hợp lệ!', 'warning');
        return false;
    }
    
    if (amount > customer.totalDebt) {
        showToast(`Số tiền thanh toán (${formatMoney(amount)}) lớn hơn công nợ (${formatMoney(customer.totalDebt)})!`, 'error');
        return false;
    }
    
    let remainingToPay = amount;
    let totalPaid = 0;
    
    // Lấy các khoản nợ chưa thanh toán (cũ nhất trước)
    const unpaidDebts = customer.debtHistory.filter(d => d.status !== 'paid').sort((a, b) => new Date(a.date) - new Date(b.date));
    
    for (let debt of unpaidDebts) {
        if (remainingToPay <= 0) break;
        
        const unpaidAmount = debt.amount - debt.paidAmount;
        const payAmount = Math.min(remainingToPay, unpaidAmount);
        
        debt.paidAmount += payAmount;
        debt.remainingAmount = debt.amount - debt.paidAmount;
        remainingToPay -= payAmount;
        totalPaid += payAmount;
        
        // Cập nhật trạng thái
        if (debt.paidAmount >= debt.amount) {
            debt.status = 'paid';
        } else if (debt.paidAmount > 0) {
            debt.status = 'partial';
        }
        
        // Ghi nhận thanh toán chi tiết cho khoản nợ này
        debt.payments.push({
            id: Date.now(),
            date: new Date().toISOString(),
            amount: payAmount,
            method: paymentMethod,
            note: `Thanh toán ${formatMoney(payAmount)}`
        });
    }
    
    // Cập nhật tổng nợ
    customer.totalDebt = customer.debtHistory.reduce((sum, d) => sum + (d.amount - d.paidAmount), 0);
    
    // Thêm vào lịch sử thanh toán tổng hợp
    customer.paymentHistory.unshift({
        id: Date.now(),
        date: new Date().toISOString(),
        amount: totalPaid,
        method: paymentMethod,
        note: `Thanh toán ${formatMoney(totalPaid)}${remainingToPay > 0 ? ` (còn nợ ${formatMoney(remainingToPay)})` : ' - Đã tất toán'}`
    });
    
    saveCustomers();
    
    // Cập nhật UI
    renderCustomerList();
    renderDebtList();
    if (window.currentCustomerId === customerId) renderCustomerDetail(customerId);
    
    // Ghi vào lịch sử chung
    if (typeof addHistory === 'function') {
        addHistory({
            type: 'debt_payment',
            amount: totalPaid,
            paymentMethod: paymentMethod,
            customer: { name: customer.name, id: customer.id },
            note: `Thanh toán công nợ - Còn nợ ${formatMoney(customer.totalDebt)}`
        });
    }
    
    if (remainingToPay === 0) {
        showToast(`✅ Đã thanh toán hết nợ cho ${customer.name}!`, 'success');
    } else {
        showToast(`💰 Đã thanh toán ${formatMoney(totalPaid)} cho ${customer.name}. Còn nợ ${formatMoney(customer.totalDebt)}`, 'info');
    }
    
    return true;
}

// ========== THÊM KHÁCH HÀNG MỚI ==========
function addCustomer(name, phone, address) {
    const newCustomer = {
        id: nextCustomerId++,
        name: name,
        phone: phone || '',
        address: address || '',
        totalDebt: 0,
        totalSpent: 0,
        createdAt: new Date().toISOString().slice(0,10),
        debtHistory: [],
        paymentHistory: []
    };
    customers.push(newCustomer);
    saveCustomers();
    renderCustomerList();
    renderDebtList();
    showToast(`✅ Đã thêm khách hàng ${name}`, 'success');
    return newCustomer;
}

// ========== TÌM KIẾM KHÁCH HÀNG ==========
function searchCustomers(keyword) {
    if (!keyword) return customers;
    const k = keyword.toLowerCase();
    return customers.filter(c => 
        c.name.toLowerCase().includes(k) || 
        c.phone.includes(k) ||
        c.address.toLowerCase().includes(k)
    );
}

// ========== RENDER DANH SÁCH KHÁCH HÀNG ==========
function renderCustomerList(searchKeyword = '') {
    const container = document.getElementById('customerListContainer');
    if (!container) return;
    
    let filtered = searchCustomers(searchKeyword);
    const totalDebt = filtered.reduce((sum, c) => sum + c.totalDebt, 0);
    
    const totalDebtEl = document.getElementById('totalDebtAmount');
    if (totalDebtEl) totalDebtEl.innerHTML = formatMoney(totalDebt);
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👥</div>
                <div>Chưa có khách hàng nào</div>
                <button class="btn-add-customer" onclick="openAddCustomerModal()">+ Thêm khách hàng</button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filtered.map(customer => `
        <div class="customer-card" onclick="renderCustomerDetail(${customer.id})">
            <div class="customer-avatar">${customer.name.charAt(0).toUpperCase()}</div>
            <div class="customer-info">
                <div class="customer-name">${customer.name}</div>
                <div class="customer-contact">📞 ${customer.phone || 'Chưa có'}</div>
                <div class="customer-contact">🏠 ${customer.address || 'Chưa có'}</div>
            </div>
            <div class="customer-debt ${customer.totalDebt > 0 ? 'has-debt' : 'no-debt'}">
                ${customer.totalDebt > 0 ? formatMoney(customer.totalDebt) : '✅ Hết nợ'}
            </div>
        </div>
    `).join('');
}

function searchCustomerList() {
    const keyword = document.getElementById('customerSearchInput')?.value || '';
    renderCustomerList(keyword);
}

// ========== RENDER DANH SÁCH KHÁCH NỢ ==========
function renderDebtList() {
    const container = document.getElementById('debtListContainer');
    if (!container) return;
    
    const debtCustomers = customers.filter(c => c.totalDebt > 0);
    
    if (debtCustomers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">✅</div>
                <div>Không có khách hàng nào đang nợ</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = debtCustomers.map(customer => {
        const unpaidDebts = customer.debtHistory.filter(d => d.status !== 'paid');
        
        return `
            <div class="debt-card" onclick="renderCustomerDetail(${customer.id})">
                <div class="debt-card-header">
                    <div class="debt-customer-name">👤 ${customer.name}</div>
                    <div class="debt-total-amount">${formatMoney(customer.totalDebt)}</div>
                </div>
                <div class="debt-card-phone">📞 ${customer.phone || 'Chưa có'}</div>
                <div class="debt-details-list">
                    ${unpaidDebts.map(d => `
                        <div class="debt-detail-item">
                            <div class="debt-detail-date">📅 ${new Date(d.date).toLocaleDateString('vi-VN')}</div>
                            <div class="debt-detail-amount">Nợ: ${formatMoney(d.amount)}</div>
                            <div class="debt-detail-paid">Đã trả: ${formatMoney(d.paidAmount)}</div>
                            <div class="debt-detail-remaining">Còn: ${formatMoney(d.remainingAmount)}</div>
                            <div class="debt-detail-note">${d.note.substring(0, 50)}${d.note.length > 50 ? '...' : ''}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="debt-card-actions">
                    <button class="btn-pay-debt-small" onclick="event.stopPropagation(); openPaymentForCustomer(${customer.id})">
                        💸 Thanh toán nợ
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ========== RENDER CHI TIẾT KHÁCH HÀNG ==========
function renderCustomerDetail(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    window.currentCustomerId = customerId;
    const container = document.getElementById('customerDetailContent');
    if (!container) return;
    
    // Tính tổng nợ gốc và tổng đã trả
    const totalDebtOriginal = customer.debtHistory.reduce((sum, d) => sum + d.amount, 0);
    const totalPaid = customer.debtHistory.reduce((sum, d) => sum + d.paidAmount, 0);
    
    container.innerHTML = `
        <div class="customer-detail-header">
            <div class="customer-detail-avatar">${customer.name.charAt(0).toUpperCase()}</div>
            <div class="customer-detail-info">
                <h3>${customer.name}</h3>
                <p>📞 ${customer.phone || 'Chưa có số điện thoại'}</p>
                <p>🏠 ${customer.address || 'Chưa có địa chỉ'}</p>
                <p>📅 Tham gia: ${customer.createdAt}</p>
            </div>
            <div class="customer-detail-actions">
                <button class="btn-edit-customer" onclick="openEditCustomerModal(${customer.id})">✏️ Sửa</button>
                <button class="btn-delete-customer" onclick="deleteCustomer(${customer.id})">🗑️ Xóa</button>
            </div>
        </div>
        
        <div class="customer-stats">
            <div class="stat-card-mini">
                <div class="stat-label">💰 Tổng chi tiêu</div>
                <div class="stat-value">${formatMoney(customer.totalSpent)}</div>
            </div>
            <div class="stat-card-mini debt-stat">
                <div class="stat-label">🔴 Công nợ hiện tại</div>
                <div class="stat-value ${customer.totalDebt > 0 ? 'text-danger' : 'text-success'}">
                    ${customer.totalDebt > 0 ? formatMoney(customer.totalDebt) : '0đ'}
                </div>
            </div>
            <div class="stat-card-mini">
                <div class="stat-label">📋 Tổng số lần nợ</div>
                <div class="stat-value">${customer.debtHistory.length}</div>
            </div>
        </div>
        
        ${customer.totalDebt > 0 ? `
            <div class="debt-payment-section">
                <div class="section-title">💸 Thanh toán công nợ</div>
                <div class="debt-payment-form">
                    <input type="number" id="debtPaymentAmount" placeholder="Số tiền thanh toán" class="payment-input">
                    <select id="debtPaymentMethod" class="payment-input" style="width:auto;">
                        <option value="cash">💰 Tiền mặt</option>
                        <option value="transfer">💳 Chuyển khoản</option>
                    </select>
                    <button class="btn-pay-debt" onclick="processQuickPayment(${customer.id})">Xác nhận</button>
                </div>
            </div>
        ` : ''}
        
        <div class="section-title">📜 Lịch sử các khoản nợ</div>
        <div class="history-timeline">
            ${customer.debtHistory.length === 0 ? '<div class="empty-history">Chưa có khoản nợ nào</div>' : 
                customer.debtHistory.map(d => `
                    <div class="timeline-item ${d.status === 'paid' ? 'paid' : 'unpaid'}">
                        <div class="timeline-date">${new Date(d.date).toLocaleString('vi-VN')}</div>
                        <div class="timeline-type">
                            🛒 ${d.note.substring(0, 60)}${d.note.length > 60 ? '...' : ''}
                        </div>
                        <div class="timeline-amount">Tổng nợ: ${formatMoney(d.amount)}</div>
                        <div class="timeline-amount text-success">Đã trả: ${formatMoney(d.paidAmount)}</div>
                        <div class="timeline-amount text-danger">Còn nợ: ${formatMoney(d.remainingAmount)}</div>
                        <div class="timeline-status ${d.status}">
                            ${d.status === 'paid' ? '✅ Đã tất toán' : (d.status === 'partial' ? '⚠️ Trả một phần' : '🔴 Chưa thanh toán')}
                        </div>
                        ${d.payments.length > 0 ? `
                            <div class="timeline-payments">
                                <div class="payment-title">Lịch sử thanh toán:</div>
                                ${d.payments.map(p => `
                                    <div class="payment-item">📅 ${new Date(p.date).toLocaleString('vi-VN')} - ${formatMoney(p.amount)} (${p.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'})</div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `).join('')
            }
        </div>
        
        <div class="section-title">💰 Lịch sử thanh toán tổng hợp</div>
        <div class="history-timeline">
            ${customer.paymentHistory.length === 0 ? '<div class="empty-history">Chưa có thanh toán nào</div>' : 
                customer.paymentHistory.map(p => `
                    <div class="timeline-item payment">
                        <div class="timeline-date">${new Date(p.date).toLocaleString('vi-VN')}</div>
                        <div class="timeline-type">💸 Thanh toán: ${formatMoney(p.amount)}</div>
                        <div class="timeline-method">Phương thức: ${p.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}</div>
                        <div class="timeline-note">${p.note}</div>
                    </div>
                `).join('')
            }
        </div>
    `;
    
    document.getElementById('customerDetailModal').style.display = 'flex';
}

// ========== THANH TOÁN NHANH TỪ CHI TIẾT ==========
function processQuickPayment(customerId) {
    const amountInput = document.getElementById('debtPaymentAmount');
    const methodSelect = document.getElementById('debtPaymentMethod');
    const amount = parseInt(amountInput.value);
    const method = methodSelect ? methodSelect.value : 'cash';
    
    if (!amount || amount <= 0) {
        showToast('Vui lòng nhập số tiền hợp lệ!', 'warning');
        return;
    }
    
    payCustomerDebt(customerId, amount, method);
    amountInput.value = '';
}

// ========== MỞ MODAL THANH TOÁN NỢ ==========
function openPaymentForCustomer(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer || customer.totalDebt === 0) {
        showToast('Khách hàng không có nợ!', 'warning');
        return;
    }
    
    window.payingCustomerId = customerId;
    
    const modalBody = document.getElementById('debtPaymentModalBody');
    if (!modalBody) return;
    
    const unpaidDebts = customer.debtHistory.filter(d => d.status !== 'paid');
    
    modalBody.innerHTML = `
        <div class="debt-payment-info">
            <div class="debt-payment-customer">👤 ${customer.name}</div>
            <div class="debt-payment-total">💰 Tổng nợ: ${formatMoney(customer.totalDebt)}</div>
            <div class="debt-detail-list">
                ${unpaidDebts.map(d => `
                    <div class="debt-detail-row">
                        <div class="debt-detail-text">${new Date(d.date).toLocaleDateString('vi-VN')}</div>
                        <div class="debt-detail-text">${d.note.substring(0, 30)}...</div>
                        <div class="debt-detail-text">Còn: ${formatMoney(d.remainingAmount)}</div>
                    </div>
                `).join('')}
            </div>
            <div class="form-group">
                <label>Số tiền thanh toán</label>
                <input type="number" id="debtPayAmount" class="form-input" placeholder="Nhập số tiền" max="${customer.totalDebt}">
            </div>
            <div class="form-group">
                <label>Phương thức thanh toán</label>
                <select id="debtPayMethod" class="form-input">
                    <option value="cash">💰 Tiền mặt</option>
                    <option value="transfer">💳 Chuyển khoản</option>
                </select>
            </div>
        </div>
    `;
    
    document.getElementById('debtPaymentModal').style.display = 'flex';
}

function processDebtPayment() {
    const customerId = window.payingCustomerId;
    const amount = parseInt(document.getElementById('debtPayAmount')?.value || 0);
    const method = document.getElementById('debtPayMethod')?.value || 'cash';
    
    if (!amount || amount <= 0) {
        showToast('Vui lòng nhập số tiền hợp lệ!', 'warning');
        return;
    }
    
    payCustomerDebt(customerId, amount, method);
    document.getElementById('debtPaymentModal').style.display = 'none';
}

// ========== THÊM GIAO DỊCH MUA HÀNG (TỪ POS) ==========
function addCustomerOrder(customerId, amount, orderDetail) {
    addCustomerDebt(customerId, amount, orderDetail);
}

// ========== MỞ MODAL THÊM/SỬA KHÁCH HÀNG ==========
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
        showToast('Vui lòng nhập tên khách hàng!', 'warning');
        return;
    }
    
    if (id) {
        const customer = customers.find(c => c.id === parseInt(id));
        if (customer) {
            customer.name = name;
            customer.phone = phone;
            customer.address = address;
            saveCustomers();
            showToast('Đã cập nhật thông tin!', 'success');
        }
    } else {
        addCustomer(name, phone, address);
    }
    
    closeModal('customerFormModal');
    renderCustomerList();
    renderDebtList();
    if (id) renderCustomerDetail(parseInt(id));
}

function deleteCustomer(customerId) {
    if (confirm('Xóa khách hàng này? Dữ liệu lịch sử nợ sẽ mất!')) {
        customers = customers.filter(c => c.id !== customerId);
        saveCustomers();
        renderCustomerList();
        renderDebtList();
        closeModal('customerDetailModal');
        showToast('Đã xóa khách hàng!', 'success');
    }
}

// ========== CHỌN KHÁCH HÀNG (TÍCH HỢP POS) ==========
function showCustomerSelector(callback) {
    window.customerSelectCallback = callback;
    const container = document.getElementById('customerSelectorList');
    if (!container) return;
    
    container.innerHTML = customers.map(c => `
        <div class="customer-select-item" onclick="selectCustomer(${c.id})">
            <div class="customer-select-avatar">${c.name.charAt(0).toUpperCase()}</div>
            <div class="customer-select-info">
                <div class="customer-select-name">${c.name}</div>
                <div class="customer-select-debt">${c.totalDebt > 0 ? `🔴 Nợ ${formatMoney(c.totalDebt)}` : '✅ Hết nợ'}</div>
            </div>
        </div>
    `).join('');
    
    container.innerHTML += `
        <div class="customer-select-item add-new" onclick="openAddCustomerModalFromSelector()">
            <div class="customer-select-avatar">➕</div>
            <div class="customer-select-info">
                <div class="customer-select-name">Thêm khách hàng mới</div>
            </div>
        </div>
    `;
    
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
    const keyword = document.getElementById('customerSelectorSearch')?.value.toLowerCase() || '';
    const items = document.querySelectorAll('#customerSelectorList .customer-select-item:not(.add-new)');
    items.forEach(item => {
        const name = item.querySelector('.customer-select-name')?.innerText.toLowerCase() || '';
        item.style.display = name.includes(keyword) ? 'flex' : 'none';
    });
}

// ========== TIỆN ÍCH ==========
function formatMoney(amount) {
    return amount.toLocaleString('vi-VN') + 'đ';
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
        console.log(message);
        return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : (type === 'warning' ? '⚠️' : 'ℹ️'));
    toast.innerHTML = `${icon} ${message}`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'toastSlideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

// ========== EXPORT GLOBAL ==========
window.customers = customers;
window.initCustomers = initCustomers;
window.renderCustomerList = renderCustomerList;
window.renderDebtList = renderDebtList;
window.searchCustomerList = searchCustomerList;
window.renderCustomerDetail = renderCustomerDetail;
window.openAddCustomerModal = openAddCustomerModal;
window.openEditCustomerModal = openEditCustomerModal;
window.saveCustomerForm = saveCustomerForm;
window.deleteCustomer = deleteCustomer;
window.showCustomerSelector = showCustomerSelector;
window.selectCustomer = selectCustomer;
window.filterCustomerSelector = filterCustomerSelector;
window.addCustomerDebt = addCustomerDebt;
window.payCustomerDebt = payCustomerDebt;
window.addCustomerOrder = addCustomerOrder;
window.openPaymentForCustomer = openPaymentForCustomer;
window.processDebtPayment = processDebtPayment;
window.processQuickPayment = processQuickPayment;
window.formatMoney = formatMoney;
window.showToast = showToast;
window.closeModal = closeModal;