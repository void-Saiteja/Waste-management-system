// ══════════════════════════════════════════════════════
//  EcoTrack — Frontend Logic
// ══════════════════════════════════════════════════════

let userRole = null;
let userId = null;
let authMode = 'login';
let charts = {};
let refreshInt = null;

// ── Init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    toggleAuth('login');
});

// ── Session ───────────────────────────────────────────
async function checkSession() {
    try {
        const res = await fetch('/api/session');
        const data = await res.json();
        data.loggedIn ? setupDashboard(data.user) : showLogin();
    } catch (e) { showLogin(); }
}

function showLogin() {
    document.getElementById('login-section').style.display = 'flex';
    document.getElementById('dashboard-section').style.display = 'none';
    document.getElementById('user-nav').style.display = 'none';
    if (refreshInt) { clearInterval(refreshInt); refreshInt = null; }
}

function setupDashboard(user) {
    userRole = user.role;
    userId = user.id || null;

    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'block';
    document.getElementById('user-nav').style.display = 'flex';
    document.getElementById('display-username').innerText = `${user.username} (${user.role})`;

    // Role visibility
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = user.role === 'admin' ? '' : 'none');
    document.querySelectorAll('.staff-only').forEach(el => el.style.display = user.role === 'staff' ? '' : 'none');

    if (user.role === 'staff') {
        showPage('mytarget');
    } else {
        showPage('overview');
        initCharts();
    }

    loadBins();
    refreshAll();
    if (refreshInt) clearInterval(refreshInt);
    refreshInt = setInterval(refreshAll, 10000);
}

// ── Page Navigation ───────────────────────────────────
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.page-tab').forEach(t => t.classList.remove('active'));
    const pageEl = document.getElementById(`page-${page}`);
    const tabEl = document.getElementById(`tab-${page}`);
    if (pageEl) pageEl.classList.add('active');
    if (tabEl) tabEl.classList.add('active');

    // Lazy-load data per tab
    if (page === 'overview') { refreshDashStats(); refreshCharts(); }
    if (page === 'bins') { loadBins(); }
    if (page === 'logs') { refreshLogs(); }
    if (page === 'alerts') { refreshAlerts(); }
    if (page === 'admin') { refreshAdminData(); }
    if (page === 'mytarget') { refreshMyTarget(); refreshMyLogs(); loadStaffBins(); }
    if (page === 'map') {
        initMap();
        // Leaflet needs to recalculate size when container becomes visible
        setTimeout(() => { if (mapInstance) mapInstance.invalidateSize(); }, 150);
        refreshMap();
    }
}

// ── Auth ─────────────────────────────────────────────
function toggleAuth(mode) {
    authMode = mode;
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const roleGroup = document.getElementById('role-group');
    const title = document.getElementById('auth-title');
    const btn = document.getElementById('auth-btn');

    tabLogin.classList.toggle('active', mode === 'login');
    tabRegister.classList.toggle('active', mode === 'register');
    roleGroup.style.display = mode === 'register' ? 'block' : 'none';
    title.innerText = mode === 'login' ? 'Welcome Back' : 'Create Account';
    btn.innerText = mode === 'login' ? 'Sign In' : 'Register';
}

async function handleAuth() {
    return authMode === 'login' ? login() : register();
}

async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    if (!username || !password) return toast('Please fill all fields', 'warning');

    const btn = document.getElementById('auth-btn');
    btn.disabled = true; btn.innerText = 'Signing in…';

    try {
        const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
        const data = await res.json();
        if (data.success) {
            setupDashboard({ username: data.username, role: data.role });
        } else {
            toast('Login failed: ' + data.error, 'error');
        }
    } catch (e) { toast('Server error. Try again.', 'error'); }
    finally { btn.disabled = false; btn.innerText = 'Sign In'; }
}

