import { Fragment, useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { api, ROLE_META } from '../lib.jsx';
import { Card, PageHeader, Spinner, cx, useToast } from '../components/ui.jsx';

export default function Permissions() {
  const toast = useToast();
  const [data, setData] = useState(null);

  useEffect(() => {
    api('/admin/permissions').then(setData).catch((e) => toast(e.message, 'error'));
  }, [toast]);

  const toggle = async (role, permission) => {
    const enabled = !data.matrix[role].includes(permission);
    const prev = data;
    setData({ ...data, matrix: { ...data.matrix, [role]: enabled ? [...data.matrix[role], permission] : data.matrix[role].filter((p) => p !== permission) } });
    try {
      await api('/admin/permissions', { method: 'PUT', body: { role, permission, enabled } });
      toast(`${ROLE_META[role].label}: ${enabled ? 'allowed' : 'removed'}`);
    } catch (e) {
      setData(prev);
      toast(e.message, 'error');
    }
  };

  if (!data) return <div className="flex justify-center py-20 text-olive-600"><Spinner className="h-7 w-7" /></div>;

  const groups = [...new Set(data.permissions.map((p) => p.group))];

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Permissions"
        subtitle="Choose what each role can see and do. Changes apply immediately. Agents only ever see their own customers."
      />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/10">
              <th className="label-caps sticky left-0 bg-white px-5 py-4 text-left text-slate-400 dark:bg-[#0d1630]">Permission</th>
              {data.roles.map((r) => (
                <th key={r} className="px-3 py-4 text-center text-xs font-bold">{ROLE_META[r].label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr className="bg-slate-50/80 dark:bg-white/[0.02]">
                  <td colSpan={data.roles.length + 1} className="label-caps px-5 py-2 text-olive-700 dark:text-lime-brand">{g}</td>
                </tr>
                {data.permissions.filter((p) => p.group === g).map((p) => (
                  <tr key={p.key} className="border-b border-slate-100 last:border-0 dark:border-white/5">
                    <td className="sticky left-0 bg-white px-5 py-3 dark:bg-[#0d1630]">
                      <div className="font-medium">{p.label}</div>
                      <div className="font-mono text-[11px] text-slate-400">{p.key}</div>
                    </td>
                    {data.roles.map((r) => {
                      const on = data.matrix[r].includes(p.key);
                      const locked = data.locked[r]?.includes(p.key);
                      return (
                        <td key={r} className="px-3 py-3 text-center">
                          {locked ? (
                            <span title="Always on for admins" className="inline-flex h-6 w-11 items-center justify-center rounded-full bg-olive-600/70 text-white">
                              <Lock className="h-3 w-3" />
                            </span>
                          ) : (
                            <button
                              role="switch"
                              aria-checked={on}
                              aria-label={`${ROLE_META[r].label}: ${p.label}`}
                              onClick={() => toggle(r, p.key)}
                              className={cx('relative inline-flex h-6 w-11 items-center rounded-full transition', on ? 'bg-olive-600' : 'bg-slate-200 dark:bg-white/15')}
                            >
                              <span className={cx('inline-block h-5 w-5 rounded-full bg-white shadow transition', on ? 'translate-x-[22px]' : 'translate-x-0.5')} />
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
