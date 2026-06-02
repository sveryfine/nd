// Data State
let ecns = [];

const lines = ["CR", "CV", "SP", "HC", "PSW", "VS1", "HM", "VS2", "GA", "PC"];
const categories = ["Housing", "TPA", "Terminal", "Seal", "Wire", "Bracket", "Connector"];

// State Management
let currentFilter = { line: 'all', category: 'all', search: '', status: 'all', sortBy: 'time-desc' };
let isAdmin = false;
let editingEcnId = null;
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzEbV-8ShOalFeSmQDEDNXrLsyEhfvp1b2Czdp0QaAsf2mXc2FfeWMx3dbZFdh4Jl1LKw/exec'; // URL Google Apps Script Web App

// ===== NOTIFICATION SYSTEM =====
const NOTIF_STORAGE_KEY = 'ecn_notifications';
const NOTIF_MAX = 50; // Max notifications to keep

function getNotifications() {
    try {
        const stored = localStorage.getItem(NOTIF_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch { return []; }
}

function saveNotifications(notifs) {
    // Keep only latest NOTIF_MAX
    if (notifs.length > NOTIF_MAX) notifs = notifs.slice(0, NOTIF_MAX);
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(notifs));
}

/**
 * Add a notification
 * @param {string} type - 'add' | 'edit' | 'status' | 'delete' | 'lot' | 'category'
 * @param {string} title - Short title
 * @param {string} desc - Description detail
 * @param {object} meta - Optional: { ecnId, itemCode } for click-to-navigate
 */
function addNotification(type, title, desc, meta = {}) {
    const notifs = getNotifications();
    const notif = {
        id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        type,
        title,
        desc,
        meta,
        time: new Date().toISOString(),
        read: false
    };
    notifs.unshift(notif);
    saveNotifications(notifs);
    
    // Sync notification to server
    syncData('addNotification', notif);
    
    renderNotifBadge();
    renderNotifList();
    renderSidebarHistory();
    showNotifToast(notif);
    shakeBell();
}

function renderNotifBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    const notifs = getNotifications();
    const unreadCount = notifs.filter(n => !n.read).length;
    if (unreadCount > 0) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function shakeBell() {
    const bell = document.getElementById('notifBell');
    if (!bell) return;
    bell.classList.remove('has-notif');
    void bell.offsetWidth; // Force reflow for re-trigger
    bell.classList.add('has-notif');
    setTimeout(() => bell.classList.remove('has-notif'), 700);
}

function formatNotifTime(isoStr) {
    const date = new Date(isoStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Vừa xong';
    if (diffMin < 60) return `${diffMin} phút trước`;
    if (diffHr < 24) return `${diffHr} giờ trước`;
    if (diffDay < 7) return `${diffDay} ngày trước`;
    return date.toLocaleDateString('vi-VN');
}

function getNotifIcon(type) {
    const icons = {
        add: 'plus-circle',
        edit: 'edit-3',
        status: 'truck',
        delete: 'trash-2',
        lot: 'hash',
        category: 'tag'
    };
    return icons[type] || 'bell';
}

function renderNotifList() {
    const listEl = document.getElementById('notifList');
    if (!listEl) return;
    const notifs = getNotifications();

    if (notifs.length === 0) {
        listEl.innerHTML = `
            <div class="notif-empty">
                <i data-lucide="bell-off" style="width: 32px; height: 32px; opacity: 0.3;"></i>
                <p>Chưa có thông báo</p>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    listEl.innerHTML = notifs.map(n => `
        <div class="notif-item ${n.read ? '' : 'unread'}" data-notif-id="${n.id}" data-ecn-id="${n.meta.ecnId || ''}" data-item-code="${n.meta.itemCode || ''}">
            <div class="notif-icon type-${n.type}">
                <i data-lucide="${getNotifIcon(n.type)}" style="width: 18px; height: 18px;"></i>
            </div>
            <div class="notif-content">
                <div class="notif-title">${n.title}</div>
                <div class="notif-desc">${n.desc}</div>
                <div class="notif-time">${formatNotifTime(n.time)}</div>
            </div>
        </div>
    `).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Click handler for items
    listEl.querySelectorAll('.notif-item').forEach(item => {
        item.addEventListener('click', () => {
            const notifId = item.dataset.notifId;
            const ecnId = item.dataset.ecnId;
            const itemCode = item.dataset.itemCode;

            // Mark as read
            const notifs = getNotifications();
            const target = notifs.find(n => n.id === notifId);
            if (target) {
                target.read = true;
                saveNotifications(notifs);
                renderNotifBadge();
                item.classList.remove('unread');
            }

            // Navigate to ECN detail if applicable
            if (ecnId && itemCode) {
                const ecn = ecns.find(e => String(e.id) === String(ecnId) && String(e.itemCode) === String(itemCode));
                if (ecn) {
                    // Close dropdown
                    const dd = document.getElementById('notifDropdown');
                    if (dd) dd.classList.remove('open');
                    showDetail(ecnId, itemCode);
                }
            }
        });
    });
}

function showNotifToast(notif) {
    // Remove any existing toast
    const existing = document.querySelector('.notif-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'notif-toast';
    toast.innerHTML = `
        <div class="notif-icon type-${notif.type}">
            <i data-lucide="${getNotifIcon(notif.type)}" style="width: 16px; height: 16px;"></i>
        </div>
        <div class="notif-content">
            <div class="notif-title">${notif.title}</div>
            <div class="notif-desc">${notif.desc}</div>
        </div>
    `;
    document.body.appendChild(toast);
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Auto-remove after animation
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 4200);
}

function clearAllNotifications() {
    localStorage.removeItem(NOTIF_STORAGE_KEY);
    syncData('clearNotifications', {});
    renderNotifBadge();
    renderNotifList();
    renderSidebarHistory();
}

function markAllNotificationsRead() {
    const notifs = getNotifications();
    notifs.forEach(n => n.read = true);
    saveNotifications(notifs);
    renderNotifBadge();
    renderNotifList();
}

// Sidebar History Timeline
const HISTORY_MAX_DISPLAY = 15;

function renderSidebarHistory() {
    const container = document.getElementById('sidebarHistory');
    if (!container) return;
    const notifs = getNotifications();

    if (notifs.length === 0) {
        container.innerHTML = `<div class="history-empty"><p>Chưa có lịch sử</p></div>`;
        return;
    }

    const displayNotifs = notifs.slice(0, HISTORY_MAX_DISPLAY);

    container.innerHTML = displayNotifs.map(n => `
        <div class="history-item" data-ecn-id="${n.meta.ecnId || ''}" data-item-code="${n.meta.itemCode || ''}">
            <div class="history-dot type-${n.type}">
                <i data-lucide="${getNotifIcon(n.type)}" style="width: 13px; height: 13px;"></i>
            </div>
            <div class="history-info">
                <div class="history-title">${n.title}</div>
                <div class="history-time">${formatNotifTime(n.time)}</div>
            </div>
        </div>
    `).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Click to navigate
    container.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => {
            const ecnId = item.dataset.ecnId;
            const itemCode = item.dataset.itemCode;
            if (ecnId && itemCode) {
                const ecn = ecns.find(e => String(e.id) === String(ecnId) && String(e.itemCode) === String(itemCode));
                if (ecn) {
                    // Close sidebar on mobile
                    const sidebar = document.querySelector('.sidebar');
                    const overlay = document.getElementById('sidebarOverlay');
                    if (sidebar) sidebar.classList.remove('open');
                    if (overlay) overlay.classList.remove('active');
                    showDetail(ecnId, itemCode);
                }
            }
        });
    });
}
// ===== END NOTIFICATION SYSTEM =====

// DOM Elements
const ecnGrid = document.getElementById('ecnGrid');
const lineList = document.getElementById('lineList');
const searchInput = document.getElementById('searchInput');
const detailOverlay = document.getElementById('detailOverlay');
const detailContent = document.getElementById('detailContent');
const closeDetail = document.getElementById('closeDetail');
const adminToggle = document.getElementById('adminToggle');
const adminActions = document.getElementById('adminActions');
const addModal = document.getElementById('addModal');
const addEcnBtn = document.getElementById('addEcnBtn');
const cancelAdd = document.getElementById('cancelAdd');
const saveEcn = document.getElementById('saveEcn');
const sidebar = document.querySelector('.sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarIcon = sidebarToggle.querySelector('i');
const addCatBtn = document.getElementById('addCatBtn');
const adminCategoryActions = document.getElementById('adminCategoryActions');
const addCatModalBtn = document.getElementById('addCatModalBtn');
const catPromptOverlay = document.getElementById('catPromptOverlay');
const newCatInput = document.getElementById('newCatInput');
const saveCatBtn = document.getElementById('saveCatBtn');
const cancelCatBtn = document.getElementById('cancelCatBtn');
const deleteConfirmOverlay = document.getElementById('deleteConfirmOverlay');
const deleteConfirmText = document.getElementById('deleteConfirmText');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const passwordModal = document.getElementById('passwordModal');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const submitPassword = document.getElementById('submitPassword');
const cancelPassword = document.getElementById('cancelPassword');
let categoryToDelete = null;
let ecnToDelete = null;
let isZoomed = false;
let zoomScale = 1;
let initialDist = 0;
let initialScale = 1;
let startX = 0, startY = 0, translateX = 0, translateY = 0;

let isSyncing = false;
let lastWriteTime = 0;
const SYNC_COOLDOWN = 10000; // 10 seconds cooldown after local write

async function loadData(silent = false) {
    if (isSyncing) return;

    // Don't sync from server if we just wrote something (give server time to update)
    if (silent && Date.now() - lastWriteTime < SYNC_COOLDOWN) {
        console.log('Skipping auto-sync to avoid overwriting local changes...');
        return;
    }

    isSyncing = true;

    // Show sync indicator if not silent
    const syncIndicator = document.getElementById('syncIndicator');
    if (syncIndicator) syncIndicator.classList.add('syncing');

    // 1. Initial Load from LocalStorage (only if array is empty)
    if (ecns.length === 0 && !silent) {
        const savedEcns = localStorage.getItem('ecns');
        const savedCats = localStorage.getItem('categories');
        if (savedEcns) {
            try {
                ecns = JSON.parse(savedEcns);
            } catch (e) { console.error("Error parsing local ECNS"); }
        }
        if (savedCats) {
            try {
                const parsedCats = JSON.parse(savedCats);
                if (Array.isArray(parsedCats)) {
                    categories.splice(0, categories.length, ...parsedCats);
                }
            } catch (e) { console.error("Error parsing local Categories"); }
        }
        renderLines();
        renderECNs();
    }

    // 2. Fetch from Google Sheets
    if (!SCRIPT_URL) {
        console.warn('Chưa cấu hình SCRIPT_URL. Đang chạy ở chế độ Offline.');
        isSyncing = false;
        return;
    }

    try {
        const cacheBuster = `?t=${new Date().getTime()}`;
        const response = await fetch(SCRIPT_URL + cacheBuster);
        const serverData = await response.json();

        let newEcns = [];
        let newCats = null;
        let newNotifs = null;

        if (Array.isArray(serverData)) {
            newEcns = serverData;
        } else if (serverData && serverData.ecns) {
            newEcns = serverData.ecns;
            newCats = serverData.categories;
            newNotifs = serverData.notifications;
        }

        // --- SYNC THÔNG BÁO TỪ SERVER ---
        if (newNotifs && Array.isArray(newNotifs)) {
            const localNotifs = getNotifications();
            const localIds = new Set(localNotifs.map(n => n.id));
            
            // Server trả về từ cũ đến mới, reverse để lấy mới nhất lên đầu
            const serverNotifsReversed = [...newNotifs].reverse();
            
            // Tìm thông báo từ server mà local chưa có
            const newFromServer = serverNotifsReversed.filter(n => n.id && !localIds.has(n.id));
            
            if (newFromServer.length > 0) {
                localNotifs.unshift(...newFromServer);
                saveNotifications(localNotifs);
                
                renderNotifBadge();
                renderNotifList();
                renderSidebarHistory();
                
                // Chỉ hiện toast & rung chuông nếu có thông báo mới (lấy cái đầu tiên)
                showNotifToast(newFromServer[0]);
                shakeBell();
            }
            
            // Xử lý trường hợp Admin xóa lịch sử (trên server rỗng mà local có dữ liệu cũ)
            // (Chỉ xóa nếu local có thông báo nhưng server không có cái nào)
            if (serverNotifsReversed.length === 0 && localNotifs.length > 0) {
                // Ngoại trừ các thông báo vừa tạo ở local chưa kịp lên server (trong vòng 10 giây qua)
                const now = Date.now();
                const hasRecentLocal = localNotifs.some(n => (now - new Date(n.time).getTime()) < 10000);
                
                if (!hasRecentLocal) {
                    localStorage.removeItem(NOTIF_STORAGE_KEY);
                    renderNotifBadge();
                    renderNotifList();
                    renderSidebarHistory();
                }
            }
        }

        if (newEcns.length > 0) {
            // Đảo ngược mảng từ server (vì Google Sheets thường trả về dữ liệu cũ trước, mới sau ở dưới cùng)
            newEcns.reverse();

            // Smart Merge: Don't let old server data overwrite fresh local changes
            let hasActualChanges = false;
            const now = Date.now();

            const updatedEcns = newEcns.map(serverEcn => {
                // Sanitize server data
                if (serverEcn.deliveries) {
                    serverEcn.deliveries = serverEcn.deliveries.map(d => {
                        if (typeof d === 'string') return d.toLowerCase() === 'true';
                        return !!d;
                    });
                } else {
                    serverEcn.deliveries = [false, false, false];
                }
                if (!serverEcn.lotNumbers) serverEcn.lotNumbers = ["", "", ""];

                // Find local version
                const localEcn = ecns.find(e => String(e.id) === String(serverEcn.id) && String(e.itemCode) === String(serverEcn.itemCode));

                if (localEcn && localEcn._lastLocalUpdate) {
                    const timeSinceUpdate = now - localEcn._lastLocalUpdate;
                    if (timeSinceUpdate < 30000) { // 30 seconds protection
                        // Server might be lagging, keep our local version for now
                        return localEcn;
                    }
                }
                return serverEcn;
            });

            // Check if the merged result is different from current memory
            if (JSON.stringify(ecns) !== JSON.stringify(updatedEcns)) {
                hasActualChanges = true;
                ecns = updatedEcns;
                localStorage.setItem('ecns', JSON.stringify(ecns));
                if (newCats && Array.isArray(newCats)) {
                    categories.splice(0, categories.length, ...newCats);
                    localStorage.setItem('categories', JSON.stringify(categories));
                    renderCategorySelect();
                }
            }

            if (hasActualChanges) {
                renderLines();
                renderECNs();

                // Cập nhật Detail nếu đang mở
                if (detailOverlay.style.display === 'flex') {
                    const currentId = detailOverlay.dataset.ecnId;
                    const currentCode = detailOverlay.dataset.itemCode;

                    if (currentId && currentCode) {
                        const updatedEcn = ecns.find(e => String(e.id) === String(currentId) && String(e.itemCode) === String(currentCode));
                        if (updatedEcn) {
                            showDetail(updatedEcn.id, updatedEcn.itemCode);
                        }
                    }
                }
            }

            // Update last sync time
            if (syncIndicator) {
                const now = new Date();
                const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
                syncIndicator.querySelector('.sync-time').textContent = `Cập nhật lúc: ${timeStr}`;
            }
        }
    } catch (e) {
        console.error('Không thể kết nối Server:', e);
    } finally {
        isSyncing = false;
        if (syncIndicator) {
            setTimeout(() => syncIndicator.classList.remove('syncing'), 1000);
        }
    }
}

function startAutoSync() {
    // Sync mỗi 5 giây để tiệm cận thời gian thực
    setInterval(() => {
        loadData(true);
    }, 5000);

    // Cho phép click vào indicator để sync thủ công
    const syncIndicator = document.getElementById('syncIndicator');
    if (syncIndicator) {
        syncIndicator.style.cursor = 'pointer';
        syncIndicator.title = 'Click để đồng bộ ngay';
        syncIndicator.onclick = () => loadData(false);
    }
}

function saveData() {
    localStorage.setItem('ecns', JSON.stringify(ecns));
    localStorage.setItem('categories', JSON.stringify(categories));
}

async function syncData(action, data) {
    const now = Date.now();
    lastWriteTime = now; // Mark that we are writing

    // Add local timestamp to the data to protect it from being reverted
    if (Array.isArray(data)) {
        data.forEach(item => item._lastLocalUpdate = now);
    } else if (data && typeof data === 'object') {
        data._lastLocalUpdate = now;
    }

    saveData();
    if (!SCRIPT_URL) return;

    try {
        // Send to Google Apps Script
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action, data }),
            mode: 'no-cors'
        });
        console.log(`Sync successful: ${action}`);
        return true;
    } catch (e) {
        console.error('Lỗi đồng bộ server:', e);
        return false;
    }
}

function getDirectDriveLink(url) {
    if (!url) return '';
    // Handle Google Drive links
    if (url.includes('drive.google.com')) {
        const fileId = url.match(/[-\w]{25,}/);
        if (fileId) {
            // Using the thumbnail endpoint is often the most reliable for embedding
            return `https://drive.google.com/thumbnail?id=${fileId[0]}&sz=w1000`;
        }
    }
    return url;
}
function init() {
    loadData();
    renderLines();
    renderCategories();
    renderECNs();
    setupEventListeners();
    startAutoSync();

    // Tự động tải lại trang mỗi 4 tiếng để làm mới bộ nhớ và script
    const FOUR_HOURS = 4 * 60 * 60 * 1000;
    setTimeout(() => {
        location.reload();
    }, FOUR_HOURS);
}

function renderLines() {
    lineList.innerHTML = `
        <div class="line-item active" data-line="all">
            <i data-lucide="layout-grid"></i>
            <span>Tất cả Line</span>
        </div>
    `;

    lines.forEach(line => {
        // Get categories present in this line
        const lineEcns = ecns.filter(e => e.line === line);
        const lineCats = [...new Set(lineEcns.map(e => e.category))].sort();

        const group = document.createElement('div');
        group.className = 'line-group';
        group.innerHTML = `
            <div class="line-item" data-line="${line}">
                <i data-lucide="component"></i> 
                <span>${line}</span>
                <i data-lucide="chevron-right" class="dropdown-icon" style="margin-left: auto; width: 12px; opacity: 0.5;"></i>
            </div>
            <div class="sub-category-list">
                <div class="sub-item ${currentFilter.line === line && currentFilter.category === 'all' ? 'active' : ''}" data-cat="all">
                    <i data-lucide="layers"></i> Tất cả loại
                </div>
                ${lineCats.map(cat => `
                    <div class="sub-item ${currentFilter.line === line && currentFilter.category === cat ? 'active' : ''}" data-cat="${cat}">
                        <i data-lucide="tag"></i> ${cat}
                    </div>
                `).join('')}
            </div>
        `;
        lineList.appendChild(group);
    });
    lucide.createIcons();
}

function renderCategories() {
    renderCategorySelect();
}

function renderCategorySelect() {
    const newCat = document.getElementById('newCat');
    if (!newCat) return;

    const currentVal = newCat.value;
    newCat.innerHTML = ''; // Xóa sạch để tạo mới

    // Thêm option mặc định
    const defOpt = document.createElement('option');
    defOpt.value = "";
    defOpt.textContent = "Chọn phân loại...";
    defOpt.disabled = true;
    defOpt.selected = !currentVal;
    newCat.appendChild(defOpt);

    // Danh sách dự phòng nếu categories bị lỗi
    const safeCategories = Array.isArray(categories) && categories.length > 0
        ? categories
        : ["Housing", "TPA", "Terminal", "Seal", "Wire", "Bracket", "Connector"];

    safeCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        newCat.appendChild(opt);
    });

    // Khôi phục giá trị cũ nếu hợp lệ
    if (currentVal && safeCategories.includes(currentVal)) {
        newCat.value = currentVal;
    }
}

