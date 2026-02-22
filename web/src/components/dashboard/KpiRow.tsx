import KpiCard, { KpiCardProps } from './KpiCard';

interface KpiRowProps {
  kpis: KpiCardProps[];
}

export default function KpiRow({ kpis }: KpiRowProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
      {kpis.map((kpi, index) => (
        <KpiCard key={index} {...kpi} />
      ))}
    </div>
  );
}
