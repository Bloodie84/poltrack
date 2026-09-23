import { SITE_NAME } from '@/lib/site';
import type { RequiredVar } from '@/lib/env';
import { AlertIcon } from './icons';

/**
 * What a fresh deployment shows before anyone has given it a database.
 *
 * Without this the first visit to a new instance hits the error boundary and
 * says "Something went wrong. This is usually temporary." — which is wrong on
 * both counts: nothing went wrong, and it will stay this way until somebody
 * sets four values. Naming them, and where they come from, turns a dead end
 * into an instruction.
 */
export default function NotConfigured({
  missing,
}: {
  missing: { name: RequiredVar; where: string }[];
}) {
  return (
    <div className="gate fade-in" style={{ maxWidth: 560, textAlign: 'left', alignItems: 'stretch' }}>
      <span className="gate__mark" style={{ alignSelf: 'center' }}><AlertIcon size={22} /></span>
      <h1 className="gate__title" style={{ textAlign: 'center' }}>
        {SITE_NAME} is not connected yet
      </h1>
      <p className="gate__hint" style={{ textAlign: 'center' }}>
        The application is deployed. It has no database to talk to.
      </p>

      <div className="stack stack--8" style={{ marginTop: 14 }}>
        {missing.map((v) => (
          <div key={v.name} className="replace" style={{ padding: 12, gap: 4 }}>
            <code style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--signal)' }}>
              {v.name}
            </code>
            <span className="hint">{v.where}</span>
          </div>
        ))}
      </div>

      <p className="hint" style={{ marginTop: 14 }}>
        Set these where this instance runs, then redeploy. The full walkthrough is
        in <code>DEPLOY.md</code>.
      </p>
    </div>
  );
}
