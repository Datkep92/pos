// inventory-manager.js - Quản lý thực đơn & tồn kho (Admin)
// ES5, tương thích Android 6, iOS 12

// ========== BIẾN TẠM ==========
var _editingCategoryId = null;
var _editingMenuItemId = null;
var _editingIngredientId = null;

// ========== RENDER DANH MỤC ==========
function renderInventoryCategoryFilter() {
    var filter = document.getElementById('invMenuFilter');
    var catSelect = document.getElementById('invMenuItemCategory');
    if (!filter && !catSelect) return;
    
    var cats = menuCategories || [];
    // Sắp xếp theo thứ tự
    cats.sort(function(a, b) { return (a.order || 999) - (b.order || 999); });
    
    var optionsHtml = '<option value="all">📋 Tất cả danh mục</option>';
    var catOptionsHtml = '<option value="">-- Chọn danh mục --</option>';
    for (var i = 0; i < cats.length; i++) {
        var c = cats[i];
        var name = escapeHtml(c.name || '');
        optionsHtml += '<option value="' + c.id + '">' + name + '</option>';
        catOptionsHtml += '<option value="' + c.id + '">' + name + '</option>';
    }
    if (filter) filter.innerHTML = optionsHtml;
    if (catSelect) catSelect.innerHTML = catOptionsHtml;
}

function renderInventoryCategories() {
    var container = document.getElementById('invCategoryList');
    if (!container) return;
    
    var cats = menuCategories || [];
    cats.sort(function(a, b) { return (a.order || 999) - (b.order || 999); });
    
    if (cats.length === 0) {
        container.innerHTML = '<div class="empty-text">Chưa có danh mục nào</div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < cats.length; i++) {
        var c = cats[i];
        html += '<div class="inv-category-item" onclick="editCategory(\'' + c.id + '\')">' +
            '<div class="inv-cat-info">' +
                '<span class="inv-cat-name">' + escapeHtml(c.name || '') + '</span>' +
                '<span class="inv-cat-order">#' + (c.order || '-') + '</span>' +
            '</div>' +
        '</div>';
    }
    container.innerHTML = html;
}

// ========== CRUD DANH MỤC ==========
function showAddCategoryForm() {
    _editingCategoryId = null;
    var form = document.getElementById('addCategoryForm');
    var nameInput = document.getElementById('invCategoryName');
    var orderInput = document.getElementById('invCategoryOrder');
    var errorEl = document.getElementById('invCategoryError');
    if (form) form.style.display = 'block';
    if (nameInput) { nameInput.value = ''; nameInput.focus(); }
    if (orderInput) orderInput.value = '';
    if (errorEl) errorEl.innerText = '';
}

function hideAddCategoryForm() {
    var form = document.getElementById('addCategoryForm');
    if (form) form.style.display = 'none';
    _editingCategoryId = null;
}

function editCategory(catId) {
    if (!catId) return;
    var cats = menuCategories || [];
    var cat = null;
    for (var i = 0; i < cats.length; i++) {
        if (cats[i].id === catId) { cat = cats[i]; break; }
    }
    if (!cat) return;
    
    _editingCategoryId = catId;
    var form = document.getElementById('addCategoryForm');
    var nameInput = document.getElementById('invCategoryName');
    var orderInput = document.getElementById('invCategoryOrder');
    var errorEl = document.getElementById('invCategoryError');
    if (form) form.style.display = 'block';
    if (nameInput) { nameInput.value = cat.name || ''; nameInput.focus(); }
    if (orderInput) orderInput.value = cat.order || '';
    if (errorEl) errorEl.innerText = '';
}

function handleSaveCategory() {
    var nameInput = document.getElementById('invCategoryName');
    var orderInput = document.getElementById('invCategoryOrder');
    var errorEl = document.getElementById('invCategoryError');
    
    if (!nameInput) return;
    var name = nameInput.value.trim();
    if (!name) {
        if (errorEl) errorEl.innerText = 'Vui lòng nhập tên danh mục';
        return;
    }
    
    var order = parseInt(orderInput ? orderInput.value : '') || 0;
    if (errorEl) errorEl.innerText = '';
    
    if (_editingCategoryId) {
        // Cập nhật
        DB.update('menu_categories', _editingCategoryId, {
            name: name,
            order: order
        }).then(function() {
            showToast('Đã cập nhật danh mục', 'success');
            hideAddCategoryForm();
            // Cập nhật menuCategories từ memory cache
            return DB.getAll('menu_categories');
        }).then(function(cats) {
            menuCategories = cats;
            renderInventoryCategories();
            renderInventoryCategoryFilter();
            renderInventoryMenu();
        }).catch(function(err) {
            if (errorEl) errorEl.innerText = err.message || 'Lỗi cập nhật';
        });
    } else {
        // Tạo mới
        DB.create('menu_categories', {
            name: name,
            order: order
        }).then(function(newCat) {
            showToast('Đã thêm danh mục', 'success');
            hideAddCategoryForm();
            menuCategories.push(newCat);
            renderInventoryCategories();
            renderInventoryCategoryFilter();
        }).catch(function(err) {
            if (errorEl) errorEl.innerText = err.message || 'Lỗi tạo danh mục';
        });
    }
}

function deleteCategory(catId) {
    if (!catId) return;
    if (!confirm('Xóa danh mục này? Các món trong danh mục sẽ không bị xóa.')) return;
    
    DB.remove('menu_categories', catId).then(function() {
        showToast('Đã xóa danh mục', 'success');
        menuCategories = menuCategories.filter(function(c) { return c.id !== catId; });
        renderInventoryCategories();
        renderInventoryCategoryFilter();
    }).catch(function(err) {
        showToast('Lỗi xóa danh mục', 'error');
    });
}

// ========== RENDER MÓN ĂN (GRID) ==========
function renderInventoryMenu() {
    var container = document.getElementById('invMenuItemList');
    if (!container) return;
    
    var filter = document.getElementById('invMenuFilter');
    var filterCatId = filter ? filter.value : 'all';
    
    var items = menuItems || [];
    if (filterCatId !== 'all') {
        items = items.filter(function(i) { return String(i.categoryId) === String(filterCatId); });
    }
    
    // Xây lookup category name
    var catMap = {};
    var cats = menuCategories || [];
    for (var i = 0; i < cats.length; i++) {
        catMap[cats[i].id] = cats[i].name;
    }
    
    if (items.length === 0) {
        container.innerHTML = '<div class="empty-text">Chưa có món ăn nào</div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < items.length; i++) {
        var m = items[i];
        var catName = catMap[m.categoryId] || '';
        // Hiển thị số lượng nguyên liệu nếu có
        var ingCount = (m.ingredients && m.ingredients.length) ? m.ingredients.length : 0;
        var ingBadge = ingCount > 0 ? '<span class="inv-menu-ing-badge">' + ingCount + ' NL</span>' : '';
        
        html += '<div class="inv-menu-item" onclick="showMenuItemDetail(\'' + m.id + '\')">' +
            '<div class="inv-menu-info">' +
                '<span class="inv-menu-name">' + escapeHtml(m.name || '') + '</span>' +
                '<span class="inv-menu-price">' + formatMoney(m.price || 0) + '</span>' +
                (catName ? '<span class="inv-menu-cat">' + escapeHtml(catName) + '</span>' : '') +
                ingBadge +
            '</div>' +
        '</div>';
    }
    container.innerHTML = html;
}

