export interface LinkOp {
  contentPath: string;
  fieldPath: string;
  action: 'add' | 'remove' | 'set';
  value: string;
}

export interface SectionConfig {
  field: string;
  label: string;
  availableEndpoint: string;
  idField: string;
  nameField: string;
  yamlDir: string;
  fileType: string;
  scalar?: boolean;
  arrayItemPath?: string;
}

export interface ListItem {
  id: string;
  name?: string;
  title?: string;
  [key: string]: unknown;
}