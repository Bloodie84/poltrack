export default function LibraryLoading() {
  return (
    <div className="container">
      <div className="row row--between" style={{ marginBottom: 20 }}>
        <div className="stack stack--8">
          <div className="skeleton" style={{ width: 170, height: 30 }} />
          <div className="skeleton" style={{ width: 220, height: 14 }} />
        </div>
        <div className="skeleton" style={{ width: 104, height: 36, borderRadius: 9 }} />
      </div>
      <div className="panel">
        {[0, 1, 2].map((i) => (
          <div key={i} className="row" style={{ gap: 13, padding: 14, borderBottom: '1px solid var(--line)' }}>
            <div className="skeleton" style={{ width: 46, height: 46, borderRadius: 9 }} />
            <div className="stack stack--8" style={{ flex: 1 }}>
              <div className="skeleton" style={{ width: '38%', height: 14 }} />
              <div className="skeleton" style={{ width: '62%', height: 12 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