function renderECNs() {
    let filtered = ecns.filter(ecn => {
        const matchesLine = currentFilter.line === 'all' || ecn.line === currentFilter.line;
        const matchesCat = currentFilter.category === 'all' || ecn.category.toLowerCase() === currentFilter.category.toLowerCase();
        const searchLower = currentFilter.search.toLowerCase();
        const matchesSearch =
            (String(ecn.itemCode || '').toLowerCase().includes(searchLower)) ||
            (String(ecn.id || '').toLowerCase().includes(searchLower)) ||
            (String(ecn.description || '').toLowerCase().includes(searchLower)) ||
            (String(ecn.line || '').toLowerCase().includes(searchLower)) ||
            (String(ecn.category || '').toLowerCase().includes(searchLower)) ||
            (String(ecn.m4e || '').toLowerCase().includes(searchLower));

        // Filter by Status
        let matchesStatus = true;
        if (currentFilter.status === 'complete') {
            matchesStatus = ecn.deliveries.filter(d => d).length === 3;
        } else if (currentFilter.status === 'incomplete') {
            matchesStatus = ecn.deliveries.filter(d => d).length < 3;
        }

        return matchesLine && matchesCat && matchesSearch && matchesStatus;
    });

    // Sort results
    if (currentFilter.sortBy === 'itemCode-asc') {
        filtered.sort((a, b) => (a.itemCode || '').localeCompare(b.itemCode || ''));
    } else if (currentFilter.sortBy === 'itemCode-desc') {
        filtered.sort((a, b) => (b.itemCode || '').localeCompare(a.itemCode || ''));
    } else if (currentFilter.sortBy === 'time-desc') {
        filtered.sort((a, b) => (b.lastUpdate || '').localeCompare(a.lastUpdate || ''));
    } else if (currentFilter.sortBy === 'time-asc') {
        filtered.sort((a, b) => (a.lastUpdate || '').localeCompare(b.lastUpdate || ''));
    }

    ecnGrid.innerHTML = filtered.map(ecn => {
        const deliveryCount = ecn.deliveries.filter(d => d).length;
        const isDone = deliveryCount === 3;

        return `
            <div class="ecn-card" onclick="showDetail('${ecn.id}', '${ecn.itemCode}')">
                <!-- Delivery Status Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; margin-bottom: 16px; border-bottom: 1px solid var(--bg-accent);">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        ${[0, 1, 2].map((i) => {
            const colors = ['#ff4757', '#ffa502', '#2ed573'];
            const isActive = ecn.deliveries[i];
            const dotColor = isDone ? '#2ed573' : colors[i];
            return `
                                <div 
                                    class="status-dot-btn ${isAdmin ? 'admin-active' : ''}" 
                                    onclick="${isAdmin ? `event.stopPropagation(); toggleDelivery('${ecn.id.replace(/'/g, "\\'")}', ${i}, '${ecn.itemCode.replace(/'/g, "\\'")}')` : ''}"
                                    style="width: 55px; height: 55px; border-radius: 50%; background: ${isActive ? dotColor : 'var(--bg-accent)'}; border: 2.5px solid ${isActive ? 'transparent' : '#cbd5e1'}; display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0; box-shadow: ${isActive ? '0 0 20px ' + dotColor + '80' : 'none'}; cursor: ${isAdmin ? 'pointer' : 'default'}; transition: all 0.2s;"
                                >
                                    ${isActive ? '<i data-lucide="check" style="width: 32px; height: 32px; stroke-width: 4;"></i>' : ''}
                                </div>
                            `;
        }).join('')}
                    </div>
                    <span style="font-size: 11px; font-weight: 700; color: var(--primary); background: var(--primary-glow); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(2, 132, 199, 0.2);">${ecn.line}</span>
                </div>

                <div class="card-header" style="margin-bottom: 8px;">
                    <span style="font-weight: 600; color: var(--text-dim); font-size: 13px;">${ecn.id}</span>
                </div>
                
                <div style="display: flex; gap: 16px; align-items: flex-start;">
                    <div style="flex: 1;">
                        <h2 style="font-size: 18px; margin-bottom: 8px; color: var(--text-main);">${ecn.itemCode}</h2>
                        <p style="color: var(--text-dim); font-size: 13px; line-height: 1.5;">
                            ${ecn.description.substring(0, 80)}${ecn.description.length > 80 ? '...' : ''}
                        </p>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; flex-shrink: 0;">
                        ${ecn.image ? `
                            <div style="width: 80px; height: 80px;" onclick="event.stopPropagation(); openImageViewer('${ecn.image}')">
                                <img src="${ecn.image}" referrerpolicy="no-referrer" style="width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--bg-accent); cursor: pointer;">
                            </div>
                        ` : ''}
                        <span class="badge ${isDone ? 'badge-success' : 'badge-danger'}" style="font-size: 9px; padding: 2px 8px; white-space: nowrap; width: fit-content;">
                            ${isDone ? 'Hoàn thành' : 'Chưa hoàn thành'}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    lucide.createIcons();
}

function showDetail(id, itemCode) {
    const ecn = ecns.find(e => String(e.id) === String(id) && String(e.itemCode) === String(itemCode));
    if (!ecn) return;

    // Track current open ECN for auto-sync
    detailOverlay.dataset.ecnId = id;
    detailOverlay.dataset.itemCode = itemCode;

    const deliveryCount = (ecn.deliveries || []).filter(d => d).length;
    const titleEl = document.getElementById('detailHeaderTitle');
    titleEl.textContent = ecn.itemCode;

    if (deliveryCount === 3) {
        titleEl.style.color = '#10b981';
        titleEl.style.textShadow = '0 4px 12px rgba(16, 185, 129, 0.2)';
    } else {
        titleEl.style.color = '#ef4444';
        titleEl.style.textShadow = '0 4px 12px rgba(239, 68, 68, 0.2)';
    }

    detailContent.innerHTML = `
        <div style="margin-bottom: 16px;" onclick="openImageViewer('${ecn.image}')">
            <img src="${ecn.image}" referrerpolicy="no-referrer" style="width: calc(100% - 8px); margin: 0 auto 16px auto; display: block; aspect-ratio: 8 / 4; object-fit: cover; border-radius: var(--radius-lg); border: 1px solid var(--bg-accent); cursor: pointer;">
        </div>
        
        <div style="display: flex; justify-content: center; margin-bottom: 32px;">
            <span style="font-size: 11px; font-weight: 700; background: var(--bg-accent); color: var(--text-dim); border: 1px solid rgba(0, 0, 0, 0.05); padding: 4px 12px; border-radius: 6px; opacity: 0.8;">
                ${ecn.id}
            </span>
        </div>

        <div style="background: var(--bg-card); padding: 24px; border-radius: var(--radius-lg); border: 1px solid var(--glass-border); margin-bottom: 32px;">
            <h3 style="margin-bottom: 20px; font-size: 16px; display: flex; align-items: center; gap: 8px;">
                <i data-lucide="truck"></i> Theo dõi 3 lần giao hàng
            </h3>
            
            <div style="display: flex; gap: 16px; margin-top: 20px;">
                ${[0, 1, 2].map(i => {
        const colors = ['#ff4757', '#ffa502', '#2ed573'];
        const isActive = ecn.deliveries[i];
        return `
                        <div style="flex: 1; padding: 16px; background: ${isActive ? colors[i] + '15' : 'var(--bg-accent)'}; border-radius: var(--radius-md); border: 2px solid ${isActive ? colors[i] : 'transparent'}; display: flex; flex-direction: column; align-items: center; gap: 12px; transition: all 0.3s ease; box-shadow: ${isActive ? '0 0 15px ' + colors[i] + '40' : 'none'};">
                            <div style="width: 32px; height: 32px; border-radius: 50%; background: ${isActive ? colors[i] : '#cbd5e1'}; display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 14px; box-shadow: ${isActive ? '0 0 12px ' + colors[i] + '80' : 'none'};">
                                ${isActive ? '<i data-lucide="check" style="width:18px"></i>' : i + 1}
                            </div>
                            <div style="text-align: center;">
                                <div style="font-weight: 800; color: ${isActive ? 'var(--text-main)' : 'var(--text-dim)'}; font-size: 11px; margin-bottom: 8px; opacity: 0.8;">LOT ${i + 1}</div>
                                ${isAdmin ? `
                                    <input type="text" 
                                        class="search-input" 
                                        style="padding: 8px 12px; font-size: 12px; width: 100%; text-align: center; background: white; height: 36px;" 
                                        value="${ecn.lotNumbers[i]}" 
                                        onchange="updateLotNumber('${ecn.id.replace(/'/g, "\\'")}', ${i}, this.value, '${ecn.itemCode.replace(/'/g, "\\'")}')"
                                        placeholder="Ngày..."
                                    >
                                    <button onclick="toggleDelivery('${ecn.id.replace(/'/g, "\\'")}', ${i}, '${ecn.itemCode.replace(/'/g, "\\'")}')" style="margin-top: 8px; width: 100%; font-size: 10px; background: ${isActive ? 'rgba(148, 163, 184, 0.1)' : colors[i] + '15'}; border: 1.5px solid ${isActive ? '#94a3b8' : colors[i]}; color: ${isActive ? '#64748b' : colors[i]}; padding: 6px; border-radius: 100px; cursor: pointer; font-weight: 800; transition: all 0.2s;">
                                        ${isActive ? 'Đã giao' : 'Chưa giao'}
                                    </button>
                                ` : `
                                    <div style="${ecn.lotNumbers[i] ? 'font-weight: 700; font-size: 12px;' : 'font-weight: 500; font-size: 11px; opacity: 0.8;'} color: ${isActive ? colors[i] : 'var(--text-dim)'};">
                                        ${ecn.lotNumbers[i] || (isActive ? 'Đã giao' : 'Chưa giao')}
                                    </div>
                                `}
                            </div>
                        </div>
                    `;
    }).join('')}
            </div>

            ${deliveryCount === 3 ? `
                <div style="background: rgba(34, 197, 94, 0.1); border: 1px dashed var(--success); padding: 16px; border-radius: var(--radius-md); text-align: center; margin-top: 16px;">
                    <p style="color: var(--success); font-weight: 600;">Đã hoàn thành 3 lot</p>
                </div>
            ` : ''}
        </div>

        <div style="margin-bottom: 32px;">
            <h3 style="margin-bottom: 12px; font-size: 13px; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.5px;">Nội dung thay đổi</h3>
            <p style="line-height: 1.6; font-size: 14px; color: var(--text-main); opacity: 0.8;">${ecn.description}</p>
        </div>

        <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 24px; padding: 24px 8px 0 8px; border-top: 1px solid var(--glass-border);">
            <!-- Line Section -->
            <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 100px;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 4px; background: var(--primary-glow); color: var(--primary); width: 95px; height: 28px; border-radius: 100px; border: 1px solid var(--primary); font-size: 9px; font-weight: 800; letter-spacing: 0.5px;">
                    <i data-lucide="layers" style="width: 10px; height: 10px;"></i> LINE
                </div>
                <span style="font-size: 13px; font-weight: 800; color: var(--text-main); text-transform: uppercase;">${ecn.line}</span>
            </div>

            <!-- 4M+1E Section -->
            <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 100px;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 4px; background: rgba(168, 85, 247, 0.1); color: #a855f7; width: 95px; height: 28px; border-radius: 100px; border: 1px solid #a855f7; font-size: 9px; font-weight: 800; letter-spacing: 0.5px;">
                    <i data-lucide="cog" style="width: 10px; height: 10px;"></i> 4M+1E
                </div>
                <span style="font-size: 13px; font-weight: 800; color: var(--text-main); text-transform: uppercase;">${ecn.m4e || 'N/A'}</span>
            </div>

            <!-- Category Section -->
            <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 100px;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 4px; background: rgba(148, 163, 184, 0.1); color: var(--text-dim); width: 95px; height: 28px; border-radius: 100px; border: 1px solid var(--bg-accent); font-size: 9px; font-weight: 800; letter-spacing: 0.5px;">
                    <i data-lucide="tag" style="width: 10px; height: 10px;"></i> PHÂN LOẠI
                </div>
                <span style="font-size: 13px; font-weight: 800; color: var(--text-main); text-transform: uppercase;">${ecn.category}</span>
            </div>
        </div>

        ${isAdmin ? `
            <div style="display: flex; gap: 12px; margin-top: 32px; padding-top: 24px; border-top: 1px dashed var(--glass-border);">
                <button id="btnEditECN" data-id="${ecn.id}" data-itemcode="${ecn.itemCode}" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; background: var(--bg-accent); color: var(--text-main); border: 1px solid var(--glass-border); border-radius: var(--radius-md); font-weight: 700; cursor: pointer;">
                    <i data-lucide="edit-3" style="width: 18px;"></i> Sửa ECN
                </button>
                <button id="btnDeleteECN" data-id="${ecn.id}" data-itemcode="${ecn.itemCode}" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid #ef4444; border-radius: var(--radius-md); font-weight: 700; cursor: pointer;">
                    <i data-lucide="trash-2" style="width: 18px;"></i> Xóa ECN
                </button>
            </div>
        ` : ''}
    `;

    detailOverlay.style.display = 'flex';
    lucide.createIcons();

    // Attach listeners for Edit/Delete buttons (Safer than inline onclick)
    if (isAdmin) {
        const btnEdit = document.getElementById('btnEditECN');
        const btnDelete = document.getElementById('btnDeleteECN');
        if (btnEdit) btnEdit.onclick = () => editECN(id, itemCode);
        if (btnDelete) btnDelete.onclick = () => deleteECN(id, itemCode);
    }
}

function toggleDelivery(id, index, itemCode) {
    const ecn = ecns.find(e => String(e.id) === String(id) && String(e.itemCode) === String(itemCode));
    if (ecn) {
        ecn.deliveries[index] = !ecn.deliveries[index];
        syncData('updateECN', ecn);
        showDetail(id, itemCode); // Re-render detail
        renderECNs();   // Re-render grid

        // Notification
        const statusText = ecn.deliveries[index] ? 'Đã giao' : 'Chưa giao';
        const deliveryCount = ecn.deliveries.filter(d => d).length;
        addNotification(
            'status',
            `[${ecn.itemCode}] Lot ${index + 1}: ${statusText}`,
            `ECN: ${ecn.id} — Tiến độ: ${deliveryCount}/3`,
            { ecnId: id, itemCode }
        );
    }
}

function deleteECN(id, itemCode) {
    const ecn = ecns.find(e => String(e.id) === String(id) && String(e.itemCode) === String(itemCode));
    if (!ecn) return;

    ecnToDelete = { id, itemCode };
    deleteConfirmText.textContent = `Bạn có chắc chắn muốn xóa ECN "${id}" (${itemCode}) không? Hành động này không thể hoàn tác.`;
    deleteConfirmOverlay.style.display = 'flex';
}

function editECN(id, itemCode) {
    const ecn = ecns.find(e => String(e.id) === String(id) && String(e.itemCode) === String(itemCode));
    if (!ecn) return;

    editingEcnId = id + '|' + itemCode;

    // Fill form
    document.getElementById('newEcnId').value = ecn.id;
    document.getElementById('newItemCode').value = ecn.itemCode; // Fill the specific code
    document.getElementById('newLine').value = ecn.line;
    document.getElementById('new4m').value = ecn.m4e || '';

    // Ensure categories are loaded before setting value
    const catSelect = document.getElementById('newCat');
    if (catSelect) {
        renderCategorySelect();
        catSelect.value = ecn.category;

        // Nếu giá trị hiện tại không khớp với ecn.category, thêm nó vào list
        if (catSelect.value !== ecn.category && ecn.category) {
            const opt = document.createElement('option');
            opt.value = ecn.category;
            opt.textContent = ecn.category;
            catSelect.appendChild(opt);
            catSelect.value = ecn.category;
        }
    }

    document.getElementById('newDesc').value = ecn.description;
    document.getElementById('newImage').value = ecn.image;
    document.getElementById('newDrive').value = ecn.driveLink;

    // Update Modal UI
    document.querySelector('#addModal h2').textContent = 'Chỉnh sửa ECN';
    document.getElementById('saveEcn').textContent = 'Cập nhật';
    addModal.style.display = 'flex';
}

function updateLotNumber(id, index, value, itemCode) {
    const ecn = ecns.find(e => String(e.id) === String(id) && String(e.itemCode) === String(itemCode));
    if (ecn) {
        ecn.lotNumbers[index] = value;
        syncData('updateECN', ecn);
        renderECNs();

        // Notification
        if (value) {
            addNotification(
                'lot',
                `[${ecn.itemCode}] Cập nhật ngày Lot ${index + 1}`,
                `Ngày: "${value}" (ECN: ${ecn.id})`,
                { ecnId: id, itemCode }
            );
        }
    }
}

// Image Viewer Logic
function openImageViewer(url) {
    if (!url) return;
    const viewer = document.getElementById('imageViewer');
    const img = document.getElementById('fullImage');
    img.src = url;
    viewer.style.display = 'flex';
    resetZoom();
    lucide.createIcons(); // Ensure the X icon is rendered
}

window.closeImageViewer = function () {
    const viewer = document.getElementById('imageViewer');
    viewer.style.display = 'none';
    resetZoom();
}

function resetZoom() {
    const img = document.getElementById('fullImage');
    isZoomed = false;
    zoomScale = 1;
    translateX = 0;
    translateY = 0;
    img.style.transformOrigin = 'center';
    img.style.transform = 'translate(0, 0) scale(1)';
    img.style.cursor = 'zoom-in';
}

function toggleZoom(e) {
    if (e.touches && e.touches.length > 1) return;
    const img = document.getElementById('fullImage');
    if (!isZoomed) {
        isZoomed = true;
        zoomScale = 2.5;
        img.style.cursor = 'grab';
    } else {
        resetZoom();
    }
    updateImageTransform();
}

function updateImageTransform() {
    const img = document.getElementById('fullImage');
    img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${zoomScale})`;
}

