import { API } from './api.js';
import { renderCompose, renderTweetCard, bindCardInteractions } from './compose.js';

let isLoading = false;

export async function renderFeed() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="tabs">
      <div class="tab active" data-tab="for-you">For You</div>
      <div class="tab" data-tab="following">Following</div>
    </div>
    <div id="compose-area"></div>
    <div id="tweet-feed">
      <div class="skeleton" style="height:100px; margin:16px;"></div>
      <div class="skeleton" style="height:100px; margin:16px;"></div>
      <div class="skeleton" style="height:100px; margin:16px;"></div>
    </div>
  `;

  renderCompose();
  await loadTimeline();
  setupTabSwitching();
}

async function loadTimeline() {
  if (isLoading) return;
  isLoading = true;

  try {
    const result = await API.tweets.timeline({ maxResults: 20 });
    const feed = document.getElementById('tweet-feed');
    if (!feed) return;
    feed.innerHTML = '';

    const users = result.includes?.users || [];
    const tweets = result.data || [];

    tweets.forEach(tweet => {
      const author = users.find(u => u.id === tweet.author_id);
      feed.insertAdjacentHTML('beforeend', renderTweetCard({ ...tweet, author }));
    });

    bindCardInteractions();
  } catch (err) {
    console.error('Timeline load failed:', err);
  } finally {
    isLoading = false;
  }
}

function setupTabSwitching() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadTimeline();
    };
  });
}
