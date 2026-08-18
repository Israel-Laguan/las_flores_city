import ReviewQueue from './ReviewQueue';

// M29 — global needs_review triage queue page. The layout wraps this child in
// AdminShell (which mounts the ChatPanelProvider + ChatPanel), so "Copy to Chat"
// and "Merge" actions open the docked panel across any admin page.
export default function NeedsReviewPage() {
  return <ReviewQueue />;
}