async function register() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const role = document.getElementById('reg-role').value;
    if (!username || !password) return toast('Please fill all fields', 'warning');
    if (password.length < 4) return toast('Password too short', 'warning');

    const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, role }) });
    const data = await res.json();
    if (data.success) {
        toast('Registration successful! Please login.', 'success');
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        toggleAuth('login');
    } else {
        toast('Registration failed: ' + data.error, 'error');
    }
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    if (refreshInt) clearInterval(refreshInt);
    // Reset map so it re-initialises on next login
    if (mapInstance) { mapInstance.remove(); mapInstance = null; mapMarkers = {}; }
    location.reload();
}

// ── Bins ─────────────────────────────────────────────
async function loadBins() {
    try {
        const bins = await fetchJSON('/api/bins');
        renderBinsGrid(bins);
        updateBinSelects(bins);
    } catch (e) { }
}

function renderBinsGrid(bins) {
    const grid = document.getElementById('bins-grid');
    if (!grid) return;
    if (!bins.length) { grid.innerHTML = '<p class="text-dim" style="padding:2rem;">No bins found.</p>'; return; }

    grid.innerHTML = bins.map(bin => {
        const pct = Math.min((bin.current_fill / bin.capacity) * 100, 100);
        const pDisplay = pct.toFixed(0);
        const colorClass = pct >= 95 ? 'fill-red' : pct >= 80 ? 'fill-red' : pct >= 50 ? 'fill-yellow' : 'fill-green';
        const statusEmojis = { Good: '🟢', Medium: '🟡', Full: '🔴', Critical: '🔴' };
        return `
        <div class="bin-card ${bin.status === 'Critical' ? 'critical' : bin.status === 'Full' ? 'full' : ''}">
            <div class="bin-head">
                <div>
                    <div class="bin-name">${bin.name}</div>
                    <div class="bin-loc">📍 ${bin.location}</div>
                </div>
                <span class="bin-status ${bin.status}">${statusEmojis[bin.status] || '🟢'} ${bin.status}</span>
            </div>
            <div class="bin-fill-row">
                <span>${parseFloat(bin.current_fill).toFixed(1)} / ${bin.capacity} kg</span>
                <span class="bin-pct">${pDisplay}%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill ${colorClass}" style="width:${pDisplay}%"></div>
            </div>
            <div class="bin-actions">
                <button class="btn btn-sm btn-success" onclick="markCleaned(${bin.id})">✅ Mark Cleaned</button>
                ${userRole === 'admin' ? `<button class="btn btn-sm btn-danger" onclick="deleteBin(${bin.id})">🗑 Delete</button>` : ''}
            </div>
        </div>`;
    }).join('');
}

function updateBinSelects(bins) {
    const opts = bins.map(b => `<option value="${b.id}">${b.name} — ${b.location}</option>`).join('');
    ['bin-select', 'staff-bin-select'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = opts;
    });
}

async function addBin() {
    const name = document.getElementById('new-bin-name').value.trim();
    const location = document.getElementById('new-bin-location').value.trim();
    const capacity = document.getElementById('new-bin-capacity').value;
    if (!name || !location || !capacity) return toast('Please fill all bin fields', 'warning');
    const data = await postJSON('/api/bins', { name, location, capacity });
    if (data.success) {
        toast(`Bin "${name}" added! 🗑️`, 'success');
        ['new-bin-name', 'new-bin-location', 'new-bin-capacity'].forEach(id => document.getElementById(id).value = '');
        loadBins(); refreshDashStats();
    } else { toast('Error: ' + data.error, 'error'); }
}

async function deleteBin(id) {
    if (!confirm('Delete this bin?')) return;
    const data = await fetchJSON(`/api/bins/${id}`, 'DELETE');
    if (data.success) { toast('Bin deleted', 'success'); loadBins(); refreshDashStats(); }
}

async function markCleaned(id) {
    const data = await postJSON(`/api/bins/${id}/clean`, {});
    if (data.success) { toast('Bin marked as cleaned ✅', 'success'); loadBins(); refreshAlerts(); }
}

