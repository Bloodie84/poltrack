export default function TrackLoading() {
  return (
    <div className="container">
      <div className="track">
        <div className="track__head">
          <div className="skeleton" style={{ aspectRatio: '1', borderRadius: 12 }} />
          <div className="stack stack--12">
            <div className="skeleton" style={{ width: 90, height: 22, borderRadius: 999 }} />
            <div className="skeleton" style={{ width: '70%', height: 38 }} />
            <div className="skeleton" style={{ width: '35%', height: 16 }} />
          </div>
        </div>
        <div className="panel" style={{ padding: 20 }}>
          <div className="row" style={{ gap: 18 }}>
            <div className="skeleton" style={{ width: 60, height: 60, borderRadius: '50%', flex: 'none' }} />
            <div className="skeleton" style={{ flex: 1, height: 84 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
