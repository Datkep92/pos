// ========== QUẢN LÝ MENU (ĐỒNG BỘ FIREBASE) ==========
let menuCategories = [];
let menuItems = [];
let tempFormula = [];

async function initMenu() {
    try {
        menuCategories = await DB.getAll('menu_categories') || [];
        menuItems = await DB.getAll('menu') || [];
        window.menuCategories = menuCategories;
        window.menuItems = menuItems;
        renderMenuManager();
        console.log(`✅ Menu loaded: ${menuCategories.length} categories, ${menuItems.length} items`);
    } catch (error) {
        console.error('Lỗi load menu:', error);
    }
}

// Lưu categories (đồng bộ)
async function saveCategoriesToDB() {
    for (const cat of menuCategories) {
        await DB.create('menu_categories', cat, cat.id);
    }
    window.menuCategories = menuCategories;
}

async function saveItemsToDB() {
    for (const item of menuItems) {
        await DB.create('menu', item, item.id);
    }
    window.menuItems = menuItems;
}

function renderMenuManager() {

    menuItems = window.menuItems || [];
    menuCategories = window.menuCategories || [];

    const catContainer = document.getElementById('menuCategories');
    if (!catContainer) return;
    if (menuCategories.length === 0) {
        catContainer.innerHTML = '<div class="empty-state">Chưa có danh mục. Hãy thêm danh mục đầu tiên.</div>';
    } else {
        catContainer.innerHTML = `
            <div class="category-chip active" data-cat="all" onclick="filterMenuByCategory('all')">📋 Tất cả</div>
            ${menuCategories.map(c => `
                <div class="category-chip" data-cat="${c.id}" style="border-left: 3px solid ${c.color || '#f97316'};" onclick="filterMenuByCategory(${c.id})">
                    ${c.icon || '📌'} ${c.name}
                    <span class="category-actions">
                        <button onclick="event.stopPropagation(); editCategory('${c.id}')">✏️</button>
                        <button onclick="event.stopPropagation(); deleteCategory('${c.id}')">🗑️</button>
                    </span>
                </div>
            `).join('')}
        `;
    }
    filterMenuByCategory('all');
}

async function filterMenuByCategory(categoryId) {
    const container = document.getElementById('menuItemsGrid');
    if (!container) return;
    let items = menuItems;
    if (categoryId !== 'all') items = items.filter(i => i.categoryId == categoryId);
    if (items.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:40px;">📭 Không có món</div>';
        return;
    }
    container.innerHTML = items.map(item => `
        <div class="menu-item-card">
            <div class="menu-item-name">${item.name}</div>
            <div class="menu-item-price">${formatMoney(item.price)}</div>
            <div class="menu-item-ingredients">🧂 ${(item.ingredients || []).length} nguyên liệu</div>
            <div><button class="btn-small" onclick="editItem('${item.id}')">✏️ Sửa</button>
            <button class="btn-small" style="background:#dc2626;" onclick="deleteItem('${item.id}')">🗑️ Xóa</button></div>
        </div>
    `).join('');
}

// Danh mục
async function openCategoryModal() {
    document.getElementById('categoryModalTitle').innerText = '➕ Thêm danh mục';
    document.getElementById('categoryId').value = '';
    document.getElementById('categoryName').value = '';
    document.getElementById('categoryColor').value = '#f97316';
    document.getElementById('categoryModal').style.display = 'flex';
}

async function editCategory(id) {
    const cat = menuCategories.find(c => c.id == id);
    if (!cat) return;
    document.getElementById('categoryModalTitle').innerText = '✏️ Sửa danh mục';
    document.getElementById('categoryId').value = cat.id;
    document.getElementById('categoryName').value = cat.name;
    document.getElementById('categoryColor').value = cat.color || '#f97316';
    document.getElementById('categoryModal').style.display = 'flex';
}