// ── Waste Submission ──────────────────────────────────
async function submitWaste() {
    const bin_id = document.getElementById('bin-select').value;
    const waste_type = document.getElementById('waste-type').value;
    const quantity = document.getElementById('quantity').value;
    if (!bin_id) return toast('Select a bin', 'warning');
    if (!quantity || parseFloat(quantity) <= 0) return toast('Enter a valid quantity', 'warning');

    const res = await fetch('/api/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bin_id, waste_type, quantity }) });
    if (res.ok) {
        document.getElementById('quantity').value = '';
        toast('Waste entry logged 📦', 'success');
        loadBins(); refreshLogs(); refreshDashStats(); refreshCharts();
    } else { toast('Error submitting log', 'error'); }
}

async function submitStaffWaste() {
    const bin_id = document.getElementById('staff-bin-select').value;
    const waste_type = document.getElementById('staff-waste-type').value;
    const quantity = document.getElementById('staff-quantity').value;
    if (!bin_id) return toast('Select a bin', 'warning');
    if (!quantity || parseFloat(quantity) <= 0) return toast('Enter a valid quantity', 'warning');

    const res = await fetch('/api/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bin_id, waste_type, quantity }) });
    if (res.ok) {
        document.getElementById('staff-quantity').value = '';
        toast('Entry submitted 📦', 'success');
        refreshMyTarget(); refreshMyLogs();
    } else { toast('Error submitting entry', 'error'); }
}

function loadStaffBins() {
    fetch('/api/bins').then(r => r.json()).then(bins => updateBinSelects(bins));
}

// ── Dashboard Stats ───────────────────────────────────
async function refreshDashStats() {
    try {
        const s = await fetchJSON('/api/dashboard/stats');
        document.getElementById('val-bins').innerText = s.totalBins ?? '—';
        document.getElementById('val-full').innerText = s.fullBins ?? '—';
        document.getElementById('val-waste').innerText = s.wasteToday ?? '—';
        document.getElementById('val-alerts').innerText = s.activeAlerts ?? '—';
        // Update alert badge
        const cnt = s.activeAlerts || 0;
        const badge = document.getElementById('alert-badge');
        badge.innerText = cnt;
        badge.style.display = cnt > 0 ? '' : 'none';
        const pill = document.getElementById('alert-count-pill');
        if (pill) pill.innerText = cnt + ' Active';
    } catch (e) { }
}

// ── Logs ──────────────────────────────────────────────
async function refreshLogs() {
    try {
        const logs = await fetchJSON('/api/logs');
        const tbody = document.querySelector('#logs-table tbody');
        if (!tbody) return;
        tbody.innerHTML = logs.map(l => `
            <tr>
                <td>${new Date(l.date).toLocaleString()}</td>
                <td><strong>${l.bin_name}</strong></td>
                <td><span class="type-badge">${l.waste_type}</span></td>
                <td>${parseFloat(l.quantity).toFixed(1)} kg</td>
                <td>${l.staff_name}</td>
            </tr>`).join('') || '<tr><td colspan="5" class="text-dim" style="text-align:center;padding:2rem;">No logs yet</td></tr>';
    } catch (e) { }
}

async function refreshMyLogs() {
    try {
        const logs = await fetchJSON('/api/logs');
        const tbody = document.querySelector('#my-logs-table tbody');
        if (!tbody) return;
        tbody.innerHTML = logs.map(l => `
            <tr>
                <td>${new Date(l.date).toLocaleTimeString()}</td>
                <td>${l.bin_name}</td>
                <td><span class="type-badge">${l.waste_type}</span></td>
                <td>${parseFloat(l.quantity).toFixed(1)} kg</td>
            </tr>`).join('') || '<tr><td colspan="4" class="text-dim" style="text-align:center;padding:1.5rem;">No logs yet</td></tr>';
    } catch (e) { }
}

// ── Alerts ────────────────────────────────────────────
async function refreshAlerts() {
    try {
        const alerts = await fetchJSON('/api/alerts');
        const list = document.getElementById('alerts-list');
        if (!list) return;
        const cnt = alerts.length;
        const pill = document.getElementById('alert-count-pill');
        if (pill) pill.innerText = cnt + ' Active';
        const badge = document.getElementById('alert-badge');
        if (badge) { badge.innerText = cnt; badge.style.display = cnt > 0 ? '' : 'none'; }

        list.innerHTML = alerts.map(a => `
            <div class="alert-item ${a.message.includes('Critical') || a.message.includes('95') ? 'Critical' : 'Full'}">
                <div>
                    <div class="alert-msg">🚨 ${a.message}</div>
                    <div class="alert-time">🗑️ ${a.bin_name} &bull; ${new Date(a.timestamp).toLocaleString()}</div>
                </div>
                ${userRole === 'admin' ? `<button class="btn btn-sm btn-outline" onclick="resolveAlert(${a.id})">Resolve</button>` : ''}
            </div>`).join('') || '<p class="text-dim text-sm" style="text-align:center;padding:2rem;">✅ No active alerts!</p>';
    } catch (e) { }
}

async function resolveAlert(id) {
    const data = await postJSON(`/api/alerts/${id}/resolve`, {});
    if (data.success) { toast('Alert resolved ✅', 'success'); refreshAlerts(); refreshDashStats(); }
}

// ── Charts ────────────────────────────────────────────
function initCharts() {
    const defaults = {
        plugins: { legend: { labels: { color: '#94a3b8', font: { family: 'Outfit' } } } }
    };
    const gridColor = 'rgba(255,255,255,0.05)';
    const axisColor = '#64748b';

    // Trend
    const ct = document.getElementById('trendChart');
    if (ct && !charts.trend) {
        charts.trend = new Chart(ct.getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Waste (kg)', data: [], borderColor: '#00f2fe', backgroundColor: 'rgba(0,242,254,.07)', tension: .4, fill: true, pointBackgroundColor: '#00f2fe', pointRadius: 4 }] },
            options: { ...defaults, responsive: true, scales: { y: { grid: { color: gridColor }, ticks: { color: axisColor } }, x: { grid: { color: gridColor }, ticks: { color: axisColor } } } }
        });
    }

    // Category
    const cc = document.getElementById('categoryChart');
    if (cc && !charts.category) {
        charts.category = new Chart(cc.getContext('2d'), {
            type: 'doughnut',
            data: { labels: [], datasets: [{ data: [], backgroundColor: ['#00f2fe', '#f093fb', '#10b981', '#f59e0b', '#6366f1'], borderWidth: 2, borderColor: '#070d1a' }] },
            options: { ...defaults, responsive: true, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 12 } } } }
        });
    }

    // Bin Fill Bar
    const cb = document.getElementById('binFillChart');
    if (cb && !charts.binFill) {
        charts.binFill = new Chart(cb.getContext('2d'), {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Fill %', data: [], backgroundColor: [], borderRadius: 6, borderSkipped: false }] },
            options: { ...defaults, responsive: true, scales: { y: { max: 100, grid: { color: gridColor }, ticks: { color: axisColor, callback: v => v + '%' } }, x: { grid: { display: false }, ticks: { color: axisColor } } } }
        });
    }
}

