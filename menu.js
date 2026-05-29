// ========== QUẢN LÝ MENU ==========
let menuCategories = [];
let menuItems = [];
let nextCategoryId = 1;
let nextItemId = 1;

// DANH MỤC MẶC ĐỊNH
const defaultCategories = [
    { id: 1, name: "Cà phê", color: "#f97316", icon: "☕" },
    { id: 2, name: "Trà", color: "#10b981", icon: "🍵" },
    { id: 3, name: "Nước ngọt", color: "#3b82f6", icon: "🥤" },
    { id: 4, name: "Thuốc lá", color: "#ef4444", icon: "🚬" }
];

// MÓN MẶC ĐỊNH THEO DANH MỤC
const defaultItems = [
    // Cà phê (categoryId: 1)
    { id: 1, name: "Cà phê đen", categoryId: 1, price: 25000, ingredients: [] },
    { id: 2, name: "Cà phê sữa", categoryId: 1, price: 30000, ingredients: [] },
    { id: 3, name: "Bạc xỉu", categoryId: 1, price: 35000, ingredients: [] },
    { id: 4, name: "Cà phê đá", categoryId: 1, price: 25000, ingredients: [] },
    { id: 5, name: "Cappuccino", categoryId: 1, price: 45000, ingredients: [] },
    { id: 6, name: "Latte", categoryId: 1, price: 45000, ingredients: [] },
    // Trà (categoryId: 2)
    { id: 7, name: "Trà chanh", categoryId: 2, price: 20000, ingredients: [] },
    { id: 8, name: "Trà đào", categoryId: 2, price: 25000, ingredients: [] },
    { id: 9, name: "Trà tắc", categoryId: 2, price: 20000, ingredients: [] },
    { id: 10, name: "Trà xanh", categoryId: 2, price: 18000, ingredients: [] },
    { id: 11, name: "Trà sữa", categoryId: 2, price: 30000, ingredients: [] },
    { id: 12, name: "Trà vải", categoryId: 2, price: 25000, ingredients: [] },
    // Nước ngọt (categoryId: 3)
    { id: 13, name: "Coca Cola", categoryId: 3, price: 15000, ingredients: [] },
    { id: 14, name: "Pepsi", categoryId: 3, price: 15000, ingredients: [] },
    { id: 15, name: "Sting dâu", categoryId: 3, price: 12000, ingredients: [] },
    { id: 16, name: "Sting vàng", categoryId: 3, price: 12000, ingredients: [] },
    { id: 17, name: "Redbull", categoryId: 3, price: 18000, ingredients: [] },
    { id: 18, name: "Nước suối", categoryId: 3, price: 10000, ingredients: [] },
    { id: 19, name: "7Up", categoryId: 3, price: 15000, ingredients: [] },
    { id: 20, name: "Mirinda", categoryId: 3, price: 15000, ingredients: [] },
    // Thuốc lá (categoryId: 4)
    { id: 21, name: "Marlboro", categoryId: 4, price: 35000, ingredients: [] },
    { id: 22, name: "Craven A", categoryId: 4, price: 30000, ingredients: [] },
    { id: 23, name: "555", categoryId: 4, price: 32000, ingredients: [] },
    { id: 24, name: "Dunhill", categoryId: 4, price: 40000, ingredients: [] },
    { id: 25, name: "Thăng Long", categoryId: 4, price: 25000, ingredients: [] },
    { id: 26, name: "Sài Gòn", categoryId: 4, price: 22000, ingredients: [] },
    { id: 27, name: "Vinataba", categoryId: 4, price: 20000, ingredients: [] }
];

