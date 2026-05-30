// ========== QUẢN LÝ NGUYÊN LIỆU (ĐỒNG BỘ FIREBASE) ==========
let ingredients = [];

// Khởi tạo: load từ DB
async function initIngredients() {
    ingredients = await DB.getAll('ingredients') || [];
    window.ingredients = ingredients;
    renderIngredients();
    console.log(`✅ Đã tải ${ingredients.length} nguyên liệu`);
}

// Lưu danh sách ingredients (hàm này không cần thiết vì mỗi thao tác đã gọi DB)
// nhưng giữ để tương thích
async function saveIngredients() {
    // Không cần, vì mỗi item đã được lưu riêng qua DB.create/update
}

// Render danh sách nguyên liệu
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
            <div class="ingredient-card">
                <div class="ingredient-info">
                    <div class="ingredient-name">${ing.name}</div>
                    <div class="ingredient-unit">Đơn vị: ${ing.unit}</div>
                </div>
                <div class="ingredient-stock ${isLow ? 'low' : ''}">📦 ${ing.stock.toLocaleString()} ${ing.unit}</div>
                <div class="ingredient-price">💰 ${formatMoney(ing.price)} / ${ing.unit}</div>
                <div class="ingredient-actions">
                    <button class="btn-edit" onclick="editIngredient('${ing.id}')">✏️</button>
                    <button class="btn-delete" onclick="deleteIngredient('${ing.id}')">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

// Mở modal thêm nguyên liệu
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

// Sửa nguyên liệu
async function editIngredient(id) {
    const ing = ingredients.find(i => i.id === id);
    if (!ing) return;
    document.getElementById('ingredientModalTitle').innerText = '✏️ Sửa nguyên liệu';
    document.getElementById('ingredientId').value = ing.id;
    document.getElementById('ingredientName').value = ing.name;
    document.getElementById('ingredientUnit').value = ing.unit;
    document.getElementById('ingredientStock').value = ing.stock;
    document.getElementById('ingredientPrice').value = ing.price;
    document.getElementById('ingredientMinStock').value = ing.minStock || 10;
    document.getElementById('ingredientModal').style.display = 'flex';
}

// Lưu nguyên liệu (tạo mới hoặc cập nhật)
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
        // Cập nhật
        const index = ingredients.findIndex(i => i.id === id);
        if (index !== -1) {
            const updatedIng = { ...ingredients[index], name, unit, stock, price, minStock };
            await DB.update('ingredients', id, updatedIng);
            ingredients[index] = updatedIng;
        }
    } else {
        // Thêm mới
        const newId = Date.now().toString();
        const newIng = {
            id: newId,
            name,
            unit,
            stock,
            price,
            minStock,
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

// Xóa nguyên liệu
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
    // Lấy danh sách món hiện tại
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
    // Cập nhật ingredients array và UI
    window.ingredients = ingredients;
    renderIngredients();
}
// Kiểm tra tồn kho cho danh sách món trong orderItems
// orderItems: [{ name, qty, price }]
// Trả về true nếu đủ, false nếu thiếu (đã hiển thị toast)
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

// Export hàm kiểm tra
window.checkStockForItems = checkStockForItems;
// Xuất global
window.ingredients = ingredients;
window.initIngredients = initIngredients;
window.renderIngredients = renderIngredients;
window.openIngredientModal = openIngredientModal;
window.editIngredient = editIngredient;
window.saveIngredient = saveIngredient;
window.deleteIngredient = deleteIngredient;
window.checkLowStock = checkLowStock;
window.deductIngredients = deductIngredients;