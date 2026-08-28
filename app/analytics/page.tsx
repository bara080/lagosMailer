'use client';
import Topbar from '@/components/Topbar';
import { LineChart, Donut } from '@/components/charts';
import { Skeleton, EmptyState } from '@/components/ui';
import { useStats } from '@/lib/hooks';

const STAGE_COLORS: Record<string, string> = {
  new: '#4f8cff', contacted: '#f0a637', replied: '#a974ff', qualified: '#29c273', won: '#e7b64b',
};

export default function AnalyticsPage() {
  const { data, isLoading } = useStats();
  return (
    <>
      <Topbar title="Analytics" subtitle="Sends, replies and pipeline over time" />
      <div className="page grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="card">
          <div className="card-h"><h3>Sends &amp; Replies (7 days)</h3></div>
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
              </>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h3>Pipeline</h3></div>
          <div style={{ padding: 18 }}>
            {isLoading || !data ? <Skeleton h={150} /> : data.metrics.totalLeads === 0 ? <EmptyState title="No leads yet" /> : (
              <div className="donut-wrap">
                <Donut size={140} thickness={16} centerTop={data.metrics.totalLeads.toLocaleString()} centerBottom="Total"
                  data={data.stageDonut.map((s) => ({ label: s.label, value: s.value, color: STAGE_COLORS[s.key] }))} />
                <div className="legend">
                  {data.stageDonut.map((s) => (
                    <div className="li" key={s.key}><span className="sw" style={{ background: STAGE_COLORS[s.key] }} /><span className="nm">{s.label}</span><span className="vl">{s.value}</span></div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
