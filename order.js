// order.js - Tạo đơn hàng, thêm món, giỏ hàng
// BỐ CỤC 3 CỘT: Danh mục | Menu | Giỏ hàng

var _menuCategoryIds = []; // Danh sách category IDs để vuốt chuyển danh mục
var _menuSwipeStartY = 0;

// OPTIMIZE: Cache DOM references cho cart để tránh querySelector mỗi lần render
var _cartDomCache = {
    container: null,
    totalSpan: null,
    actionsDiv: null,
    headerActions: null
};
// OPTIMIZE: Cache HTML string cuối cùng để tránh rebuild không cần thiết
var _cartLastHtml = '';
var _cartLastTotal = -1;
// OPTIMIZE: Debounce timer cho render cart
var _cartRenderTimer = null;
var _cartRenderPending = false;
// OPTIMIZE: Số lượng items lần render trước (để biết có cần rebuild swipe hay không)
var _cartLastItemCount = 0;

// OPTIMIZE: Clone nhanh thay vì JSON.parse(JSON.stringify(...)) - chậm trên Android 6
function _cloneArr(arr) {
    if (!arr) return [];
    var result = [];
    for (var i = 0; i < arr.length; i++) {
        var item = arr[i];
        if (item && typeof item === 'object') {
            var cloned = {};
            for (var k in item) {
                if (item.hasOwnProperty(k)) {
                    cloned[k] = item[k];
                }
            }
            result.push(cloned);
        } else {
            result.push(item);
        }
    }
    return result;
}

// ========== MỞ MODAL ==========
function openAddMenuForTable(tableId) {
    currentAddToTableId = tableId;
    tempOrder = [];
    selectedCustomer = null;
    openOrderModal();
}

function openCreateOrderModal() {
    currentAddToTableId = null;
    currentDraftId = null;  // Reset draft khi tạo đơn mới
    tempOrder = [];
    selectedCustomer = null;
    openOrderModal();
}

function openOrderModal() {
    // Reset cache DOM khi mở modal
    _resetCartDomCache();
    renderOrderCategoriesColumn();
    renderMenuByCategory('all');
    renderCartColumn();
    
    // Cập nhật tiêu đề modal nếu đang chỉnh sửa draft
    var titleEl = document.querySelector('#orderModal .modal-title');
    if (titleEl) {
        if (currentDraftId) {
            var draft = getDraft(currentDraftId);
            if (draft) {
                titleEl.innerText = '✏️ ' + escapeHtml(draft.label) + ' (nháp)';
            } else {
                titleEl.innerText = '🛒 Tạo đơn hàng';
            }
        } else {
            titleEl.innerText = '🛒 Tạo đơn hàng';
        }
    }
    
    document.getElementById('orderModal').style.display = 'flex';
    
    // Khởi tạo vuốt chuyển danh mục
    _initMenuSwipe();
}

// ========== RENDER CỘT DANH MỤC (dọc) ==========
function renderOrderCategoriesColumn() {
    var container = document.getElementById('orderCategoriesColumn');
    if (!container) return;
    
    // CHỈ DÙNG DANH MỤC TỪ DATABASE, KHÔNG CÓ HARDCODE
    var categories = [];
    
    // Thêm danh mục "Tất cả" thủ công
    categories.push({ id: 'all', icon: '📋', name: 'Tất cả' });
    
    // Lấy danh mục từ database (window.menuCategories)
    if (window.menuCategories && window.menuCategories.length) {
        for (var i = 0; i < window.menuCategories.length; i++) {
            var cat = window.menuCategories[i];
            categories.push({
                id: cat.id,
                icon: cat.icon || '📌',
                name: cat.name
            });
        }
    }
    
    // Cập nhật danh sách category IDs để vuốt chuyển
    _menuCategoryIds = [];
    for (var i = 0; i < categories.length; i++) {
        _menuCategoryIds.push(categories[i].id);
    }
    
    var html = '';
    for (var i = 0; i < categories.length; i++) {
        var cat = categories[i];
        var activeClass = (currentMenuCategory === cat.id) ? 'active' : '';
        html += '<div class="category-item ' + activeClass + '" data-cat="' + cat.id + '" onclick="renderMenuByCategory(\'' + cat.id + '\')">' +
            '<span class="cat-icon">' + cat.icon + '</span>' +
            '<span>' + escapeHtml(cat.name) + '</span>' +
        '</div>';
    }
    container.innerHTML = html;
}

// ========== RENDER MENU THEO DANH MỤC ==========
function renderMenuByCategory(categoryId) {
    currentMenuCategory = categoryId;
    
    // Lọc món theo danh mục
    var items = [];
    if (categoryId === 'all') {
        items = menuItems.slice();
    } else {
        items = menuItems.filter(function(i) { return i.categoryId == categoryId; });
    }
    
    var container = document.getElementById('menuGrid');
    if (!container) return;
    
    if (items.length === 0) {
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: #94a3b8;">📭 Không có món</div>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.hasVariants && item.variants && item.variants.length) {
            // Có biến thể
            var variantsHtml = '';
            for (var v = 0; v < item.variants.length; v++) {
                var variant = item.variants[v];
                variantsHtml += '<button class="variant-btn" onclick="addToCartWithVariant(\'' + item.id + '\', \'' + escapeHtml(variant.name) + '\', ' + variant.price + ')">' + escapeHtml(variant.name) + '</button>';
            }
            html += '<div class="menu-item-variant">' +
                '<div class="menu-name">' + escapeHtml(item.name) + '</div>' +
                '<div class="variant-group">' + variantsHtml + '</div>' +
            '</div>';
        } else {
            // Món đơn
            var price = item.price || 0;
            html += '<div class="menu-card" onclick="addToCart(\'' + item.id + '\', \'' + escapeHtml(item.name) + '\', ' + price + ')">' +
                '<div class="menu-name">' + escapeHtml(item.name) + '</div>' +
                '<div class="menu-price">' + formatMoney(price) + '</div>' +
            '</div>';
        }
    }
    container.innerHTML = html;
    
    // Cập nhật active cho danh mục
    var cats = document.querySelectorAll('#orderCategoriesColumn .category-item');
    for (var i = 0; i < cats.length; i++) {
        var cat = cats[i].getAttribute('data-cat');
        if (cat == categoryId) cats[i].classList.add('active');
        else cats[i].classList.remove('active');
    }
}