async function refreshCharts() {
    try {
        const [catData, trendData] = await Promise.all([
            fetchJSON('/api/analytics/categories'),
            fetchJSON('/api/analytics/trends')
        ]);
        const bins = await fetchJSON('/api/bins');
        const fillData = bins.map(b => ({ name: b.name, pct: Math.min((b.current_fill / b.capacity) * 100, 100) }));

        if (charts.category) {
            charts.category.data.labels = catData.map(d => d.waste_type);
            charts.category.data.datasets[0].data = catData.map(d => d.total);
            charts.category.update('none');
        }
        if (charts.trend) {
            charts.trend.data.labels = trendData.map(d => d.day);
            charts.trend.data.datasets[0].data = trendData.map(d => d.total);
            charts.trend.update('none');
        }
        if (charts.binFill) {
            const colors = fillData.map(d => d.pct >= 95 ? '#ef4444' : d.pct >= 80 ? '#f59e0b' : '#10b981');
            charts.binFill.data.labels = fillData.map(d => d.name);
            charts.binFill.data.datasets[0].data = fillData.map(d => d.pct.toFixed(1));
            charts.binFill.data.datasets[0].backgroundColor = colors;
            charts.binFill.update('none');
        }
    } catch (e) { }
}

// ── Admin ─────────────────────────────────────────────
async function refreshAdminData() {
    try {
        // Staff Stats
        const staff = await fetchJSON('/api/admin/staff-stats');
        const sTbody = document.querySelector('#staff-stats-table tbody');
        if (sTbody) {
            sTbody.innerHTML = staff.map(s => {
                const pct = s.target_qty > 0 ? Math.min((s.total_qty / s.target_qty) * 100, 100).toFixed(0) : 0;
                const achieved = s.target_qty > 0 && parseFloat(s.total_qty) >= s.target_qty;
                const color = pct >= 100 ? 'fill-green' : pct >= 50 ? 'fill-yellow' : 'fill-red';
                return `
                <tr>
                    <td><strong>${s.username}</strong></td>
                    <td>${s.log_count}</td>
                    <td>${parseFloat(s.total_qty).toFixed(1)} kg</td>
                    <td>${s.target_qty ? s.target_qty + ' kg' : '<span class="text-dim">Not set</span>'}</td>
                    <td>
                        <div style="min-width:120px;">
                            <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:.3rem;">
                                <span class="text-dim">${pct}%</span>
                                <span style="color:${achieved ? 'var(--success)' : 'var(--muted)'};">${achieved ? '🎉 Achieved' : '⏳ Pending'}</span>
                            </div>
                            <div class="progress-bar"><div class="progress-fill ${color}" style="width:${pct}%"></div></div>
                        </div>
                    </td>
                    <td>
                        <div style="display:flex;gap:.4rem;align-items:center;">
                            <input type="number" id="target-${s.id}" placeholder="kg" style="width:65px;padding:.3rem .5rem;font-size:.82rem;" value="${s.target_qty || ''}">
                            <button class="btn btn-sm btn-primary" onclick="setTarget(${s.id})">Set</button>
                        </div>
                    </td>
                </tr>`;
            }).join('') || '<tr><td colspan="6" class="text-dim" style="text-align:center;padding:2rem;">No staff yet</td></tr>';
        }

        // All Users
        const users = await fetchJSON('/api/admin/users');
        const uTbody = document.querySelector('#users-table tbody');
        if (uTbody) {
            uTbody.innerHTML = users.map(u => `
                <tr>
                    <td><strong>${u.username}</strong></td>
                    <td><span class="bin-status ${u.role === 'admin' ? 'Good' : 'Medium'}">${u.role}</span></td>
                    <td>${u.role !== 'admin' ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">Remove</button>` : '—'}</td>
                </tr>`).join('');
        }
    } catch (e) { console.error('refreshAdminData:', e); }
}

async function createStaff() {
    const username = document.getElementById('new-staff-user').value.trim();
    const password = document.getElementById('new-staff-pass').value;
    if (!username || !password) return toast('Username and password required', 'warning');
    const data = await postJSON('/api/admin/create-staff', { username, password });
    if (data.success) {
        toast(`Staff "${username}" hired! 👷`, 'success');
        document.getElementById('new-staff-user').value = '';
        document.getElementById('new-staff-pass').value = '';
        refreshAdminData();
    } else { toast('Error: ' + data.error, 'error'); }
}

async function setTarget(userId) {
    const el = document.getElementById(`target-${userId}`);
    const qty = parseFloat(el.value);
    if (!qty || qty <= 0) return toast('Enter a valid target', 'warning');
    const data = await postJSON('/api/admin/targets', { user_id: userId, target_qty: qty });
    if (data.success) { toast('Target set! 🎯', 'success'); refreshAdminData(); }
    else { toast('Error: ' + data.error, 'error'); }
}

async function deleteUser(id) {
    if (!confirm('Remove this user?')) return;
    const data = await fetchJSON(`/api/admin/users/${id}`, 'DELETE');
    if (data.success) { toast('User removed', 'success'); refreshAdminData(); }
}

// ── Staff Target ──────────────────────────────────────
async function refreshMyTarget() {
    try {
        const data = await fetchJSON('/api/staff/my-target');
        const progress = document.getElementById('target-fill');
        const text = document.getElementById('target-progress-text');
        const pctTxt = document.getElementById('target-percent');
        const badge = document.getElementById('bonus-badge');

        if (data.target_qty > 0) {
            const pct = Math.min((parseFloat(data.current_qty) / data.target_qty) * 100, 100).toFixed(0);
            progress.style.width = pct + '%';
            text.innerText = `${parseFloat(data.current_qty).toFixed(1)} kg of ${data.target_qty} kg collected`;
            pctTxt.innerText = pct + '%';
            badge.style.display = parseFloat(data.current_qty) >= data.target_qty ? '' : 'none';
            progress.className = 'progress-fill ' + (pct >= 100 ? 'fill-green' : pct >= 50 ? 'fill-yellow' : 'fill-red');
        } else {
            text.innerText = 'No target set for today. Contact your admin.';
            pctTxt.innerText = '—';
            progress.style.width = '0%';
            badge.style.display = 'none';
        }
    } catch (e) { }
}

// ── Simulation ────────────────────────────────────────
async function simulateDay() {
    const btn = document.getElementById('sim-btn');
    const status = document.getElementById('sim-status');
    btn.disabled = true; btn.innerText = '⏳ Simulating…';
    if (status) status.innerText = 'Running…';

    // Client-side simulation: log waste to all bins
    try {
        const bins = await fetchJSON('/api/bins');
        const types = ['Bio-degradable', 'Plastic', 'Paper', 'Metal'];
        await Promise.all(bins.map(bin => {
            const qty = (Math.random() * 0.35 * (bin.capacity - bin.current_fill) + 2).toFixed(1);
            const type = types[Math.floor(Math.random() * types.length)];
            return fetch('/api/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bin_id: bin.id, waste_type: type, quantity: qty }) });
        }));
        toast(`✅ Day simulated for ${bins.length} bins`, 'success');
        if (status) status.innerText = `Simulated ${bins.length} bins at ${new Date().toLocaleTimeString()}`;
        loadBins(); refreshAll();
    } catch (e) { toast('Simulation error', 'error'); }
    finally { btn.disabled = false; btn.innerText = '🎲 Simulate One Day'; }
}

async function resetAllBins() {
    if (!confirm('Reset ALL bins to 0%? This also resolves all alerts.')) return;
    const data = await postJSON('/api/admin/reset-bins', {});
    if (data.success) { toast('All bins reset 🔄', 'success'); loadBins(); refreshAll(); }
}

// ── Export CSV ────────────────────────────────────────
async function exportCSV() {
    try {
        const logs = await fetchJSON('/api/logs');
        const rows = [['Date', 'Bin', 'Waste Type', 'Quantity (kg)', 'Staff'], ...logs.map(l => [
            new Date(l.date).toLocaleString(), l.bin_name, l.waste_type, l.quantity, l.staff_name
        ])];
        const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ecotrack-${new Date().toISOString().split('T')[0]}.csv`;
        a.click(); URL.revokeObjectURL(url);
        toast('Report exported 📥', 'success');
    } catch (e) { toast('Export failed', 'error'); }
}

// ── Global Refresh ────────────────────────────────────
async function refreshAll() {
    await Promise.allSettled([
        refreshDashStats(),
        refreshLogs(),
        refreshAlerts(),
        userRole === 'admin' ? refreshCharts() : refreshMyTarget()
    ]);
    loadBins();
}

// ── Helpers ───────────────────────────────────────────
async function fetchJSON(url, method = 'GET') {
    const res = await fetch(url, { method });
    return res.json();
}

async function postJSON(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.json();
}

// ── Toast Notifications ───────────────────────────────
function toast(msg, type = 'info') {
    const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#6366f1' };
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const wrap = document.getElementById('toast-wrap');

    const el = document.createElement('div');
    el.className = 'toast';
    el.style.borderLeft = `4px solid ${colors[type]}`;
    el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
    wrap.appendChild(el);

    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(30px)';
        el.style.transition = 'all .3s';
        setTimeout(() => el.remove(), 300);
    }, 3500);
}

