import { SocialPost } from '../../../../shared/src/types/feed.js';

export class FeedApp {
  private container: HTMLElement;

  constructor(containerElement: HTMLElement) {
    this.container = containerElement;
    this.init();
  }

  private async init(): Promise<void> {
    this.container.innerHTML = `<div class="loading-spinner">Interacting with decentralized mesh network...</div>`;
    try {
      const response = await fetch('/api/network/feed', {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Uplink failed');
      const feed: SocialPost[] = await response.json();
      this.render(feed);
    } catch {
      this.container.innerHTML = `
        <div class="app-error">
          <p>Network Error: Local node packet loss detected.</p>
          <button onclick="globalEventBus.emit('phone:navigate', 'home')">Reconnect</button>
        </div>`;
    }
  }

  private render(feed: SocialPost[]): void {
    this.container.innerHTML = `
      <div class="feed-app">
        <div class="feed-header">
          <h2>THE WIRE // LAS FLORES</h2>
          <span class="secure-token">UNREGULATED SUBNET AD-HOC CONNECTION</span>
        </div>
        <div class="feed-scroll">
          ${feed.map(post => this.createPostCard(post)).join('')}
        </div>
      </div>`;

    feed.forEach(post => {
      const btn = document.getElementById(`like-btn-${post.id}`);
      if (btn) btn.addEventListener('click', () => this.handleLike(post.id, btn));
    });
  }

  private createPostCard(post: SocialPost): string {
    const relativeTime = this.formatRelativeTime(post.createdAt);
    const badge = post.postType === 'leaderboard' ? '[BREAKTHROUGH]'
                : post.postType === 'system' ? '[SYS_ALERT]' : '';

    return `
      <div class="feed-card ${post.postType}">
        <div class="card-header">
          <img class="avatar" src="${post.authorAvatarUrl}" alt="${post.authorName} avatar" />
          <div class="author-info">
            <span class="author-name">${post.authorName}${badge ? ` <span class="type-badge">${badge}</span>` : ''}</span>
            <span class="author-handle">@${post.authorHandle}</span>
          </div>
          <span class="post-time">${relativeTime}</span>
        </div>
        <div class="card-body"><p>${post.content}</p></div>
        <div class="card-footer">
          <button id="like-btn-${post.id}" class="like-button" ${post.postType === 'ad' ? 'disabled' : ''}>
            ❤️ <span class="like-label">Like</span>
          </button>
          <span class="action-id-tag">ID: ${post.id.substring(0, 8)}</span>
        </div>
      </div>`;
  }

  private formatRelativeTime(dateString: string): string {
    const diffMins = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private async handleLike(postId: string, btn: HTMLElement): Promise<void> {
    btn.classList.add('liked');
    btn.style.pointerEvents = 'none';
    try {
      await fetch('/api/network/feed/like', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ postId }),
      });
    } catch (err) {
      console.error('Non-blocking like sync failed:', err);
    }
  }
}