// ========== VUỐT LÊN/XUỐNG CHUYỂN DANH MỤC ==========
function _initMenuSwipe() {
    var el = document.querySelector('.order-menu-column');
    if (!el) return;
    // Xoá event cũ để tránh dup
    el.removeEventListener('touchstart', _menuSwipeStart);
    el.removeEventListener('touchend', _menuSwipeEnd);
    el.addEventListener('touchstart', _menuSwipeStart);
    el.addEventListener('touchend', _menuSwipeEnd);
}
function _menuSwipeStart(e) {
    _menuSwipeStartY = e.touches[0].clientY;
}
function _menuSwipeEnd(e) {
    if (_menuCategoryIds.length < 2) return;
    var endY = e.changedTouches[0].clientY;
    var diff = _menuSwipeStartY - endY;
    // Ngưỡng 50px để tránh vuốt vô tình
    if (Math.abs(diff) < 50) return;
    
    var currentIdx = -1;
    for (var i = 0; i < _menuCategoryIds.length; i++) {
        if (_menuCategoryIds[i] === currentMenuCategory) {
            currentIdx = i;
            break;
        }
    }
    if (currentIdx === -1) return;
    
    var nextIdx;
    if (diff > 0) {
        // Vuốt lên → danh mục tiếp theo
        nextIdx = currentIdx + 1;
        if (nextIdx >= _menuCategoryIds.length) nextIdx = 0;
    } else {
        // Vuốt xuống → danh mục trước đó
        nextIdx = currentIdx - 1;
        if (nextIdx < 0) nextIdx = _menuCategoryIds.length - 1;
    }
    renderMenuByCategory(_menuCategoryIds[nextIdx]);
}

// ========== RENDER HEADER ACTIONS (landscape only) ==========
// ========== RENDER GIỎ HÀNG (cột 3) - TỐI ƯU ==========
// OPTIMIZE: Cache DOM references, chỉ rebuild khi cần, debounce khi thêm nhiều món
function _getCartDom() {
    if (!_cartDomCache.container) {
        _cartDomCache.container = document.getElementById('cartItemsList');
        _cartDomCache.totalSpan = document.getElementById('cartTotalAmount');
        _cartDomCache.actionsDiv = document.getElementById('cartFooterActions');
        _cartDomCache.headerActions = document.getElementById('orderHeaderActions');
    }
    return _cartDomCache;
}

// OPTIMIZE: Reset cache DOM (gọi khi modal đóng/mở)
function _resetCartDomCache() {
    _cartDomCache.container = null;
    _cartDomCache.totalSpan = null;
    _cartDomCache.actionsDiv = null;
    _cartDomCache.headerActions = null;
    _cartLastHtml = '';
    _cartLastTotal = -1;
    _cartLastItemCount = 0;
}

// OPTIMIZE: Render cart với debounce - gọi từ addToCart, removeFromCart, updateCartQty
function renderCartColumn() {
    // Nếu đang có timer debounce, gắn cờ pending và return
    if (_cartRenderTimer) {
        _cartRenderPending = true;
        return;
    }
    // Render ngay lập tức
    _cartRenderPending = false;
    _doRenderCart();
}

