// ========== CẤU HÌNH ĐỒNG BỘ TẬP TRUNG ==========
const SYNC_CONFIG = {
    // Tên collection => { localVariable, renderFunction, dependsOn? }
    tables: {
        localVar: 'tablesData',       // biến lưu trong window (nếu cần)
        render: 'renderTables',       // tên hàm render
        needsAuth: false
    },
    customers: {
        localVar: 'customers',
        render: 'renderCustomerList',
        secondaryRender: 'renderDebtList',  // thêm hàm phụ nếu cần
        needsAuth: false
    },
    menu: {
        localVar: 'menuItems',
        render: 'renderMenuManager',
        needsAuth: false
    },
    menu_categories: {
        localVar: 'menuCategories',
        render: 'renderMenuManager',
        secondaryRender: 'renderOrderCategories', // cho popup
        needsAuth: false
    },
    ingredients: {
        localVar: 'ingredients',
        render: 'renderIngredients',
        needsAuth: false
    },
    transactions: {
        localVar: 'historyData',
        render: 'renderHistory',
        needsAuth: false
    },
    reports: {
        localVar: 'reportData',
        render: 'renderReport',
        needsAuth: false
    }
};
async function addItem(item) {
    const db = firebase.database();

    const newRef = db.ref('menu').push(); // 👈 tạo ID thật

    const id = newRef.key;

    const newItem = {
        id: id, // 👈 LƯU ID CHUẨN
        ...item
    };

    await newRef.set(newItem);

    return newItem;
}
async function deleteItem(firebaseId) {
    if (!confirm('Xóa món?')) return;

    try {
        await firebase.database().ref('menu/' + firebaseId).remove();

        console.log("🗑️ Deleted:", firebaseId);

    } catch (err) {
        console.error(err);
    }
}
function setupRealtimeSync() {
    const db = firebase.database();

    db.ref('menu').on('value', snapshot => {
        const data = snapshot.val() || {};

        window.menuItems = Object.keys(data).map(key => ({
            firebaseId: key,   // ✅ ID thật
            ...data[key]
        }));

        renderMenuManager();
    });
}
// Hàm tiện ích để gọi render an toàn
function safeRender(renderFuncName, ...args) {
    if (typeof window[renderFuncName] === 'function') {
        window[renderFuncName](...args);
    } else {
        console.warn(`⚠️ Hàm render ${renderFuncName} chưa được định nghĩa`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initMenu();
    setupRealtimeSync(); // ⚠️ bắt buộc
});