async function saveCategory() {
    const id = document.getElementById('categoryId').value;
    const name = document.getElementById('categoryName').value.trim();
    const color = document.getElementById('categoryColor').value;
    if (!name) { showToast('Nhập tên danh mục!', 'warning'); return; }
    if (id) {
        const index = menuCategories.findIndex(c => c.id == id);
        if (index !== -1) {
            menuCategories[index] = { ...menuCategories[index], name, color };
            await DB.update('menu_categories', id, menuCategories[index]);
        }
    } else {
        const newId = Date.now().toString();
        const newCat = { id: newId, name, color, icon: '📌' };
        menuCategories.push(newCat);
        await DB.create('menu_categories', newCat);
    }
    window.menuCategories = menuCategories;
    renderMenuManager();
    closeModal('categoryModal');
    showToast('Đã lưu danh mục', 'success');
}

async function deleteCategory(id) {
    if (menuItems.some(i => i.categoryId == id)) {
        showToast('Danh mục có món, không thể xóa!', 'error');
        return;
    }
    if (confirm('Xóa danh mục?')) {
        menuCategories = menuCategories.filter(c => c.id != id);
        await DB.remove('menu_categories', id);
        window.menuCategories = menuCategories;
        renderMenuManager();
        showToast('Đã xóa danh mục', 'success');
    }
}

// Món
async function openItemModal() {
    if (menuCategories.length === 0) {
        showToast('Cần tạo danh mục trước!', 'warning');
        return;
    }
    document.getElementById('itemModalTitle').innerText = '➕ Thêm món';
    document.getElementById('itemId').value = '';
    document.getElementById('itemName').value = '';
    document.getElementById('itemPrice').value = '';
    populateCategorySelect();
    tempFormula = [];
    renderIngredientsFormula();
    document.getElementById('itemModal').style.display = 'flex';
}

async function editItem(id) {
    const item = menuItems.find(i => i.id == id);
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
    select.innerHTML = '<option value="">-- Chọn danh mục --</option>' +
        menuCategories.map(c => `<option value="${c.id}" ${selectedId == c.id ? 'selected' : ''}>${c.icon || '📌'} ${c.name}</option>`).join('');
}

function renderIngredientsFormula() {
    const container = document.getElementById('ingredientsFormula');
    if (!container) return;
    const ings = window.ingredients || [];
    if (ings.length === 0) {
        container.innerHTML = `<div style="padding:10px; text-align:center;">Chưa có nguyên liệu. <button class="btn-small" onclick="openIngredientModal()">Thêm</button></div>`;
        return;
    }
    if (tempFormula.length === 0) {
        container.innerHTML = `<div style="padding:10px;">Chưa có nguyên liệu</div><button class="btn-add-ingredient-formula" onclick="addIngredientToFormula()">➕ Thêm</button>`;
        return;
    }
    let html = '';
    tempFormula.forEach((ing, idx) => {
        const ingObj = ings.find(i => i.id == ing.ingredientId);
        html += `
            <div class="formula-row">
                <select class="form-input" onchange="updateFormulaIngredient(${idx}, this.value)">
                    <option value="">-- Chọn --</option>
                    ${ings.map(i => `<option value="${i.id}" ${i.id == ing.ingredientId ? 'selected' : ''}>${i.name} (${i.unit})</option>`).join('')}
                </select>
                <input type="number" class="form-input" placeholder="SL" value="${ing.quantity || 0}" step="0.1" onchange="updateFormulaQuantity(${idx}, this.value)">
                <button class="btn-small" style="background:#dc2626;" onclick="removeFormulaIngredient(${idx})">X</button>
            </div>
        `;
    });
    html += `<button class="btn-add-ingredient-formula" onclick="addIngredientToFormula()">➕ Thêm</button>`;
    container.innerHTML = html;
}

function addIngredientToFormula() { tempFormula.push({ ingredientId: null, quantity: 0 }); renderIngredientsFormula(); }
function updateFormulaIngredient(idx, ingredientId) { if (tempFormula[idx]) tempFormula[idx].ingredientId = String(ingredientId); }
function updateFormulaQuantity(idx, quantity) { if (tempFormula[idx]) tempFormula[idx].quantity = parseFloat(quantity) || 0; }
function removeFormulaIngredient(idx) { tempFormula.splice(idx, 1); renderIngredientsFormula(); }