// OPTIMIZE: Hàm render thực tế - tách riêng để debounce có thể gọi lại
function _doRenderCart() {
    var dom = _getCartDom();
    var container = dom.container;
    var totalSpan = dom.totalSpan;
    var actionsDiv = dom.actionsDiv;
    var headerActions = dom.headerActions;
    
    if (!container) return;
    
    // Cập nhật header actions (landscape) - chỉ khi có thay đổi
    _renderOrderHeaderActionsFast(headerActions);
    
    if (tempOrder.length === 0) {
        if (_cartLastHtml !== '') {
            container.innerHTML = '<div class="empty-cart">🛒 Chưa có món nào</div>';
            _cartLastHtml = '';
            _cartLastItemCount = 0;
        }
        if (totalSpan && _cartLastTotal !== 0) {
            totalSpan.innerText = '0đ';
            _cartLastTotal = 0;
        }
        return;
    }
    
    var total = 0;
    var itemCount = 0;
    var html = '';
    
    for (var i = 0; i < tempOrder.length; i++) {
        var item = tempOrder[i];
        var itemTotal = item.price * item.qty;
        total += itemTotal;
        itemCount += item.qty;
        
        var timeStr = '';
        if (item.addedTime) {
            var date = new Date(item.addedTime);
            timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }
        
        // UI 1 DÒNG: Tên 🕒 thời gian [- 2 +] Thành tiền
        // Vuốt phải để xoá món (swipe-to-delete)
        html += '<div class="cart-item-row" data-idx="' + i + '">' +
            '<div class="cart-item-content">' +
                '<span class="cart-item-name">' + escapeHtml(item.name) + '</span>' +
                (timeStr ? '<span class="cart-item-time">🕒 ' + timeStr + '</span>' : '') +
                '<div class="cart-item-qty">' +
                    '<button class="cart-qty-btn" onclick="updateCartQty(' + i + ', -1)">−</button>' +
                    '<span class="cart-qty-num">' + item.qty + '</span>' +
                    '<button class="cart-qty-btn" onclick="updateCartQty(' + i + ', 1)">+</button>' +
                '</div>' +
                '<span class="cart-item-total">' + formatMoney(itemTotal) + '</span>' +
            '</div>' +
            '<div class="cart-item-delete-bg" onclick="removeFromCart(' + i + ')">🗑️ Xoá</div>' +
        '</div>';
    }
    
    // OPTIMIZE: Chỉ set innerHTML khi HTML thực sự thay đổi
    if (html !== _cartLastHtml) {
        container.innerHTML = html;
        _cartLastHtml = html;
        // OPTIMIZE: Chỉ init swipe khi số lượng items thay đổi
        if (tempOrder.length !== _cartLastItemCount) {
            _initCartSwipe();
            _cartLastItemCount = tempOrder.length;
        } else {
            // Chỉ gán lại data-idx cho các row hiện có (khi sắp xếp lại)
            _updateCartIndices();
        }
    }
    
    // OPTIMIZE: Chỉ update totalSpan khi giá trị thay đổi
    if (totalSpan && _cartLastTotal !== total) {
        totalSpan.innerText = formatMoney(total);
        _cartLastTotal = total;
    }
    
    // Render nút action
    if (actionsDiv) {
        if (currentAddToTableId) {
            actionsDiv.innerHTML = '<button class="action-btn btn-table" onclick="handleAddToExistingTable()">🍽️ Thêm vào bàn</button>';
        } else {
            actionsDiv.innerHTML =
                '<div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; margin-bottom: 8px;">' +
                    '<button class="action-btn btn-table" onclick="handleCreateNewTable()" style="flex: 2;">🍽️ Tạo bàn mới</button>' +
                    '<span style="font-size: 12px; color: #475569; text-align: center; flex: 1;">' + itemCount + ' món</span>' +
                    '<span style="font-weight: 600; color: #f97316; flex: 1; text-align: right;">' + formatMoney(total) + '</span>' +
                '</div>' +
                // Nút mệnh giá thanh toán nhanh tiền mặt
'<div class="denom-actions" style="display: flex; gap: 4px; margin-bottom: 4px;">' +
    '<button class="denom-btn" onclick="takeawayCashPayWithDenom(50000)" style="flex:1;padding:8px 2px;font-size:12px;">50.000đ</button>' +
    '<button class="denom-btn" onclick="takeawayCashPayWithDenom(100000)" style="flex:1;padding:8px 2px;font-size:12px;">100.000đ</button>' +
    '<button class="denom-btn" onclick="takeawayCashPayWithDenom(200000)" style="flex:1;padding:8px 2px;font-size:12px;">200.000đ</button>' +
    '<button class="denom-btn" onclick="takeawayCashPayWithDenom(500000)" style="flex:1;padding:8px 2px;font-size:12px;">500.000đ</button>' +
'</div>' +
'<div style="display: flex; gap: 6px; flex-wrap: wrap;">' +
    '<button class="action-btn btn-cash" onclick="handleTakeawayPayment(\'cash\')" style="flex: 1; padding: 12px 4px; font-size: 14px;">💰 TM</button>' +
    '<button class="action-btn btn-transfer" onclick="handleTakeawayPayment(\'transfer\')" style="flex: 1; padding: 12px 4px; font-size: 14px;">💳 CK</button>' +
    '<button class="action-btn btn-grab" onclick="handleGrabOrder()" style="flex: 1; padding: 12px 4px; font-size: 14px;">🚕 GR</button>' +
    '<button class="action-btn btn-debt" onclick="handleDebtOrder()" style="flex: 1; padding: 12px 4px; font-size: 14px;">💢 Nợ</button>' +
'</div>' +
                // Nút lưu nháp - luôn hiển thị khi có món
                '<div style="margin-top: 6px;">' +
                    '<button class="action-btn btn-draft" onclick="minimizeCurrentOrderToDraft()" style="width: 100%; padding: 10px; font-size: 13px;">💬 Lưu nháp</button>' +
                '</div>'
        }
    }
}

// OPTIMIZE: Phiên bản header actions nhanh - cache DOM, tránh rebuild HTML không cần
function _renderOrderHeaderActionsFast(headerActions) {
    if (!headerActions) return;
    
    var total = 0;
    for (var i = 0; i < tempOrder.length; i++) {
        total += tempOrder[i].price * tempOrder[i].qty;
    }
    
    var html;
    if (currentAddToTableId) {
        html = '<span class="header-action-btn btn-total">' + formatMoney(total) + '</span>' +
            '<button class="header-action-btn btn-table" onclick="handleAddToExistingTable()">🍽️ Nhập vào bàn</button>' +
            '<button class="header-action-btn btn-draft" onclick="minimizeCurrentOrderToDraft()">💬 Lưu nháp</button>';
    } else {
        html = '<span class="header-action-btn btn-total">' + formatMoney(total) + '</span>' +
            '<button class="header-action-btn btn-table" onclick="handleCreateNewTable()">🍽️ Tạo bàn mới</button>' +
            '<button class="header-action-btn btn-cash" onclick="handleTakeawayPayment(\'cash\')">💰 Tiền mặt</button>' +
            '<button class="header-action-btn btn-transfer" onclick="handleTakeawayPayment(\'transfer\')">💳 Chuyển khoản</button>' +
            '<button class="header-action-btn btn-debt" onclick="handleDebtOrder()">💢 Nợ</button>' +
            '<button class="header-action-btn btn-draft" onclick="minimizeCurrentOrderToDraft()">💬 Lưu nháp</button>';
    }
    headerActions.innerHTML = html;
}

// OPTIMIZE: Cập nhật data-idx cho các row hiện có (khi sắp xếp lại thứ tự)
function _updateCartIndices() {
    var rows = document.querySelectorAll('.cart-item-row');
    for (var r = 0; r < rows.length; r++) {
        rows[r].setAttribute('data-idx', r);
        // Cập nhật onclick cho các nút qty và delete
        var qtyBtns = rows[r].querySelectorAll('.cart-qty-btn');
        if (qtyBtns.length >= 2) {
            qtyBtns[0].setAttribute('onclick', 'updateCartQty(' + r + ', -1)');
            qtyBtns[1].setAttribute('onclick', 'updateCartQty(' + r + ', 1)');
        }
        var deleteBg = rows[r].querySelector('.cart-item-delete-bg');
        if (deleteBg) {
            deleteBg.setAttribute('onclick', 'removeFromCart(' + r + ')');
        }
    }
}

// OPTIMIZE: Debounce render - gom nhiều lần gọi renderCartColumn trong 50ms thành 1 lần
function _debouncedRenderCart() {
    if (_cartRenderTimer) {
        // Đã có timer, đánh dấu pending
        _cartRenderPending = true;
        return;
    }
    // Render ngay lần đầu
    _cartRenderPending = false;
    _doRenderCart();
    
    // Thiết lập timer để bắt các lần gọi tiếp theo trong 50ms
    _cartRenderTimer = setTimeout(function() {
        _cartRenderTimer = null;
        if (_cartRenderPending) {
            _cartRenderPending = false;
            _doRenderCart();
        }
    }, 50);
}

