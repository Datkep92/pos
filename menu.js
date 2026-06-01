// ========== QUẢN LÝ MENU (ĐỒNG BỘ FIREBASE REALTIME) ==========
let menuCategories = [];
let menuItems = [];
let tempFormula = [];

async function initMenu() {
    try {
        console.log("📦 Loading menu...");
        const cats = await DB.getAll('menu_categories');
        const items = await DB.getAll('menu');
        menuCategories = cats || [];
        menuItems = items || [];
        window.menuCategories = menuCategories;
        window.menuItems = menuItems;
        renderMenuManager();
        renderOrderCategories();
    } catch (err) {
        console.error("❌ initMenu lỗi:", err);
    }
}

function renderMenuManager() {
    const cats = window.menuCategories;
    const items = window.menuItems;
    menuCategories = Array.isArray(cats) ? cats : [];
    menuItems = Array.isArray(items) ? items : [];

    const catContainer = document.getElementById('menuCategories');
    if (!catContainer) return;
    if (menuCategories.length === 0) {
        catContainer.innerHTML = '<div class="empty-state">Chưa có danh mục. Hãy thêm danh mục đầu tiên.</div>';
    } else {
        catContainer.innerHTML = `
            <div class="category-chip active" data-cat="all" onclick="filterMenuByCategory('all')">📋 Tất cả</div>
            ${menuCategories.map(c => `
                <div class="category-chip" data-cat="${c.id}" style="border-left: 3px solid ${c.color || '#f97316'};" onclick="filterMenuByCategory('${c.id}')">
                    ${c.icon || '📌'} ${escapeHtml(c.name)}
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
            <div class="menu-item-name">${escapeHtml(item.name)}</div>
            <div class="menu-item-price">${formatMoney(item.price)}</div>
            <div class="menu-item-ingredients">🧂 ${(item.ingredients || []).length} nguyên liệu</div>
            <div>
                <button class="btn-small" onclick="editItem('${item.id}')">✏️ Sửa</button>
                <button class="btn-small" style="background:#dc2626;" onclick="deleteItem('${item.id}')">🗑️ Xóa</button>
            </div>
        </div>
    `).join('');
}

// === DANH MỤC ===
async function openCategoryModal() {
    const titleEl = document.getElementById('categoryModalTitle');
    const idEl = document.getElementById('categoryId');
    const nameEl = document.getElementById('categoryName');
    const colorEl = document.getElementById('categoryColor');
    const modalEl = document.getElementById('categoryModal');
    if (!titleEl || !idEl || !nameEl || !colorEl || !modalEl) return;
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
    if (!titleEl || !idEl || !nameEl || !colorEl || !modalEl) return;
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
    if (!idEl || !nameEl || !colorEl) return;
    const id = idEl.value;
    const name = nameEl.value.trim();
    const color = colorEl.value;
    if (!name) { showToast('Nhập tên danh mục!', 'warning'); return; }
    try {
        if (id) {
            await DB.update('menu_categories', id, { name, color });
        } else {
            const newId = Date.now().toString();
            const newCat = { id: newId, name, color, icon: '📌' };
            await DB.create('menu_categories', newCat);
        }
        closeModal('categoryModal');
        showToast('Đã lưu danh mục', 'success');
    } catch (err) {
        console.error(err);
        showToast('Lỗi lưu danh mục', 'error');
    }
}

async function deleteCategory(id) {
    if (menuItems.some(i => i.categoryId == id)) {
        showToast('Danh mục có món, không thể xóa!', 'error');
        return;
    }
    if (!confirm('Xóa danh mục?')) return;
    try {
        await DB.remove('menu_categories', id);
        showToast('Đã xóa danh mục', 'success');
    } catch (err) {
        console.error("❌ deleteCategory lỗi:", err);
        showToast('Lỗi xóa danh mục!', 'error');
    }
}

// === MÓN ===
function populateCategorySelect(selectedId = null) {
    const select = document.getElementById('itemCategory');
    if (!select) return;
    select.innerHTML = '<option value="">-- Chọn danh mục --</option>' +
        menuCategories.map(c => `<option value="${c.id}" ${selectedId == c.id ? 'selected' : ''}>${c.icon || '📌'} ${escapeHtml(c.name)}</option>`).join('');
}

function renderIngredientsFormula() {
    const container = document.getElementById('ingredientsFormula');
    if (!container) return;
    const ings = window.ingredients || [];
    if (!Array.isArray(ings) || ings.length === 0) {
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
    if (!titleEl || !idEl || !nameEl || !priceEl || !modalEl) return;
    titleEl.innerText = '➕ Thêm món';
    idEl.value = '';
    nameEl.value = '';
    priceEl.value = '';
    populateCategorySelect();
    tempFormula = [];
    renderIngredientsFormula();
    modalEl.style.display = 'flex';
}

async function editItem(id) {
    const item = menuItems.find(i => i.id == id);
    if (!item) return;
    const titleEl = document.getElementById('itemModalTitle');
    const idEl = document.getElementById('itemId');
    const nameEl = document.getElementById('itemName');
    const priceEl = document.getElementById('itemPrice');
    const modalEl = document.getElementById('itemModal');
    if (!titleEl || !idEl || !nameEl || !priceEl || !modalEl) return;
    titleEl.innerText = '✏️ Sửa món';
    idEl.value = item.id;
    nameEl.value = item.name;
    priceEl.value = item.price;
    populateCategorySelect(item.categoryId);
    tempFormula = item.ingredients ? [...item.ingredients] : [];
    renderIngredientsFormula();
    modalEl.style.display = 'flex';
}

async function saveItem() {
    const idEl = document.getElementById('itemId');
    const nameEl = document.getElementById('itemName');
    const categorySelect = document.getElementById('itemCategory');
    const priceEl = document.getElementById('itemPrice');
    if (!idEl || !nameEl || !categorySelect || !priceEl) return;
    const id = idEl.value;
    const name = nameEl.value.trim();
    let categoryId = categorySelect.value;
    const price = parseInt(priceEl.value);
    const ingredients = tempFormula.filter(ing => ing.ingredientId && ing.quantity > 0);
    if (!name || !price || !categoryId) { showToast('Nhập đủ thông tin!', 'warning'); return; }
    categoryId = String(categoryId);
    try {
        if (id) {
            await DB.update('menu', id, { name, categoryId, price, ingredients });
        } else {
            const newId = Date.now().toString();
            const newItem = { id: newId, name, categoryId, price, ingredients };
            await DB.create('menu', newItem);
        }
        closeModal('itemModal');
        showToast(`Đã lưu món "${name}"`, 'success');
    } catch (err) {
        console.error(err);
        showToast('Lỗi lưu món', 'error');
    }
}

// ========== XÓA MÓN (SỬ DỤNG DB.remove) ==========
async function deleteItem(id) {
    if (!confirm('Xóa món này?')) return;
    try {
        await DB.remove('menu', id);
        showToast('Đã xóa món', 'success');
        // Dữ liệu sẽ tự cập nhật realtime qua db.js
    } catch (err) {
        console.error("❌ deleteItem lỗi:", err);
        showToast('Lỗi xóa món! Vui lòng kiểm tra console.', 'error');
    }
}

// === Các hàm render cho popup order ===
function renderOrderCategories() {
    const container = document.getElementById('orderCategories');
    if (!container) return;
    const cats = Array.isArray(window.menuCategories) ? window.menuCategories : [];
    if (cats.length === 0) { container.innerHTML = '<div>Chưa có danh mục</div>'; return; }
    container.innerHTML = `<div class="category-chip active" data-cat="all" onclick="filterOrderMenuByCategory('all')">📋 Tất cả</div>
        ${cats.map(c => `<div class="category-chip" data-cat="${c.id}" onclick="filterOrderMenuByCategory('${c.id}')">${c.icon || '📌'} ${escapeHtml(c.name)}</div>`).join('')}`;
}

function renderOrderMenuByCategory(categoryId = 'all', searchTerm = '') {
    const container = document.getElementById('menuGridOrder');
    if (!container) return;
    let items = Array.isArray(window.menuItems) ? [...window.menuItems] : [];
    if (categoryId !== 'all') items = items.filter(i => i.categoryId == categoryId);
    if (searchTerm) items = items.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));
    if (items.length === 0) { container.innerHTML = '<div style="padding:40px;">📭 Không có món</div>'; return; }
    container.innerHTML = items.map(item => `
        <div class="menu-item-simple" onclick="addToTempOrder('${item.name}', ${item.price})">
            ${escapeHtml(item.name)}<br>
            <span style="font-size:10px;">${formatMoney(item.price)}</span>
        </div>
    `).join('');
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

// Khởi tạo biến toàn cục
window.menuItems = [];
window.menuCategories = [];

// Xuất toàn cục
window.initMenu = initMenu;
window.renderMenuManager = renderMenuManager;
window.openCategoryModal = openCategoryModal;
window.editCategory = editCategory;
window.saveCategory = saveCategory;
window.deleteCategory = deleteCategory;
window.openItemModal = openItemModal;
window.editItem = editItem;
window.saveItem = saveItem;
window.deleteItem = deleteItem;
window.addIngredientToFormula = addIngredientToFormula;
window.updateFormulaIngredient = updateFormulaIngredient;
window.updateFormulaQuantity = updateFormulaQuantity;
window.removeFormulaIngredient = removeFormulaIngredient;
window.renderOrderCategories = renderOrderCategories;
window.renderOrderMenuByCategory = renderOrderMenuByCategory;
window.filterOrderMenuByCategory = filterOrderMenuByCategory;
window.openOrderModalWithMenu = openOrderModalWithMenu;