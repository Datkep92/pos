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
    const titleEl = document.getElementById('categoryModalTitle');
    const idEl = document.getElementById('categoryId');
    const nameEl = document.getElementById('categoryName');
    const colorEl = document.getElementById('categoryColor');
    const modalEl = document.getElementById('categoryModal');
    if (!titleEl || !idEl || !nameEl || !colorEl || !modalEl) {
        console.error('Không tìm thấy các phần tử của modal danh mục');
        showToast('Lỗi giao diện, vui lòng reload trang', 'error');
        return;
    }
    titleEl.innerText = '➕ Thêm danh mục';
    idEl.value = '';
    nameEl.value = '';
    colorEl.value = '#f97316';
    modalEl.style.display = 'flex';
}

async function editCategory(id) {
    const cat = menuCategories.find(c => c.id == id);
    if (!cat) return;
    const titleEl = document.getElementById('categoryModalTitle');
    const idEl = document.getElementById('categoryId');
    const nameEl = document.getElementById('categoryName');
    const colorEl = document.getElementById('categoryColor');
    const modalEl = document.getElementById('categoryModal');
    if (!titleEl || !idEl || !nameEl || !colorEl || !modalEl) {
        showToast('Lỗi giao diện', 'error');
        return;
    }
    titleEl.innerText = '✏️ Sửa danh mục';
    idEl.value = cat.id;
    nameEl.value = cat.name;
    colorEl.value = cat.color || '#f97316';
    modalEl.style.display = 'flex';
}

