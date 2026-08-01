import { API } from './api.js';

export async function renderProfile(userId = '10001') {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div style="padding:16px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:16px;">
      <a href="#/" style="color:var(--text-primary); font-size:20px; text-decoration:none;">←</a>
      <div>
        <h2 style="font-size:20px; font-weight:800;" id="profile-title-name">Profile</h2>
        <span style="color:var(--text-secondary); font-size:13px;" id="profile-title-posts">0 posts</span>
      </div>
    </div>
    <div id="profile-banner" style="height:150px; background:linear-gradient(135deg, #1d9bf0 0%, #00ba7c 100%);"></div>
    <div style="padding:16px; position:relative;" id="profile-header-details">
      <div class="skeleton" style="height:120px;"></div>
    </div>
    <div class="tabs">
      <div class="tab active">Posts</div>
      <div class="tab">Replies</div>
      <div class="tab">Highlights</div>
      <div class="tab">Likes</div>
    </div>
    <div id="profile-tweets"></div>
  `;

  try {
    const user = await API.users.profile(userId);
    const details = document.getElementById('profile-header-details');
    if (!details) return;

    document.getElementById('profile-title-name').textContent = user.name;
    document.getElementById('profile-title-posts').textContent = `${user.public_metrics?.tweet_count || 0} posts`;

    details.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:-60px; margin-bottom:16px;">
        <img class="avatar" src="${user.profile_image_url || 'https://i.pravatar.cc/150?u=user'}" style="width:100px; height:100px; border:4px solid var(--bg-primary);" alt="${user.name}">
        <button style="background:var(--accent); color:#fff; border:none; padding:8px 20px; border-radius:9999px; font-weight:700; cursor:pointer;">
          ${user.is_following ? 'Following' : 'Edit profile'}
        </button>
      </div>
      <h3 style="font-size:22px; font-weight:800;">${user.name} ${user.verified ? '<span class="verified-badge">☑</span>' : ''}</h3>
      <div style="color:var(--text-secondary); font-size:15px;">@${user.username}</div>
      <p style="margin-top:12px; font-size:15px;">${user.description || 'No bio available'}</p>
      <div style="display:flex; gap:20px; margin-top:16px; font-size:14px; color:var(--text-secondary);">
        <div><strong style="color:var(--text-primary);">${user.public_metrics?.following_count || 0}</strong> Following</div>
        <div><strong style="color:var(--text-primary);">${user.public_metrics?.followers_count || 0}</strong> Followers</div>
      </div>
    `;
  } catch (err) {
    console.error('Failed to load profile:', err);
  }
}
