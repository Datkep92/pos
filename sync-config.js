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

// Hàm tiện ích để gọi render an toàn
function safeRender(renderFuncName, ...args) {
    if (typeof window[renderFuncName] === 'function') {
        window[renderFuncName](...args);
    } else {
        console.warn(`⚠️ Hàm render ${renderFuncName} chưa được định nghĩa`);
    }
}