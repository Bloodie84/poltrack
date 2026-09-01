import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container container--narrow" style={{ paddingTop: '10vh', textAlign: 'center' }}>
      <h1 style={{ fontSize: 26, marginBottom: 10 }}>Nothing here</h1>
      <p className="hint" style={{ marginBottom: 22 }}>
        This link is wrong, the track was removed, or it is private.
      </p>
      <Link href="/" className="btn btn--primary">Back home</Link>
    </div>
  );
}