// ========== CHI TIẾT MÓN ĂN (POPUP) ==========
function showMenuItemDetail(itemId) {
    if (!itemId) return;
    var items = menuItems || [];
    var item = null;
    for (var i = 0; i < items.length; i++) {
        if (items[i].id === itemId) { item = items[i]; break; }
    }
    if (!item) return;
    
    var titleEl = document.getElementById('menuItemDetailTitle');
    var contentEl = document.getElementById('menuItemDetailContent');
    if (!contentEl) return;
    if (titleEl) titleEl.innerText = '🍽️ ' + (item.name || 'Chi tiết món');
    
    // Build category name
    var catName = '';
    var cats = menuCategories || [];
    for (var i = 0; i < cats.length; i++) {
        if (cats[i].id === item.categoryId) { catName = cats[i].name; break; }
    }
    
    // Build ingredients list (global/shared)
    var ingHtml = '';
    if (item.ingredients && item.ingredients.length > 0) {
        ingHtml = '<div class="detail-section"><strong>🧂 Nguyên liệu (chung):</strong><ul class="detail-ing-list">';
        for (var i = 0; i < item.ingredients.length; i++) {
            var req = item.ingredients[i];
            var ingName = req.ingredientName || '#' + req.ingredientId;
            // Lookup ingredient name from global list
            var ings = ingredients || [];
            for (var j = 0; j < ings.length; j++) {
                if (ings[j].id === req.ingredientId) { ingName = ings[j].name; break; }
            }
            ingHtml += '<li>' + escapeHtml(ingName) + ': ' + req.quantity + ' ' + escapeHtml(req.unit || '') + '</li>';
        }
        ingHtml += '</ul></div>';
    }
    
    // Build per-variant ingredients
    var variantIngHtml = '';
    var variantData = (item.variants && item.variants.length > 0) ? item.variants : (item.sizes || []);
    for (var vi = 0; vi < variantData.length; vi++) {
        var v = variantData[vi];
        if (v.ingredients && v.ingredients.length > 0) {
            variantIngHtml += '<div class="detail-section"><strong>🧂 Nguyên liệu (' + escapeHtml(v.name || '') + '):</strong><ul class="detail-ing-list">';
            for (var i = 0; i < v.ingredients.length; i++) {
                var req = v.ingredients[i];
                var ingName = req.ingredientName || '#' + req.ingredientId;
                var ings = ingredients || [];
                for (var j = 0; j < ings.length; j++) {
                    if (ings[j].id === req.ingredientId) { ingName = ings[j].name; break; }
                }
                variantIngHtml += '<li>' + escapeHtml(ingName) + ': ' + req.quantity + ' ' + escapeHtml(req.unit || '') + '</li>';
            }
            variantIngHtml += '</ul></div>';
        }
    }
    
    if (!ingHtml && !variantIngHtml) {
        ingHtml = '<div class="detail-section"><em>Chưa có nguyên liệu</em></div>';
    }
    
    // Build variants list (sizes)
    var variantsHtml = '';
    if (item.variants && item.variants.length > 0) {
        variantsHtml = '<div class="detail-section"><strong>📏 Size:</strong><ul class="detail-size-list">';
        for (var i = 0; i < item.variants.length; i++) {
            var s = item.variants[i];
            variantsHtml += '<li>' + escapeHtml(s.name || '') + ': ' + formatMoney(s.price || 0) + '</li>';
        }
        variantsHtml += '</ul></div>';
    } else if (item.sizes && item.sizes.length > 0) {
        // Fallback for old data format
        variantsHtml = '<div class="detail-section"><strong>📏 Size:</strong><ul class="detail-size-list">';
        for (var i = 0; i < item.sizes.length; i++) {
            var s = item.sizes[i];
            variantsHtml += '<li>' + escapeHtml(s.name || '') + ': ' + formatMoney(s.price || 0) + '</li>';
        }
        variantsHtml += '</ul></div>';
    }
    
    var html =
        '<div class="menu-detail-info">' +
            '<div class="detail-row"><strong>Tên món:</strong> ' + escapeHtml(item.name || '') + '</div>' +
            '<div class="detail-row"><strong>Giá bán:</strong> ' + formatMoney(item.price || 0) + '</div>' +
            (catName ? '<div class="detail-row"><strong>Danh mục:</strong> ' + escapeHtml(catName) + '</div>' : '') +
        '</div>' +
        variantsHtml +
        ingHtml +
        variantIngHtml +
        '<div class="menu-detail-actions" style="margin-top:16px;display:flex;gap:8px;">' +
            '<button class="btn-save" onclick="closeModal(\'menuItemDetailModal\');editMenuItem(\'' + item.id + '\')" style="flex:1;">✏️ Sửa món</button>' +
            '<button class="btn-danger" onclick="closeModal(\'menuItemDetailModal\');deleteMenuItem(\'' + item.id + '\')" style="flex:1;">🗑️ Xóa</button>' +
        '</div>';
    
    contentEl.innerHTML = html;
    openBottomSheet('menuItemDetailModal');
}

// ========== CRUD MÓN ĂN ==========
function showAddMenuItemForm() {
    _editingMenuItemId = null;
    var form = document.getElementById('addMenuItemForm');
    var nameInput = document.getElementById('invMenuItemName');
    var priceInput = document.getElementById('invMenuItemPrice');
    var catSelect = document.getElementById('invMenuItemCategory');
    var errorEl = document.getElementById('invMenuItemError');
    if (form) form.style.display = 'block';
    if (nameInput) { nameInput.value = ''; nameInput.focus(); }
    if (priceInput) priceInput.value = '';
    if (catSelect) catSelect.value = '';
    if (errorEl) errorEl.innerText = '';
    renderInventoryCategoryFilter();
    // Reset sizes & ingredients
    _resetMenuItemSizes();
    _resetMenuItemIngredients();
}

function hideAddMenuItemForm() {
    var form = document.getElementById('addMenuItemForm');
    if (form) form.style.display = 'none';
    _editingMenuItemId = null;
}

function editMenuItem(itemId) {
    if (!itemId) return;
    var items = menuItems || [];
    var item = null;
    for (var i = 0; i < items.length; i++) {
        if (items[i].id === itemId) { item = items[i]; break; }
    }
    if (!item) return;
    
    _editingMenuItemId = itemId;
    
    // Populate edit modal
    var titleEl = document.getElementById('editMenuItemModalTitle');
    var nameInput = document.getElementById('editMenuItemName');
    var priceInput = document.getElementById('editMenuItemPrice');
    var catSelect = document.getElementById('editMenuItemCategory');
    var errorEl = document.getElementById('editMenuItemError');
    
    if (titleEl) titleEl.innerText = '✏️ Sửa món: ' + (item.name || '');
    if (nameInput) { nameInput.value = item.name || ''; }
    if (priceInput) priceInput.value = item.price || '';
    if (errorEl) errorEl.innerText = '';
    
    // Populate category select
    var cats = menuCategories || [];
    cats.sort(function(a, b) { return (a.order || 999) - (b.order || 999); });
    var catOptionsHtml = '<option value="">-- Chọn danh mục --</option>';
    for (var i = 0; i < cats.length; i++) {
        var selected = String(cats[i].id) === String(item.categoryId) ? ' selected' : '';
        catOptionsHtml += '<option value="' + cats[i].id + '"' + selected + '>' + escapeHtml(cats[i].name || '') + '</option>';
    }
    if (catSelect) catSelect.innerHTML = catOptionsHtml;
    
    // Load variants (sizes) into edit modal
    var sizesContainer = document.getElementById('editMenuItemSizesContainer');
    if (sizesContainer) {
        sizesContainer.innerHTML = '';
        var variantData = (item.variants && item.variants.length > 0) ? item.variants : (item.sizes || []);
        if (variantData.length > 0) {
            for (var i = 0; i < variantData.length; i++) {
                _addEditMenuItemSizeRow(variantData[i].name || '', variantData[i].price || '', variantData[i].ingredients || []);
            }
        } else {
            _addEditMenuItemSizeRow('', '', []);
        }
    }
    
    // Load ingredients into edit modal
    var ingsContainer = document.getElementById('editMenuItemIngredientsContainer');
    if (ingsContainer) {
        ingsContainer.innerHTML = '';
        if (item.ingredients && item.ingredients.length > 0) {
            for (var i = 0; i < item.ingredients.length; i++) {
                _addEditMenuItemIngredientRow(item.ingredients[i].ingredientId || '', item.ingredients[i].quantity || '', item.ingredients[i].unit || '');
            }
        } else {
            _addEditMenuItemIngredientRow('', '', '');
        }
    }
    
    openBottomSheet('editMenuItemModal');
}

// ========== MENU ITEM SIZES ==========
function _resetMenuItemSizes() {
    var container = document.getElementById('menuItemSizesContainer');
    if (!container) return;
    container.innerHTML = '';
    // Add one default empty row
    _addMenuItemSizeRow('', '');
}

function _addMenuItemSizeRow(sizeName, sizePrice, sizeIngredients) {
    var container = document.getElementById('menuItemSizesContainer');
    if (!container) return;
    var rowId = 'size_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    var row = document.createElement('div');
    row.className = 'inv-form-row';
    row.id = rowId;
    row.style.cssText = 'margin-top:4px;flex-direction:column;border:1px solid #e2e8f0;border-radius:6px;padding:8px;';
    
    var headerHtml =
        '<div style="display:flex;gap:6px;align-items:center;width:100%;">' +
            '<input type="text" class="menu-size-name" placeholder="Tên size (VD: Nhỏ)" value="' + escapeHtml(sizeName || '') + '" style="flex:1;">' +
            '<input type="number" class="menu-size-price" placeholder="Giá" value="' + (sizePrice || '') + '" style="flex:0.8;" step="1000">' +
            '<button class="btn-small btn-outline" onclick="' + rowId + '.querySelector(\'.size-ingredients\').classList.toggle(\'size-ing-hidden\')" style="padding:4px 8px;font-size:11px;">🧂</button>' +
            '<button class="btn-small btn-danger" onclick="this.closest(\'.inv-form-row\').remove()" style="padding:4px 8px;">✕</button>' +
        '</div>';
    
    // Build ingredients section for this size
    var ingsHtml = '<div class="size-ingredients size-ing-hidden" style="margin-top:6px;padding-top:6px;border-top:1px solid #e2e8f0;width:100%;">';
    ingsHtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
    ingsHtml += '<span style="font-size:11px;color:#64748b;font-weight:600;">Nguyên liệu cho size này</span>';
    ingsHtml += '<button class="btn-small btn-outline" onclick="' + rowId + '.querySelector(\'.size-ing-rows\').appendChild(_createSizeIngRow(\'\',\'\',\'\'))" style="font-size:10px;padding:2px 6px;">+ Thêm NL</button>';
    ingsHtml += '</div>';
    ingsHtml += '<div class="size-ing-rows">';
    
    // Add ingredient rows
    if (sizeIngredients && sizeIngredients.length) {
        for (var i = 0; i < sizeIngredients.length; i++) {
            var si = sizeIngredients[i];
            ingsHtml += _buildSizeIngRowHtml(si.ingredientId || '', si.quantity || '', si.unit || '');
        }
    } else {
        ingsHtml += _buildSizeIngRowHtml('', '', '');
    }
    
    ingsHtml += '</div></div>';
    
    row.innerHTML = headerHtml + ingsHtml;
    container.appendChild(row);
}

