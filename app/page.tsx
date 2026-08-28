'use client';
import {
  Users, UserPlus, Mail, Send, Eye, Reply, MessageSquare, Trophy, AlertTriangle, Ban, Activity,
} from 'lucide-react';
import Topbar from '@/components/Topbar';
import { MetricCard, MetricCardSkeleton, Skeleton, StatusBadge, EmptyState } from '@/components/ui';
import { Donut, LineChart } from '@/components/charts';
import { useStats } from '@/lib/hooks';

const STAGE_COLORS: Record<string, string> = {
  new: '#4f8cff', contacted: '#f0a637', replied: '#a974ff', qualified: '#29c273', won: '#e7b64b',
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function OverviewPage() {
  const { data, isLoading } = useStats();
  const m = data?.metrics;

  return (
    <>
      <Topbar title="Dashboard" subtitle="Overview of your email outreach performance"
        actions={<select className="input" style={{ width: 150 }}><option>Last 7 days</option><option>Last 30 days</option></select>} />
      <div className="page">
        {/* Metric cards */}
        <div className="metrics">
          {isLoading || !m ? Array.from({ length: 5 }).map((_, i) => <MetricCardSkeleton key={i} />) : (
            <>
              <MetricCard icon={<Users size={18} />} tone="purple" label="Total Leads" value={m.totalLeads.toLocaleString()} delta={null} />
              <MetricCard icon={<UserPlus size={18} />} tone="green" label="New Leads" value={m.newLeads.toLocaleString()} delta={{ dir: 'up', text: `${m.newThisWeek} this week` }} />
              <MetricCard icon={<Mail size={18} />} tone="blue" label="Emails Sent" value={m.emailsSent.toLocaleString()} delta={{ dir: 'up', text: `${m.sentThisWeek} this week` }} />
              <MetricCard icon={<Send size={18} />} tone="cyan" label="Delivered" value={m.delivered.toLocaleString()} delta={null} />
              <MetricCard icon={<Eye size={18} />} tone="amber" label="Opens" value={m.opens.toLocaleString()} delta={{ dir: 'flat', text: 'tracking soon' }} />
            </>
          )}
        </div>
        <div className="metrics mt16">
          {isLoading || !m ? Array.from({ length: 5 }).map((_, i) => <MetricCardSkeleton key={i} />) : (
            <>
              <MetricCard icon={<Reply size={18} />} tone="purple" label="Replies" value={m.replies.toLocaleString()} delta={null} />
              <MetricCard icon={<MessageSquare size={18} />} tone="green" label="Qualified" value={m.qualified.toLocaleString()} delta={null} />
              <MetricCard icon={<Trophy size={18} />} tone="amber" label="Won" value={m.won.toLocaleString()} delta={null} />
              <MetricCard icon={<AlertTriangle size={18} />} tone="red" label="Bounces / Failed" value={m.bounces.toLocaleString()} delta={null} />
              <MetricCard icon={<Ban size={18} />} tone="red" label="Unsubscribes" value={m.unsubscribes.toLocaleString()} delta={null} />
            </>
          )}
        </div>

        {/* Middle: performance + right rail */}
        <div className="grid mt16" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <div className="stack gap16">
            <div className="card">
              <div className="card-h"><h3>Performance Over Time</h3><span className="muted" style={{ fontSize: 12 }}>Last 7 days</span></div>
              <div style={{ padding: 16 }}>
                {isLoading || !data ? <Skeleton h={220} /> : (
                  <>
                    <LineChart series={[
                      { name: 'Sent', color: '#4f8cff', points: data.series.map((d) => d.sent) },
                      { name: 'Replies', color: '#a974ff', points: data.series.map((d) => d.replies) },
                    ]} />
                    <div className="row between mt8" style={{ padding: '0 6px' }}>
                      {data.series.map((d) => <small key={d.key} className="faint">{d.label}</small>)}
                    </div>
                    <div className="row gap16 mt12" style={{ paddingLeft: 6 }}>
                      <span className="row gap6" style={{ fontSize: 12 }}><span className="sw" style={{ width: 9, height: 9, borderRadius: 3, background: '#4f8cff', display: 'inline-block' }} /> Sent</span>
                      <span className="row gap6" style={{ fontSize: 12 }}><span className="sw" style={{ width: 9, height: 9, borderRadius: 3, background: '#a974ff', display: 'inline-block' }} /> Replies</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <TopCampaigns data={data} loading={isLoading} />
          </div>

          <div className="stack gap16">
            <LiveSending data={data} loading={isLoading} />

            <div className="card">
              <div className="card-h"><h3>Recent Activity</h3></div>
              <div style={{ padding: '8px 18px 14px' }}>
                {isLoading || !data ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="mt12"><Skeleton w="80%" /></div>) :
                  data.activity.length === 0 ? <EmptyState title="No activity yet" hint="Send a campaign to see events here." /> :
                  data.activity.map((a, i) => (
                    <div className="act-item" key={i}>
                      <span className="adot" style={{ background: a.type === 'done' ? 'var(--green)' : 'var(--accent)' }} />
                      <div><div>{a.text}</div><small className="faint">{timeAgo(a.at)}</small></div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="card">
              <div className="card-h"><h3>Leads by Stage</h3></div>
              <div style={{ padding: 18 }}>
                {isLoading || !data ? <Skeleton h={150} style={{ borderRadius: '50%', width: 150, margin: '0 auto' }} /> : (
                  <div className="donut-wrap">
                    <Donut size={140} thickness={16}
                      centerTop={m!.totalLeads.toLocaleString()} centerBottom="Total"
                      data={data.stageDonut.map((s) => ({ label: s.label, value: s.value, color: STAGE_COLORS[s.key] }))} />
                    <div className="legend">
                      {data.stageDonut.map((s) => (
                        <div className="li" key={s.key}>
                          <span className="sw" style={{ background: STAGE_COLORS[s.key] }} />
                          <span className="nm">{s.label}</span><span className="vl">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function LiveSending({ data, loading }: { data: any; loading: boolean }) {
  const lb = data?.lastBlast;
  const sent = lb?.sent ?? 0, failed = lb?.failed ?? 0, total = lb?.total ?? 0;
  return (
    <div className="card">
      <div className="card-h"><h3>Live Sending Status</h3><span className="row gap6" style={{ fontSize: 12, color: 'var(--green)' }}><Activity size={13} /> operational</span></div>
      <div style={{ padding: 18 }}>
        {loading ? <Skeleton h={150} /> : !lb ? <EmptyState title="Idle" hint="No blast has run yet." /> : (
          <div className="donut-wrap">
            <Donut size={132} thickness={15} centerTop={String(sent)} centerBottom={`of ${total}`}
              data={[
                { label: 'Sent', value: sent, color: '#29c273' },
                { label: 'Failed', value: failed, color: '#ef5a5a' },
              ]} />
            <div className="legend">
              <div className="li"><span className="sw" style={{ background: '#29c273' }} /><span className="nm">Sent</span><span className="vl">{sent}</span></div>
              <div className="li"><span className="sw" style={{ background: '#ef5a5a' }} /><span className="nm">Failed</span><span className="vl">{failed}</span></div>
              <div className="li"><span className="nm faint">Last: {lb.label}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TopCampaigns({ data, loading }: { data: any; loading: boolean }) {
  return (
    <div className="card">
      <div className="card-h"><h3>Top Campaigns</h3><a className="link" href="/campaigns">View all</a></div>
      <div style={{ overflowX: 'auto' }}>
        {loading ? <div style={{ padding: 16 }}><Skeleton h={120} /></div> :
          !data || data.campaigns.length === 0 ? <EmptyState title="No campaigns yet" hint="Create one from Compose or Campaigns." /> : (
            <table className="tbl">
              <thead><tr><th>Campaign</th><th>Status</th><th>Recipients</th><th>Sent</th><th>Replies</th></tr></thead>
              <tbody>
                {data.campaigns.slice(0, 5).map((c: any) => (
                  <tr key={c.id}>
                    <td><b>{c.name}</b></td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>{c.recipients.toLocaleString()}</td>
                    <td>{c.sent.toLocaleString()}</td>
                    <td>{c.replied.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