async function saveItem() {
    const id = document.getElementById('itemId').value;
    const name = document.getElementById('itemName').value.trim();
    let categoryId = document.getElementById('itemCategory').value;
    const price = parseInt(document.getElementById('itemPrice').value);
    const ingredients = tempFormula.filter(ing => ing.ingredientId && ing.quantity > 0);
    if (!name || !price || !categoryId) { showToast('Nhập đủ thông tin!', 'warning'); return; }
    categoryId = String(categoryId); // Ép về string để đồng bộ Firebase
    if (id) {
        const index = menuItems.findIndex(i => i.id == id);
        if (index !== -1) {
            const updatedItem = { ...menuItems[index], name, categoryId, price, ingredients };
            await DB.update('menu', id, updatedItem);
            menuItems[index] = updatedItem;
        }
    } else {
        const newId = Date.now().toString();
        const newItem = { id: newId, name, categoryId, price, ingredients };
        await DB.create('menu', newItem);
        menuItems.push(newItem);
    }
    window.menuItems = menuItems;
    renderMenuManager();
    closeModal('itemModal');
    showToast(`Đã lưu món "${name}"`, 'success');
}

async function deleteItem(id) {
    if (confirm('Xóa món?')) {
        await DB.remove('menu', id);
        menuItems = menuItems.filter(i => i.id != id);
        window.menuItems = menuItems;
        renderMenuManager();
        showToast('Đã xóa món', 'success');
    }
}

// Các hàm render popup (giữ nguyên)
function renderOrderCategories() {
    const container = document.getElementById('orderCategories');
    if (!container) return;
    if (menuCategories.length === 0) { container.innerHTML = '<div>Chưa có danh mục</div>'; return; }
    container.innerHTML = `<div class="category-chip active" data-cat="all" onclick="filterOrderMenuByCategory('all')">📋 Tất cả</div>
        ${menuCategories.map(c => `<div class="category-chip" data-cat="${c.id}" onclick="filterOrderMenuByCategory(${c.id})">${c.icon || '📌'} ${c.name}</div>`).join('')}`;
}

function renderOrderMenuByCategory(categoryId = 'all', searchTerm = '') {
    const container = document.getElementById('menuGridOrder');
    if (!container) return;
    let items = [...menuItems];
    if (categoryId !== 'all') items = items.filter(i => i.categoryId == categoryId);
    if (searchTerm) items = items.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));
    if (items.length === 0) { container.innerHTML = '<div style="padding:40px;">📭 Không có món</div>'; return; }
    container.innerHTML = items.map(item => `<div class="menu-item-simple" onclick="addToTempOrder('${item.name}', ${item.price})">${item.name}<br><span style="font-size:10px;">${formatMoney(item.price)}</span></div>`).join('');
}

function filterOrderMenuByCategory(categoryId) {
    window.currentOrderCategory = categoryId;
    const searchTerm = document.getElementById('menuSearchInput2')?.value || '';
    renderOrderMenuByCategory(categoryId, searchTerm);
    document.querySelectorAll('#orderCategories .category-chip').forEach(chip => {
        chip.classList.remove('active');
        if ((categoryId === 'all' && chip.getAttribute('data-cat') === 'all') || chip.getAttribute('data-cat') == categoryId)
            chip.classList.add('active');
    });
}

function openOrderModalWithMenu() {
    renderOrderCategories();
    renderOrderMenuByCategory('all', '');
    const searchInput = document.getElementById('menuSearchInput2');
    if (searchInput) searchInput.oninput = (e) => renderOrderMenuByCategory(window.currentOrderCategory || 'all', e.target.value);
}

// Xuất global
window.initMenu = initMenu;
window.renderMenuManager = renderMenuManager;
window.openCategoryModal = openCategoryModal;
window.openItemModal = openItemModal;
window.editCategory = editCategory;
window.editItem = editItem;
window.saveCategory = saveCategory;
window.saveItem = saveItem;
window.deleteCategory = deleteCategory;
window.deleteItem = deleteItem;
window.addIngredientToFormula = addIngredientToFormula;
window.updateFormulaIngredient = updateFormulaIngredient;
window.updateFormulaQuantity = updateFormulaQuantity;
window.removeFormulaIngredient = removeFormulaIngredient;
window.renderOrderCategories = renderOrderCategories;
window.renderOrderMenuByCategory = renderOrderMenuByCategory;
window.filterOrderMenuByCategory = filterOrderMenuByCategory;
window.openOrderModalWithMenu = openOrderModalWithMenu;