function _buildSizeIngRowHtml(ingId, qty, unit) {
    var ings = ingredients || [];
    var optionsHtml = '<option value="">-- Chọn NL --</option>';
    for (var i = 0; i < ings.length; i++) {
        var ing = ings[i];
        var selected = String(ing.id) === String(ingId) ? ' selected' : '';
        var stock = parseFloat(ing.stock) || 0;
        var unitLabel = ing.unit || '';
        var convInfo = '';
        if (ing.conversionFrom && ing.conversionTo && ing.conversionRate) {
            convInfo = ' (' + Math.round(stock * 10) / 10 + unitLabel + ' → ~' + Math.round(stock * ing.conversionRate) + ing.conversionTo + ')';
        } else {
            convInfo = ' (' + Math.round(stock * 10) / 10 + unitLabel + ')';
        }
        optionsHtml += '<option value="' + ing.id + '"' + selected + '>' + escapeHtml(ing.name || '') + convInfo + '</option>';
    }
    return '<div style="display:flex;gap:4px;margin-top:4px;align-items:center;">' +
        '<select class="menu-ing-select" style="flex:1.2;font-size:11px;padding:4px 6px;">' + optionsHtml + '</select>' +
        '<input type="number" class="menu-ing-qty" placeholder="SL" value="' + (qty || '') + '" style="flex:0.5;font-size:11px;padding:4px 6px;" step="0.1">' +
        '<input type="text" class="menu-ing-unit" placeholder="ĐV" value="' + escapeHtml(unit || '') + '" style="flex:0.5;font-size:11px;padding:4px 6px;">' +
        '<button class="btn-small btn-danger" onclick="this.parentElement.remove()" style="padding:2px 6px;font-size:10px;">✕</button>' +
    '</div>';
}

function _createSizeIngRow(ingId, qty, unit) {
    var div = document.createElement('div');
    div.innerHTML = _buildSizeIngRowHtml(ingId, qty, unit);
    return div.firstElementChild;
}

function _resetMenuItemIngredients() {
    var container = document.getElementById('menuItemIngredientsContainer');
    if (!container) return;
    container.innerHTML = '';
    // Add one default empty row
    _addMenuItemIngredientRow('', '', '');
}

function _addMenuItemIngredientRow(ingId, qty, unit) {
    var container = document.getElementById('menuItemIngredientsContainer');
    if (!container) return;
    
    // Build ingredient options with stock info
    var ings = ingredients || [];
    var optionsHtml = '<option value="">-- Chọn NL --</option>';
    for (var i = 0; i < ings.length; i++) {
        var ing = ings[i];
        var selected = String(ing.id) === String(ingId) ? ' selected' : '';
        var stock = parseFloat(ing.stock) || 0;
        var unitLabel = ing.unit || '';
        // Show conversion info if available
        var convInfo = '';
        if (ing.conversionFrom && ing.conversionTo && ing.conversionRate) {
            convInfo = ' (' + stock + unitLabel + ' → ~' + Math.round(stock * ing.conversionRate) + ing.conversionTo + ')';
        } else {
            convInfo = ' (' + stock + unitLabel + ')';
        }
        optionsHtml += '<option value="' + ing.id + '"' + selected + '>' + escapeHtml(ing.name || '') + convInfo + '</option>';
    }
    
    var row = document.createElement('div');
    row.className = 'inv-form-row';
    row.style.marginTop = '4px';
    row.innerHTML =
        '<select class="menu-ing-select" style="flex:1.2;">' + optionsHtml + '</select>' +
        '<input type="number" class="menu-ing-qty" placeholder="SL" value="' + (qty || '') + '" style="flex:0.5;" step="0.1">' +
        '<input type="text" class="menu-ing-unit" placeholder="ĐV" value="' + escapeHtml(unit || '') + '" style="flex:0.5;">' +
        '<button class="btn-small btn-danger" onclick="this.parentElement.remove()" style="padding:4px 8px;">✕</button>';
    container.appendChild(row);
}

function handleSaveMenuItem() {
    var nameInput = document.getElementById('invMenuItemName');
    var priceInput = document.getElementById('invMenuItemPrice');
    var catSelect = document.getElementById('invMenuItemCategory');
    var errorEl = document.getElementById('invMenuItemError');
    
    if (!nameInput || !priceInput) return;
    var name = nameInput.value.trim();
    var price = parseInt(priceInput.value) || 0;
    var categoryId = catSelect ? catSelect.value : '';
    
    if (!name) {
        if (errorEl) errorEl.innerText = 'Vui lòng nhập tên món';
        return;
    }
    if (price <= 0) {
        if (errorEl) errorEl.innerText = 'Vui lòng nhập giá bán hợp lệ';
        return;
    }
    if (errorEl) errorEl.innerText = '';
    
    // Helper to collect ingredients from a container
    function _collectIngsFromContainer(containerSelector, selectClass, qtyClass, unitClass) {
        var result = [];
        var selEls = document.querySelectorAll(containerSelector + ' .' + selectClass);
        var qtyEls = document.querySelectorAll(containerSelector + ' .' + qtyClass);
        var unitEls = document.querySelectorAll(containerSelector + ' .' + unitClass);
        for (var i = 0; i < selEls.length; i++) {
            var ingId = selEls[i].value;
            var ingQty = parseFloat(qtyEls[i].value) || 0;
            var ingUnit = unitEls[i].value.trim();
            if (ingId && ingQty > 0) {
                var ingName = '';
                var ings = ingredients || [];
                for (var j = 0; j < ings.length; j++) {
                    if (String(ings[j].id) === String(ingId)) { ingName = ings[j].name; break; }
                }
                result.push({
                    ingredientId: ingId,
                    ingredientName: ingName,
                    quantity: ingQty,
                    unit: ingUnit
                });
            }
        }
        return result;
    }
    
    // Collect sizes with per-variant ingredients
    var sizes = [];
    var sizeRows = document.querySelectorAll('#menuItemSizesContainer .inv-form-row');
    for (var i = 0; i < sizeRows.length; i++) {
        var row = sizeRows[i];
        var sNameInput = row.querySelector('.menu-size-name');
        var sPriceInput = row.querySelector('.menu-size-price');
        if (!sNameInput) continue;
        var sName = sNameInput.value.trim();
        var sPrice = parseInt(sPriceInput ? sPriceInput.value : 0) || 0;
        if (!sName) continue;
        
        // Collect per-variant ingredients from this size row
        var sizeIngs = [];
        var ingRows = row.querySelectorAll('.size-ing-rows .menu-ing-select');
        var ingQtyRows = row.querySelectorAll('.size-ing-rows .menu-ing-qty');
        var ingUnitRows = row.querySelectorAll('.size-ing-rows .menu-ing-unit');
        for (var si = 0; si < ingRows.length; si++) {
            var ingId = ingRows[si].value;
            var ingQty = parseFloat(ingQtyRows[si].value) || 0;
            var ingUnit = ingUnitRows[si].value.trim();
            if (ingId && ingQty > 0) {
                var ingName = '';
                var ings = ingredients || [];
                for (var j = 0; j < ings.length; j++) {
                    if (String(ings[j].id) === String(ingId)) { ingName = ings[j].name; break; }
                }
                sizeIngs.push({
                    ingredientId: ingId,
                    ingredientName: ingName,
                    quantity: ingQty,
                    unit: ingUnit
                });
            }
        }
        
        sizes.push({
            name: sName,
            price: sPrice,
            ingredients: sizeIngs.length > 0 ? sizeIngs : []
        });
    }
    
    // Collect global ingredients (shared across all sizes)
    var ingredients_data = _collectIngsFromContainer('#menuItemIngredientsContainer', 'menu-ing-select', 'menu-ing-qty', 'menu-ing-unit');
    
    var hasVariants = sizes.length > 0;
    var data = {
        name: name,
        price: price,
        categoryId: categoryId,
        hasVariants: hasVariants,
        variants: hasVariants ? sizes : [],
        sizes: hasVariants ? sizes : [],
        ingredients: ingredients_data.length > 0 ? ingredients_data : []
    };
    
    if (_editingMenuItemId) {
        DB.update('menu', _editingMenuItemId, data).then(function() {
            showToast('Đã cập nhật món', 'success');
            hideAddMenuItemForm();
            return DB.getAll('menu');
        }).then(function(items) {
            menuItems = items;
            window.menuItems = items;
            renderInventoryMenu();
            _invalidateLookups();
        }).catch(function(err) {
            if (errorEl) errorEl.innerText = err.message || 'Lỗi cập nhật';
        });
    } else {
        DB.create('menu', data).then(function(newItem) {
            showToast('Đã thêm món', 'success');
            hideAddMenuItemForm();
            menuItems.push(newItem);
            window.menuItems = menuItems;
            renderInventoryMenu();
            _invalidateLookups();
        }).catch(function(err) {
            if (errorEl) errorEl.innerText = err.message || 'Lỗi tạo món';
        });
    }
}