// Cập nhật lại hàm renderCart để gọi renderCartColumn
function renderCart() {
    renderCartColumn();
}

// ========== THÊM MÓN VÀO GIỎ (MỚI HIỂN THỊ TRÊN CÙNG) - TỐI ƯU ==========
// OPTIMIZE: Dùng _debouncedRenderCart để gom nhiều lần thêm món liên tiếp
function addToCart(id, name, price) {
    var now = new Date();
    var timeStr = now.toISOString();
    
    // Tìm món trùng trong giỏ
    var existingIndex = -1;
    for (var i = 0; i < tempOrder.length; i++) {
        if (tempOrder[i].id === id && !tempOrder[i].variantName) {
            existingIndex = i;
            break;
        }
    }
    
    if (existingIndex !== -1) {
        // Nếu đã tồn tại: tăng số lượng
        tempOrder[existingIndex].qty += 1;
        // CẬP NHẬT thời gian mới nhất
        tempOrder[existingIndex].addedTime = timeStr;
        // LẤY PHẦN TỬ ĐÓ RA
        var updatedItem = tempOrder.splice(existingIndex, 1)[0];
        // ĐƯA LÊN ĐẦU MẢNG (hiển thị trên cùng)
        tempOrder.unshift(updatedItem);
    } else {
        // Món mới: thêm vào ĐẦU mảng
        tempOrder.unshift({
            id: id,
            name: name,
            price: price,
            qty: 1,
            addedTime: timeStr,
            variantName: null
        });
    }
    
    // OPTIMIZE: Dùng debounced render - UI phản hồi tức thì, render gộp sau 50ms
    _debouncedRenderCart();
}

// ========== THÊM MÓN CÓ BIẾN THỂ (MỚI HIỂN THỊ TRÊN CÙNG) ==========
function addToCartWithVariant(itemId, variantName, price) {
    // Tìm item gốc để lấy tên
    var baseItem = null;
    for (var i = 0; i < menuItems.length; i++) {
        if (menuItems[i].id === itemId) {
            baseItem = menuItems[i];
            break;
        }
    }
    var displayName = baseItem ? baseItem.name + ' (' + variantName + ')' : variantName;
    var uniqueId = itemId + '_' + variantName;
    var now = new Date();
    var timeStr = now.toISOString();
    
    // Tìm món trùng trong giỏ
    var existingIndex = -1;
    for (var i = 0; i < tempOrder.length; i++) {
        if (tempOrder[i].id === uniqueId) {
            existingIndex = i;
            break;
        }
    }
    
    if (existingIndex !== -1) {
        // Nếu đã tồn tại: tăng số lượng
        tempOrder[existingIndex].qty += 1;
        // CẬP NHẬT thời gian mới nhất
        tempOrder[existingIndex].addedTime = timeStr;
        // LẤY PHẦN TỬ ĐÓ RA
        var updatedItem = tempOrder.splice(existingIndex, 1)[0];
        // ĐƯA LÊN ĐẦU MẢNG (hiển thị trên cùng)
        tempOrder.unshift(updatedItem);
    } else {
        // Món mới: thêm vào ĐẦU mảng
        tempOrder.unshift({
            id: uniqueId,
            name: displayName,
            price: price,
            qty: 1,
            addedTime: timeStr,
            variantName: variantName
        });
    }
    
    // OPTIMIZE: Dùng debounced render
    _debouncedRenderCart();
}



function removeFromCart(idx) {
    tempOrder.splice(idx, 1);
    // OPTIMIZE: Dùng debounced render
    _debouncedRenderCart();
}

function updateCartQty(idx, delta) {
    if (tempOrder[idx]) {
        var newQty = tempOrder[idx].qty + delta;
        if (newQty <= 0) {
            tempOrder.splice(idx, 1);
        } else {
            tempOrder[idx].qty = newQty;
        }
        // OPTIMIZE: Dùng debounced render
        _debouncedRenderCart();
    }
}
// ========== TẠO BÀN MỚI - TỰ ĐỘNG (phiên bản đơn giản) ==========
// OPTIMIZE: Gộp checkStock + deductIngredients thành 1 lần duyệt (dùng chung)
function _checkAndDeductIngredients(items) {
    _buildLookups();
    var updates = [];
    for (var i = 0; i < items.length; i++) {
        var orderItem = items[i];
        var baseName = orderItem.name.replace(/\s*\([^)]*\)/g, '').trim();
        var menuItem = _menuLookup[orderItem.id] || _menuLookup[baseName];
        if (menuItem && menuItem.ingredients) {
            var ings = _getIngredientsForItem(menuItem, orderItem);
            for (var k = 0; k < ings.length; k++) {
                var req = ings[k];
                var ing = _ingredientLookup[req.ingredientId];
                if (ing) {
                    var needed = _getConvertedQuantity(ing, req.quantity * orderItem.qty);
                    // Check stock
                    if (ing.stock < needed) {
                        showToast('⚠️ Nguyên liệu "' + ing.name + '" không đủ cho món ' + baseName, 'error');
                        return Promise.reject(new Error('Hết nguyên liệu'));
                    }
                    // Deduct
                    ing.stock = Math.max(0, (ing.stock || 0) - needed);
                    updates.push(DB.update('ingredients', ing.id, { stock: ing.stock }));
                    
                    var unit = ing.unit || '';
                    var note = 'Bán: ' + orderItem.name + ' x' + orderItem.qty + ' (-' + Math.round(needed * 1000) / 1000 + ' ' + unit + ')';
                    _logIngredientTransaction(ing.id, 'export', Math.round(needed * 1000) / 1000, unit, note).catch(function(err) {
                        console.error('Log export error:', err);
                    });
                }
            }
        }
    }
    return Promise.all(updates);
}

