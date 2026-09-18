(function () {
    function getDB() {
        return window.firebase && firebase.firestore ? firebase.firestore() : null;
    }

    async function loadAndRenderUsers() {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;
        const db = getDB();
        if (!db) {
            tbody.innerHTML = '<div style="padding:1rem;color:#ef4444;">Firebase not available.</div>';
            return;
        }
        tbody.innerHTML = '<div style="padding:1rem;color:#64748b;">Loading…</div>';
        try {
            const snap = await db.collection('users').where('role', '==', 'admin').get();
            if (snap.empty) {
                window.clearPager?.(tbody);
                tbody.innerHTML = '<div style="padding:1rem;color:#64748b;text-align:center;">No admin accounts found.</div>';
                return;
            }
            // Sort: pending first, then by name
            const docs = [];
            snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
            const statusOrder = { pending: 0, active: 1, declined: 2 };
            docs.sort((a, b) => {
                const ao = statusOrder[a.status] ?? 1;
                const bo = statusOrder[b.status] ?? 1;
                if (ao !== bo) return ao - bo;
                return (a.name || '').localeCompare(b.name || '');
            });
            tbody.innerHTML = '';
            // Shared pager from admin.js (this file is its own IIFE)
            const pageDocs = window.applyPagination
                ? window.applyPagination('users', docs, tbody, loadAndRenderUsers)
                : docs;
            pageDocs.forEach(d => {

                const isPending  = d.status === 'pending';
                const isDeclined = d.status === 'declined';
                const initial   = (d.name || '?')[0].toUpperCase();
                const row       = document.createElement('div');
                row.className   = 'table-row';
                row.style.gridTemplateColumns = '2fr 1fr 2fr 1fr 140px';
                const statusBg  = isPending ? '#fef9c3' : isDeclined ? '#fef2f2' : '#dcfce7';
                const statusClr = isPending ? '#92400e' : isDeclined ? '#dc2626' : '#166534';
                const statusLbl = isPending ? 'Pending' : isDeclined ? 'Declined' : 'Active';
                const actionBtns = isPending
                    ? `<button data-uid="${d.id}" class="approve-btn" style="padding:5px 12px;background:#1a2e6b;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:600;">Approve</button>
                       <button data-uid="${d.id}" class="decline-btn" style="padding:5px 12px;background:white;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:600;">Decline</button>`
                    : isDeclined
                    ? `<button data-uid="${d.id}" data-name="${(d.name||'').replace(/"/g,'&quot;')}" class="delete-user-btn" style="padding:5px 12px;background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:600;">Delete</button>`
                    : '<span style="color:#94a3b8;font-size:0.8rem;">—</span>';
                row.innerHTML = `
                    <!-- Mobile card (hidden on desktop, shown on mobile via CSS) -->
                    <div class="user-mob-card" style="align-items:flex-start;gap:0.65rem;padding:0.65rem 0.75rem;">
                        <div style="width:40px;height:40px;border-radius:50%;background:#1a2e6b;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.9rem;flex-shrink:0;">${initial}</div>
                        <div style="flex:1;min-width:0;">
                            <div style="display:flex;align-items:center;justify-content:space-between;gap:0.4rem;">
                                <span style="font-weight:600;font-size:0.9rem;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.name || '—'}</span>
                                <span style="padding:2px 9px;border-radius:9999px;font-size:0.68rem;font-weight:700;flex-shrink:0;background:${statusBg};color:${statusClr};">${statusLbl}</span>
                            </div>
                            <div style="font-size:0.75rem;color:#64748b;margin-top:0.15rem;">Admin</div>
                            <div style="font-size:0.75rem;color:#64748b;margin-top:0.1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.email || '—'}</div>
                            ${isPending || isDeclined ? `<div style="display:flex;gap:6px;margin-top:0.5rem;">${actionBtns}</div>` : ''}
                        </div>
                    </div>
                    <!-- Desktop columns (hidden on mobile via CSS) -->
                    <div class="user-col-name" style="display:flex;align-items:center;gap:0.6rem;">
                        <div style="width:32px;height:32px;border-radius:50%;background:#1a2e6b;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;flex-shrink:0;">${initial}</div>
                        <span style="font-weight:500;">${d.name || '—'}</span>
                    </div>
                    <div class="user-col-role">Admin</div>
                    <div class="user-col-email" style="color:#64748b;font-size:0.875rem;">${d.email || '—'}</div>
                    <div class="user-col-status">
                        <span style="padding:3px 10px;border-radius:9999px;font-size:0.72rem;font-weight:700;letter-spacing:0.03em;background:${statusBg};color:${statusClr};">${statusLbl}</span>
                    </div>
                    <div class="user-col-actions" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">${actionBtns}</div>
                `;
                tbody.appendChild(row);
            });

            // Wire approve buttons
            tbody.querySelectorAll('.approve-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm('Approve this admin account? They will be able to log in immediately.')) return;
                    btn.disabled = true;
                    btn.textContent = 'Approving…';
                    try {
                        await db.collection('users').doc(btn.dataset.uid).update({ status: 'active' });
                        loadAndRenderUsers();
                    } catch (err) {
                        alert('Failed to approve: ' + err.message);
                        btn.disabled = false;
                        btn.textContent = 'Approve';
                    }
                });
            });

            // Wire delete buttons
            tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const name = btn.dataset.name || 'this user';
                    if (!confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
                    btn.disabled = true;
                    btn.textContent = 'Deleting…';
                    try {
                        await db.collection('users').doc(btn.dataset.uid).delete();
                        loadAndRenderUsers();
                    } catch (err) {
                        alert('Failed to delete: ' + err.message);
                        btn.disabled = false;
                        btn.textContent = 'Delete';
                    }
                });
            });

            // Wire decline buttons
            tbody.querySelectorAll('.decline-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm('Decline this registration? The account will be blocked from logging in.')) return;
                    btn.disabled = true;
                    btn.textContent = 'Declining…';
                    try {
                        await db.collection('users').doc(btn.dataset.uid).update({ status: 'declined' });
                        loadAndRenderUsers();
                    } catch (err) {
                        alert('Failed to decline: ' + err.message);
                        btn.disabled = false;
                        btn.textContent = 'Decline';
                    }
                });
            });
        } catch (err) {
            tbody.innerHTML = `<div style="padding:1rem;color:#ef4444;">Error loading users: ${err.message}</div>`;
        }
    }

    window.loadAdminUsers = loadAndRenderUsers;
    window.renderUsers    = loadAndRenderUsers;  // called by admin.js section switch

    document.addEventListener('DOMContentLoaded', function () {
        // Reload whenever the Users nav link is clicked
        document.querySelector('[data-section="users"]')
            ?.addEventListener('click', loadAndRenderUsers);

        // If users section is already active on load, populate it
        const usersSection = document.getElementById('section-users');
        if (usersSection && usersSection.style.display !== 'none') {
            loadAndRenderUsers();
        }
    });
})();