function deleteMenuItem(itemId) {
    if (!itemId) return;
    if (!confirm('Xóa món này?')) return;
    
    DB.remove('menu', itemId).then(function() {
        showToast('Đã xóa món', 'success');
        menuItems = menuItems.filter(function(m) { return m.id !== itemId; });
        window.menuItems = menuItems;
        renderInventoryMenu();
        _invalidateLookups();
    }).catch(function(err) {
        showToast('Lỗi xóa món', 'error');
    });
}

// ========== EDIT MENU ITEM MODAL HELPERS ==========
function _addEditMenuItemSizeRow(sizeName, sizePrice, sizeIngredients) {
    var container = document.getElementById('editMenuItemSizesContainer');
    if (!container) return;
    var rowId = 'edit_size_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    var row = document.createElement('div');
    row.className = 'inv-form-row';
    row.id = rowId;
    row.style.cssText = 'margin-top:4px;flex-direction:column;border:1px solid #e2e8f0;border-radius:6px;padding:8px;';
    
    var headerHtml =
        '<div style="display:flex;gap:6px;align-items:center;width:100%;">' +
            '<input type="text" class="edit-menu-size-name" placeholder="Tên size (VD: Nhỏ)" value="' + escapeHtml(sizeName || '') + '" style="flex:1;">' +
            '<input type="number" class="edit-menu-size-price" placeholder="Giá" value="' + (sizePrice || '') + '" style="flex:0.8;" step="1000">' +
            '<button class="btn-small btn-outline" onclick="' + rowId + '.querySelector(\'.edit-size-ingredients\').classList.toggle(\'edit-size-ing-hidden\')" style="padding:4px 8px;font-size:11px;">🧂</button>' +
            '<button class="btn-small btn-danger" onclick="this.closest(\'.inv-form-row\').remove()" style="padding:4px 8px;">✕</button>' +
        '</div>';
    
    // Build ingredients section for this size
    var ingsHtml = '<div class="edit-size-ingredients edit-size-ing-hidden" style="margin-top:6px;padding-top:6px;border-top:1px solid #e2e8f0;width:100%;">';
    ingsHtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
    ingsHtml += '<span style="font-size:11px;color:#64748b;font-weight:600;">Nguyên liệu cho size này</span>';
    ingsHtml += '<button class="btn-small btn-outline" onclick="' + rowId + '.querySelector(\'.edit-size-ing-rows\').appendChild(_createEditSizeIngRow(\'\',\'\',\'\'))" style="font-size:10px;padding:2px 6px;">+ Thêm NL</button>';
    ingsHtml += '</div>';
    ingsHtml += '<div class="edit-size-ing-rows">';
    
    // Add ingredient rows
    if (sizeIngredients && sizeIngredients.length) {
        for (var i = 0; i < sizeIngredients.length; i++) {
            var si = sizeIngredients[i];
            ingsHtml += _buildEditSizeIngRowHtml(si.ingredientId || '', si.quantity || '', si.unit || '');
        }
    } else {
        ingsHtml += _buildEditSizeIngRowHtml('', '', '');
    }
    
    ingsHtml += '</div></div>';
    
    row.innerHTML = headerHtml + ingsHtml;
    container.appendChild(row);
}

function _buildEditSizeIngRowHtml(ingId, qty, unit) {
    var ings = ingredients || [];
    var optionsHtml = '<option value="">-- Chọn NL --</option>';
    for (var i = 0; i < ings.length; i++) {
        var ing = ings[i];
        var selected = String(ing.id) === String(ingId) ? ' selected' : '';
        var stock = parseFloat(ing.stock) || 0;
        var unitLabel = ing.unit || '';
        var convInfo = '';
        if (ing.conversionFrom && ing.conversionTo && ing.conversionRate) {
            convInfo = ' (' + Math.round(stock * 10) / 10 + unitLabel + ' → ~' + Math.round(stock * ing.conversionRate) + ing.conversionTo + ')';
        } else {
            convInfo = ' (' + Math.round(stock * 10) / 10 + unitLabel + ')';
        }
        optionsHtml += '<option value="' + ing.id + '"' + selected + '>' + escapeHtml(ing.name || '') + convInfo + '</option>';
    }
    return '<div style="display:flex;gap:4px;margin-top:4px;align-items:center;">' +
        '<select class="edit-menu-ing-select" style="flex:1.2;font-size:11px;padding:4px 6px;">' + optionsHtml + '</select>' +
        '<input type="number" class="edit-menu-ing-qty" placeholder="SL" value="' + (qty || '') + '" style="flex:0.5;font-size:11px;padding:4px 6px;" step="0.1">' +
        '<input type="text" class="edit-menu-ing-unit" placeholder="ĐV" value="' + escapeHtml(unit || '') + '" style="flex:0.5;font-size:11px;padding:4px 6px;">' +
        '<button class="btn-small btn-danger" onclick="this.parentElement.remove()" style="padding:2px 6px;font-size:10px;">✕</button>' +
    '</div>';
}

function _createEditSizeIngRow(ingId, qty, unit) {
    var div = document.createElement('div');
    div.innerHTML = _buildEditSizeIngRowHtml(ingId, qty, unit);
    return div.firstElementChild;
}

function _addEditMenuItemIngredientRow(ingId, qty, unit) {
    var container = document.getElementById('editMenuItemIngredientsContainer');
    if (!container) return;
    
    var ings = ingredients || [];
    var optionsHtml = '<option value="">-- Chọn NL --</option>';
    for (var i = 0; i < ings.length; i++) {
        var ing = ings[i];
        var selected = String(ing.id) === String(ingId) ? ' selected' : '';
        var stock = parseFloat(ing.stock) || 0;
        var unitLabel = ing.unit || '';
        var convInfo = '';
        if (ing.conversionFrom && ing.conversionTo && ing.conversionRate) {
            convInfo = ' (' + stock + unitLabel + ' → ~' + Math.round(stock * ing.conversionRate) + ing.conversionTo + ')';
        } else {
            convInfo = ' (' + stock + unitLabel + ')';
        }
        optionsHtml += '<option value="' + ing.id + '"' + selected + '>' + escapeHtml(ing.name || '') + convInfo + '</option>';
    }
    
    var row = document.createElement('div');
    row.className = 'inv-form-row';
    row.style.marginTop = '4px';
    row.innerHTML =
        '<select class="edit-menu-ing-select" style="flex:1.2;">' + optionsHtml + '</select>' +
        '<input type="number" class="edit-menu-ing-qty" placeholder="SL" value="' + (qty || '') + '" style="flex:0.5;" step="0.1">' +
        '<input type="text" class="edit-menu-ing-unit" placeholder="ĐV" value="' + escapeHtml(unit || '') + '" style="flex:0.5;">' +
        '<button class="btn-small btn-danger" onclick="this.parentElement.remove()" style="padding:4px 8px;">✕</button>';
    container.appendChild(row);
}

function handleEditMenuItemSave() {
    var nameInput = document.getElementById('editMenuItemName');
    var priceInput = document.getElementById('editMenuItemPrice');
    var catSelect = document.getElementById('editMenuItemCategory');
    var errorEl = document.getElementById('editMenuItemError');
    
    if (!nameInput || !priceInput) return;
    var name = nameInput.value.trim();
    var price = parseInt(priceInput.value) || 0;
    var categoryId = catSelect ? catSelect.value : '';
    
    if (!name) {
        if (errorEl) errorEl.innerText = 'Vui lòng nhập tên món';
        return;
    }
    if (price <= 0) {
        if (errorEl) errorEl.innerText = 'Vui lòng nhập giá bán hợp lệ';
        return;
    }
    if (errorEl) errorEl.innerText = '';
    
    // Collect sizes with per-variant ingredients
    var sizes = [];
    var sizeRows = document.querySelectorAll('#editMenuItemSizesContainer .inv-form-row');
    for (var i = 0; i < sizeRows.length; i++) {
        var row = sizeRows[i];
        var sNameInput = row.querySelector('.edit-menu-size-name');
        var sPriceInput = row.querySelector('.edit-menu-size-price');
        if (!sNameInput) continue;
        var sName = sNameInput.value.trim();
        var sPrice = parseInt(sPriceInput ? sPriceInput.value : 0) || 0;
        if (!sName) continue;
        
        // Collect per-variant ingredients from this size row
        var sizeIngs = [];
        var ingRows = row.querySelectorAll('.edit-size-ing-rows .edit-menu-ing-select');
        var ingQtyRows = row.querySelectorAll('.edit-size-ing-rows .edit-menu-ing-qty');
        var ingUnitRows = row.querySelectorAll('.edit-size-ing-rows .edit-menu-ing-unit');
        for (var si = 0; si < ingRows.length; si++) {
            var ingId = ingRows[si].value;
            var ingQty = parseFloat(ingQtyRows[si].value) || 0;
            var ingUnit = ingUnitRows[si].value.trim();
            if (ingId && ingQty > 0) {
                var ingName = '';
                var ings = ingredients || [];
                for (var j = 0; j < ings.length; j++) {
                    if (String(ings[j].id) === String(ingId)) { ingName = ings[j].name; break; }
                }
                sizeIngs.push({
                    ingredientId: ingId,
                    ingredientName: ingName,
                    quantity: ingQty,
                    unit: ingUnit
                });
            }
        }
        
        sizes.push({
            name: sName,
            price: sPrice,
            ingredients: sizeIngs.length > 0 ? sizeIngs : []
        });
    }
    
    // Collect global ingredients (shared across all sizes)
    var ingredients_data = [];
    var ingSelects = document.querySelectorAll('#editMenuItemIngredientsContainer .edit-menu-ing-select');
    var ingQtys = document.querySelectorAll('#editMenuItemIngredientsContainer .edit-menu-ing-qty');
    var ingUnits = document.querySelectorAll('#editMenuItemIngredientsContainer .edit-menu-ing-unit');
    for (var i = 0; i < ingSelects.length; i++) {
        var ingId = ingSelects[i].value;
        var ingQty = parseFloat(ingQtys[i].value) || 0;
        var ingUnit = ingUnits[i].value.trim();
        if (ingId && ingQty > 0) {
            var ingName = '';
            var ings = ingredients || [];
            for (var j = 0; j < ings.length; j++) {
                if (String(ings[j].id) === String(ingId)) { ingName = ings[j].name; break; }
            }
            ingredients_data.push({
                ingredientId: ingId,
                ingredientName: ingName,
                quantity: ingQty,
                unit: ingUnit
            });
        }
    }
    
    var hasVariants = sizes.length > 0;
    var data = {
        name: name,
        price: price,
        categoryId: categoryId,
        hasVariants: hasVariants,
        variants: hasVariants ? sizes : [],
        sizes: hasVariants ? sizes : [],
        ingredients: ingredients_data.length > 0 ? ingredients_data : []
    };
    
    if (!_editingMenuItemId) {
        if (errorEl) errorEl.innerText = 'Lỗi: không tìm thấy món';
        return;
    }
    
    DB.update('menu', _editingMenuItemId, data).then(function() {
        showToast('Đã cập nhật món', 'success');
        closeModal('editMenuItemModal');
        return DB.getAll('menu');
    }).then(function(items) {
        menuItems = items;
        window.menuItems = items;
        renderInventoryMenu();
        _invalidateLookups();
    }).catch(function(err) {
        if (errorEl) errorEl.innerText = err.message || 'Lỗi cập nhật';
    });
}

