// ========== QUẢN LÝ NGUYÊN LIỆU (ĐỒNG BỘ FIREBASE) ==========
let ingredients = [];

async function initIngredients() {
    ingredients = await DB.getAll('ingredients') || [];
    window.ingredients = ingredients;
    renderIngredients();
    console.log(`✅ Đã tải ${ingredients.length} nguyên liệu`);
}

function renderIngredients() {
    ingredients = window.ingredients || [];
    const container = document.getElementById('ingredientsList');
    if (!container) return;
    if (ingredients.length === 0) {
        container.innerHTML = `<div class="empty-state">📦 Chưa có nguyên liệu</div><button class="btn-add-ingredient" onclick="openIngredientModal()">+ Thêm</button>`;
        return;
    }
    const minStock = parseInt(localStorage.getItem('settingMinStock') || '10');
    container.innerHTML = ingredients.map(ing => {
        const isLow = ing.stock <= (ing.minStock || minStock);
        return `
            <div class="ingredient-card" onclick="showIngredientDetail('${ing.id}')">
                <div class="ingredient-info">
                    <div class="ingredient-name">${escapeHtml(ing.name)}</div>
                </div>
                <div class="ingredient-stock ${isLow ? 'low' : ''}">📦 ${ing.stock.toLocaleString()} ${ing.unit}</div>
                <div class="ingredient-price">💰 ${formatMoney(ing.price)} / ${ing.unit}</div>
            </div>
        `;
    }).join('');
}

// Hiển thị chi tiết nguyên liệu (popup)
async function showIngredientDetail(id) {
    const ing = ingredients.find(i => i.id === id);
    if (!ing) return;
    document.getElementById('ingredientDetailId').value = ing.id;
    document.getElementById('ingredientDetailName').value = ing.name;
    document.getElementById('ingredientDetailUnit').value = ing.unit;
    document.getElementById('ingredientDetailStock').value = ing.stock;
    document.getElementById('ingredientDetailPrice').value = ing.price;
    document.getElementById('ingredientDetailMinStock').value = ing.minStock || 10;
    document.getElementById('ingredientDetailModal').style.display = 'flex';
}

// Lưu nguyên liệu từ popup chi tiết
async function saveIngredientDetail() {
    const id = document.getElementById('ingredientDetailId').value;
    const name = document.getElementById('ingredientDetailName').value.trim();
    const unit = document.getElementById('ingredientDetailUnit').value;
    const stock = parseFloat(document.getElementById('ingredientDetailStock').value) || 0;
    const price = parseFloat(document.getElementById('ingredientDetailPrice').value) || 0;
    const minStock = parseFloat(document.getElementById('ingredientDetailMinStock').value) || 10;
    if (!name) {
        showToast('Vui lòng nhập tên nguyên liệu!', 'warning');
        return;
    }
    const index = ingredients.findIndex(i => i.id === id);
    if (index !== -1) {
        const updatedIng = { ...ingredients[index], name, unit, stock, price, minStock };
        await DB.update('ingredients', id, updatedIng);
        ingredients[index] = updatedIng;
        window.ingredients = ingredients;
        renderIngredients();
        closeModal('ingredientDetailModal');
        showToast(`Đã cập nhật "${name}"`, 'success');
    }
}

// Xóa nguyên liệu từ popup chi tiết
async function deleteIngredientDetail() {
    const id = document.getElementById('ingredientDetailId').value;
    if (!confirm('Xóa nguyên liệu này?')) return;
    await DB.remove('ingredients', id);
    ingredients = ingredients.filter(i => i.id !== id);
    window.ingredients = ingredients;
    renderIngredients();
    closeModal('ingredientDetailModal');
    showToast('Đã xóa nguyên liệu', 'success');
}

// Mở modal thêm mới nguyên liệu (giữ nguyên)
function openIngredientModal() {
    document.getElementById('ingredientModalTitle').innerText = '➕ Thêm nguyên liệu';
    document.getElementById('ingredientId').value = '';
    document.getElementById('ingredientName').value = '';
    document.getElementById('ingredientUnit').value = 'kg';
    document.getElementById('ingredientStock').value = 0;
    document.getElementById('ingredientPrice').value = 0;
    document.getElementById('ingredientMinStock').value = 10;
    document.getElementById('ingredientModal').style.display = 'flex';
}

