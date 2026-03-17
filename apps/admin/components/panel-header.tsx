interface PanelHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
}

export function PanelHeader({
  description,
  eyebrow,
  title
}: PanelHeaderProps) {
  return (
    <header className="panel-header">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1 className="panel-title" style={{ marginTop: eyebrow ? 12 : 0 }}>
          {title}
        </h1>
        <p className="muted" style={{ marginBottom: 0 }}>
          {description}
        </p>
      </div>
    </header>
  );
}