// ========== RENDER NGUYÊN LIỆU (GRID) ==========
function renderInventoryIngredients() {
    var container = document.getElementById('invIngredientList');
    if (!container) return;
    
    var ings = ingredients || [];
    
    if (ings.length === 0) {
        container.innerHTML = '<div class="empty-text">Chưa có nguyên liệu nào</div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < ings.length; i++) {
        var ing = ings[i];
        var stock = parseFloat(ing.stock) || 0;
        var minStock = parseFloat(ing.minStock) || 0;
        var isLow = minStock > 0 && stock <= minStock;
        var unit = ing.unit || '';
        
        // Hiển thị thông tin quy đổi nếu có
        var conversionHtml = '';
        var convertedStockHtml = '';
        if (ing.conversionFrom && ing.conversionTo && ing.conversionRate) {
            conversionHtml = '<span class="inv-ing-conversion">1 ' + escapeHtml(ing.conversionFrom) + ' → ' + ing.conversionRate + ' ' + escapeHtml(ing.conversionTo) + '</span>';
            var convertedStock = Math.round(stock * ing.conversionRate * 10) / 10;
            convertedStockHtml = '<span class="inv-ing-converted">' + convertedStock + ' ' + escapeHtml(ing.conversionTo) + '</span>';
        }
        
        // Round stock to 1 decimal
        var displayStock = Math.round(stock * 10) / 10;
        
        html += '<div class="inv-ingredient-item' + (isLow ? ' low-stock' : '') + '" onclick="showIngredientUsage(\'' + ing.id + '\')">' +
            '<div class="inv-ing-info">' +
                '<span class="inv-ing-name">' + escapeHtml(ing.name || '') + '</span>' +
                '<span class="inv-ing-stock ' + (isLow ? 'text-danger' : '') + '">' +
                    displayStock + ' ' + escapeHtml(unit) +
                    (isLow ? ' ⚠️' : '') +
                '</span>' +
                (convertedStockHtml ? '<span class="inv-ing-stock-converted">= ' + convertedStockHtml + '</span>' : '') +
                conversionHtml +
            '</div>' +
        '</div>';
    }
    container.innerHTML = html;
}

// ========== CRUD NGUYÊN LIỆU ==========
function showAddIngredientForm() {
    _editingIngredientId = null;
    var form = document.getElementById('addIngredientForm');
    var nameInput = document.getElementById('invIngredientName');
    var unitInput = document.getElementById('invIngredientUnit');
    var stockInput = document.getElementById('invIngredientStock');
    var minStockInput = document.getElementById('invIngredientMinStock');
    var errorEl = document.getElementById('invIngredientError');
    if (form) form.style.display = 'block';
    if (nameInput) { nameInput.value = ''; nameInput.focus(); }
    if (unitInput) unitInput.value = '';
    if (stockInput) stockInput.value = '';
    if (minStockInput) minStockInput.value = '';
    if (errorEl) errorEl.innerText = '';
    // Reset conversion fields
    var convFrom = document.getElementById('invIngredientConvFrom');
    var convTo = document.getElementById('invIngredientConvTo');
    var convRate = document.getElementById('invIngredientConvRate');
    if (convFrom) convFrom.value = '';
    if (convTo) convTo.value = '';
    if (convRate) convRate.value = '';
}

function hideAddIngredientForm() {
    var form = document.getElementById('addIngredientForm');
    if (form) form.style.display = 'none';
    _editingIngredientId = null;
}

function editIngredient(ingId) {
    if (!ingId) return;
    var ings = ingredients || [];
    var ing = null;
    for (var i = 0; i < ings.length; i++) {
        if (ings[i].id === ingId) { ing = ings[i]; break; }
    }
    if (!ing) return;
    
    _editingIngredientId = ingId;
    
    // Populate edit modal
    var titleEl = document.getElementById('editIngredientModalTitle');
    var nameInput = document.getElementById('editIngredientName');
    var unitInput = document.getElementById('editIngredientUnit');
    var stockInput = document.getElementById('editIngredientStock');
    var minStockInput = document.getElementById('editIngredientMinStock');
    var errorEl = document.getElementById('editIngredientError');
    
    if (titleEl) titleEl.innerText = '✏️ Sửa: ' + (ing.name || '');
    if (nameInput) { nameInput.value = ing.name || ''; }
    if (unitInput) unitInput.value = ing.unit || '';
    if (stockInput) stockInput.value = ing.stock || '';
    if (minStockInput) minStockInput.value = ing.minStock || '';
    if (errorEl) errorEl.innerText = '';
    
    // Load conversion fields
    var convFrom = document.getElementById('editIngredientConvFrom');
    var convTo = document.getElementById('editIngredientConvTo');
    var convRate = document.getElementById('editIngredientConvRate');
    if (convFrom) convFrom.value = ing.conversionFrom || '';
    if (convTo) convTo.value = ing.conversionTo || '';
    if (convRate) convRate.value = ing.conversionRate || '';
    
    openBottomSheet('editIngredientModal');
}

function handleIngredientQuickImport() {
    var ingId = _editingIngredientId;
    if (!ingId) { showToast('Không tìm thấy nguyên liệu', 'error'); return; }
    
    var qtyInput = document.getElementById('editIngredientAddStock');
    if (!qtyInput) return;
    var qty = parseFloat(qtyInput.value);
    if (!qty || qty <= 0) { showToast('Vui lòng nhập số lượng > 0', 'error'); return; }
    
    if (typeof addIngredientStock === 'function') {
        addIngredientStock(ingId, qty).then(function() {
            showToast('✅ Đã nhập kho +' + qty, 'success');
            qtyInput.value = '';
            // Refresh ingredient list
            if (typeof renderInventoryIngredients === 'function') {
                renderInventoryIngredients();
            }
            // Update stock display in edit modal
            var ings = ingredients || [];
            for (var i = 0; i < ings.length; i++) {
                if (ings[i].id === ingId) {
                    var stockInput = document.getElementById('editIngredientStock');
                    if (stockInput) stockInput.value = ings[i].stock || '';
                    break;
                }
            }
        }).catch(function(err) {
            showToast('Lỗi nhập kho: ' + err.message, 'error');
        });
    } else {
        showToast('Chức năng nhập kho chưa sẵn sàng', 'error');
    }
}