async function saveIngredient() {
    const id = document.getElementById('ingredientId').value;
    const name = document.getElementById('ingredientName').value.trim();
    const unit = document.getElementById('ingredientUnit').value;
    const stock = parseFloat(document.getElementById('ingredientStock').value) || 0;
    const price = parseFloat(document.getElementById('ingredientPrice').value) || 0;
    const minStock = parseFloat(document.getElementById('ingredientMinStock').value) || 10;
    if (!name) {
        showToast('Vui lòng nhập tên nguyên liệu!', 'warning');
        return;
    }
    if (id) {
        const index = ingredients.findIndex(i => i.id === id);
        if (index !== -1) {
            const updatedIng = { ...ingredients[index], name, unit, stock, price, minStock };
            await DB.update('ingredients', id, updatedIng);
            ingredients[index] = updatedIng;
        }
    } else {
        const newId = Date.now().toString();
        const newIng = {
            id: newId, name, unit, stock, price, minStock,
            createdAt: Date.now()
        };
        await DB.create('ingredients', newIng);
        ingredients.push(newIng);
    }
    window.ingredients = ingredients;
    renderIngredients();
    closeModal('ingredientModal');
    showToast(`Đã lưu nguyên liệu "${name}"`, 'success');
}

// Xóa nguyên liệu (cũ, có thể giữ nhưng không dùng)
async function deleteIngredient(id) {
    if (confirm('Xóa nguyên liệu này?')) {
        await DB.remove('ingredients', id);
        ingredients = ingredients.filter(i => i.id !== id);
        window.ingredients = ingredients;
        renderIngredients();
        showToast('Đã xóa nguyên liệu', 'success');
    }
}

// Kiểm tra tồn kho thấp
function checkLowStock() {
    const minStock = parseInt(localStorage.getItem('settingMinStock') || '10');
    const lowItems = ingredients.filter(i => i.stock <= (i.minStock || minStock));
    if (lowItems.length === 0) {
        showToast('✅ Tất cả nguyên liệu đều đủ tồn kho!', 'success');
    } else {
        showToast(`⚠️ Tồn kho thấp: ${lowItems.map(i => i.name).join(', ')}`, 'warning');
    }
}

// Trừ nguyên liệu khi bán hàng
async function deductIngredients(orderItems) {
    if (!orderItems || orderItems.length === 0) return;
    const menuItems = window.menuItems || [];
    for (const orderItem of orderItems) {
        const menuItem = menuItems.find(m => m.name === orderItem.name);
        if (menuItem && menuItem.ingredients && menuItem.ingredients.length) {
            for (const req of menuItem.ingredients) {
                const ing = ingredients.find(i => i.id === req.ingredientId);
                if (ing) {
                    const newStock = ing.stock - (req.quantity * orderItem.qty);
                    ing.stock = Math.max(0, newStock);
                    await DB.update('ingredients', ing.id, { stock: ing.stock });
                }
            }
        }
    }
    window.ingredients = ingredients;
    renderIngredients();
}

async function checkStockForItems(orderItems) {
    const menuItems = window.menuItems || [];
    const ingredients = window.ingredients || [];
    for (const orderItem of orderItems) {
        const menuItem = menuItems.find(m => m.name === orderItem.name);
        if (!menuItem) continue;
        const formula = menuItem.ingredients || [];
        for (const req of formula) {
            const ing = ingredients.find(i => i.id === req.ingredientId);
            if (!ing) {
                showToast(`Nguyên liệu không tồn tại cho món ${orderItem.name}`, 'error');
                return false;
            }
            const needed = (req.quantity || 0) * (orderItem.qty || 0);
            if (ing.stock < needed) {
                showToast(`⚠️ Nguyên liệu "${ing.name}" không đủ cho món ${orderItem.name} (cần ${needed} ${ing.unit}, còn ${ing.stock})`, 'error');
                return false;
            }
        }
    }
    return true;
}

// Xuất global
window.ingredients = ingredients;
window.initIngredients = initIngredients;
window.renderIngredients = renderIngredients;
window.openIngredientModal = openIngredientModal;
window.saveIngredient = saveIngredient;
window.deleteIngredient = deleteIngredient;
window.checkLowStock = checkLowStock;
window.deductIngredients = deductIngredients;
window.checkStockForItems = checkStockForItems;
window.showIngredientDetail = showIngredientDetail;
window.saveIngredientDetail = saveIngredientDetail;
window.deleteIngredientDetail = deleteIngredientDetail;