// OPTIMIZE: handleCreateNewTable - suppress realtime, gộp checkStock+deductIngredients
function handleCreateNewTable() {
    if (!tempOrder.length) {
        showToast('Chưa có món nào trong giỏ!', 'warning');
        return;
    }
    
    // OPTIMIZE: Suppress realtime notifications
    DB.suppressRealtime();
    
    // Lấy danh sách bàn hiện tại
    DB.getAll('tables').then(function(allTables) {
        // Tìm số bàn lớn nhất
        var numbers = [];
        for (var i = 0; i < allTables.length; i++) {
            var name = allTables[i].name;
            var num = parseInt(name.replace(/\D/g, '')); // Lấy số từ tên
            if (!isNaN(num)) numbers.push(num);
        }
        
        // Tìm số lớn nhất
        var maxNum = Math.max.apply(null, numbers);
        if (maxNum === -Infinity) maxNum = 0;
        
        var nextNum = maxNum + 1;
        var tableName = 'Bàn ' + nextNum;
        
        var now = new Date();
        var tableId = Date.now().toString();
        var initTotal = tempOrder.reduce(function(sum, item) { return sum + (item.price * item.qty); }, 0);
        // Lưu danh sách món vừa thêm
        var initItems = tempOrder.map(function(item) { return { name: item.name, qty: item.qty }; });
        var newTable = {
            id: tableId,
            name: tableName,
            status: 'occupied',
            time: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            startTime: now.toISOString(),
            items: _cloneArr(tempOrder),
            total: initTotal,
            customerId: selectedCustomer ? selectedCustomer.id : null,
            customerName: selectedCustomer ? selectedCustomer.name : null,
            recentAdds: [{ items: initItems, time: now.toISOString() }]
        };
        
        // OPTIMIZE: Gộp checkStock + deductIngredients, chạy song song với DB.create
        var createPromise = DB.create('tables', newTable, tableId);
        var stockPromise = _checkAndDeductIngredients(tempOrder);
        
        Promise.all([createPromise, stockPromise]).then(function() {
            // Xóa draft nếu đang chỉnh sửa draft
            if (currentDraftId) {
                return deleteDraft(currentDraftId);
            }
        }).then(function() {
            tempOrder = [];
            selectedCustomer = null;
            currentDraftId = null;
            closeModal('orderModal');
            
            // OPTIMIZE: Flush realtime sau khi tất cả operations hoàn tất
            DB.flushRealtime();
            
            return renderTables();
        }).then(function() {
            // Thêm class table-new để chạy hiệu ứng glow 30s
            var card = document.querySelector('.table-card[data-id="' + tableId + '"]');
            if (card) card.classList.add('table-new');
            showToast('✅ Đã tạo ' + tableName, 'success');
        }).catch(function(err) {
            DB.remove('tables', tableId);
            DB.flushRealtime();
            showToast(err.message || 'Lỗi!', 'error');
        });
    });
}

// ========== XỬ LÝ THÊM VÀO BÀN HIỆN TẠI ==========
// OPTIMIZE: handleAddToExistingTable - suppress realtime, gộp checkStock+deductIngredients
function handleAddToExistingTable() {
    if (!tempOrder.length) {
        showToast('Chưa có món nào trong giỏ!', 'warning');
        return;
    }
    if (!currentAddToTableId) {
        showToast('Không xác định bàn đích!', 'error');
        return;
    }
    
    // OPTIMIZE: Suppress realtime notifications
    DB.suppressRealtime();
    
    DB.get('tables', String(currentAddToTableId)).then(function(table) {
        if (!table) {
            showToast('Bàn không tồn tại!', 'error');
            DB.flushRealtime();
            return;
        }
        
        // OPTIMIZE: Gộp checkStock + deductIngredients thành 1 lần duyệt
        var stockPromise = _checkAndDeductIngredients(tempOrder);
        
        // Chuẩn bị dữ liệu cập nhật bàn (có thể tính song song)
        var existingItems = table.items || [];
        for (var i = 0; i < tempOrder.length; i++) {
            existingItems.push(_cloneArr([tempOrder[i]])[0]);
        }
        
        var newTotal = existingItems.reduce(function(sum, item) {
            return sum + (item.price * item.qty);
        }, 0);
        
        var recentAdds = table.recentAdds || [];
        var now = new Date();
        var addedItems = tempOrder.map(function(item) { return { name: item.name, qty: item.qty }; });
        recentAdds.push({ items: addedItems, time: now.toISOString() });
        if (recentAdds.length > 2) recentAdds.shift();
        
        // OPTIMIZE: Chạy song song checkStock+deductIngredients và DB.update
        var updatePromise = DB.update('tables', String(currentAddToTableId), {
            items: existingItems,
            total: newTotal,
            recentAdds: recentAdds
        });
        
        Promise.all([stockPromise, updatePromise]).then(function() {
            // Xóa draft nếu đang chỉnh sửa draft
            if (currentDraftId) {
                return deleteDraft(currentDraftId);
            }
        }).then(function() {
            tempOrder = [];
            selectedCustomer = null;
            currentDraftId = null;
            closeModal('orderModal');
            
            // OPTIMIZE: Flush realtime sau khi tất cả operations hoàn tất
            DB.flushRealtime();
            
            return renderTables();
        }).then(function() {
            // Thêm class table-new để chạy hiệu ứng glow 30s
            var card = document.querySelector('.table-card[data-id="' + currentAddToTableId + '"]');
            if (card) card.classList.add('table-new');
            showToast('✅ Đã thêm món vào bàn', 'success');
        }).catch(function(err) {
            DB.flushRealtime();
            showToast(err.message || 'Lỗi khi thêm món!', 'error');
        });
    });
}

// Biến lưu trạng thái toast tiền dư cho takeaway
var _takeawayChangeToastEl = null;
var _takeawayChangeGivenAmount = 0;