function handleSaveIngredient() {
    var nameInput = document.getElementById('invIngredientName');
    var unitInput = document.getElementById('invIngredientUnit');
    var stockInput = document.getElementById('invIngredientStock');
    var minStockInput = document.getElementById('invIngredientMinStock');
    var errorEl = document.getElementById('invIngredientError');
    
    if (!nameInput) return;
    var name = nameInput.value.trim();
    var unit = unitInput ? unitInput.value.trim() : '';
    var stock = parseFloat(stockInput ? stockInput.value : '') || 0;
    var minStock = parseFloat(minStockInput ? minStockInput.value : '') || 0;
    
    if (!name) {
        if (errorEl) errorEl.innerText = 'Vui lòng nhập tên nguyên liệu';
        return;
    }
    if (errorEl) errorEl.innerText = '';
    
    // Collect conversion data
    var convFrom = document.getElementById('invIngredientConvFrom');
    var convTo = document.getElementById('invIngredientConvTo');
    var convRate = document.getElementById('invIngredientConvRate');
    var conversionFrom = convFrom ? convFrom.value.trim() : '';
    var conversionTo = convTo ? convTo.value.trim() : '';
    var conversionRate = parseFloat(convRate ? convRate.value : '') || 0;
    
    var data = {
        name: name,
        unit: unit,
        stock: stock,
        minStock: minStock
    };
    
    // Only save conversion if all fields are filled
    if (conversionFrom && conversionTo && conversionRate > 0) {
        data.conversionFrom = conversionFrom;
        data.conversionTo = conversionTo;
        data.conversionRate = conversionRate;
    } else {
        // Clear conversion if not fully specified
        data.conversionFrom = '';
        data.conversionTo = '';
        data.conversionRate = 0;
    }
    
    if (_editingIngredientId) {
        DB.update('ingredients', _editingIngredientId, data).then(function() {
            showToast('Đã cập nhật nguyên liệu', 'success');
            hideAddIngredientForm();
            return DB.getAll('ingredients');
        }).then(function(ings) {
            ingredients = ings;
            window.ingredients = ings;
            renderInventoryIngredients();
            _invalidateLookups();
        }).catch(function(err) {
            if (errorEl) errorEl.innerText = err.message || 'Lỗi cập nhật';
        });
    } else {
        DB.create('ingredients', data).then(function(newIng) {
            showToast('Đã thêm nguyên liệu', 'success');
            hideAddIngredientForm();
            ingredients.push(newIng);
            window.ingredients = ingredients;
            renderInventoryIngredients();
            _invalidateLookups();
        }).catch(function(err) {
            if (errorEl) errorEl.innerText = err.message || 'Lỗi tạo nguyên liệu';
        });
    }
}

function handleEditIngredientSave() {
    var nameInput = document.getElementById('editIngredientName');
    var unitInput = document.getElementById('editIngredientUnit');
    var stockInput = document.getElementById('editIngredientStock');
    var minStockInput = document.getElementById('editIngredientMinStock');
    var errorEl = document.getElementById('editIngredientError');
    
    if (!nameInput) return;
    var name = nameInput.value.trim();
    var unit = unitInput ? unitInput.value.trim() : '';
    var stock = parseFloat(stockInput ? stockInput.value : '') || 0;
    var minStock = parseFloat(minStockInput ? minStockInput.value : '') || 0;
    
    if (!name) {
        if (errorEl) errorEl.innerText = 'Vui lòng nhập tên nguyên liệu';
        return;
    }
    if (errorEl) errorEl.innerText = '';
    
    // Collect conversion data
    var convFrom = document.getElementById('editIngredientConvFrom');
    var convTo = document.getElementById('editIngredientConvTo');
    var convRate = document.getElementById('editIngredientConvRate');
    var conversionFrom = convFrom ? convFrom.value.trim() : '';
    var conversionTo = convTo ? convTo.value.trim() : '';
    var conversionRate = parseFloat(convRate ? convRate.value : '') || 0;
    
    var data = {
        name: name,
        unit: unit,
        stock: stock,
        minStock: minStock
    };
    
    if (conversionFrom && conversionTo && conversionRate > 0) {
        data.conversionFrom = conversionFrom;
        data.conversionTo = conversionTo;
        data.conversionRate = conversionRate;
    } else {
        data.conversionFrom = '';
        data.conversionTo = '';
        data.conversionRate = 0;
    }
    
    if (!_editingIngredientId) {
        if (errorEl) errorEl.innerText = 'Lỗi: không tìm thấy nguyên liệu';
        return;
    }
    
    DB.update('ingredients', _editingIngredientId, data).then(function() {
        showToast('Đã cập nhật nguyên liệu', 'success');
        closeModal('editIngredientModal');
        return DB.getAll('ingredients');
    }).then(function(ings) {
        ingredients = ings;
        window.ingredients = ings;
        renderInventoryIngredients();
        _invalidateLookups();
    }).catch(function(err) {
        if (errorEl) errorEl.innerText = err.message || 'Lỗi cập nhật';
    });
}

function deleteIngredient(ingId) {
    if (!ingId) return;
    if (!confirm('Xóa nguyên liệu này?')) return;
    
    DB.remove('ingredients', ingId).then(function() {
        showToast('Đã xóa nguyên liệu', 'success');
        ingredients = ingredients.filter(function(i) { return i.id !== ingId; });
        window.ingredients = ingredients;
        renderInventoryIngredients();
        _invalidateLookups();
    }).catch(function(err) {
        showToast('Lỗi xóa nguyên liệu', 'error');
    });
}