function setupEventListeners() {
    // === Notification Bell Controls ===
    const notifBell = document.getElementById('notifBell');
    const notifDropdown = document.getElementById('notifDropdown');
    const notifClearAll = document.getElementById('notifClearAll');

    if (notifBell && notifDropdown) {
        notifBell.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = notifDropdown.classList.toggle('open');
            if (isOpen) {
                // Mark all as read when opening
                markAllNotificationsRead();
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.notif-wrapper')) {
                notifDropdown.classList.remove('open');
            }
        });
    }

    if (notifClearAll) {
        notifClearAll.addEventListener('click', (e) => {
            e.stopPropagation();
            clearAllNotifications();
        });
    }

    // Initialize notification badge, list & sidebar history
    renderNotifBadge();
    renderNotifList();
    renderSidebarHistory();

    // === Reload Button ===
    const reloadBtn = document.getElementById('reloadBtn');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            reloadBtn.classList.add('spinning');
            reloadBtn.style.pointerEvents = 'none';
            // Small delay for visual feedback before reload
            setTimeout(() => {
                location.reload();
            }, 400);
        });
    }

    // === Sidebar Sort & Filter Controls ===

    // Sort Toggle Buttons (A-Z, Z-A, Newest, Oldest)
    const sortBtns = document.querySelectorAll('.sort-toggle-btn');
    sortBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isAlreadyActive = btn.classList.contains('active');

            // Deactivate all sort buttons
            sortBtns.forEach(b => b.classList.remove('active'));

            if (isAlreadyActive) {
                currentFilter.sortBy = 'none';
            } else {
                btn.classList.add('active');
                currentFilter.sortBy = btn.dataset.sort;
            }
            console.log('Sort changed to:', currentFilter.sortBy);
            renderECNs();
        });
    });

    // Filter by Status
    const statusBtns = document.querySelectorAll('.status-filter-btn');
    statusBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            statusBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter.status = btn.dataset.status;
            console.log('Status filter changed to:', currentFilter.status);
            renderECNs();
        });
    });

    // Sidebar filtering (Nested Dropdown)
    lineList.addEventListener('click', (e) => {
        const lineItem = e.target.closest('.line-item');
        const subItem = e.target.closest('.sub-item');

        if (lineItem) {
            const line = lineItem.dataset.line;

            // Clear all active states in sidebar
            document.querySelectorAll('#lineList .line-item, .sub-item').forEach(el => el.classList.remove('active'));
            lineItem.classList.add('active');

            currentFilter.line = line;
            currentFilter.category = 'all';

            renderECNs();
            // If it's "All Lines", no sub-menu to show
            if (line === 'all') {
                // Refresh to collapse others
                renderLines();
            }
        } else if (subItem) {
            const cat = subItem.dataset.cat;
            const group = subItem.closest('.line-group');
            const parentLineItem = group.querySelector('.line-item');

            document.querySelectorAll('.sub-item').forEach(el => el.classList.remove('active'));
            subItem.classList.add('active');

            currentFilter.line = parentLineItem.dataset.line;
            currentFilter.category = cat;
            renderECNs();
        }
    });

    // Search
    searchInput.addEventListener('input', (e) => {
        currentFilter.search = e.target.value;
        renderECNs();
    });

    // Detail Panel
    closeDetail.addEventListener('click', () => {
        detailOverlay.style.display = 'none';
    });

    detailOverlay.addEventListener('click', (e) => {
        if (e.target === detailOverlay) detailOverlay.style.display = 'none';
    });

    // Sidebar Toggle
    sidebarToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('active', isOpen);
        sidebarIcon.setAttribute('data-lucide', isOpen ? 'x' : 'menu');
        lucide.createIcons();
    });

    // Close sidebar when clicking overlay
    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
        sidebarIcon.setAttribute('data-lucide', 'menu');
        lucide.createIcons();
    });

    // Custom Password Modal Logic
    if (adminToggle) {
        adminToggle.addEventListener('click', () => {
            if (!isAdmin) {
                if (passwordModal) {
                    passwordModal.style.display = 'flex';
                    if (adminPasswordInput) {
                        adminPasswordInput.value = '';
                        adminPasswordInput.focus();
                    }
                }
            } else {
                isAdmin = false;
                updateAdminUI();
            }
        });
    }

    if (cancelPassword) {
        cancelPassword.addEventListener('click', () => {
            if (passwordModal) passwordModal.style.display = 'none';
        });
    }

    if (submitPassword) submitPassword.addEventListener('click', verifyAdminPassword);
    if (adminPasswordInput) {
        adminPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') verifyAdminPassword();
        });
    }

    function verifyAdminPassword() {
        const password = adminPasswordInput.value;
        const SECRET = "MjAwNDIwMjE="; // btoa('20042021')

        if (btoa(password) === SECRET) {
            isAdmin = true;
            passwordModal.style.display = 'none';
            updateAdminUI();
            alert("Đăng nhập Admin thành công!");
        } else {
            alert("Sai mật khẩu! Bạn không có quyền truy cập.");
        }
    }


    function updateAdminUI() {
        if (adminToggle) {
            adminToggle.classList.toggle('active', isAdmin);
            const iconName = isAdmin ? 'unlock' : 'user-cog';
            const label = isAdmin ? 'Admin On' : 'Admin Off';
            adminToggle.innerHTML = `<i data-lucide="${iconName}" style="width: 20px; height: 20px;"></i> <span class="desktop-only" style="font-size: 13px; margin-left: 6px;">${label}</span>`;
        }
        if (adminActions) adminActions.style.display = isAdmin ? 'flex' : 'none';
        if (adminCategoryActions) adminCategoryActions.style.display = isAdmin ? 'block' : 'none';
        if (addCatModalBtn) addCatModalBtn.style.display = isAdmin ? 'flex' : 'none';

        const notifClearAllBtn = document.getElementById('notifClearAll');
        if (notifClearAllBtn) notifClearAllBtn.style.display = isAdmin ? 'block' : 'none';

        if (typeof lucide !== 'undefined') lucide.createIcons();
        renderECNs();
        renderCategories();
    }

    // Custom Category Prompt Listeners
    // Admin & Category Actions - Safe handling
    if (addCatBtn) addCatBtn.addEventListener('click', addNewCategory);
    if (addCatModalBtn) addCatModalBtn.addEventListener('click', addNewCategory);

    // Password Modal
    if (submitPassword) submitPassword.addEventListener('click', verifyAdminPassword);
    if (cancelPassword) cancelPassword.addEventListener('click', () => {
        if (passwordModal) passwordModal.style.display = 'none';
        if (adminPasswordInput) adminPasswordInput.value = '';
    });

    if (adminPasswordInput) {
        adminPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') verifyAdminPassword();
        });
    }

    // Custom Category Prompt Listeners
    if (cancelCatBtn) {
        cancelCatBtn.addEventListener('click', () => {
            if (catPromptOverlay) catPromptOverlay.style.display = 'none';
            if (newCatInput) newCatInput.value = '';
        });
    }

    if (saveCatBtn) {
        saveCatBtn.addEventListener('click', () => {
            if (!newCatInput) return;
            const newCat = newCatInput.value.trim();
            if (newCat && !categories.includes(newCat)) {
                categories.push(newCat);
                syncData('addCategory', { name: newCat });
                renderCategorySelect();

                const newCatSelect = document.getElementById('newCat');
                if (newCatSelect) newCatSelect.value = newCat;

                if (catPromptOverlay) catPromptOverlay.style.display = 'none';
                newCatInput.value = '';

                // Notification
                addNotification('category', `Thêm phân loại: "${newCat}"`, 'Danh mục mới đã được thêm vào hệ thống', {});
            } else if (categories.includes(newCat)) {
                window.alert('Phân loại này đã tồn tại!');
            }
        });
    }

    // Custom Delete Confirmation Listeners
    cancelDeleteBtn.addEventListener('click', () => {
        deleteConfirmOverlay.style.display = 'none';
        categoryToDelete = null;
        ecnToDelete = null;
    });

    confirmDeleteBtn.addEventListener('click', () => {
        if (categoryToDelete) {
            const catName = categoryToDelete;
            const index = categories.indexOf(categoryToDelete);
            if (index > -1) {
                categories.splice(index, 1);
                syncData('deleteCategory', { name: categoryToDelete });
                renderCategories();

                // Notification
                addNotification('category', `Đã xóa phân loại: "${catName}"`, 'Danh mục đã bị xóa khỏi hệ thống', {});
            }
            deleteConfirmOverlay.style.display = 'none';
            categoryToDelete = null;
        } else if (ecnToDelete) {
            const index = ecns.findIndex(e => String(e.id) === String(ecnToDelete.id) && String(e.itemCode) === String(ecnToDelete.itemCode));
            if (index !== -1) {
                const deletedEcn = ecns[index];
                ecns.splice(index, 1);
                syncData('deleteECN', { id: ecnToDelete.id, itemCode: ecnToDelete.itemCode });
                detailOverlay.style.display = 'none';
                renderECNs();

                // Notification
                addNotification(
                    'delete',
                    `[${deletedEcn.itemCode}] Đã xóa ECN`,
                    `ID: ${deletedEcn.id} — Line: ${deletedEcn.line}`,
                    {}
                );
            }
            deleteConfirmOverlay.style.display = 'none';
            ecnToDelete = null;
        }
    });

    // Add ECN Modal
    if (addEcnBtn) {
        addEcnBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Opening Add Modal...');
            editingEcnId = null;
            document.getElementById('modalTitle').textContent = 'Thêm ECN Mới';
            const form = document.getElementById('addEcnForm');
            if (form) form.reset();
            if (addModal) addModal.style.display = 'flex';
            renderCategorySelect();
        });
    }

    cancelAdd.addEventListener('click', () => {
        addModal.style.display = 'none';
        editingEcnId = null;
        document.querySelector('#addModal h2').textContent = 'Thêm ECN Mới';
        document.getElementById('saveEcn').textContent = 'Lưu';
    });

    saveEcn.addEventListener('click', async () => {
        const ecnId = document.getElementById('newEcnId').value;
        const itemCodesText = document.getElementById('newItemCode').value;
        const line = document.getElementById('newLine').value;
        const m4e = document.getElementById('new4m').value;
        const category = document.getElementById('newCat').value;
        const description = document.getElementById('newDesc').value;
        const driveLink = document.getElementById('newDrive').value;
        const imageLink = document.getElementById('newImage').value;

        // Tách các mã hàng bằng dấu phẩy hoặc xuống dòng
        const itemCodes = itemCodesText.split(/[,\n]/).map(code => code.trim()).filter(code => code !== "");

        if (!ecnId || itemCodes.length === 0) {
            alert('Vui lòng nhập Tên ECN và ít nhất một Mã hàng!');
            return;
        }

        // Thêm trạng thái loading
        const originalBtnText = saveEcn.textContent;
        saveEcn.textContent = 'Đang đồng bộ...';
        saveEcn.disabled = true;

        try {
            if (editingEcnId) {
                // Update mode
                const [oldId, oldCode] = editingEcnId.split('|');
                const targetEcn = ecns.find(e => String(e.id) === String(oldId) && String(e.itemCode) === String(oldCode));

                if (targetEcn) {
                    targetEcn.id = ecnId;
                    targetEcn.itemCode = itemCodes[0];
                    targetEcn.line = line;
                    targetEcn.m4e = m4e;
                    targetEcn.category = category;
                    targetEcn.description = description;
                    targetEcn.driveLink = driveLink;
                    targetEcn.image = getDirectDriveLink(imageLink);
                    targetEcn.lastUpdate = new Date().toISOString().split('T')[0];

                    await syncData('updateECN', targetEcn);

                    // Refresh Detail view if it's open for this ECN
                    if (detailOverlay.style.display === 'flex') {
                        showDetail(targetEcn.id, targetEcn.itemCode);
                    }

                    // Notification - Edit
                    addNotification(
                        'edit',
                        `[${targetEcn.itemCode}] Đã chỉnh sửa`,
                        `ID: ${targetEcn.id} — Line: ${targetEcn.line}, Loại: ${targetEcn.category}`,
                        { ecnId: targetEcn.id, itemCode: targetEcn.itemCode }
                    );
                }
                editingEcnId = null;
            } else {
                // Create mode - Bulk Add
                const newEcns = [];
                itemCodes.forEach(code => {
                    const newEcn = {
                        id: ecnId,
                        itemCode: code,
                        line: line,
                        m4e: m4e,
                        category: category,
                        description: description,
                        lotNumbers: ["", "", ""],
                        deliveries: [false, false, false],
                        firstDeliveryDate: new Date().toISOString().split('T')[0],
                        driveLink: driveLink,
                        image: getDirectDriveLink(imageLink) || "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=400",
                        lastUpdate: new Date().toISOString().split('T')[0]
                    };
                    newEcns.push(newEcn);
                    ecns.unshift(newEcn);
                });

                // Gửi tất cả trong 1 request duy nhất
                await syncData('addECNs', newEcns);

                // Notification - Add New
                if (newEcns.length === 1) {
                    addNotification(
                        'add',
                        `[${newEcns[0].itemCode}] Thêm mới ECN`,
                        `ID: ${ecnId} — Line: ${line}, Loại: ${category}`,
                        { ecnId, itemCode: newEcns[0].itemCode }
                    );
                } else {
                    addNotification(
                        'add',
                        `Thêm ${newEcns.length} mã hàng mới`,
                        `ID: ${ecnId} — Line: ${line} (${newEcns.map(e => e.itemCode).join(', ')})`,
                        { ecnId, itemCode: newEcns[0].itemCode }
                    );
                }
            }

            renderECNs();
            addModal.style.display = 'none';

            // Reset Modal UI
            document.querySelector('#addModal h2').textContent = 'Thêm ECN Mới';
            saveEcn.textContent = 'Lưu';

            // Reset fields
            ['newEcnId', 'newItemCode', 'newDesc', 'newDrive', 'newImage', 'new4m'].forEach(id => document.getElementById(id).value = '');
        } catch (error) {
            console.error('Lỗi khi lưu ECN:', error);
            alert('Có lỗi xảy ra khi lưu. Vui lòng thử lại.');
        } finally {
            saveEcn.disabled = false;
            saveEcn.textContent = originalBtnText;
        }
    });

    // Image Viewer Listeners
    const fullImage = document.getElementById('fullImage');
    const imageViewer = document.getElementById('imageViewer');
    const closeViewerBtn = document.getElementById('closeViewer');

    closeViewerBtn.addEventListener('click', closeImageViewer);
    imageViewer.addEventListener('click', (e) => {
        if (e.target === imageViewer || e.target.id === 'viewerContent') closeImageViewer();
    });

    // Mouse Wheel Zoom
    fullImage.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY;
        const zoomStep = 0.5; // Increased for clear feedback

        if (delta < 0) {
            // Zoom in (scroll up)
            zoomScale = Math.min(zoomScale + zoomStep, 10);
        } else {
            // Zoom out (scroll down)
            zoomScale = Math.max(zoomScale - zoomStep, 1);
        }

        isZoomed = zoomScale > 1;
        fullImage.style.cursor = isZoomed ? 'grab' : 'zoom-in';
        updateImageTransform();
    }, { passive: false });

    fullImage.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleZoom(e);
    });

    // Dragging & Pinch Zoom Logic
    const handleStart = (e) => {
        if (e.touches && e.touches.length === 2) {
            // Pinch start
            initialDist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            initialScale = zoomScale;
            return;
        }

        if (!isZoomed && (!e.touches || e.touches.length === 1)) return;

        const pos = e.type === 'mousedown' ? e : e.touches[0];
        startX = pos.clientX - translateX;
        startY = pos.clientY - translateY;
        fullImage.style.transition = 'none';
        fullImage.style.cursor = 'grabbing';

        const handleMove = (moveEvent) => {
            if (moveEvent.touches && moveEvent.touches.length === 2) {
                moveEvent.preventDefault();
                // Pinch move
                const dist = Math.hypot(
                    moveEvent.touches[0].pageX - moveEvent.touches[1].pageX,
                    moveEvent.touches[0].pageY - moveEvent.touches[1].pageY
                );
                zoomScale = Math.min(Math.max(initialScale * (dist / initialDist), 1), 5);
                isZoomed = zoomScale > 1;
                fullImage.style.cursor = isZoomed ? 'grab' : 'zoom-in';
                updateImageTransform();
                return;
            }

            if (!isZoomed) return;
            moveEvent.preventDefault();
            const movePos = moveEvent.type === 'mousemove' ? moveEvent : moveEvent.touches[0];
            translateX = movePos.clientX - startX;
            translateY = movePos.clientY - startY;
            updateImageTransform();
        };

        const handleEnd = () => {
            fullImage.style.transition = 'transform 0.3s ease';
            if (isZoomed) fullImage.style.cursor = 'grab';
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleEnd);
            document.removeEventListener('touchmove', handleMove);
            document.removeEventListener('touchend', handleEnd);
        };

        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', handleEnd);
    };

    fullImage.addEventListener('mousedown', handleStart);
    fullImage.addEventListener('touchstart', handleStart, { passive: false });
}

function addNewCategory() {
    catPromptOverlay.style.display = 'flex';
    newCatInput.focus();
}

function deleteCategory(catName) {
    console.log('Attempting to delete category:', catName);

    if (!catName) return;

    // Kiểm tra xem có ECN nào đang dùng danh mục này không
    const isUsed = ecns.some(e => e.category.trim().toLowerCase() === catName.trim().toLowerCase());

    if (isUsed) {
        window.alert(`Không thể xóa! Danh mục "${catName}" đang được sử dụng bởi một hoặc nhiều ECN.`);
        return;
    }

    // Hiển thị modal xác nhận thay vì window.confirm
    categoryToDelete = catName;
    deleteConfirmText.textContent = `Bạn có chắc chắn muốn xóa danh mục "${catName}" không? Hành động này không thể hoàn tác.`;
    deleteConfirmOverlay.style.display = 'flex';
}

// Run init
init();
