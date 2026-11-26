// Shared page header: title left, actions right, consistent vertical align.
//
// Props:
//   icon        emoji / string / element in the 44px badge
//   title       page title (h1)
//   subtitle    one-line description
//   meta        optional pill next to the subtitle
//   children    right-hand actions (buttons, HelpButton, …)
//   compact     slim title row (Dashboard) — no card / icon / subtitle

export default function PageHeader({ icon, title, subtitle, meta, children, compact = false }) {
  if (compact) {
    return (
      <div className="page-header page-header-compact">
        <div className="page-header-main">
          <h1 className="page-title">{title}</h1>
          {meta && <span className="page-header-meta-plain">{meta}</span>}
        </div>
        {children && <div className="page-header-actions">{children}</div>}
      </div>
    );
  }
  return (
    <div className="page-header">
      <div className="page-header-main">
        {icon !== undefined && (
          <div className="page-header-icon" aria-hidden="true">{icon}</div>
        )}
        <div className="page-header-text">
          <h1 className="page-title">{title}</h1>
          {(subtitle || meta) && (
            <p className="page-subtitle">
              {subtitle && <span>{subtitle}</span>}
              {meta && <span className="page-header-meta">{meta}</span>}
            </p>
          )}
        </div>
      </div>
      {children && <div className="page-header-actions">{children}</div>}
    </div>
  );
}