// ========== LỊCH SỬ SỬ DỤNG NGUYÊN LIỆU ==========
function showIngredientUsage(ingId) {
    if (!ingId) return;
    window._currentIngId = ingId;
    var ings = ingredients || [];
    var ing = null;
    for (var i = 0; i < ings.length; i++) {
        if (ings[i].id === ingId) { ing = ings[i]; break; }
    }
    if (!ing) return;

    var titleEl = document.getElementById('ingredientUsageTitle');
    var summaryEl = document.getElementById('ingUsageSummary');
    var datesEl = document.getElementById('ingUsageDates');
    var txListEl = document.getElementById('ingTxList');
    if (!datesEl) return;

    if (titleEl) titleEl.innerText = '🧂 ' + (ing.name || 'Nguyên liệu');

    // Reset tabs to show Usage tab by default
    var tabs = document.querySelectorAll('.ing-usage-tab');
    for (var ti = 0; ti < tabs.length; ti++) { tabs[ti].classList.remove('active'); }
    var usageTab = document.querySelector('.ing-usage-tab[data-tab="usage"]');
    if (usageTab) usageTab.classList.add('active');
    var usageContent = document.getElementById('ingUsageTabUsage');
    var txContent = document.getElementById('ingUsageTabTransactions');
    if (usageContent) usageContent.style.display = '';
    if (txContent) txContent.style.display = 'none';

    // Find which menu items use this ingredient
    var menuItems = window.menuItems || [];
    var relatedMenuIds = {};
    var relatedMenuNames = {};
    for (var i = 0; i < menuItems.length; i++) {
        var mi = menuItems[i];
        if (mi.ingredients && mi.ingredients.length > 0) {
            for (var j = 0; j < mi.ingredients.length; j++) {
                if (String(mi.ingredients[j].ingredientId) === String(ingId)) {
                    relatedMenuIds[mi.id] = true;
                    relatedMenuNames[mi.id] = mi.name;
                    break;
                }
            }
        }
        // Also check per-variant ingredients
        var variantData = (mi.variants && mi.variants.length > 0) ? mi.variants : (mi.sizes || []);
        for (var vi = 0; vi < variantData.length; vi++) {
            var vIngs = variantData[vi].ingredients || [];
            for (var j = 0; j < vIngs.length; j++) {
                if (String(vIngs[j].ingredientId) === String(ingId)) {
                    relatedMenuIds[mi.id] = true;
                    relatedMenuNames[mi.id] = mi.name;
                    break;
                }
            }
        }
    }

    var relatedCount = Object.keys(relatedMenuIds).length;

    // Determine display units
    var baseUnit = ing.unit || '';
    var convRate = parseFloat(ing.conversionRate) || 0;
    var convTo = ing.conversionTo || '';
    var hasConv = convRate > 0 && convTo;
    // For usage tab (recipe quantities are in converted unit), use convTo if available
    var displayUnit = hasConv ? convTo : baseUnit;

    // Helper: format quantity with both base and converted units
    function _fmtQty(qty, showConv) {
        var s = Math.round(qty * 100) / 100 + ' ' + baseUnit;
        if (showConv && hasConv) {
            var convQty = Math.round(qty * convRate * 100) / 100;
            s += ' (' + convQty + ' ' + convTo + ')';
        }
        return s;
    }

    // Load transaction history (nhập từ cost_transactions + xuất từ transactions/orders + ingredient_transactions)
    var txPromises = [];
    if (typeof getIngredientTransactions === 'function') {
        txPromises.push(getIngredientTransactions(ingId));
    }
    // Get import data from cost_transactions
    txPromises.push(DB.getAll('cost_transactions').then(function(costs) {
        if (!costs || !costs.length) return [];
        var result = [];
        for (var ci = 0; ci < costs.length; ci++) {
            var c = costs[ci];
            if (c.deleted) continue;
            if (String(c.ingredientId) === String(ingId) || c.categoryId === 'ingredient_' + String(ingId)) {
                result.push({
                    type: 'import',
                    quantity: parseFloat(c.ingredientQty) || parseFloat(c.quantity) || 0,
                    unit: baseUnit,
                    note: 'Mua: ' + (c.ingredientName || c.categoryName || '') + ' - ' + formatMoney(c.amount),
                    dateKey: c.dateKey || '',
                    time: c.date ? c.date.slice(11, 19) : '',
                    createdAt: c.createdAt || 0,
                    _source: 'cost'
                });
            }
        }
        return result;
    }));
    // Get export data from transactions (order history) - same logic as usage tab
    txPromises.push(DB.getAll('transactions').then(function(transactions) {
        if (!transactions || !transactions.length) return [];
        var result = [];
        for (var i = 0; i < transactions.length; i++) {
            var tx = transactions[i];
            if (tx.refunded) continue;
            if (!tx.items || !tx.items.length) continue;
            var dateKey = tx.dateKey || '';
            if (!dateKey) continue;
            for (var j = 0; j < tx.items.length; j++) {
                var orderItem = tx.items[j];
                var baseName = orderItem.name.replace(/\s*\([^)]*\)/g, '').trim();
                var isRelated = false;
                for (var mid in relatedMenuIds) {
                    if (relatedMenuIds.hasOwnProperty(mid)) {
                        if (orderItem.id === mid || relatedMenuNames[mid] === baseName) {
                            isRelated = true;
                            break;
                        }
                    }
                }
                if (!isRelated) continue;
                // Find recipe quantity for this ingredient
                var recipeQty = 0;
                for (var k = 0; k < menuItems.length; k++) {
                    if (menuItems[k].id === orderItem.id || menuItems[k].name === baseName) {
                        if (menuItems[k].ingredients) {
                            for (var l = 0; l < menuItems[k].ingredients.length; l++) {
                                if (String(menuItems[k].ingredients[l].ingredientId) === String(ingId)) {
                                    recipeQty = menuItems[k].ingredients[l].quantity || 0;
                                    break;
                                }
                            }
                        }
                        if (recipeQty === 0) {
                            var variantData = (menuItems[k].variants && menuItems[k].variants.length > 0) ? menuItems[k].variants : (menuItems[k].sizes || []);
                            for (var vi = 0; vi < variantData.length; vi++) {
                                var vIngs = variantData[vi].ingredients || [];
                                for (var l = 0; l < vIngs.length; l++) {
                                    if (String(vIngs[l].ingredientId) === String(ingId)) {
                                        recipeQty = vIngs[l].quantity || 0;
                                        break;
                                    }
                                }
                                if (recipeQty > 0) break;
                            }
                        }
                        break;
                    }
                }
                if (recipeQty <= 0) continue;
                var qtyUsed = recipeQty * orderItem.qty;
                // Convert recipe qty (in display unit) to base unit for consistent display
                var baseQty = hasConv ? (qtyUsed / convRate) : qtyUsed;
                result.push({
                    type: 'export',
                    quantity: baseQty,
                    unit: baseUnit,
                    note: 'Bán: ' + orderItem.name + ' x' + orderItem.qty + ' (' + Math.round(qtyUsed * 100) / 100 + ' ' + displayUnit + ')',
                    dateKey: dateKey,
                    time: tx.time || '',
                    createdAt: tx.createdAt || 0,
                    _source: 'order'
                });
            }
        }
        return result;
    }));

    Promise.all(txPromises).then(function(results) {
        if (txListEl) {
            // Merge all transactions
            var allTx = [];
            for (var ri = 0; ri < results.length; ri++) {
                if (results[ri] && results[ri].length) {
                    allTx = allTx.concat(results[ri]);
                }
            }

            // Tag ingredient_transactions records with _source for dedup
            // (they come from getIngredientTransactions which returns raw store records)
            for (var ti = 0; ti < allTx.length; ti++) {
                if (!allTx[ti]._source) {
                    allTx[ti]._source = 'ing_tx';
                }
            }

            // Deduplicate: remove ingredient_transactions imports that have matching cost_transactions
            // (saveIngredientExpense logs to BOTH ingredient_transactions AND cost_transactions)
            var costKeys = {};
            for (var di = 0; di < allTx.length; di++) {
                if (allTx[di]._source === 'cost') {
                    var key = allTx[di].dateKey + '_' + Math.round(allTx[di].quantity * 1000);
                    costKeys[key] = true;
                }
            }
            var deduped = [];
            for (var di = 0; di < allTx.length; di++) {
                if (allTx[di]._source === 'ing_tx' && allTx[di].type === 'import') {
                    var key = allTx[di].dateKey + '_' + Math.round(allTx[di].quantity * 1000);
                    if (costKeys[key]) continue; // Skip, already in cost_transactions
                }
                deduped.push(allTx[di]);
            }
            allTx = deduped;

            // Get date filter values
            var filterFrom = document.getElementById('ingTxFilterFrom');
            var filterTo = document.getElementById('ingTxFilterTo');
            var fromVal = filterFrom ? filterFrom.value : '';
            var toVal = filterTo ? filterTo.value : '';

            // Apply date filter
            if (fromVal || toVal) {
                var filtered = [];
                for (var fi = 0; fi < allTx.length; fi++) {
                    var dk = allTx[fi].dateKey || '';
                    if (fromVal && dk < fromVal) continue;
                    if (toVal && dk > toVal) continue;
                    filtered.push(allTx[fi]);
                }
                allTx = filtered;
            }

            if (allTx.length === 0) {
                txListEl.innerHTML = '<div class="ing-usage-empty">📭 Chưa có giao dịch nhập/xuất</div>';
            } else {
                // Sort by date (oldest first for running balance), then by time
                allTx.sort(function(a, b) {
                    if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
                    return (a.createdAt || 0) - (b.createdAt || 0);
                });

                // Calculate running balance
                var currentStock = parseFloat(ing.stock) || 0;
                // Work backwards: start from current stock, reverse transactions to get historical balance
                // First, calculate total net change from all transactions
                var totalNetChange = 0;
                for (var si = 0; si < allTx.length; si++) {
                    if (allTx[si].type === 'import') totalNetChange += allTx[si].quantity;
                    else totalNetChange -= allTx[si].quantity;
                }
                // Starting balance = current stock - total net change
                var runningBalance = currentStock - totalNetChange;

                // Group by dateKey (newest first for display)
                var txByDate = {};
                for (var ti = 0; ti < allTx.length; ti++) {
                    var txn = allTx[ti];
                    var dk = txn.dateKey || '';
                    if (!dk) continue;
                    if (!txByDate[dk]) {
                        txByDate[dk] = { items: [], importTotal: 0, exportTotal: 0 };
                    }
                    txByDate[dk].items.push(txn);
                    if (txn.type === 'import') {
                        txByDate[dk].importTotal += txn.quantity;
                    } else {
                        txByDate[dk].exportTotal += txn.quantity;
                    }
                }

                var dateKeys = Object.keys(txByDate).sort().reverse();
                var txHtml = '';
                for (var di = 0; di < dateKeys.length; di++) {
                    var dk = dateKeys[di];
                    var dayData = txByDate[dk];
                    var dateLabel = formatDateDisplay(dk);

                    // Calculate running balance for this date's items (oldest first within the day)
                    var dayItems = dayData.items;
                    dayItems.sort(function(a, b) {
                        return (a.createdAt || 0) - (b.createdAt || 0);
                    });

                    // Build items for this date
                    var dayItemsHtml = '';
                    for (var tii = 0; tii < dayItems.length; tii++) {
                        var txn = dayItems[tii];
                        var isImport = txn.type === 'import';
                        var icon = isImport ? '📥' : '📤';
                        var iconClass = isImport ? 'import' : 'export';
                        var qtyClass = isImport ? 'import' : 'export';
                        var qtyStr = (isImport ? '+' : '-') + _fmtQty(txn.quantity, true);
                        var timeStr = txn.time ? ' ' + txn.time : '';

                        // Update running balance
                        if (isImport) runningBalance += txn.quantity;
                        else runningBalance -= txn.quantity;
                        var balStr = _fmtQty(runningBalance, true);

                        dayItemsHtml +=
                            '<div class="ing-tx-item">' +
                                '<div class="ing-tx-icon ' + iconClass + '">' + icon + '</div>' +
                                '<div class="ing-tx-info">' +
                                    '<div class="ing-tx-note">' + escapeHtml(txn.note || '') + '</div>' +
                                    '<div class="ing-tx-meta">' + timeStr + '</div>' +
                                '</div>' +
                                '<div class="ing-tx-qty ' + qtyClass + '">' + qtyStr + '</div>' +
                                '<div class="ing-tx-balance" title="Tồn còn lại">' + balStr + '</div>' +
                            '</div>';
                    }

                    // Calculate daily net (base unit)
                    var netQty = dayData.importTotal - dayData.exportTotal;
                    var netStr = _fmtQty(Math.abs(netQty), true);
                    if (netQty > 0) netStr = '+' + netStr;
                    else if (netQty < 0) netStr = '-' + netStr;
                    else netStr = '0 ' + baseUnit + (hasConv ? ' (0 ' + convTo + ')' : '');

                    // Build header summary
                    var importStr = '+' + _fmtQty(dayData.importTotal, true);
                    var exportStr = '-' + _fmtQty(dayData.exportTotal, true);

                    txHtml +=
                        '<div class="ing-usage-date-group">' +
                            '<div class="ing-usage-date-header" onclick="toggleIngUsageDate(this)">' +
                                '<div class="date-info">' +
                                    '<span class="date-toggle">▶</span>' +
                                    '<span>' + dateLabel + '</span>' +
                                '</div>' +
                                '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">' +
                                    '<span style="font-size:11px;color:#16a34a;font-weight:500;">Nhập: ' + importStr + '</span>' +
                                    '<span style="font-size:11px;color:#dc2626;font-weight:500;">Xuất: ' + exportStr + '</span>' +
                                    '<span class="date-total" style="font-size:12px;">Tổng: ' + netStr + '</span>' +
                                '</div>' +
                            '</div>' +
                            '<div class="ing-usage-date-body">' +
                                dayItemsHtml +
                            '</div>' +
                        '</div>';
                }
                txListEl.innerHTML = txHtml;
            }
        }
    });

    // Query all transactions to find usage
    DB.getAll('transactions').then(function(transactions) {
        // Group by dateKey
        var usageByDate = {};
        var totalUsed = 0;
        var totalOrders = 0;

        for (var i = 0; i < transactions.length; i++) {
            var tx = transactions[i];
            if (tx.refunded) continue; // Skip refunded transactions
            if (!tx.items || !tx.items.length) continue;

            var dateKey = tx.dateKey || '';
            if (!dateKey) continue;

            for (var j = 0; j < tx.items.length; j++) {
                var orderItem = tx.items[j];
                // Check if this item is related to our ingredient
                var baseName = orderItem.name.replace(/\s*\([^)]*\)/g, '').trim();
                var isRelated = false;
                for (var mid in relatedMenuIds) {
                    if (relatedMenuIds.hasOwnProperty(mid)) {
                        if (orderItem.id === mid || relatedMenuNames[mid] === baseName) {
                            isRelated = true;
                            break;
                        }
                    }
                }
                if (!isRelated) continue;

                // Find the recipe quantity for this ingredient
                var recipeQty = 0;
                for (var k = 0; k < menuItems.length; k++) {
                    if (menuItems[k].id === orderItem.id || menuItems[k].name === baseName) {
                        // Check global ingredients
                        if (menuItems[k].ingredients) {
                            for (var l = 0; l < menuItems[k].ingredients.length; l++) {
                                if (String(menuItems[k].ingredients[l].ingredientId) === String(ingId)) {
                                    recipeQty = menuItems[k].ingredients[l].quantity || 0;
                                    break;
                                }
                            }
                        }
                        // If not found in global, check per-variant ingredients
                        if (recipeQty === 0) {
                            var variantData = (menuItems[k].variants && menuItems[k].variants.length > 0) ? menuItems[k].variants : (menuItems[k].sizes || []);
                            for (var vi = 0; vi < variantData.length; vi++) {
                                var vIngs = variantData[vi].ingredients || [];
                                for (var l = 0; l < vIngs.length; l++) {
                                    if (String(vIngs[l].ingredientId) === String(ingId)) {
                                        recipeQty = vIngs[l].quantity || 0;
                                        break;
                                    }
                                }
                                if (recipeQty > 0) break;
                            }
                        }
                        break;
                    }
                }

                var qtyUsed = recipeQty * orderItem.qty;
                totalUsed += qtyUsed;
                totalOrders += orderItem.qty;

                if (!usageByDate[dateKey]) {
                    usageByDate[dateKey] = {
                        items: {},
                        totalQty: 0,
                        orderCount: 0
                    };
                }
                var itemKey = orderItem.id + '_' + orderItem.name;
                if (!usageByDate[dateKey].items[itemKey]) {
                    usageByDate[dateKey].items[itemKey] = {
                        name: orderItem.name,
                        qty: 0,
                        count: 0
                    };
                }
                usageByDate[dateKey].items[itemKey].qty += qtyUsed;
                usageByDate[dateKey].items[itemKey].count += orderItem.qty;
                usageByDate[dateKey].totalQty += qtyUsed;
                usageByDate[dateKey].orderCount += orderItem.qty;
            }
        }

        var summaryHtml =
            '<div class="usage-stat">' +
                '<span class="usage-stat-label">📦 Món có chứa nguyên liệu:</span>' +
                '<span class="usage-stat-value">' + relatedCount + ' món</span>' +
            '</div>' +
            '<div class="usage-stat">' +
                '<span class="usage-stat-label">📊 Tổng số lượng đã dùng:</span>' +
                '<span class="usage-stat-value">' + Math.round(totalUsed * 100) / 100 + ' ' + escapeHtml(displayUnit) + '</span>' +
            '</div>' +
            '<div class="usage-stat">' +
                '<span class="usage-stat-label">📋 Tổng số món đã bán:</span>' +
                '<span class="usage-stat-value">' + totalOrders + ' món</span>' +
            '</div>' +
            '<div style="margin-top:8px;display:flex;gap:6px;">' +
                '<button class="btn-small btn-outline" onclick="closeModal(\'ingredientUsageModal\');editIngredient(\'' + ing.id + '\')" style="flex:1;font-size:12px;">✏️ Sửa nguyên liệu</button>' +
                '<button class="btn-small btn-danger" onclick="closeModal(\'ingredientUsageModal\');deleteIngredient(\'' + ing.id + '\')" style="flex:1;font-size:12px;">🗑️ Xóa</button>' +
            '</div>';
        if (summaryEl) summaryEl.innerHTML = summaryHtml;

        // Build date groups
        var dateKeys = Object.keys(usageByDate).sort().reverse(); // newest first
        if (dateKeys.length === 0) {
            if (datesEl) datesEl.innerHTML = '<div class="ing-usage-empty">📭 Chưa có dữ liệu sử dụng</div>';
            openBottomSheet('ingredientUsageModal');
            return;
        }

        var datesHtml = '';
        for (var d = 0; d < dateKeys.length; d++) {
            var dk = dateKeys[d];
            var dayData = usageByDate[dk];
            var dateLabel = formatDateDisplay(dk);
            var itemKeys = Object.keys(dayData.items);

            var itemsHtml = '';
            for (var m = 0; m < itemKeys.length; m++) {
                var itemData = dayData.items[itemKeys[m]];
                itemsHtml += '<div class="ing-usage-item">' +
                    '<div>' +
                        '<div class="item-name">' + escapeHtml(itemData.name) + '</div>' +
                        '<div class="item-order-info">Đã bán: ' + itemData.count + ' món</div>' +
                    '</div>' +
                    '<div class="item-qty">' + Math.round(itemData.qty * 100) / 100 + ' ' + escapeHtml(displayUnit) + '</div>' +
                '</div>';
            }

            datesHtml +=
                '<div class="ing-usage-date-group">' +
                    '<div class="ing-usage-date-header" onclick="toggleIngUsageDate(this)">' +
                        '<div class="date-info">' +
                            '<span class="date-toggle">▶</span>' +
                            '<span>' + dateLabel + '</span>' +
                        '</div>' +
                        '<div>' +
                            '<span class="date-total">' + Math.round(dayData.totalQty * 100) / 100 + ' ' + escapeHtml(displayUnit) + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="ing-usage-date-body">' +
                        itemsHtml +
                    '</div>' +
                '</div>';
        }
        if (datesEl) datesEl.innerHTML = datesHtml;

        openBottomSheet('ingredientUsageModal');
    });
}

