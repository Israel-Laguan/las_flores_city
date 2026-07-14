import { adminStyles as styles } from '@/lib/adminStyles';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

export default function SearchBar({ searchQuery, onSearchChange }: SearchBarProps) {
  return (
    <div style={{ padding: '0.75rem', borderBottom: '1px solid #333' }}>
      <input
        type="text"
        placeholder="Search lore files..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        style={styles.input}
      />
    </div>
  );
}