// ========== XỬ LÝ THANH TOÁN MANG ĐI ==========
function handleTakeawayPayment(method) {
    if (!tempOrder.length) {
        showToast('Chưa có món nào trong giỏ!', 'warning');
        return;
    }
    
    if (method === 'cash') {
        // Tiền mặt: ẩn toast tiền dư (nếu có) rồi thanh toán luôn
        _hideTakeawayChangeToast();
    }
    
    // Kiểm tra credit của khách nếu có chọn khách hàng
    if (selectedCustomer && (selectedCustomer.creditBalance || 0) > 0) {
        var creditBalance = selectedCustomer.creditBalance || 0;
        var total = tempOrder.reduce(function(sum, item) { return sum + (item.price * item.qty); }, 0);
        if (creditBalance > 0 && total > 0) {
            if (confirm('💰 ' + selectedCustomer.name + ' có ' + formatMoney(creditBalance) + ' tiền dư.\nDùng số dư này để thanh toán?')) {
                // Sẽ xử lý credit trong _processTakeawayDirect
                _processTakeawayDirect(method);
                return;
            }
        }
    }
    
    _processTakeawayDirect(method);
}

// OPTIMIZE: _processTakeawayDirect - đóng modal ngay, song song hóa Promise, batch ingredients
function _processTakeawayDirect(method) {
    if (!tempOrder.length) return;
    
    // OPTIMIZE: Đóng modal ngay lập tức
    closeModal('orderModal');
    _paymentToastId = showToast('⏳ Đang xử lý thanh toán...', 'info', 0);
    
    // OPTIMIZE: Suppress realtime notifications trong quá trình batch operations
    DB.suppressRealtime();
    
    var items = _cloneArr(tempOrder);
    var total = items.reduce(function(sum, item) { return sum + (item.price * item.qty); }, 0);
    var now = new Date();
    
    // Kiểm tra credit của khách
    var creditUsed = 0;
    var customerInfo = selectedCustomer ? { id: selectedCustomer.id, name: selectedCustomer.name } : null;
    
    if (selectedCustomer && (selectedCustomer.creditBalance || 0) > 0) {
        creditUsed = Math.min(selectedCustomer.creditBalance || 0, total);
        if (creditUsed > 0) {
            total = total - creditUsed;
        }
    }
    
    // OPTIMIZE: Dùng _checkAndDeductIngredients thay vì inline
    var stockAndDeductPromise = _checkAndDeductIngredients(tempOrder).then(function() {
        return true;
    }).catch(function(err) {
        showToast('⚠️ ' + (err.message || 'Hết nguyên liệu'), 'error');
        return false;
    });
    
    stockAndDeductPromise.then(function(result) {
        if (!result) {
            hideToast(_paymentToastId);
            DB.flushRealtime();
            return;
        }
        
        // OPTIMIZE: Chạy song song credit + addHistory
        var creditPromise = Promise.resolve();
        if (creditUsed > 0 && selectedCustomer) {
            creditPromise = useCustomerCredit(selectedCustomer.id, creditUsed, 'Trừ tiền dư khi mua mang đi');
        }
        
        var historyPromise = addHistory({
            type: 'takeaway',
            amount: total,
            paymentMethod: method,
            items: items,
            customer: customerInfo,
            tableName: null,
            note: 'Mang đi - ' + (method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản') + (creditUsed > 0 ? ' (dùng ' + formatMoney(creditUsed) + ' tiền dư)' : ''),
            createdAt: now.toISOString(),
            dateKey: now.toISOString().slice(0, 10)
        });
        
        // OPTIMIZE: Chạy song song creditPromise + historyPromise
        Promise.all([creditPromise, historyPromise]).then(function() {
            // OPTIMIZE: Flush realtime sau khi tất cả operations hoàn tất
            DB.flushRealtime();
            
            // Xóa draft (fire-and-forget)
            if (currentDraftId) {
                deleteDraft(currentDraftId);
            }
            
            tempOrder = [];
            selectedCustomer = null;
            currentDraftId = null;
            
            hideToast(_paymentToastId);
            var msg = '✅ Đã thanh toán đơn mang đi thành công';
            if (creditUsed > 0) msg += ' (đã dùng ' + formatMoney(creditUsed) + ' tiền dư)';
            showToast(msg, 'success');
            if (typeof renderRecentTransactions === 'function') renderRecentTransactions();
            // In hóa đơn (fire-and-forget)
            if (typeof printAfterPayment === 'function') {
                printAfterPayment({
                    type: 'takeaway',
                    amount: total,
                    paymentMethod: method,
                    items: items,
                    tableName: null,
                    customer: customerInfo,
                    createdAt: now.toISOString()
                });
            }
        }).catch(function(err) {
            hideToast(_paymentToastId);
            DB.flushRealtime();
            showToast(err.message || 'Lỗi khi thanh toán!', 'error');
        });
    }).catch(function(err) {
        hideToast(_paymentToastId);
        DB.flushRealtime();
        showToast('❌ Lỗi xử lý nguyên liệu: ' + (err.message || err), 'error');
    });
}

// ========== HIỂN THỊ SỐ TIỀN DƯ KHI CHỌN MỆNH GIÁ (MANG ĐI) ==========
// Click nút mệnh giá → chỉ toast số tiền dư cần trả, KHÔNG thanh toán
// Click TM hoặc nút trong toast → thanh toán và ẩn toast
// Click ✕ → đóng toast (đổi PTTT)
function takeawayCashPayWithDenom(givenAmount) {
    if (!tempOrder.length) {
        showToast('Chưa có món nào trong giỏ!', 'warning');
        return;
    }
    var total = tempOrder.reduce(function(sum, item) { return sum + (item.price * item.qty); }, 0);
    if (givenAmount < total) {
        showToast('❌ Số tiền ' + formatMoney(givenAmount) + ' không đủ!', 'error');
        return;
    }
    var change = givenAmount - total;
    // Xóa toast cũ nếu có
    _hideTakeawayChangeToast();
    // Lưu givenAmount
    _takeawayChangeGivenAmount = givenAmount;
    
    // Kiểm tra nếu có chọn khách hàng và có tiền dư
    var creditNote = '';
    if (change > 0 && selectedCustomer) {
        creditNote = '<div style="font-size:12px;color:#d97706;margin-top:6px;">💡 ' + selectedCustomer.name + ' có ' + formatMoney(change) + ' tiền dư sẽ được lưu làm tiền trả trước</div>';
    }
    
    // Tạo toast đặc biệt to, nổi bật
    var toast = document.createElement('div');
    toast.className = 'change-toast';
    toast.id = 'changeToast';
    toast.innerHTML =
        '<div class="change-label">💵 TIỀN DƯ</div>' +
        '<div class="change-given">Khách đưa: ' + formatMoney(givenAmount) + '</div>' +
        '<div class="change-amount">' + formatMoney(change) + '</div>' +
        creditNote +
        '<div style="display:flex;gap:8px;margin-top:10px;">' +
            '<button onclick="_takeawayChangeToastPay()" style="flex:1;padding:10px;border-radius:40px;border:none;background:#f97316;color:#fff;font-weight:700;font-size:14px;cursor:pointer;-webkit-appearance:none;">✅ Thanh toán</button>' +
            '<button onclick="_hideTakeawayChangeToast()" style="padding:10px 16px;border-radius:40px;border:none;background:#475569;color:#fff;font-size:13px;cursor:pointer;-webkit-appearance:none;">✕</button>' +
        '</div>';
    document.body.appendChild(toast);
    _takeawayChangeToastEl = toast;
}

function _takeawayChangeToastPay() {
    var givenAmount = _takeawayChangeGivenAmount;
    _hideTakeawayChangeToast();
    
    // Nếu có chọn khách và tiền dư > 0, lưu credit trước
    if (tempOrder.length && selectedCustomer) {
        var total = tempOrder.reduce(function(sum, item) { return sum + (item.price * item.qty); }, 0);
        var change = givenAmount - total;
        if (change > 0) {
            addCustomerCredit(selectedCustomer.id, change, 'Trả dư khi mua mang đi').then(function() {
                showToast('💰 Đã lưu ' + formatMoney(change) + ' tiền dư cho ' + selectedCustomer.name, 'success');
                handleTakeawayPayment('cash');
            });
            return;
        }
    }
    handleTakeawayPayment('cash');
}

function _hideTakeawayChangeToast() {
    if (_takeawayChangeToastEl) {
        if (_takeawayChangeToastEl.parentNode) _takeawayChangeToastEl.remove();
        _takeawayChangeToastEl = null;
    }
    _takeawayChangeGivenAmount = 0;
}

// OPTIMIZE: handleGrabOrder - đóng modal ngay, song song hóa Promise, batch ingredients
function handleGrabOrder() {
    if (!tempOrder.length) {
        showToast('Chưa có món nào trong giỏ!', 'warning');
        return;
    }
    
    // OPTIMIZE: Đóng modal ngay lập tức
    closeModal('orderModal');
    _paymentToastId = showToast('⏳ Đang xử lý đơn Grab...', 'info', 0);
    
    // OPTIMIZE: Suppress realtime notifications trong quá trình batch operations
    DB.suppressRealtime();
    
    var items = _cloneArr(tempOrder);
    var total = items.reduce(function(sum, item) { return sum + (item.price * item.qty); }, 0);
    var now = new Date();
    
    // OPTIMIZE: Dùng _checkAndDeductIngredients thay vì inline
    var stockAndDeductPromise = _checkAndDeductIngredients(tempOrder).then(function() {
        return true;
    }).catch(function(err) {
        showToast('⚠️ ' + (err.message || 'Hết nguyên liệu'), 'error');
        return false;
    });
    
    stockAndDeductPromise.then(function(result) {
        if (!result) {
            hideToast(_paymentToastId);
            DB.flushRealtime();
            return;
        }
        
        addHistory({
            type: 'grab',
            amount: total,
            paymentMethod: 'grab',
            items: items,
            customer: null,
            tableName: null,
            note: 'Đơn Grab',
            createdAt: now.toISOString(),
            dateKey: now.toISOString().slice(0, 10)
        }).then(function() {
            // OPTIMIZE: Flush realtime sau khi tất cả operations hoàn tất
            DB.flushRealtime();
            
            // Xóa draft (fire-and-forget)
            if (currentDraftId) {
                deleteDraft(currentDraftId);
            }
            
            tempOrder = [];
            selectedCustomer = null;
            currentDraftId = null;
            
            hideToast(_paymentToastId);
            showToast('✅ Đã tạo đơn Grab thành công', 'success');
            if (typeof renderRecentTransactions === 'function') renderRecentTransactions();
            // In hóa đơn (fire-and-forget)
            if (typeof printAfterPayment === 'function') {
                printAfterPayment({
                    type: 'grab',
                    amount: total,
                    paymentMethod: 'grab',
                    items: items,
                    tableName: null,
                    customer: null,
                    createdAt: now.toISOString()
                });
            }
        }).catch(function(err) {
            hideToast(_paymentToastId);
            DB.flushRealtime();
            showToast(err.message || 'Lỗi khi tạo đơn Grab!', 'error');
        });
    }).catch(function(err) {
        hideToast(_paymentToastId);
        DB.flushRealtime();
        showToast('❌ Lỗi xử lý nguyên liệu: ' + (err.message || err), 'error');
    });
}

// OPTIMIZE: handleDebtOrder - đóng modal ngay, song song hóa Promise, batch ingredients
function handleDebtOrder() {
    if (!tempOrder.length) {
        showToast('Chưa có món nào trong giỏ!', 'warning');
        return;
    }
    
    // OPTIMIZE: Đóng modal ngay lập tức
    closeModal('orderModal');
    _paymentToastId = showToast('⏳ Đang xử lý ghi nợ...', 'info', 0);
    
    // OPTIMIZE: Suppress realtime notifications trong quá trình batch operations
    DB.suppressRealtime();
    
    // Hiển thị modal chọn khách hàng
    showCustomerSelector(function(customer) {
        if (!customer) {
            hideToast(_paymentToastId);
            DB.flushRealtime();
            showToast('Cần chọn khách hàng để ghi nợ!', 'warning');
            return;
        }
        
        var items = _cloneArr(tempOrder);
        var total = items.reduce(function(sum, item) { return sum + (item.price * item.qty); }, 0);
        var now = new Date();
        var debtAmount = total;
        var creditUsed = 0;
        var debtNote = 'Ghi nợ - ' + customer.name;
        
        // OPTIMIZE: Dùng _checkAndDeductIngredients thay vì inline
        var stockAndDeductPromise = _checkAndDeductIngredients(tempOrder).then(function() {
            return true;
        }).catch(function(err) {
            showToast('⚠️ ' + (err.message || 'Hết nguyên liệu'), 'error');
            return false;
        });
        
        stockAndDeductPromise.then(function(result) {
            if (!result) {
                hideToast(_paymentToastId);
                DB.flushRealtime();
                return;
            }
            
            // OPTIMIZE: Pre-calculate debtAmount và creditUsed từ memory cache
            // để chạy song song addCustomerDebt + addHistory thay vì tuần tự
            var creditBalance = customer.creditBalance || 0;
            var preCreditUsed = Math.min(creditBalance, total);
            var preDebtAmount = total - preCreditUsed;
            
            // Chạy song song addCustomerDebt và addHistory
            var debtPromise = addCustomerDebt(customer.id, total, 'Mua hàng tại quầy');
            var historyPromise = addHistory({
                type: 'debt_payment',
                amount: preDebtAmount,
                paymentMethod: 'debt',
                items: items,
                customer: { id: customer.id, name: customer.name },
                tableName: null,
                note: debtNote + (preCreditUsed > 0 ? ' (đã dùng ' + formatMoney(preCreditUsed) + ' tiền dư)' : ''),
                createdAt: now.toISOString(),
                dateKey: now.toISOString().slice(0, 10)
            });
            
            return Promise.all([debtPromise, historyPromise]).then(function(results) {
                // Lấy kết quả thực tế từ addCustomerDebt (để đảm bảo chính xác)
                var debtResult = results[0];
                debtAmount = debtResult.debtAmount;
                creditUsed = debtResult.creditUsed;
            });
        }).then(function() {
            // OPTIMIZE: Flush realtime sau khi tất cả operations hoàn tất
            DB.flushRealtime();
            
            // Xóa draft (fire-and-forget)
            if (currentDraftId) {
                deleteDraft(currentDraftId);
            }
            
            tempOrder = [];
            selectedCustomer = null;
            currentDraftId = null;
            
            hideToast(_paymentToastId);
            var msg = '✅ Đã ghi nợ ' + formatMoney(debtAmount) + ' cho ' + customer.name;
            if (creditUsed > 0) msg += ' (đã trừ ' + formatMoney(creditUsed) + ' tiền dư)';
            showToast(msg, 'success');
            if (typeof renderRecentTransactions === 'function') renderRecentTransactions();
            if (typeof renderCustomerList === 'function') renderCustomerList();
            // In hóa đơn (fire-and-forget)
            if (typeof printAfterPayment === 'function') {
                printAfterPayment({
                    type: 'debt_payment',
                    amount: debtAmount,
                    paymentMethod: 'debt',
                    items: items,
                    tableName: null,
                    customer: { id: customer.id, name: customer.name },
                    createdAt: now.toISOString()
                });
            }
        }).catch(function(err) {
            hideToast(_paymentToastId);
            DB.flushRealtime();
            showToast(err.message || 'Lỗi khi ghi nợ!', 'error');
        });
    });
}

// Xuất global (nếu cần)
window.handleCreateNewTable = handleCreateNewTable;
window.handleAddToExistingTable = handleAddToExistingTable;
window.handleTakeawayPayment = handleTakeawayPayment;
window.handleGrabOrder = handleGrabOrder;
window.handleDebtOrder = handleDebtOrder;

// ========== SWIPE TO DELETE CHO CART ITEM ==========
function _initCartSwipe() {
    var rows = document.querySelectorAll('.cart-item-row');
    for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        // Xóa event cũ để tránh dup
        row.removeEventListener('touchstart', _swipeHandler);
        row.removeEventListener('touchmove', _swipeHandler);
        row.removeEventListener('touchend', _swipeHandler);
        row.removeEventListener('touchcancel', _swipeHandler);
        // Gắn handler mới
        row.addEventListener('touchstart', _swipeHandler);
        row.addEventListener('touchmove', _swipeHandler);
        row.addEventListener('touchend', _swipeHandler);
        row.addEventListener('touchcancel', _swipeHandler);
    }
}