function toggleIngUsageDate(headerEl) {
    if (!headerEl) return;
    var toggle = headerEl.querySelector('.date-toggle');
    var body = headerEl.nextElementSibling;
    if (!body) return;
    if (body.classList.contains('expanded')) {
        body.classList.remove('expanded');
        if (toggle) toggle.classList.remove('expanded');
    } else {
        body.classList.add('expanded');
        if (toggle) toggle.classList.add('expanded');
    }
}

function switchIngUsageTab(tabName) {
    var tabs = document.querySelectorAll('.ing-usage-tab');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === tabName);
    }
    var usageContent = document.getElementById('ingUsageTabUsage');
    var txContent = document.getElementById('ingUsageTabTransactions');
    if (usageContent) usageContent.style.display = tabName === 'usage' ? '' : 'none';
    if (txContent) txContent.style.display = tabName === 'transactions' ? '' : 'none';
}

// Export global functions
window.renderInventoryMenu = renderInventoryMenu;
window.renderInventoryIngredients = renderInventoryIngredients;
window.renderInventoryCategoryFilter = renderInventoryCategoryFilter;
window.renderInventoryCategories = renderInventoryCategories;
window.showAddCategoryForm = showAddCategoryForm;
window.hideAddCategoryForm = hideAddCategoryForm;
window.editCategory = editCategory;
window.handleSaveCategory = handleSaveCategory;
window.deleteCategory = deleteCategory;
window.showAddMenuItemForm = showAddMenuItemForm;
window.hideAddMenuItemForm = hideAddMenuItemForm;
window.editMenuItem = editMenuItem;
window.handleSaveMenuItem = handleSaveMenuItem;
window.deleteMenuItem = deleteMenuItem;
window.showAddIngredientForm = showAddIngredientForm;
window.hideAddIngredientForm = hideAddIngredientForm;
window.editIngredient = editIngredient;
window.handleSaveIngredient = handleSaveIngredient;
window.handleEditIngredientSave = handleEditIngredientSave;
window.deleteIngredient = deleteIngredient;
window.showMenuItemDetail = showMenuItemDetail;
window.handleEditMenuItemSave = handleEditMenuItemSave;
window._addEditMenuItemSizeRow = _addEditMenuItemSizeRow;
window._addEditMenuItemIngredientRow = _addEditMenuItemIngredientRow;
window._createEditSizeIngRow = _createEditSizeIngRow;
window.showIngredientUsage = showIngredientUsage;
window.toggleIngUsageDate = toggleIngUsageDate;
window.switchIngUsageTab = switchIngUsageTab;
window.handleIngredientQuickImport = handleIngredientQuickImport;
