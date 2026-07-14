'use client';

import ContentListPage from '@/components/ContentListPage';

const columns = [
  { key: 'title', label: 'Title' },
  { key: 'missionTitle', label: 'Mission' },
  { key: 'characterCount', label: 'Characters' },
  { key: 'sceneCount', label: 'Scenes' },
  { key: 'dialogueCount', label: 'Dialogues' },
  { key: 'writtenBy', label: 'Author' },
];

export default function StoriesPage() {
  return (
    <ContentListPage
      title="Stories"
      heading="Story Browser"
      endpoint="/admin/stories"
      detailPath="/stories"
      columns={columns}
    />
  );
}