// ========== KHỞI TẠO ==========
function initMenu() {
    const saved = localStorage.getItem('pos_menu');
    if (saved) {
        const data = JSON.parse(saved);
        menuCategories = data.categories || [];
        menuItems = data.items || [];
        nextCategoryId = Math.max(...menuCategories.map(c => c.id), 0) + 1;
        nextItemId = Math.max(...menuItems.map(i => i.id), 0) + 1;
        
        // Nếu không có danh mục nào, tạo mặc định
        if (menuCategories.length === 0) {
            menuCategories = JSON.parse(JSON.stringify(defaultCategories));
            nextCategoryId = 5;
            saveMenu();
        }
        // Nếu không có món nào, tạo mặc định
        if (menuItems.length === 0) {
            menuItems = JSON.parse(JSON.stringify(defaultItems));
            nextItemId = 28;
            saveMenu();
        }
    } else {
        menuCategories = JSON.parse(JSON.stringify(defaultCategories));
        menuItems = JSON.parse(JSON.stringify(defaultItems));
        nextCategoryId = 5;
        nextItemId = 28;
        saveMenu();
    }
    
    // Xuất global để các file khác dùng
    window.menuCategories = menuCategories;
    window.menuItems = menuItems;
    
    renderMenuManager();
}

function saveMenu() {
    localStorage.setItem('pos_menu', JSON.stringify({ categories: menuCategories, items: menuItems }));
    window.menuCategories = menuCategories;
    window.menuItems = menuItems;
}

// ========== RENDER QUẢN LÝ MENU ==========
function renderMenuManager() {
    const catContainer = document.getElementById('menuCategories');
    if (catContainer) {
        catContainer.innerHTML = `
            <div class="category-chip active" data-cat="all" onclick="filterMenuByCategory('all')">📋 Tất cả</div>
            ${menuCategories.map(c => `
                <div class="category-chip" data-cat="${c.id}" style="border-left: 3px solid ${c.color};" onclick="filterMenuByCategory(${c.id})">
                    ${c.icon || '📌'} ${c.name}
                    <span class="category-actions">
                        <button onclick="event.stopPropagation(); editCategory(${c.id})">✏️</button>
                        <button onclick="event.stopPropagation(); deleteCategory(${c.id})">🗑️</button>
                    </span>
                </div>
            `).join('')}
        `;
    }
    filterMenuByCategory('all');
}