function _swipeHandler(e) {
    var row = e.currentTarget;
    if (e.type === 'touchstart') {
        row._swipeStartX = e.touches[0].clientX;
        row._swipeStartY = e.touches[0].clientY;
        row._swipeDeltaX = 0;
        row._swipeActive = true;
        return;
    }
    if (!row._swipeActive) return;
    
    if (e.type === 'touchmove') {
        var dx = e.touches[0].clientX - row._swipeStartX;
        var dy = e.touches[0].clientY - row._swipeStartY;
        // Chỉ swipe ngang, bỏ qua nếu vuốt dọc nhiều
        if (Math.abs(dy) > Math.abs(dx) * 2) {
            row._swipeActive = false;
            row.classList.remove('swiping');
            return;
        }
        row._swipeDeltaX = dx;
        if (dx < -20) {
            row.classList.add('swiping');
        } else {
            row.classList.remove('swiping');
        }
        return;
    }
    
    // touchend / touchcancel
    row._swipeActive = false;
    if (row._swipeDeltaX < -60) {
        // Vuốt đủ xa -> xoá món
        var idx = parseInt(row.getAttribute('data-idx'));
        if (!isNaN(idx)) {
            removeFromCart(idx);
        }
    } else {
        row.classList.remove('swiping');
    }
}
// ========== EXPORT GLOBAL ==========
window.addToCart = addToCart;
window.addToCartWithVariant = addToCartWithVariant;
window.removeFromCart = removeFromCart;
window.updateCartQty = updateCartQty;
window.renderMenuByCategory = renderMenuByCategory;
window.handleAddToExistingTable = handleAddToExistingTable;
window.handleCreateNewTable = handleCreateNewTable;
window.handleTakeawayPayment = handleTakeawayPayment;
window.handleGrabOrder = handleGrabOrder;
window.handleDebtOrder = handleDebtOrder;