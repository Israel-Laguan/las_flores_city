// PageHeader — intentionally breadcrumb-free.
// There is no `breadcrumb` prop on purpose: `AdminShell` renders the global
// `<Breadcrumbs />` above every page, so a per-page breadcrumb surface would
// compete with it. Keep this component minimal (title + optional description).
export interface PageHeaderProps {
  title: string;
  description?: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}