// ══════════════════════════════════════════════════════
//  CAMPUS MAP  (Leaflet + OpenStreetMap)
//  Centre: Anurag University, Venkatapur, Ghatkesar, Hyderabad
//  Coordinates: 17.41931°N, 78.65654°E
// ══════════════════════════════════════════════════════

let mapInstance = null;
let mapMarkers = {};    // keyed by bin.id

// Real campus building positions spread across the ~100-acre campus
// Centre of Anurag University: 17.41931°N, 78.65654°E
const BIN_COORDS = [
    { hint: 'Main Gate', lat: 17.41870, lng: 78.65560 },  // Front entrance
    { hint: 'Cafeteria', lat: 17.41942, lng: 78.65680 },  // Central cafeteria
    { hint: 'Library Block', lat: 17.41985, lng: 78.65630 },  // Central library
    { hint: 'Sports Complex', lat: 17.41810, lng: 78.65700 },  // Sports ground
    { hint: 'Admin Block', lat: 17.41960, lng: 78.65590 },  // Administrative wing
    { hint: 'Engineering Block', lat: 17.41920, lng: 78.65720 },  // A/B/D Blocks
    { hint: 'Hostel Block', lat: 17.42035, lng: 78.65660 },  // Hostel area
    { hint: 'MBA Block', lat: 17.41900, lng: 78.65640 },  // Management school
];