async function saveCategory() {
    const idEl = document.getElementById('categoryId');
    const nameEl = document.getElementById('categoryName');
    const colorEl = document.getElementById('categoryColor');
    if (!idEl || !nameEl || !colorEl) {
        showToast('Lỗi giao diện, không tìm thấy form', 'error');
        return;
    }
    const id = idEl.value;
    const name = nameEl.value.trim();
    const color = colorEl.value;
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

async function openItemModal() {
    if (menuCategories.length === 0) {
        showToast('Cần tạo danh mục trước!', 'warning');
        return;
    }
    const titleEl = document.getElementById('itemModalTitle');
    const idEl = document.getElementById('itemId');
    const nameEl = document.getElementById('itemName');
    const priceEl = document.getElementById('itemPrice');
    const modalEl = document.getElementById('itemModal');
    if (!titleEl || !idEl || !nameEl || !priceEl || !modalEl) {
        console.error('Không tìm thấy các phần tử của modal món');
        showToast('Lỗi giao diện, vui lòng reload trang', 'error');
        return;
    }
    titleEl.innerText = '➕ Thêm món';
    idEl.value = '';
    nameEl.value = '';
    priceEl.value = '';
    populateCategorySelect();
    tempFormula = [];
    renderIngredientsFormula();
    renderIngredientsGrid(); // nếu có
    modalEl.style.display = 'flex';
}

async function editItem(id) {
    const item = menuItems.find(i => i.id == id);
    if (!item) return;
    document.getElementById('itemModalTitle').innerText = '✏️ Sửa món';
    document.getElementById('itemId').value = item.id;
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemPrice').value = item.price;
    document.getElementById('itemCategory').value = item.categoryId;
    tempFormula = item.ingredients ? [...item.ingredients] : [];
    renderIngredientsFormula();
    renderCategoryGrid(item.categoryId);
    renderIngredientsGrid();
    document.getElementById('itemModal').style.display = 'flex';
}

document.getElementById('addIngredientFormulaBtn')?.addEventListener('click', () => {
    addIngredientToFormula();
});
document.getElementById('ingredientsListGrid')?.addEventListener('click', (e) => {
    const opt = e.target.closest('.ingredient-option');
    if (opt) {
        const ingId = opt.dataset.id;
        const ingName = opt.dataset.name;
        // Thêm vào công thức với số lượng 1 mặc định
        tempFormula.push({ ingredientId: ingId, quantity: 1 });
        renderIngredientsFormula();
    }
});
function populateCategorySelect(selectedId = null) {
    const select = document.getElementById('itemCategory');
    if (!select) return;
    select.innerHTML = '<option value="">-- Chọn danh mục --</option>' +
        menuCategories.map(c => `<option value="${c.id}" ${selectedId == c.id ? 'selected' : ''}>${c.icon || '📌'} ${c.name}</option>`).join('');
}

function renderIngredientsFormula() {
    const container = document.getElementById('ingredientsFormula');
    if (!container) return;
    if (!tempFormula || tempFormula.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:20px;">📭 Chưa có nguyên liệu trong công thức</div>';
        return;
    }
    const ings = window.ingredients || [];
    let html = '';
    tempFormula.forEach((item, idx) => {
        const ing = ings.find(i => i.id == item.ingredientId);
        const ingName = ing ? `${ing.name} (${ing.unit})` : '???';
        html += `
            <div class="formula-row" data-idx="${idx}">
                <div class="formula-ing-name">${escapeHtml(ingName)}</div>
                <input type="number" class="formula-ing-qty" value="${item.quantity}" step="0.1" onchange="updateFormulaQuantity(${idx}, this.value)">
                <button class="btn-remove-formula" onclick="removeFormulaIngredient(${idx})">🗑️</button>
            </div>
        `;
    });
    container.innerHTML = html;
}

function renderIngredientsGrid() {
    const container = document.getElementById('ingredientsGrid');
    if (!container) return;
    const ings = window.ingredients || [];
    if (ings.length === 0) {
        container.innerHTML = '<div style="padding:20px;">Chưa có nguyên liệu. <button class="btn-small" onclick="openIngredientModal()">Thêm</button></div>';
        return;
    }
    container.innerHTML = ings.map(ing => `
        <div class="ingredient-option" data-id="${ing.id}" onclick="addIngredientToFormulaFromGrid('${ing.id}')">
            ${escapeHtml(ing.name)} (${ing.unit})
        </div>
    `).join('');
}

function addIngredientToFormulaFromGrid(ingredientId) {
    const ing = (window.ingredients || []).find(i => i.id == ingredientId);
    if (!ing) return;
    const existing = tempFormula.find(i => i.ingredientId == ingredientId);
    if (existing) {
        existing.quantity = (existing.quantity || 0) + 1;
    } else {
        tempFormula.push({ ingredientId: ingredientId, quantity: 1 });
    }
    renderIngredientsFormula();
}

function addIngredientToFormula() { tempFormula.push({ ingredientId: null, quantity: 0 }); renderIngredientsFormula(); }
function updateFormulaIngredient(idx, ingredientId) { if (tempFormula[idx]) tempFormula[idx].ingredientId = String(ingredientId); }
function updateFormulaQuantity(idx, quantity) { if (tempFormula[idx]) tempFormula[idx].quantity = parseFloat(quantity) || 0; }
function removeFormulaIngredient(idx) { tempFormula.splice(idx, 1); renderIngredientsFormula(); }

async function saveItem() {
    const idEl = document.getElementById('itemId');
    const nameEl = document.getElementById('itemName');
    const categorySelect = document.getElementById('itemCategory');
    const priceEl = document.getElementById('itemPrice');
    if (!idEl || !nameEl || !categorySelect || !priceEl) {
        showToast('Lỗi giao diện', 'error');
        return;
    }
    const id = idEl.value;
    const name = nameEl.value.trim();
    let categoryId = categorySelect.value;
    const price = parseInt(priceEl.value);
    const ingredients = tempFormula.filter(ing => ing.ingredientId && ing.quantity > 0);
    if (!name || !price || !categoryId) { showToast('Nhập đủ thông tin!', 'warning'); return; }
    categoryId = String(categoryId);
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

// Các hàm render popup
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
function renderCategoryGrid(selectedId) {
    const container = document.getElementById('categoryGrid');
    if (!container) return;
    let categories = window.menuCategories || [];
    if (categories.length === 0) {
        container.innerHTML = '<div class="empty-state">Chưa có danh mục</div>';
        return;
    }
    container.innerHTML = categories.map(cat => `
        <div class="category-option ${selectedId == cat.id ? 'active' : ''}" data-id="${cat.id}">
            ${cat.icon || '📌'} ${cat.name}
        </div>
    `).join('');
    // Gắn sự kiện click
    document.querySelectorAll('.category-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.category-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            document.getElementById('itemCategory').value = opt.dataset.id;
        });
    });
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
window.renderCategoryGrid = renderCategoryGrid;
window.renderIngredientsGrid = renderIngredientsGrid;