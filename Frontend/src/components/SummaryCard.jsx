import './SummaryCard.css';

// tone controls the accent color of the number: 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'neutral'
export default function SummaryCard({ icon: Icon, label, value, tone = 'neutral' }) {
  return (
    <div className="summary-card">
      <div className={`summary-card-icon tone-${tone}`}>
        <Icon size={17} strokeWidth={1.9} />
      </div>
      <div className="summary-card-label">{label}</div>
      <div className={`summary-card-value tone-${tone}`}>{value}</div>
    </div>
  );
}