function initMap() {
    if (mapInstance) return;   // already initialised

    // Correct centre: Anurag University, Ghatkesar, Hyderabad
    mapInstance = L.map('campus-map', {
        center: [17.41931, 78.65654],
        zoom: 17,
        zoomControl: true,
    });

    // Dark styled tile layer (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(mapInstance);

    // Campus boundary circle (~350m radius for ~100 acres)
    L.circle([17.41931, 78.65654], {
        radius: 350,
        color: '#00f2fe',
        fillColor: '#00f2fe',
        fillOpacity: 0.04,
        weight: 1.5,
        dashArray: '6 4'
    }).addTo(mapInstance);

    // University label at centre
    L.marker([17.41931, 78.65654], {
        icon: L.divIcon({
            className: '',
            html: `<div style="background:rgba(0,242,254,.12);border:1px solid rgba(0,242,254,.4);border-radius:8px;padding:4px 10px;font-family:Outfit,sans-serif;font-size:12px;font-weight:700;color:#00f2fe;white-space:nowrap;">🏛️ Anurag University</div>`,
            iconAnchor: [80, 30]
        })
    }).addTo(mapInstance);
}

function buildMarkerIcon(status, pct) {
    const color = status === 'Critical' ? '#ef4444'
        : status === 'Full' ? '#f59e0b'
            : status === 'Medium' ? '#f59e0b'
                : '#10b981';
    const ring = status === 'Critical' ? 'animation:markerPulse 1.2s ease infinite' : '';
    const html = `
        <div style="position:relative;width:36px;height:36px;">
            <div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:.18;${ring}"></div>
            <div style="position:absolute;inset:4px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;box-shadow:0 0 12px ${color}88;">${Math.round(pct)}%</div>
        </div>`;
    return L.divIcon({ html, className: '', iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -20] });
}

