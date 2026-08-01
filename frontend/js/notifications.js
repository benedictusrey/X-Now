import { API } from './api.js';

export async function renderNotifications() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div style="padding:16px; border-bottom:1px solid var(--border);">
      <h2 style="font-size:20px; font-weight:800;">Notifications</h2>
    </div>
    <div class="tabs">
      <div class="tab active">All</div>
      <div class="tab">Verified</div>
      <div class="tab">Mentions</div>
    </div>
    <div id="notifications-list">
      <div class="skeleton" style="height:80px; margin:16px;"></div>
      <div class="skeleton" style="height:80px; margin:16px;"></div>
    </div>
  `;

  try {
    const res = await API.notifications.mentions();
    const list = document.getElementById('notifications-list');
    if (!list) return;
    list.innerHTML = '';

    const notifications = res.data || [];
    notifications.forEach(item => {
      const icon = item.type === 'like' ? '🤍' : item.type === 'retweet' ? '🔁' : '💬';
      const time = item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

      list.insertAdjacentHTML('beforeend', `
        <div style="padding:16px; border-bottom:1px solid var(--border); display:grid; grid-template-columns:40px 1fr; gap:12px; align-items:start;">
          <div style="font-size:22px; text-align:right;">${icon}</div>
          <div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <img class="avatar" src="${item.author?.profile_image_url || ''}" style="width:32px; height:32px;" alt="Avatar">
              <span style="font-weight:700;">${item.author?.name || ''}</span>
              <span style="color:var(--text-secondary); font-size:13px;">@${item.author?.username || ''} · ${time}</span>
            </div>
            <p style="color:var(--text-secondary); font-size:14px;">${item.tweet?.text || ''}</p>
          </div>
        </div>
      `);
    });
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
}