function filterMenuByCategory(categoryId) {
    const container = document.getElementById('menuItemsGrid');
    if (!container) return;
    
    let items = menuItems;
    if (categoryId !== 'all') {
        items = items.filter(i => i.categoryId === categoryId);
    }
    
    if (items.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:#6c757d;">📭 Chưa có món nào trong danh mục này</div>';
        return;
    }
    
    container.innerHTML = items.map(item => {
        const category = menuCategories.find(c => c.id === item.categoryId);
        const ingredientNames = (item.ingredients || []).map(ing => {
            const ingObj = window.ingredients?.find(i => i.id === ing.ingredientId);
            return ingObj ? `${ingObj.name} (${ing.quantity}${ingObj.unit})` : '';
        }).filter(n => n).join(', ');
        
        return `
            <div class="menu-item-card">
                <div class="menu-item-name">${item.name}</div>
                <div class="menu-item-price">${formatMoney(item.price)}</div>
                <div class="menu-item-ingredients">🧂 ${ingredientNames || 'Chưa có nguyên liệu'}</div>
                <div style="margin-top: 8px;">
                    <button class="btn-small" onclick="editItem(${item.id})">✏️ Sửa</button>
                    <button class="btn-small" style="background:#dc2626;" onclick="deleteItem(${item.id})">🗑️ Xóa</button>
                </div>
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('#menuCategories .category-chip').forEach(chip => {
        chip.classList.remove('active');
        if ((categoryId === 'all' && chip.getAttribute('data-cat') === 'all') ||
            (chip.getAttribute('data-cat') == categoryId)) {
            chip.classList.add('active');
        }
    });
}

// ========== HIỂN THỊ DANH MỤC TRONG POPUP THÊM MÓN ==========
function renderOrderCategories() {
    const container = document.getElementById('orderCategories');
    if (!container) return;
    
    container.innerHTML = `
        <div class="category-chip active" data-cat="all" onclick="filterOrderMenuByCategory('all')">📋 Tất cả</div>
        ${menuCategories.map(c => `
            <div class="category-chip" data-cat="${c.id}" style="border-left: 2px solid ${c.color};" onclick="filterOrderMenuByCategory(${c.id})">
                ${c.icon || '📌'} ${c.name}
            </div>
        `).join('')}
    `;
}

// ========== RENDER MENU TRONG POPUP (THEO DANH MỤC) ==========
function renderOrderMenuByCategory(categoryId = 'all', searchTerm = '') {
    const container = document.getElementById('menuGridOrder');
    if (!container) return;
    
    let items = [...menuItems];
    
    // Lọc theo danh mục
    if (categoryId !== 'all') {
        items = items.filter(i => i.categoryId === categoryId);
    }
    
    // Lọc theo tìm kiếm
    if (searchTerm) {
        items = items.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    
    if (items.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:#6c757d;">📭 Không có món nào</div>';
        return;
    }
    
    container.innerHTML = items.map(item => `
        <div class="menu-item-simple" onclick="addToTempOrder('${item.name}', ${item.price})">
            ${item.name}<br>
            <span style="font-size:10px; color:#f97316;">${formatMoney(item.price)}</span>
        </div>
    `).join('');
}

// Hàm lọc theo danh mục khi nhấp vào tab
function filterOrderMenuByCategory(categoryId) {
    window.currentOrderCategory = categoryId;
    const searchTerm = document.getElementById('menuSearchInput2')?.value || '';
    renderOrderMenuByCategory(categoryId, searchTerm);
    
    // Cập nhật active class
    document.querySelectorAll('#orderCategories .category-chip').forEach(chip => {
        chip.classList.remove('active');
        if ((categoryId === 'all' && chip.getAttribute('data-cat') === 'all') ||
            (chip.getAttribute('data-cat') == categoryId)) {
            chip.classList.add('active');
        }
    });
}

// Hàm mở popup thêm món (gọi từ các nút)
function openOrderModalWithMenu() {
    renderOrderCategories();
    window.currentOrderCategory = 'all';
    renderOrderMenuByCategory('all', '');
    
    // Gắn sự kiện tìm kiếm
    const searchInput = document.getElementById('menuSearchInput2');
    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = (e) => {
            renderOrderMenuByCategory(window.currentOrderCategory || 'all', e.target.value);
        };
    }
}

// ========== CÁC HÀM MỞ POPUP ==========
function openAddMenuForTable(tableId) {
    currentContext = { type: 'addToTable', tableId: tableId };
    tempOrder = [];
    
    openOrderModalWithMenu();
    renderTempCartOrder();
    
    const title = document.getElementById('orderModalTitle');
    if (title) title.innerHTML = `➕ Thêm món - ${getTableName(tableId)}`;
    
    const customerRow = document.getElementById('customerSelectRow');
    if (customerRow) customerRow.style.display = 'none';
    
    document.getElementById('orderModal').style.display = 'flex';
}

function openTakeawayModal() {
    currentContext = { type: 'takeaway' };
    currentSelectedCustomer = null;
    tempOrder = [];
    
    openOrderModalWithMenu();
    renderTempCartOrder();
    
    const title = document.getElementById('orderModalTitle');
    if (title) title.innerHTML = '🛵 Bán mang đi';
    
    const customerRow = document.getElementById('customerSelectRow');
    if (customerRow) customerRow.style.display = 'flex';
    
    const customerDisplay = document.getElementById('selectedCustomerDisplay');
    if (customerDisplay) customerDisplay.innerHTML = '👤 Chọn khách hàng (không bắt buộc)';
    
    const clearBtn = document.getElementById('clearCustomerBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    
    document.getElementById('orderModal').style.display = 'flex';
}

function openNewTableModal(tableId, tableName) {
    currentContext = { type: 'newtable', tableId: tableId };
    currentSelectedCustomer = null;
    tempOrder = [];
    
    openOrderModalWithMenu();
    renderTempCartOrder();
    
    const title = document.getElementById('orderModalTitle');
    if (title) title.innerHTML = `🍽️ Tạo đơn - ${tableName}`;
    
    const customerRow = document.getElementById('customerSelectRow');
    if (customerRow) customerRow.style.display = 'flex';
    
    const customerDisplay = document.getElementById('selectedCustomerDisplay');
    if (customerDisplay) customerDisplay.innerHTML = '👤 Chọn khách hàng (gán tên bàn)';
    
    const clearBtn = document.getElementById('clearCustomerBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    
    document.getElementById('orderModal').style.display = 'flex';
}

// ========== QUẢN LÝ DANH MỤC ==========
function openCategoryModal() {
    document.getElementById('categoryModalTitle').innerText = '➕ Thêm danh mục';
    document.getElementById('categoryId').value = '';
    document.getElementById('categoryName').value = '';
    document.getElementById('categoryColor').value = '#f97316';
    document.getElementById('categoryModal').style.display = 'flex';
}

function editCategory(id) {
    const cat = menuCategories.find(c => c.id === id);
    if (!cat) return;
    document.getElementById('categoryModalTitle').innerText = '✏️ Sửa danh mục';
    document.getElementById('categoryId').value = cat.id;
    document.getElementById('categoryName').value = cat.name;
    document.getElementById('categoryColor').value = cat.color;
    document.getElementById('categoryModal').style.display = 'flex';
}

function saveCategory() {
    const id = document.getElementById('categoryId').value;
    const name = document.getElementById('categoryName').value.trim();
    const color = document.getElementById('categoryColor').value;
    
    if (!name) {
        showToast('Vui lòng nhập tên danh mục!', 'warning');
        return;
    }
    
    if (id) {
        const cat = menuCategories.find(c => c.id === parseInt(id));
        if (cat) {
            cat.name = name;
            cat.color = color;
        }
    } else {
        menuCategories.push({ 
            id: nextCategoryId++, 
            name: name, 
            color: color, 
            icon: "📌" 
        });
    }
    saveMenu();
    renderMenuManager();
    closeModal('categoryModal');
    showToast('Đã lưu danh mục!', 'success');
}

function deleteCategory(id) {
    const hasItems = menuItems.some(i => i.categoryId === id);
    if (hasItems) {
        showToast('Không thể xóa danh mục đang có món!', 'error');
        return;
    }
    if (confirm('Xóa danh mục này?')) {
        menuCategories = menuCategories.filter(c => c.id !== id);
        saveMenu();
        renderMenuManager();
        showToast('Đã xóa danh mục!', 'success');
    }
}

// ========== QUẢN LÝ MÓN ==========
let tempFormula = [];

function openItemModal() {
    document.getElementById('itemModalTitle').innerText = '➕ Thêm món';
    document.getElementById('itemId').value = '';
    document.getElementById('itemName').value = '';
    document.getElementById('itemPrice').value = '';
    populateCategorySelect();
    tempFormula = [];
    renderIngredientsFormula();
    document.getElementById('itemModal').style.display = 'flex';
}

function editItem(id) {
    const item = menuItems.find(i => i.id === id);
    if (!item) return;
    document.getElementById('itemModalTitle').innerText = '✏️ Sửa món';
    document.getElementById('itemId').value = item.id;
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemPrice').value = item.price;
    populateCategorySelect(item.categoryId);
    tempFormula = item.ingredients ? [...item.ingredients] : [];
    renderIngredientsFormula();
    document.getElementById('itemModal').style.display = 'flex';
}

function populateCategorySelect(selectedId = null) {
    const select = document.getElementById('itemCategory');
    if (!select) return;
    select.innerHTML = menuCategories.map(c => `<option value="${c.id}" ${selectedId === c.id ? 'selected' : ''}>${c.icon || '📌'} ${c.name}</option>`).join('');
}

function renderIngredientsFormula() {
    const container = document.getElementById('ingredientsFormula');
    if (!container) {
        console.log('Container ingredientsFormula không tồn tại');
        return;
    }
    
    // Lấy danh sách nguyên liệu từ global
    const ingredientsList = window.ingredients || [];
    
    // Kiểm tra nếu chưa có nguyên liệu nào
    if (ingredientsList.length === 0) {
        container.innerHTML = `
            <div style="background: #fff3cd; color: #856404; padding: 12px; border-radius: 12px; text-align: center;">
                ⚠️ Chưa có nguyên liệu nào trong kho!
                <button type="button" class="btn-small" style="display: block; margin: 10px auto 0; background: #f97316;" 
                        onclick="closeModal('itemModal'); setTimeout(() => { openIngredientModal(); }, 100);">
                    ➕ Thêm nguyên liệu ngay
                </button>
            </div>
        `;
        return;
    }
    
    // Nếu chưa có công thức
    if (!tempFormula || tempFormula.length === 0) {
        container.innerHTML = `
            <div style="color:#6c757d; padding: 10px; text-align: center; background: #f8f9fa; border-radius: 8px;">
                Chưa có nguyên liệu nào cho món này
            </div>
            <button type="button" class="btn-add-ingredient-formula" onclick="addIngredientToFormula()" 
                    style="width:100%; margin-top:10px; padding:10px; background:#10b981; color:white; border:none; border-radius:30px; font-weight:500;">
                ➕ Thêm nguyên liệu vào công thức
            </button>
        `;
        return;
    }
    
    // Hiển thị danh sách nguyên liệu đã chọn
    let html = '';
    tempFormula.forEach((ing, idx) => {
        const ingObj = ingredientsList.find(i => i.id === ing.ingredientId);
        html += `
            <div class="formula-row" style="display: flex; gap: 8px; margin-bottom: 10px; align-items: center; flex-wrap: wrap;">
                <select class="form-input" onchange="updateFormulaIngredient(${idx}, this.value)" style="flex: 2; min-width: 120px;">
                    <option value="">-- Chọn nguyên liệu --</option>
                    ${ingredientsList.map(i => `<option value="${i.id}" ${i.id === ing.ingredientId ? 'selected' : ''}>${i.name} (${i.unit}) - ${formatMoney(i.price)}</option>`).join('')}
                </select>
                <input type="number" class="form-input" style="width: 100px;" placeholder="Số lượng" value="${ing.quantity || 0}" step="0.1" onchange="updateFormulaQuantity(${idx}, this.value)">
                <button type="button" class="btn-small" style="background:#dc2626; color:white; padding:8px 12px;" onclick="removeFormulaIngredient(${idx})">✖️ Xóa</button>
            </div>
        `;
    });
    
    html += `
        <button type="button" class="btn-add-ingredient-formula" onclick="addIngredientToFormula()" 
                style="width:100%; margin-top:10px; padding:10px; background:#10b981; color:white; border:none; border-radius:30px; font-weight:500;">
            ➕ Thêm nguyên liệu vào công thức
        </button>
    `;
    
    container.innerHTML = html;
}

function addIngredientToFormula() {
    console.log('addIngredientToFormula được gọi');
    
    // Đảm bảo tempFormula tồn tại
    if (typeof tempFormula === 'undefined') {
        window.tempFormula = [];
    }
    
    // Thêm nguyên liệu mới
    tempFormula.push({ ingredientId: null, quantity: 0 });
    
    // Render lại
    renderIngredientsFormula();
    
    // Cuộn xuống phần mới thêm
    setTimeout(() => {
        const container = document.getElementById('ingredientsFormula');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }, 50);
}

function updateFormulaIngredient(idx, ingredientId) {
    if (idx < tempFormula.length) {
        tempFormula[idx].ingredientId = parseInt(ingredientId);
    }
}

function updateFormulaQuantity(idx, quantity) {
    if (idx < tempFormula.length) {
        tempFormula[idx].quantity = parseFloat(quantity) || 0;
    }
}

function removeFormulaIngredient(idx) {
    tempFormula = tempFormula.filter((_, i) => i !== idx);
    renderIngredientsFormula();
}

function saveItem() {
    const id = document.getElementById('itemId').value;
    const name = document.getElementById('itemName').value.trim();
    const categoryId = parseInt(document.getElementById('itemCategory')?.value || 0);
    const price = parseInt(document.getElementById('itemPrice').value);
    const ingredients = tempFormula.filter(ing => ing.ingredientId && ing.quantity > 0);
    
    if (!name || !price || !categoryId) {
        showToast('Vui lòng nhập đầy đủ thông tin!', 'warning');
        return;
    }
    
    if (id) {
        const item = menuItems.find(i => i.id === parseInt(id));
        if (item) {
            item.name = name;
            item.categoryId = categoryId;
            item.price = price;
            item.ingredients = ingredients;
        }
    } else {
        menuItems.push({ 
            id: nextItemId++, 
            name: name, 
            categoryId: categoryId, 
            price: price, 
            ingredients: ingredients 
        });
    }
    saveMenu();
    renderMenuManager();
    closeModal('itemModal');
    showToast(`Đã lưu món "${name}"!`, 'success');
}

function deleteItem(id) {
    if (confirm('Xóa món này?')) {
        menuItems = menuItems.filter(i => i.id !== id);
        saveMenu();
        renderMenuManager();
        showToast('Đã xóa món!', 'success');
    }
}

// ========== HÀM FORMAT TIỀN ==========
function formatMoney(amount) {
    return amount.toLocaleString('vi-VN') + 'đ';
}

// ========== HÀM TOAST ==========
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
        console.log(message);
        return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '';
    switch (type) {
        case 'success': icon = '✅'; break;
        case 'error': icon = '❌'; break;
        case 'warning': icon = '⚠️'; break;
        default: icon = 'ℹ️';
    }
    
    toast.innerHTML = `${icon} ${message}`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'toastSlideOut 0.3s ease';
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 2500);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

// Hàm getTableName (sẽ được định nghĩa trong script.js)
function getTableName(tableId) {
    if (typeof window.getTableNameById === 'function') {
        return window.getTableNameById(tableId);
    }
    return `Bàn ${tableId}`;
}

// Xuất global
window.menuCategories = menuCategories;
window.menuItems = menuItems;
window.initMenu = initMenu;
window.renderMenuManager = renderMenuManager;
window.filterMenuByCategory = filterMenuByCategory;
window.filterOrderMenuByCategory = filterOrderMenuByCategory;
window.renderOrderMenuByCategory = renderOrderMenuByCategory;
window.openOrderModalWithMenu = openOrderModalWithMenu;
window.openAddMenuForTable = openAddMenuForTable;
window.openTakeawayModal = openTakeawayModal;
window.openNewTableModal = openNewTableModal;
window.openCategoryModal = openCategoryModal;
window.openItemModal = openItemModal;
window.editCategory = editCategory;
window.editItem = editItem;
window.deleteCategory = deleteCategory;
window.deleteItem = deleteItem;
window.saveCategory = saveCategory;
window.saveItem = saveItem;
window.addIngredientToFormula = addIngredientToFormula;
window.updateFormulaIngredient = updateFormulaIngredient;
window.updateFormulaQuantity = updateFormulaQuantity;
window.removeFormulaIngredient = removeFormulaIngredient;
window.formatMoney = formatMoney;
window.showToast = showToast;
window.closeModal = closeModal;