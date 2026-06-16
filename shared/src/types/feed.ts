export interface SocialPost {
  id: string;
  authorName: string;
  authorHandle: string;
  authorAvatarUrl: string;
  content: string;
  postType: 'lore' | 'system' | 'leaderboard' | 'ad';
  createdAt: string;
}