async function refreshMap() {
    if (!mapInstance) return;

    try {
        const bins = await fetchJSON('/api/bins');

        bins.forEach((bin, idx) => {
            const coords = BIN_COORDS[idx % BIN_COORDS.length];
            // Spread bins that land on same coord slightly
            const jitter = idx >= BIN_COORDS.length ? 0.0002 * (idx - BIN_COORDS.length + 1) : 0;
            const lat = coords.lat + jitter;
            const lng = coords.lng + jitter;

            const pct = Math.min((bin.current_fill / bin.capacity) * 100, 100);
            const color = bin.status === 'Critical' || bin.status === 'Full' ? '#ef4444'
                : bin.status === 'Medium' ? '#f59e0b' : '#10b981';

            const popupHtml = `
                <div style="min-width:200px;">
                    <div class="eco-popup-title">🗑️ ${bin.name}</div>
                    <div class="eco-popup-loc">📍 ${bin.location}</div>
                    <div class="eco-popup-row">
                        <span style="color:#64748b;">Status</span>
                        <span style="color:${color};font-weight:700;">${bin.status}</span>
                    </div>
                    <div class="eco-popup-row">
                        <span style="color:#64748b;">Fill</span>
                        <span style="font-weight:700;">${parseFloat(bin.current_fill).toFixed(1)} / ${bin.capacity} kg</span>
                    </div>
                    <div class="eco-popup-bar">
                        <div class="eco-popup-fill" style="width:${pct.toFixed(0)}%;background:${color};"></div>
                    </div>
                    <div style="text-align:right;font-size:.78rem;color:#64748b;margin-top:.35rem;">${pct.toFixed(0)}% full</div>
                </div>`;

            if (mapMarkers[bin.id]) {
                // Update existing marker
                mapMarkers[bin.id].setIcon(buildMarkerIcon(bin.status, pct));
                mapMarkers[bin.id].getPopup().setContent(popupHtml);
            } else {
                const marker = L.marker([lat, lng], { icon: buildMarkerIcon(bin.status, pct) })
                    .addTo(mapInstance)
                    .bindPopup(popupHtml, { maxWidth: 240 });
                mapMarkers[bin.id] = marker;
            }
        });

        // Fit map to markers if first load
        const latLngs = bins.map((b, i) => {
            const c = BIN_COORDS[i % BIN_COORDS.length];
            return [c.lat, c.lng];
        });
        if (latLngs.length) {
            mapInstance.fitBounds(L.latLngBounds(latLngs), { padding: [60, 60], maxZoom: 18 });
        }

        updateMapBinTable(bins);
    } catch (e) { console.error('refreshMap:', e); }
}

function updateMapBinTable(bins) {
    const tbody = document.querySelector('#map-bins-table tbody');
    if (!tbody) return;
    const statusColors = { Good: 'var(--success)', Medium: 'var(--warning)', Full: 'var(--danger)', Critical: 'var(--danger)' };
    tbody.innerHTML = bins.map(bin => {
        const pct = Math.min((bin.current_fill / bin.capacity) * 100, 100).toFixed(0);
        return `<tr>
            <td><strong>${bin.name}</strong></td>
            <td>📍 ${bin.location}</td>
            <td>${bin.capacity} kg</td>
            <td>
                <div style="display:flex;align-items:center;gap:.5rem;">
                    <div style="flex:1;background:rgba(255,255,255,.07);border-radius:4px;height:7px;overflow:hidden;">
                        <div style="width:${pct}%;height:100%;background:${statusColors[bin.status] || 'var(--primary)'};"></div>
                    </div>
                    <span style="font-size:.82rem;font-weight:700;min-width:38px;text-align:right;">${pct}%</span>
                </div>
            </td>
            <td><span class="bin-status ${bin.status}">${bin.status}</span></td>
        </tr>`;
    }).join('');
}
