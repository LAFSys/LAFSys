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
            docs.forEach(d => {
                const isPending  = d.status === 'pending';
                const isDeclined = d.status === 'declined';
                const initial   = (d.name || '?')[0].toUpperCase();
                const row       = document.createElement('div');
                row.className   = 'table-row';
                row.style.gridTemplateColumns = '2fr 1fr 2fr 1fr 140px';
                row.innerHTML = `
                    <div style="display:flex;align-items:center;gap:0.6rem;">
                        <div style="width:32px;height:32px;border-radius:50%;background:#1a2e6b;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;flex-shrink:0;">${initial}</div>
                        <span style="font-weight:500;">${d.name || '—'}</span>
                    </div>
                    <div>Admin</div>
                    <div style="color:#64748b;font-size:0.875rem;">${d.email || '—'}</div>
                    <div>
                        <span style="padding:3px 10px;border-radius:9999px;font-size:0.72rem;font-weight:700;letter-spacing:0.03em;
                            background:${isPending ? '#fef9c3' : isDeclined ? '#fef2f2' : '#dcfce7'};
                            color:${isPending ? '#92400e' : isDeclined ? '#dc2626' : '#166534'};">
                            ${isPending ? 'Pending' : isDeclined ? 'Declined' : 'Active'}
                        </span>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                        ${isPending
                            ? `<button data-uid="${d.id}" class="approve-btn" style="padding:5px 12px;background:#1a2e6b;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:600;">Approve</button>
                               <button data-uid="${d.id}" class="decline-btn" style="padding:5px 12px;background:white;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:600;">Decline</button>`
                            : isDeclined
                            ? `<button data-uid="${d.id}" data-name="${(d.name||'').replace(/"/g,'&quot;')}" class="delete-user-btn" style="padding:5px 12px;background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:600;">Delete</button>`
                            : '<span style="color:#94a3b8;font-size:0.8rem;">—</span>'
                        }
                    </div>

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
